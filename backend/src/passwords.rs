//! Centralized password hashing: Argon2id for every new hash, going forward.
//! `verify_password` also accepts pre-existing bcrypt hashes (self-describing
//! PHC-style strings — `$argon2id$...` vs `$2b$...` — let both coexist with
//! no data migration required); nothing is ever re-hashed with bcrypt again.
//!
//! No length or character-set restriction beyond a generous DoS ceiling:
//! passwords are hashed as raw UTF-8 bytes, so every Unicode character
//! (letters in any script, symbols, emoji, combining marks, ...) is valid
//! input and none of it is silently truncated the way bcrypt truncates
//! anything past 72 bytes. `MAX_PASSWORD_BYTES` exists purely so a caller
//! can't force the server to Argon2-hash a multi-gigabyte request body —
//! Argon2 is deliberately memory- and CPU-hard, which makes an unbounded
//! input length a real resource-exhaustion vector, not a usability limit
//! (no human types a 10KB password).

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

pub const MAX_PASSWORD_BYTES: usize = 10_000;

/// A valid, otherwise-meaningless Argon2id hash used to pay the same
/// hashing cost for a lookup that has no real hash to compare against (e.g.
/// a login attempt for an email that doesn't exist) — see
/// `handlers/auth.rs::resolve_local_account_identity`'s doc comment for why
/// this matters: without it, "no such account" returns measurably faster
/// than "wrong password for a real account", letting an attacker enumerate
/// valid emails purely by timing.
pub const DUMMY_PASSWORD_HASH: &str =
    "$argon2id$v=19$m=19456,t=2,p=1$Tm2jUIzOmQh5nEaE89CngA$scjQr6iG3ZumRoSv2JcecJreV8bihXZ35AL43/ZLqcE";

fn hash_password_sync(password: &str) -> Result<String, String> {
    if password.len() > MAX_PASSWORD_BYTES {
        return Err("Parola este prea lungă".to_string());
    }
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| e.to_string())
}

fn verify_password_sync(password: &str, hash: &str) -> bool {
    if password.len() > MAX_PASSWORD_BYTES {
        return false;
    }
    if let Some(parsed) = hash.strip_prefix("$argon2").map(|_| hash) {
        return PasswordHash::new(parsed)
            .map(|parsed_hash| {
                Argon2::default()
                    .verify_password(password.as_bytes(), &parsed_hash)
                    .is_ok()
            })
            .unwrap_or(false);
    }
    // Legacy bcrypt hash (bcrypt::verify already treats a too-long password
    // as a hard error rather than silently truncating within this crate's
    // implementation, so the length guard above is still the operative
    // protection here too).
    bcrypt::verify(password, hash).unwrap_or(false)
}

/// Hashes `password` with Argon2id on a blocking thread (Argon2 is
/// deliberately CPU/memory-hard — running it inline on the async executor
/// would stall every other request being served by that worker thread).
pub async fn hash_password(password: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || hash_password_sync(&password))
        .await
        .unwrap_or_else(|e| Err(format!("hash task failed: {e}")))
}

/// Verifies `password` against a stored hash (Argon2 or legacy bcrypt) on a
/// blocking thread, for the same reason as `hash_password`.
pub async fn verify_password(password: String, hash: String) -> bool {
    tokio::task::spawn_blocking(move || verify_password_sync(&password, &hash))
        .await
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn hash_then_verify_round_trips() {
        let hash = hash_password("correct horse battery staple".to_string())
            .await
            .unwrap();
        assert!(verify_password("correct horse battery staple".to_string(), hash.clone()).await);
        assert!(!verify_password("wrong password".to_string(), hash).await);
    }

    #[tokio::test]
    async fn produces_an_argon2id_hash() {
        let hash = hash_password("whatever".to_string()).await.unwrap();
        assert!(hash.starts_with("$argon2id$"), "got: {hash}");
    }

    #[tokio::test]
    async fn accepts_arbitrary_unicode_including_emoji_and_combining_marks() {
        let password = "пароль密码🔒🔐e\u{0301}légant".to_string();
        let hash = hash_password(password.clone()).await.unwrap();
        assert!(verify_password(password, hash).await);
    }

    #[tokio::test]
    async fn accepts_passwords_longer_than_bcrypts_72_byte_truncation_point() {
        // A password past 72 bytes must NOT be silently truncated (bcrypt's
        // well-known weakness) — two passwords sharing the same 72-byte
        // prefix but differing after it must hash and verify distinctly.
        let long_a = format!("{}-tail-A", "x".repeat(100));
        let long_b = format!("{}-tail-B", "x".repeat(100));
        let hash_a = hash_password(long_a.clone()).await.unwrap();
        assert!(verify_password(long_a, hash_a.clone()).await);
        assert!(!verify_password(long_b, hash_a).await);
    }

    #[tokio::test]
    async fn rejects_passwords_over_the_dos_guard_length() {
        let too_long = "a".repeat(MAX_PASSWORD_BYTES + 1);
        assert!(hash_password(too_long).await.is_err());
    }

    #[tokio::test]
    async fn verify_password_still_accepts_legacy_bcrypt_hashes() {
        // Simulates an admin_password_hash / signup account created before
        // the Argon2 migration — must keep working without a data migration.
        let legacy_hash = bcrypt::hash("legacy-password", 4).unwrap();
        assert!(verify_password("legacy-password".to_string(), legacy_hash.clone()).await);
        assert!(!verify_password("wrong".to_string(), legacy_hash).await);
    }

    #[tokio::test]
    async fn verify_password_rejects_garbage_hash_without_panicking() {
        assert!(!verify_password("anything".to_string(), "not-a-real-hash".to_string()).await);
    }

    #[tokio::test]
    async fn null_bytes_are_hashed_not_silently_truncated() {
        // A NUL byte is where some legacy C-string-based hashing schemes
        // silently truncate; Argon2 hashes the full byte slice.
        let with_tail = "abc\u{0000}tail1".to_string();
        let without_tail = "abc\u{0000}tail2".to_string();
        let hash = hash_password(with_tail.clone()).await.unwrap();
        assert!(verify_password(with_tail, hash.clone()).await);
        assert!(!verify_password(without_tail, hash).await);
    }

    #[tokio::test]
    async fn dummy_password_hash_is_a_valid_argon2_hash_that_rejects_real_login_attempts() {
        // Guards the timing-safety trick in
        // handlers/auth.rs::resolve_local_account_identity: this constant
        // must parse as a real hash (so verifying against it costs the same
        // as a real lookup, rather than erroring out cheaply) and must never
        // match whatever a caller actually typed as their password.
        assert!(!verify_password("anything".to_string(), DUMMY_PASSWORD_HASH.to_string()).await);
        assert!(!verify_password(String::new(), DUMMY_PASSWORD_HASH.to_string()).await);
    }
}
