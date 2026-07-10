//! Files uploaded via the OctoPrint-compat shim (`handlers/octoprint_compat.rs`)
//! land here first instead of being printed immediately: a slicer's "upload
//! and print" is deliberately downgraded to "upload and queue" so a live
//! print always requires a human to confirm it through the web UI (reading
//! the safety rules, seeing the actual printer/webcam state) — a slicer
//! blindly triggering a print with no one watching is exactly what this
//! queue exists to prevent. An entry is removed either by
//! `handlers/print_control.rs::start_print` succeeding for its filename
//! (the normal "confirm" path — reuses the same endpoint an ordinary
//! web-upload's "start print" button already calls) or by an explicit
//! cancel through `handlers/pending_uploads.rs`.
//!
//! Backed by sqlite (matching `users.rs`/`audit.rs`) rather than kept purely
//! in memory, so a backend restart mid-print-confirmation doesn't silently
//! drop a file someone already uploaded and is about to print.

use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tokio::task;
use tracing::error;

/// Caps how many files can sit unconfirmed at once — the upload step itself
/// requires no authentication (see `octoprint_compat.rs`), so without a
/// ceiling anyone reachable on the network could fill disk/the file list
/// with an unbounded number of queued uploads nobody will ever confirm.
pub const MAX_PENDING_UPLOADS: usize = 20;

#[derive(Debug, Clone, Serialize)]
pub struct PendingUpload {
    pub id: String,
    pub filename: String,
    pub uploaded_at: String,
    /// Set only when the slicer's `X-Api-Key` resolved to a real identity at
    /// upload time (see `octoprint_compat::resolve_api_key`) — `None` means
    /// the upload itself was anonymous, and whoever confirms the print
    /// becomes the only recorded attribution (via the normal audit log).
    pub uploaded_by: Option<String>,
}

fn row_to_entry(row: &rusqlite::Row) -> rusqlite::Result<PendingUpload> {
    Ok(PendingUpload {
        id: row.get(0)?,
        filename: row.get(1)?,
        uploaded_at: row.get(2)?,
        uploaded_by: row.get(3)?,
    })
}

#[derive(Debug)]
pub enum PendingUploadError {
    QueueFull,
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    TaskJoin(String),
}

impl std::fmt::Display for PendingUploadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PendingUploadError::QueueFull => write!(
                f,
                "Coada de fișiere în așteptare este plină. Încearcă din nou mai târziu."
            ),
            PendingUploadError::Io(e) => write!(f, "I/O error: {e}"),
            PendingUploadError::Sqlite(e) => write!(f, "SQLite error: {e}"),
            PendingUploadError::TaskJoin(e) => write!(f, "task join error: {e}"),
        }
    }
}

impl std::error::Error for PendingUploadError {}

pub struct PendingUploadQueue {
    db_path: PathBuf,
}

