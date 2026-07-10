//! Local signup accounts: email + bcrypt password hash + assigned group,
//! stored in their own SQLite database (mirrors `audit.rs`'s
//! `spawn_blocking` + `rusqlite::Connection::open` pattern rather than
//! pulling in an async DB driver for one small table).

use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use tokio::task;

#[derive(Clone)]
pub struct UserStore {
    db_path: PathBuf,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct UserRecord {
    pub email: String,
    #[serde(skip)]
    pub password_hash: String,
    pub group_id: String,
    pub verified: bool,
    pub created_at: String,
    /// RFC 3339 timestamp; `None` when there's no pending verification. The
    /// verification token itself is never read back out of the DB — only
    /// matched against by SQL — so it isn't part of this struct.
    pub verification_expires_at: Option<String>,
}

impl UserStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            db_path: path.into(),
        }
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub async fn init(&self) -> Result<(), UserStoreError> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || initialize_database(&db_path))
            .await
            .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    /// Inserts a new, unverified account. Fails with `EmailTaken` if the
    /// address is already registered (verified or not).
    pub async fn create_pending(
        &self,
        email: &str,
        password_hash: &str,
        group_id: &str,
        verification_token_hash: &str,
        verification_expires_at: &str,
    ) -> Result<(), UserStoreError> {
        let db_path = self.db_path.clone();
        let (email, password_hash, group_id, token_hash, expires_at) = (
            email.to_string(),
            password_hash.to_string(),
            group_id.to_string(),
            verification_token_hash.to_string(),
            verification_expires_at.to_string(),
        );
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT 1 FROM users WHERE email = ?1",
                    params![email.to_lowercase()],
                    |row| row.get(0),
                )
                .optional()?;
            if existing.is_some() {
                return Err(UserStoreError::EmailTaken);
            }
            conn.execute(
                "INSERT INTO users (email, password_hash, group_id, verified, verification_token_hash, verification_expires_at)
                 VALUES (?1, ?2, ?3, 0, ?4, ?5)",
                params![email.to_lowercase(), password_hash, group_id, token_hash, expires_at],
            )?;
            Ok(())
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    /// Admin-provisioned account: verified immediately, no email round trip.
    pub async fn create_verified(
        &self,
        email: &str,
        password_hash: &str,
        group_id: &str,
    ) -> Result<(), UserStoreError> {
        let db_path = self.db_path.clone();
        let (email, password_hash, group_id) =
            (email.to_string(), password_hash.to_string(), group_id.to_string());
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT 1 FROM users WHERE email = ?1",
                    params![email.to_lowercase()],
                    |row| row.get(0),
                )
                .optional()?;
            if existing.is_some() {
                return Err(UserStoreError::EmailTaken);
            }
            conn.execute(
                "INSERT INTO users (email, password_hash, group_id, verified)
                 VALUES (?1, ?2, ?3, 1)",
                params![email.to_lowercase(), password_hash, group_id],
            )?;
            Ok(())
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Option<UserRecord>, UserStoreError> {
        let db_path = self.db_path.clone();
        let email = email.to_lowercase();
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            conn.query_row(
                "SELECT email, password_hash, group_id, verified, created_at, verification_expires_at
                 FROM users WHERE email = ?1",
                params![email],
                row_to_record,
            )
            .optional()
            .map_err(UserStoreError::from)
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    /// Marks the account owning `token_hash` verified and clears the pending
    /// token, but only if the token hasn't expired. Returns the email on
    /// success so the caller can log the outcome.
    pub async fn verify_by_token_hash(
        &self,
        token_hash: &str,
    ) -> Result<Option<String>, UserStoreError> {
        let db_path = self.db_path.clone();
        let token_hash = token_hash.to_string();
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let row: Option<(String, String)> = conn
                .query_row(
                    "SELECT email, verification_expires_at FROM users
                     WHERE verification_token_hash = ?1 AND verified = 0",
                    params![token_hash],
                    |row| Ok((row.get(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default())),
                )
                .optional()?;
            let Some((email, expires_at)) = row else {
                return Ok(None);
            };
            let expired = time::OffsetDateTime::parse(
                &expires_at,
                &time::format_description::well_known::Rfc3339,
            )
            .map(|expiry| expiry < time::OffsetDateTime::now_utc())
            .unwrap_or(true);
            if expired {
                return Ok(None);
            }
            conn.execute(
                "UPDATE users SET verified = 1, verification_token_hash = NULL, verification_expires_at = NULL
                 WHERE email = ?1",
                params![email],
            )?;
            Ok(Some(email))
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    pub async fn regenerate_verification(
        &self,
        email: &str,
        verification_token_hash: &str,
        verification_expires_at: &str,
    ) -> Result<(), UserStoreError> {
        let db_path = self.db_path.clone();
        let (email, token_hash, expires_at) = (
            email.to_lowercase(),
            verification_token_hash.to_string(),
            verification_expires_at.to_string(),
        );
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let changed = conn.execute(
                "UPDATE users SET verification_token_hash = ?1, verification_expires_at = ?2
                 WHERE email = ?3 AND verified = 0",
                params![token_hash, expires_at, email],
            )?;
            if changed == 0 {
                return Err(UserStoreError::NotFound);
            }
            Ok(())
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    pub async fn list_all(&self) -> Result<Vec<UserRecord>, UserStoreError> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let mut stmt = conn.prepare(
                "SELECT email, password_hash, group_id, verified, created_at, verification_expires_at
                 FROM users ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map([], row_to_record)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(UserStoreError::from)
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    pub async fn delete(&self, email: &str) -> Result<(), UserStoreError> {
        let db_path = self.db_path.clone();
        let email = email.to_lowercase();
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let changed = conn.execute("DELETE FROM users WHERE email = ?1", params![email])?;
            if changed == 0 {
                return Err(UserStoreError::NotFound);
            }
            Ok(())
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }

    pub async fn set_group(&self, email: &str, group_id: &str) -> Result<(), UserStoreError> {
        let db_path = self.db_path.clone();
        let (email, group_id) = (email.to_lowercase(), group_id.to_string());
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let changed = conn.execute(
                "UPDATE users SET group_id = ?1 WHERE email = ?2",
                params![group_id, email],
            )?;
            if changed == 0 {
                return Err(UserStoreError::NotFound);
            }
            Ok(())
        })
        .await
        .map_err(|e| UserStoreError::TaskJoin(e.to_string()))?
    }
}

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<UserRecord> {
    Ok(UserRecord {
        email: row.get(0)?,
        password_hash: row.get(1)?,
        group_id: row.get(2)?,
        verified: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
        verification_expires_at: row.get(5)?,
    })
}

fn initialize_database(db_path: &Path) -> Result<(), UserStoreError> {
    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            group_id TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            verification_token_hash TEXT,
            verification_expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token_hash);",
    )?;

    Ok(())
}

