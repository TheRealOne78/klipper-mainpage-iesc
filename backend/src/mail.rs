//! Sends the signup verification email. Two providers, tried in order:
//! Resend (a plain HTTPS API call, one API key, no host/port/TLS to get
//! right — see `ResendConfig`'s doc comment for why this is the preferred
//! option) if configured, then raw SMTP, then — if neither is configured —
//! the verification link is logged instead. The account still isn't usable
//! until *some* copy of the link is visited, so the log fallback is safe
//! for first-run/dev, never a way to skip verification.

use crate::config::{ResendConfig, SmtpConfig};
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use tracing::info;

const RESEND_API_URL: &str = "https://api.resend.com/emails";

#[derive(Debug, PartialEq, Eq)]
enum EmailProvider {
    Resend,
    Smtp,
    /// Neither is configured — the caller logs the link instead of sending.
    None,
}

/// Which provider `send_verification_email` will use — pulled out as its own
/// pure function (no network, no config mutation) so the priority rule
/// (Resend wins when both are configured) is unit-testable without needing
/// to mock an HTTP client or reach a real API.
fn select_provider(resend: &ResendConfig, smtp: &SmtpConfig) -> EmailProvider {
    if !resend.api_key.trim().is_empty() {
        EmailProvider::Resend
    } else if !smtp.host.trim().is_empty() {
        EmailProvider::Smtp
    } else {
        EmailProvider::None
    }
}

pub async fn send_verification_email(
    resend: &ResendConfig,
    smtp: &SmtpConfig,
    to_address: &str,
    verify_url: &str,
) -> Result<(), String> {
    match select_provider(resend, smtp) {
        EmailProvider::Resend => send_via_resend(resend, to_address, verify_url).await,
        EmailProvider::Smtp => send_via_smtp(smtp, to_address, verify_url).await,
        EmailProvider::None => {
            info!(
                "No email provider configured — signup verification link for {to_address}: {verify_url}"
            );
            Ok(())
        }
    }
}

fn verification_email_body(verify_url: &str) -> String {
    format!(
        "Confirmă adresa ta de email accesând acest link:\n\n{verify_url}\n\nDacă nu ai cerut această înregistrare, ignoră acest mesaj."
    )
}

async fn send_via_resend(
    resend: &ResendConfig,
    to_address: &str,
    verify_url: &str,
) -> Result<(), String> {
    if resend.from_address.trim().is_empty() {
        return Err(
            "Resend este configurat dar lipsește adresa expeditorului (from_address)".to_string(),
        );
    }

    let body = serde_json::json!({
        "from": resend.from_address,
        "to": [to_address],
        "subject": "Confirmă adresa de email",
        "text": verification_email_body(verify_url),
    });

    let client = reqwest::Client::new();
    let response = client
        .post(RESEND_API_URL)
        .bearer_auth(&resend.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Nu s-a putut contacta Resend: {e}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let detail = response
        .text()
        .await
        .unwrap_or_else(|_| "(no response body)".to_string());
    Err(format!("Resend a răspuns cu eroare {status}: {detail}"))
}

async fn send_via_smtp(smtp: &SmtpConfig, to_address: &str, verify_url: &str) -> Result<(), String> {
    let from = if smtp.from_address.trim().is_empty() {
        &smtp.username
    } else {
        &smtp.from_address
    };

    let email = Message::builder()
        .from(from.parse().map_err(|e| format!("Invalid from address: {e}"))?)
        .to(to_address
            .parse()
            .map_err(|e| format!("Invalid recipient address: {e}"))?)
        .header(ContentType::TEXT_PLAIN)
        .subject("Confirmă adresa de email")
        .body(verification_email_body(verify_url))
        .map_err(|e| format!("Failed to build email: {e}"))?;

    let mut transport_builder = if smtp.use_starttls {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp.host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp.host)
    }
    .map_err(|e| format!("Failed to configure SMTP transport: {e}"))?
    .port(smtp.port);

    if !smtp.username.trim().is_empty() {
        transport_builder = transport_builder
            .credentials(Credentials::new(smtp.username.clone(), smtp.password.clone()));
    }

    let transport = transport_builder.build();
    transport
        .send(email)
        .await
        .map_err(|e| format!("Failed to send email: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resend_config(api_key: &str) -> ResendConfig {
        ResendConfig {
            api_key: api_key.to_string(),
            from_address: "noreply@example.com".to_string(),
        }
    }

    fn smtp_config(host: &str) -> SmtpConfig {
        SmtpConfig {
            host: host.to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn picks_resend_when_only_resend_is_configured() {
        assert_eq!(
            select_provider(&resend_config("re_123"), &smtp_config("")),
            EmailProvider::Resend
        );
    }

    #[test]
    fn picks_smtp_when_only_smtp_is_configured() {
        assert_eq!(
            select_provider(&resend_config(""), &smtp_config("smtp.example.com")),
            EmailProvider::Smtp
        );
    }

    #[test]
    fn prefers_resend_when_both_are_configured() {
        assert_eq!(
            select_provider(&resend_config("re_123"), &smtp_config("smtp.example.com")),
            EmailProvider::Resend
        );
    }

    #[test]
    fn picks_none_when_neither_is_configured() {
        assert_eq!(
            select_provider(&resend_config(""), &smtp_config("")),
            EmailProvider::None
        );
    }

    #[test]
    fn whitespace_only_api_key_does_not_count_as_configured() {
        assert_eq!(
            select_provider(&resend_config("   "), &smtp_config("smtp.example.com")),
            EmailProvider::Smtp
        );
    }

    #[tokio::test]
    async fn logs_instead_of_sending_when_neither_provider_is_configured() {
        let result = send_verification_email(
            &resend_config(""),
            &smtp_config(""),
            "student@unitbv.ro",
            "https://example.com/verify?token=abc",
        )
        .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn resend_without_a_from_address_fails_fast_without_a_network_call() {
        let mut resend = resend_config("re_something");
        resend.from_address = String::new();
        let result = send_verification_email(
            &resend,
            &smtp_config(""),
            "student@unitbv.ro",
            "https://example.com/verify?token=abc",
        )
        .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("from_address"));
    }
}
