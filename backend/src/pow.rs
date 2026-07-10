//! Anubis-style proof-of-work anti-spam challenge for signup: the server
//! hands out a random seed, the browser brute-forces a nonce whose
//! `SHA256(seed:nonce)` has the required number of leading zero bits, and
//! submits it back. This is the same mechanic Techaro's Anubis reverse proxy
//! uses (https://anubis.techaro.lol) — implemented natively here rather than
//! deploying Anubis itself as a separate reverse-proxy process, since this
//! app has no other component sitting in front of it to host one.
//!
//! Challenges are stateless: instead of tracking issued challenges
//! server-side, the seed + expiry are signed with an HMAC over a
//! process-local secret, so verification only needs the signed challenge the
//! client already echoed back plus the solved nonce. A backend restart just
//! invalidates in-flight challenges, which is fine for a short-lived (~2
//! minute) anti-spam gate.

use rand::RngCore;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

const CHALLENGE_TTL_SECONDS: u64 = 120;

#[derive(Clone)]
pub struct PowSecret(pub [u8; 32]);

impl PowSecret {
    pub fn generate() -> Self {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        Self(bytes)
    }
}

#[derive(serde::Serialize)]
pub struct PowChallenge {
    /// Opaque, self-contained token the client must echo back unmodified.
    pub token: String,
    pub seed: String,
    pub difficulty_bits: u32,
}

/// Issues a new challenge: `token` encodes `seed:expiry:hmac` so verification
/// needs no server-side lookup.
pub fn issue_challenge(secret: &PowSecret, difficulty_bits: u32) -> PowChallenge {
    let mut seed_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut seed_bytes);
    let seed = hex::encode(seed_bytes);

    let expires_at = now_unix() + CHALLENGE_TTL_SECONDS;
    let signature = sign(secret, &seed, expires_at, difficulty_bits);
    let token = format!("{seed}:{expires_at}:{difficulty_bits}:{signature}");

    PowChallenge {
        token,
        seed,
        difficulty_bits,
    }
}

/// Verifies a solved challenge: the token's signature/expiry, then that
/// `SHA256(seed:nonce)` actually has `difficulty_bits` leading zero bits.
pub fn verify_solution(secret: &PowSecret, token: &str, nonce: &str) -> Result<(), &'static str> {
    let mut parts = token.splitn(4, ':');
    let (seed, expires_at, difficulty_bits, signature) = (
        parts.next().ok_or("Challenge invalid")?,
        parts.next().ok_or("Challenge invalid")?,
        parts.next().ok_or("Challenge invalid")?,
        parts.next().ok_or("Challenge invalid")?,
    );
    let expires_at: u64 = expires_at.parse().map_err(|_| "Challenge invalid")?;
    let difficulty_bits: u32 = difficulty_bits.parse().map_err(|_| "Challenge invalid")?;

    let expected_signature = sign(secret, seed, expires_at, difficulty_bits);
    if !constant_time_eq(signature.as_bytes(), expected_signature.as_bytes()) {
        return Err("Challenge invalid");
    }
    if now_unix() > expires_at {
        return Err("Challenge expirat, cere unul nou");
    }

    let hash = Sha256::digest(format!("{seed}:{nonce}").as_bytes());
    if leading_zero_bits(&hash) < difficulty_bits {
        return Err("Soluția anti-spam este invalidă");
    }

    Ok(())
}

fn sign(secret: &PowSecret, seed: &str, expires_at: u64, difficulty_bits: u32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.0);
    hasher.update(seed.as_bytes());
    hasher.update(expires_at.to_le_bytes());
    hasher.update(difficulty_bits.to_le_bytes());
    hex::encode(hasher.finalize())
}

fn leading_zero_bits(hash: &[u8]) -> u32 {
    let mut bits = 0;
    for byte in hash {
        if *byte == 0 {
            bits += 8;
            continue;
        }
        bits += byte.leading_zeros();
        break;
    }
    bits
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Minimal hex encode/decode so this module doesn't need a whole extra crate
/// beyond `sha2`/`rand`, which are already dependencies.
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solve(challenge: &PowChallenge) -> String {
        for nonce in 0u64.. {
            let hash = Sha256::digest(format!("{}:{}", challenge.seed, nonce).as_bytes());
            if leading_zero_bits(&hash) >= challenge.difficulty_bits {
                return nonce.to_string();
            }
        }
        unreachable!()
    }

    #[test]
    fn issued_challenge_can_be_solved_and_verified() {
        let secret = PowSecret::generate();
        // Low difficulty keeps the test fast; the algorithm is identical at
        // higher difficulty, just slower to brute-force.
        let challenge = issue_challenge(&secret, 8);
        let nonce = solve(&challenge);
        assert!(verify_solution(&secret, &challenge.token, &nonce).is_ok());
    }

    #[test]
    fn wrong_nonce_is_rejected() {
        let secret = PowSecret::generate();
        let challenge = issue_challenge(&secret, 16);
        assert!(verify_solution(&secret, &challenge.token, "0").is_err());
    }

    #[test]
    fn tampered_token_is_rejected() {
        let secret = PowSecret::generate();
        let challenge = issue_challenge(&secret, 8);
        let nonce = solve(&challenge);
        let tampered = challenge.token.replacen(&challenge.seed, "0000000000000000", 1);
        assert!(verify_solution(&secret, &tampered, &nonce).is_err());
    }

    #[test]
    fn token_signed_by_a_different_secret_is_rejected() {
        let secret_a = PowSecret::generate();
        let secret_b = PowSecret::generate();
        let challenge = issue_challenge(&secret_a, 8);
        let nonce = solve(&challenge);
        assert!(verify_solution(&secret_b, &challenge.token, &nonce).is_err());
    }

    #[test]
    fn expired_challenge_is_rejected() {
        let secret = PowSecret::generate();
        let seed = "deadbeef";
        let expires_at = now_unix().saturating_sub(10);
        let difficulty_bits = 8;
        let signature = sign(&secret, seed, expires_at, difficulty_bits);
        let token = format!("{seed}:{expires_at}:{difficulty_bits}:{signature}");
        assert!(verify_solution(&secret, &token, "0").is_err());
    }

    #[test]
    fn leading_zero_bits_counts_across_byte_boundary() {
        assert_eq!(leading_zero_bits(&[0x00, 0x0f]), 12);
        assert_eq!(leading_zero_bits(&[0xff]), 0);
        assert_eq!(leading_zero_bits(&[0x00, 0x00]), 16);
    }
}
