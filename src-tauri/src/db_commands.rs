// db_commands.rs
//
// Rust-side Tauri commands for atomic SQLite write operations.
//
// WHY THIS EXISTS:
//   tauri-plugin-sql uses a connection *pool* internally.  Each JS-side
//   `db.execute()` call acquires a fresh connection from the pool, runs the
//   statement, then releases it.  That means BEGIN, INSERT, and COMMIT can
//   land on *different* connections, making manual transaction management from
//   JavaScript completely unreliable.
//
//   The correct fix is to encapsulate any operation that needs ACID guarantees
//   in a Rust command where we hold a SINGLE connection for the entire
//   transaction.

use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions},
    Acquire, ConnectOptions,
};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::time::Duration;
use tauri::{Manager, State};

// ---------------------------------------------------------------------------
// Shared pool state – populated once on app startup
// ---------------------------------------------------------------------------

pub struct DbPools {
    pub prod: SqlitePool,
    pub test: SqlitePool,
}

// ---------------------------------------------------------------------------
// Serialisable types (JS → Rust)
// ---------------------------------------------------------------------------

/// A single SQL statement with its bound values.
#[derive(Debug, Deserialize)]
pub struct SqlStatement {
    pub sql: String,
    /// JSON-serialisable bind values (strings, numbers, booleans, null).
    pub values: Vec<serde_json::Value>,
}

/// Response returned to the JS side.
#[derive(Debug, Serialize)]
pub struct BatchResult {
    pub ok: bool,
}

// ---------------------------------------------------------------------------
// Helper: bind a serde_json::Value slice to a query
// ---------------------------------------------------------------------------

fn bind_values<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    values: &'q [serde_json::Value],
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    for v in values {
        match v {
            serde_json::Value::Null => query = query.bind(None::<String>),
            serde_json::Value::Bool(b) => query = query.bind(*b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query = query.bind(i);
                } else if let Some(f) = n.as_f64() {
                    query = query.bind(f);
                } else {
                    query = query.bind(None::<String>);
                }
            }
            serde_json::Value::String(s) => query = query.bind(s.as_str()),
            other => query = query.bind(other.to_string()),
        }
    }
    query
}

// ---------------------------------------------------------------------------
// Command: execute multiple statements atomically in ONE transaction
// ---------------------------------------------------------------------------

/// Executes a list of SQL statements atomically inside a single BEGIN/COMMIT.
/// Acquires ONE connection from our dedicated pool and holds it for the
/// duration, so BEGIN and COMMIT are always on the same connection.
#[tauri::command]
pub async fn db_execute_batch(
    pools_state: State<'_, DbPools>,
    statements: Vec<SqlStatement>,
    is_test: bool,
) -> Result<BatchResult, String> {
    let pool = if is_test { &pools_state.test } else { &pools_state.prod };

    // Acquire a *single* connection for the entire transaction.
    let mut conn = pool.acquire().await.map_err(|e| format!("pool acquire: {}", e))?;

    // Begin a transaction – this runs BEGIN on the acquired connection.
    let mut tx = conn.begin().await.map_err(|e| format!("begin: {}", e))?;

    for stmt in &statements {
        let query = sqlx::query(&stmt.sql);
        let query = bind_values(query, &stmt.values);
        query.execute(&mut *tx).await.map_err(|e| {
            // tx is rolled back automatically when dropped
            format!(
                "SQL error [{}...]: {}",
                stmt.sql.chars().take(80).collect::<String>(),
                e
            )
        })?;
    }

    tx.commit().await.map_err(|e| format!("commit: {}", e))?;

    Ok(BatchResult { ok: true })
}

// ---------------------------------------------------------------------------
// Command: single write (no multi-statement transaction needed)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn db_execute_single(
    pools_state: State<'_, DbPools>,
    sql: String,
    values: Vec<serde_json::Value>,
    is_test: bool,
) -> Result<BatchResult, String> {
    let pool = if is_test { &pools_state.test } else { &pools_state.prod };

    let query = sqlx::query(&sql);
    let query = bind_values(query, &values);
    query
        .execute(pool)
        .await
        .map_err(|e| format!("SQL error: {}", e))?;

    Ok(BatchResult { ok: true })
}