impl PendingUploadQueue {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            db_path: path.into(),
        }
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub async fn init(&self) -> Result<(), PendingUploadError> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || {
            if let Some(parent) = db_path.parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent).map_err(PendingUploadError::Io)?;
                }
            }
            let conn = Connection::open(&db_path).map_err(PendingUploadError::Sqlite)?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS pending_uploads (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    uploaded_at TEXT NOT NULL,
                    uploaded_by TEXT
                );",
            )
            .map_err(PendingUploadError::Sqlite)
        })
        .await
        .map_err(|e| PendingUploadError::TaskJoin(e.to_string()))?
    }

    /// Adds a new entry, rejecting once `MAX_PENDING_UPLOADS` is already
    /// queued rather than growing unbounded. The count check and insert run
    /// inside one transaction so two uploads landing at the same instant
    /// can't both slip past the cap.
    pub async fn push(
        &self,
        filename: String,
        uploaded_by: Option<String>,
    ) -> Result<PendingUpload, PendingUploadError> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || {
            let mut conn = Connection::open(&db_path).map_err(PendingUploadError::Sqlite)?;
            let tx = conn.transaction().map_err(PendingUploadError::Sqlite)?;
            let count: i64 = tx
                .query_row("SELECT COUNT(*) FROM pending_uploads", [], |row| row.get(0))
                .map_err(PendingUploadError::Sqlite)?;
            if count as usize >= MAX_PENDING_UPLOADS {
                return Err(PendingUploadError::QueueFull);
            }
            let entry = PendingUpload {
                id: uuid::Uuid::new_v4().to_string(),
                filename,
                uploaded_at: time::OffsetDateTime::now_utc()
                    .format(&time::format_description::well_known::Rfc3339)
                    .unwrap_or_default(),
                uploaded_by,
            };
            tx.execute(
                "INSERT INTO pending_uploads (id, filename, uploaded_at, uploaded_by)
                 VALUES (?1, ?2, ?3, ?4)",
                params![entry.id, entry.filename, entry.uploaded_at, entry.uploaded_by],
            )
            .map_err(PendingUploadError::Sqlite)?;
            tx.commit().map_err(PendingUploadError::Sqlite)?;
            Ok(entry)
        })
        .await
        .map_err(|e| PendingUploadError::TaskJoin(e.to_string()))?
    }

    pub async fn list(&self) -> Vec<PendingUpload> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || -> rusqlite::Result<Vec<PendingUpload>> {
            let conn = Connection::open(&db_path)?;
            let mut stmt = conn.prepare(
                "SELECT id, filename, uploaded_at, uploaded_by
                 FROM pending_uploads
                 ORDER BY uploaded_at ASC",
            )?;
            let rows = stmt.query_map([], row_to_entry)?;
            rows.collect()
        })
        .await
        .unwrap_or_else(|e| {
            error!("Failed to join pending_uploads list task: {e}");
            Ok(Vec::new())
        })
        .unwrap_or_else(|e| {
            error!("Failed to list pending uploads: {e}");
            Vec::new()
        })
    }

    pub async fn remove_by_id(&self, id: &str) -> Option<PendingUpload> {
        let db_path = self.db_path.clone();
        let id = id.to_string();
        task::spawn_blocking(move || -> rusqlite::Result<Option<PendingUpload>> {
            let conn = Connection::open(&db_path)?;
            let entry = conn
                .query_row(
                    "SELECT id, filename, uploaded_at, uploaded_by FROM pending_uploads WHERE id = ?1",
                    params![id],
                    row_to_entry,
                )
                .ok();
            if entry.is_some() {
                conn.execute("DELETE FROM pending_uploads WHERE id = ?1", params![id])?;
            }
            Ok(entry)
        })
        .await
        .unwrap_or_else(|e| {
            error!("Failed to join pending_uploads remove_by_id task: {e}");
            Ok(None)
        })
        .unwrap_or_else(|e| {
            error!("Failed to remove pending upload by id: {e}");
            None
        })
    }

    /// Called by `start_print` once a print genuinely begins, so a file
    /// started straight from the web UI's normal file list (bypassing the
    /// pending-uploads modal) still gets cleared out of the queue instead of
    /// lingering there forever.
    pub async fn remove_by_filename(&self, filename: &str) -> Option<PendingUpload> {
        let db_path = self.db_path.clone();
        let filename = filename.to_string();
        task::spawn_blocking(move || -> rusqlite::Result<Option<PendingUpload>> {
            let conn = Connection::open(&db_path)?;
            let entry = conn
                .query_row(
                    "SELECT id, filename, uploaded_at, uploaded_by FROM pending_uploads WHERE filename = ?1",
                    params![filename],
                    row_to_entry,
                )
                .ok();
            if entry.is_some() {
                conn.execute(
                    "DELETE FROM pending_uploads WHERE filename = ?1",
                    params![filename],
                )?;
            }
            Ok(entry)
        })
        .await
        .unwrap_or_else(|e| {
            error!("Failed to join pending_uploads remove_by_filename task: {e}");
            Ok(None)
        })
        .unwrap_or_else(|e| {
            error!("Failed to remove pending upload by filename: {e}");
            None
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_queue() -> PendingUploadQueue {
        let mut path = std::env::temp_dir();
        path.push(format!("klipper-pending-uploads-test-{}.sqlite", uuid::Uuid::new_v4()));
        PendingUploadQueue::new(path)
    }

    async fn init(q: &PendingUploadQueue) {
        q.init().await.expect("init");
    }

    #[tokio::test]
    async fn push_then_list_round_trips() {
        let q = temp_queue();
        init(&q).await;
        let entry = q.push("a.gcode".to_string(), None).await.unwrap();
        let listed = q.list().await;
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, entry.id);
        assert_eq!(listed[0].filename, "a.gcode");
        assert_eq!(listed[0].uploaded_by, None);
    }

    #[tokio::test]
    async fn push_preserves_uploaded_by_when_known() {
        let q = temp_queue();
        init(&q).await;
        q.push("a.gcode".to_string(), Some("student@unitbv.ro".to_string()))
            .await
            .unwrap();
        assert_eq!(
            q.list().await[0].uploaded_by,
            Some("student@unitbv.ro".to_string())
        );
    }

    #[tokio::test]
    async fn each_push_gets_a_unique_id() {
        let q = temp_queue();
        init(&q).await;
        let a = q.push("a.gcode".to_string(), None).await.unwrap();
        let b = q.push("b.gcode".to_string(), None).await.unwrap();
        assert_ne!(a.id, b.id);
    }

    #[tokio::test]
    async fn remove_by_id_removes_only_the_matching_entry() {
        let q = temp_queue();
        init(&q).await;
        let a = q.push("a.gcode".to_string(), None).await.unwrap();
        let b = q.push("b.gcode".to_string(), None).await.unwrap();
        let removed = q.remove_by_id(&a.id).await.unwrap();
        assert_eq!(removed.filename, "a.gcode");
        let remaining = q.list().await;
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, b.id);
    }

    #[tokio::test]
    async fn remove_by_id_unknown_id_returns_none_and_leaves_queue_untouched() {
        let q = temp_queue();
        init(&q).await;
        q.push("a.gcode".to_string(), None).await.unwrap();
        assert!(q.remove_by_id("nonexistent").await.is_none());
        assert_eq!(q.list().await.len(), 1);
    }

    #[tokio::test]
    async fn remove_by_filename_removes_the_matching_entry() {
        let q = temp_queue();
        init(&q).await;
        q.push("a.gcode".to_string(), None).await.unwrap();
        let removed = q.remove_by_filename("a.gcode").await.unwrap();
        assert_eq!(removed.filename, "a.gcode");
        assert!(q.list().await.is_empty());
    }

    #[tokio::test]
    async fn remove_by_filename_unknown_filename_returns_none() {
        let q = temp_queue();
        init(&q).await;
        q.push("a.gcode".to_string(), None).await.unwrap();
        assert!(q.remove_by_filename("nope.gcode").await.is_none());
        assert_eq!(q.list().await.len(), 1);
    }

    #[tokio::test]
    async fn push_rejects_once_the_queue_is_full() {
        let q = temp_queue();
        init(&q).await;
        for i in 0..MAX_PENDING_UPLOADS {
            q.push(format!("file{i}.gcode"), None).await.unwrap();
        }
        assert!(matches!(
            q.push("overflow.gcode".to_string(), None).await,
            Err(PendingUploadError::QueueFull)
        ));
        assert_eq!(q.list().await.len(), MAX_PENDING_UPLOADS);
    }

    #[tokio::test]
    async fn removing_an_entry_frees_up_room_for_another_push() {
        let q = temp_queue();
        init(&q).await;
        for i in 0..MAX_PENDING_UPLOADS {
            q.push(format!("file{i}.gcode"), None).await.unwrap();
        }
        q.remove_by_filename("file0.gcode").await.unwrap();
        assert!(q.push("newcomer.gcode".to_string(), None).await.is_ok());
    }

    #[tokio::test]
    async fn list_preserves_insertion_order() {
        let q = temp_queue();
        init(&q).await;
        q.push("first.gcode".to_string(), None).await.unwrap();
        q.push("second.gcode".to_string(), None).await.unwrap();
        q.push("third.gcode".to_string(), None).await.unwrap();
        let names: Vec<_> = q.list().await.into_iter().map(|e| e.filename).collect();
        assert_eq!(names, vec!["first.gcode", "second.gcode", "third.gcode"]);
    }

    #[tokio::test]
    async fn queue_survives_being_reopened_at_the_same_path() {
        let mut path = std::env::temp_dir();
        path.push(format!("klipper-pending-uploads-test-{}.sqlite", uuid::Uuid::new_v4()));

        let q1 = PendingUploadQueue::new(&path);
        q1.init().await.expect("init");
        q1.push("persisted.gcode".to_string(), Some("admin".to_string()))
            .await
            .unwrap();

        // Simulates a backend restart: a fresh queue handle over the same file.
        let q2 = PendingUploadQueue::new(&path);
        q2.init().await.expect("init");
        let listed = q2.list().await;
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].filename, "persisted.gcode");
        assert_eq!(listed[0].uploaded_by, Some("admin".to_string()));
    }
}
