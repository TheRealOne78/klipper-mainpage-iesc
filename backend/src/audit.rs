use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tokio::task;
use tracing::{error, warn};

#[derive(Clone)]
pub struct AuditLogger {
    db_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: i64,
    pub created_at: String,
    pub action: String,
    pub actor_role: Option<String>,
    /// The actual person, when one exists — a local signup account's email.
    /// `None` for the shared admin/guest passwords (there's no individual
    /// identity to attribute those to beyond the role itself) and for
    /// pre-authentication failures (e.g. a rejected login attempt).
    pub actor_identity: Option<String>,
    pub success: bool,
    pub details_json: String,
}

impl AuditLogger {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            db_path: path.into(),
        }
    }

    pub async fn init(&self) -> Result<(), AuditError> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || initialize_database(&db_path))
            .await
            .map_err(|e| AuditError::TaskJoin(e.to_string()))?
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub async fn record<T>(
        &self,
        action: &'static str,
        actor_role: Option<String>,
        actor_identity: Option<String>,
        success: bool,
        details: T,
    ) where
        T: Serialize + Send + 'static,
    {
        let db_path = self.db_path.clone();
        let details_json = match serde_json::to_string(&details) {
            Ok(value) => value,
            Err(e) => {
                warn!("Failed to serialize audit details for {action}: {e}");
                "{}".to_string()
            }
        };

        let result = task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            conn.execute(
                "INSERT INTO audit_log (action, actor_role, actor_identity, success, details_json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![action, actor_role, actor_identity, success, details_json],
            )?;
            Ok::<_, rusqlite::Error>(())
        })
        .await;

        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => error!("Failed to write audit log for {action}: {e}"),
            Err(e) => error!("Failed to join audit write task for {action}: {e}"),
        }
    }

    pub async fn list_recent(&self, limit: u32) -> Result<Vec<AuditEntry>, AuditError> {
        let db_path = self.db_path.clone();
        let limit = i64::from(limit.clamp(1, 500));
        task::spawn_blocking(move || {
            let conn = Connection::open(db_path)?;
            let mut stmt = conn.prepare(
                "SELECT id, created_at, action, actor_role, actor_identity, success, details_json
                 FROM audit_log
                 ORDER BY id DESC
                 LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit], |row| {
                Ok(AuditEntry {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    action: row.get(2)?,
                    actor_role: row.get(3)?,
                    actor_identity: row.get(4)?,
                    success: row.get::<_, i64>(5)? != 0,
                    details_json: row.get(6)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()
        })
        .await
        .map_err(|e| AuditError::TaskJoin(e.to_string()))?
        .map_err(AuditError::Sqlite)
    }
}

fn initialize_database(db_path: &Path) -> Result<(), AuditError> {
    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            action TEXT NOT NULL,
            actor_role TEXT,
            success INTEGER NOT NULL,
            details_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);",
    )?;

    // actor_identity was added after audit_log already shipped. SQLite has
    // no `ADD COLUMN IF NOT EXISTS` (unlike Postgres/MySQL), so the existence
    // check has to be done manually via `PRAGMA table_info` before running
    // the ALTER TABLE, or this fails with "duplicate column name" on every
    // startup after the first.
    let has_actor_identity: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('audit_log') WHERE name = 'actor_identity'")?
        .exists([])?;
    if !has_actor_identity {
        conn.execute("ALTER TABLE audit_log ADD COLUMN actor_identity TEXT", [])?;
    }

    Ok(())
}

#[derive(Debug)]
pub enum AuditError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    TaskJoin(String),
}

impl std::fmt::Display for AuditError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuditError::Io(e) => write!(f, "I/O error: {e}"),
            AuditError::Sqlite(e) => write!(f, "SQLite error: {e}"),
            AuditError::TaskJoin(e) => write!(f, "task join error: {e}"),
        }
    }
}

impl std::error::Error for AuditError {}

impl From<std::io::Error> for AuditError {
    fn from(value: std::io::Error) -> Self {
        AuditError::Io(value)
    }
}