#[derive(Debug)]
pub enum UserStoreError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    TaskJoin(String),
    EmailTaken,
    NotFound,
}

impl std::fmt::Display for UserStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserStoreError::Io(e) => write!(f, "I/O error: {e}"),
            UserStoreError::Sqlite(e) => write!(f, "SQLite error: {e}"),
            UserStoreError::TaskJoin(e) => write!(f, "task join error: {e}"),
            UserStoreError::EmailTaken => write!(f, "an account with this email already exists"),
            UserStoreError::NotFound => write!(f, "no matching account"),
        }
    }
}

impl std::error::Error for UserStoreError {}

impl From<std::io::Error> for UserStoreError {
    fn from(value: std::io::Error) -> Self {
        UserStoreError::Io(value)
    }
}

impl From<rusqlite::Error> for UserStoreError {
    fn from(value: rusqlite::Error) -> Self {
        UserStoreError::Sqlite(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> UserStore {
        let mut path = std::env::temp_dir();
        path.push(format!("klipper-users-test-{}.sqlite", uuid::Uuid::new_v4()));
        UserStore::new(path)
    }

    async fn init(store: &UserStore) {
        store.init().await.expect("init");
    }

    #[tokio::test]
    async fn create_pending_then_find_by_email_round_trips() {
        let store = temp_store();
        init(&store).await;
        store
            .create_pending("Student@Unitbv.ro", "hash", "guest", "tokenhash", "2999-01-01T00:00:00Z")
            .await
            .unwrap();

        let found = store.find_by_email("student@unitbv.ro").await.unwrap().unwrap();
        assert_eq!(found.email, "student@unitbv.ro");
        assert!(!found.verified);
        assert_eq!(found.group_id, "guest");
    }

    #[tokio::test]
    async fn create_pending_rejects_duplicate_email_case_insensitively() {
        let store = temp_store();
        init(&store).await;
        store
            .create_pending("a@unitbv.ro", "hash", "guest", "t1", "2999-01-01T00:00:00Z")
            .await
            .unwrap();
        let result = store
            .create_pending("A@UNITBV.RO", "hash2", "guest", "t2", "2999-01-01T00:00:00Z")
            .await;
        assert!(matches!(result, Err(UserStoreError::EmailTaken)));
    }

    #[tokio::test]
    async fn verify_by_token_hash_marks_verified_and_clears_token() {
        let store = temp_store();
        init(&store).await;
        store
            .create_pending("a@unitbv.ro", "hash", "guest", "tok123", "2999-01-01T00:00:00Z")
            .await
            .unwrap();

        let email = store.verify_by_token_hash("tok123").await.unwrap();
        assert_eq!(email, Some("a@unitbv.ro".to_string()));

        let record = store.find_by_email("a@unitbv.ro").await.unwrap().unwrap();
        assert!(record.verified);
        assert!(record.verification_expires_at.is_none());
    }

    #[tokio::test]
    async fn verify_by_token_hash_rejects_expired_token() {
        let store = temp_store();
        init(&store).await;
        store
            .create_pending("a@unitbv.ro", "hash", "guest", "tok123", "2000-01-01T00:00:00Z")
            .await
            .unwrap();

        let email = store.verify_by_token_hash("tok123").await.unwrap();
        assert_eq!(email, None);
        let record = store.find_by_email("a@unitbv.ro").await.unwrap().unwrap();
        assert!(!record.verified);
    }

    #[tokio::test]
    async fn verify_by_token_hash_unknown_token_returns_none() {
        let store = temp_store();
        init(&store).await;
        assert_eq!(store.verify_by_token_hash("nope").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_verified_is_immediately_verified() {
        let store = temp_store();
        init(&store).await;
        store.create_verified("admin-added@unitbv.ro", "hash", "admin").await.unwrap();
        let record = store.find_by_email("admin-added@unitbv.ro").await.unwrap().unwrap();
        assert!(record.verified);
    }

    #[tokio::test]
    async fn delete_removes_account() {
        let store = temp_store();
        init(&store).await;
        store.create_verified("a@unitbv.ro", "hash", "guest").await.unwrap();
        store.delete("a@unitbv.ro").await.unwrap();
        assert!(store.find_by_email("a@unitbv.ro").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn delete_unknown_email_returns_not_found() {
        let store = temp_store();
        init(&store).await;
        assert!(matches!(store.delete("nope@unitbv.ro").await, Err(UserStoreError::NotFound)));
    }

    #[tokio::test]
    async fn list_all_returns_every_account() {
        let store = temp_store();
        init(&store).await;
        store.create_verified("a@unitbv.ro", "hash", "guest").await.unwrap();
        store.create_verified("b@unitbv.ro", "hash", "guest").await.unwrap();
        let all = store.list_all().await.unwrap();
        assert_eq!(all.len(), 2);
    }

    #[tokio::test]
    async fn set_group_updates_group_id() {
        let store = temp_store();
        init(&store).await;
        store.create_verified("a@unitbv.ro", "hash", "guest").await.unwrap();
        store.set_group("a@unitbv.ro", "lab-advanced").await.unwrap();
        let record = store.find_by_email("a@unitbv.ro").await.unwrap().unwrap();
        assert_eq!(record.group_id, "lab-advanced");
    }

    #[tokio::test]
    async fn regenerate_verification_replaces_pending_token() {
        let store = temp_store();
        init(&store).await;
        store
            .create_pending("a@unitbv.ro", "hash", "guest", "old", "2999-01-01T00:00:00Z")
            .await
            .unwrap();
        store
            .regenerate_verification("a@unitbv.ro", "new", "2999-06-01T00:00:00Z")
            .await
            .unwrap();
        assert_eq!(store.verify_by_token_hash("old").await.unwrap(), None);
        assert_eq!(
            store.verify_by_token_hash("new").await.unwrap(),
            Some("a@unitbv.ro".to_string())
        );
    }
}