// ---------------------------------------------------------------------------
// Commands: backup / restore binary database files directly
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn export_db_file(
    app_handle: tauri::AppHandle,
    dest_path: String,
    is_test: bool,
) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let db_filename = if is_test { "aalsi_chatore_test.db" } else { "aalsi_chatore.db" };
    let db_path = app_data_dir.join(db_filename);

    if !db_path.exists() {
        return Err("Database file does not exist yet.".to_string());
    }

    std::fs::copy(&db_path, Path::new(&dest_path))
        .map_err(|e| format!("Failed to export database: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn import_db_file(
    app_handle: tauri::AppHandle,
    src_path: String,
    is_test: bool,
) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let db_filename = if is_test { "aalsi_chatore_test.db" } else { "aalsi_chatore.db" };
    let db_path = app_data_dir.join(db_filename);

    std::fs::copy(Path::new(&src_path), &db_path)
        .map_err(|e| format!("Failed to import database: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_db_file_bytes(
    app_handle: tauri::AppHandle,
    is_test: bool,
) -> Result<Vec<u8>, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let db_filename = if is_test { "aalsi_chatore_test.db" } else { "aalsi_chatore.db" };
    let db_path = app_data_dir.join(db_filename);

    if !db_path.exists() {
        return Err("Database file does not exist yet.".to_string());
    }

    std::fs::read(&db_path)
        .map_err(|e| format!("Failed to read database file: {}", e))
}

// ---------------------------------------------------------------------------
// Command: temporary HTTP server for Google OAuth loopback flow
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_oauth_listener() -> Result<String, String> {
    // Run blocking listener on a threadpool worker meant for blocking I/O
    tokio::task::spawn_blocking(|| {
        let listener = TcpListener::bind("127.0.0.1:18524")
            .map_err(|e| format!("Failed to bind port 18524: {}", e))?;

        let (mut stream, _) = listener.accept()
            .map_err(|e| format!("Failed to accept connection: {}", e))?;

        let mut buffer = [0; 2048];
        stream.read(&mut buffer).map_err(|e| format!("Failed to read stream: {}", e))?;

        let request = String::from_utf8_lossy(&buffer);

        // Look for code query parameter, e.g. GET /?code=4/0AdLIrY...
        let code = if let Some(code_idx) = request.find("code=") {
            let code_part = &request[code_idx + 5..];
            let end_idx = code_part.find(' ')
                .or_else(|| code_part.find('&'))
                .unwrap_or(code_part.len());
            code_part[..end_idx].to_string()
        } else {
            return Err("No authorization code found in request.".to_string());
        };

        // Success HTML response
        let body = "<html>\
            <head><title>Authentication Successful</title></head>\
            <body style=\"font-family: -apple-system, sans-serif; text-align: center; padding-top: 50px; background-color: #1e1e2e; color: #cdd6f4;\">\
                <h2 style=\"color: #a6e3a1;\">Authentication Successful!</h2>\
                <p>You can close this tab and return to the POS application.</p>\
                <script>window.close();</script>\
            </body>\
            </html>";

        let response = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Length: {}\r\n\
             Content-Type: text/html\r\n\
             Connection: close\r\n\r\n\
             {}",
            body.len(),
            body
        );

        stream.write_all(response.as_bytes()).ok();

        Ok(code)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Pool initialisation – called once from lib.rs setup
// ---------------------------------------------------------------------------

/// Open a single-connection SQLite pool on `db_file_path`.
///
/// Uses `SqliteConnectOptions` (not a URL string) to guarantee the correct
/// file is opened without any query-string parsing ambiguity.
pub async fn open_pool(db_file_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let opts = SqliteConnectOptions::new()
        .filename(db_file_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true)
        // Wait up to 10 s for a write lock before giving up.
        .busy_timeout(Duration::from_secs(10))
        // Suppress verbose per-query logging.
        .log_statements(log::LevelFilter::Off);

    let pool = SqlitePoolOptions::new()
        .max_connections(1) // one writer at a time
        .connect_with(opts)
        .await?;

    log::info!(
        "Rust DB pool opened: {}",
        db_file_path.display()
    );

    Ok(pool)
}
