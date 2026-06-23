mod printing;
mod db_commands;

use db_commands::DbPools;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // ── Open our own SQLite pools for atomic write commands ─────────────────
      // We resolve the same DB files that tauri-plugin-sql uses, so both the
      // plugin (reads) and our Rust commands (transactional writes) hit the
      // same files.
      let app_data_dir = app.path().app_data_dir()
        .expect("failed to resolve app data dir");

      // NOTE: must match the filename chosen by the TypeScript `resolveSqliteUrl`.
      let prod_db_path = app_data_dir.join("aalsi_chatore.db");
      let test_db_path = app_data_dir.join("aalsi_chatore_test.db");

      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let prod_pool = db_commands::open_pool(&prod_db_path).await;
        let test_pool = db_commands::open_pool(&test_db_path).await;

        match (prod_pool, test_pool) {
          (Ok(prod), Ok(test)) => {
            app_handle.manage(DbPools { prod, test });
          }
          (Err(e), _) => {
            log::error!("Failed to open Rust prod DB pool: {}", e);
          }
          (_, Err(e)) => {
            log::error!("Failed to open Rust test DB pool: {}", e);
          }
        }
      });

      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      // Printer discovery
      printing::list_printers,
      printing::get_default_printer,
      // Settings
      printing::get_printer_settings,
      printing::save_printer_settings,
      // Printing
      printing::print_html_receipt,
      printing::preview_html_receipt,
      // Atomic DB writes (bypass tauri-plugin-sql connection pool fragmentation)
      db_commands::db_execute_batch,
      db_commands::db_execute_single,
      // Direct binary DB backup / restore commands
      db_commands::export_db_file,
      db_commands::import_db_file,
      db_commands::get_db_file_bytes,
      db_commands::start_oauth_listener,
      db_commands::open_in_browser,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
