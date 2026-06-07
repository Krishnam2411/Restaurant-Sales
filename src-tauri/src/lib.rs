mod printing;

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
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