impl From<rusqlite::Error> for AuditError {
    fn from(value: rusqlite::Error) -> Self {
        AuditError::Sqlite(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_logger() -> AuditLogger {
        let mut path = std::env::temp_dir();
        path.push(format!("klipper-audit-test-{}.sqlite", uuid::Uuid::new_v4()));
        AuditLogger::new(path)
    }

    #[tokio::test]
    async fn record_then_list_recent_round_trips() {
        let logger = temp_logger();
        logger.init().await.expect("init");
        logger
            .record(
                "auth.login",
                Some("admin".to_string()),
                None,
                true,
                json!({ "role": "admin" }),
            )
            .await;

        let entries = logger.list_recent(10).await.expect("list_recent");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, "auth.login");
        assert_eq!(entries[0].actor_role, Some("admin".to_string()));
        assert_eq!(entries[0].actor_identity, None);
        assert!(entries[0].success);
        assert_eq!(entries[0].details_json, r#"{"role":"admin"}"#);
    }

    #[tokio::test]
    async fn actor_identity_is_stored_and_read_back_when_present() {
        let logger = temp_logger();
        logger.init().await.expect("init");
        logger
            .record(
                "auth.signup",
                None,
                Some("student@unitbv.ro".to_string()),
                true,
                json!({ "email": "student@unitbv.ro" }),
            )
            .await;

        let entries = logger.list_recent(10).await.expect("list_recent");
        assert_eq!(
            entries[0].actor_identity,
            Some("student@unitbv.ro".to_string())
        );
    }

    #[tokio::test]
    async fn list_recent_orders_newest_first() {
        let logger = temp_logger();
        logger.init().await.expect("init");
        logger.record("first", None, None, true, json!({})).await;
        logger.record("second", None, None, true, json!({})).await;
        logger.record("third", None, None, true, json!({})).await;

        let entries = logger.list_recent(10).await.expect("list_recent");
        let actions: Vec<_> = entries.iter().map(|e| e.action.as_str()).collect();
        assert_eq!(actions, vec!["third", "second", "first"]);
    }

    #[tokio::test]
    async fn list_recent_respects_the_limit() {
        let logger = temp_logger();
        logger.init().await.expect("init");
        for i in 0..5 {
            logger
                .record("action", None, None, true, json!({ "i": i }))
                .await;
        }
        let entries = logger.list_recent(2).await.expect("list_recent");
        assert_eq!(entries.len(), 2);
    }

    #[tokio::test]
    async fn a_failed_action_is_recorded_as_unsuccessful() {
        let logger = temp_logger();
        logger.init().await.expect("init");
        logger
            .record("auth.login", None, None, false, json!({ "reason": "invalid_credentials" }))
            .await;
        let entries = logger.list_recent(10).await.expect("list_recent");
        assert!(!entries[0].success);
    }

    /// Regression test for a real bug hit while adding `actor_identity`:
    /// SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (unlike
    /// Postgres/MySQL) — `initialize_database` used to run that literal SQL
    /// and it failed with a syntax error on every single startup, disabling
    /// audit logging entirely. This creates a database with the *old*
    /// pre-`actor_identity` schema by hand, then verifies `init()` migrates
    /// it in place without erroring and without losing the existing row.
    #[tokio::test]
    async fn init_migrates_a_pre_existing_database_missing_actor_identity() {
        let mut path = std::env::temp_dir();
        path.push(format!("klipper-audit-migration-test-{}.sqlite", uuid::Uuid::new_v4()));

        {
            let conn = Connection::open(&path).expect("open");
            conn.execute_batch(
                "CREATE TABLE audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    action TEXT NOT NULL,
                    actor_role TEXT,
                    success INTEGER NOT NULL,
                    details_json TEXT NOT NULL DEFAULT '{}'
                );
                INSERT INTO audit_log (action, actor_role, success, details_json)
                VALUES ('pre_migration_event', 'admin', 1, '{}');",
            )
            .expect("create old-schema table");
        }

        let logger = AuditLogger::new(&path);
        logger.init().await.expect("init must succeed against an old-schema database");

        // Running init() a second time (simulating a second backend restart)
        // must also succeed — this is exactly what "duplicate column name"
        // would have broken without the existence check.
        logger.init().await.expect("init must be idempotent");

        let entries = logger.list_recent(10).await.expect("list_recent");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, "pre_migration_event");
        assert_eq!(entries[0].actor_identity, None);

        logger
            .record("post_migration_event", None, Some("admin".to_string()), true, json!({}))
            .await;
        let entries = logger.list_recent(10).await.expect("list_recent");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].actor_identity, Some("admin".to_string()));
    }
}

pub fn detail(key: &'static str, value: impl Serialize) -> Value {
    json!({ key: value })
}
