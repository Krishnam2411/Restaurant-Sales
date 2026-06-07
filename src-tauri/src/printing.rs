// printing.rs — Native printing commands for Tauri
//
// Strategy (Windows):
//   • Printer enumeration: `wmic printer list brief /format:csv` (no extra deps)
//   • Silent print:        Write HTML → temp file → ShellExecuteW with "print" verb
//   • Preview:             Open a visible Tauri WebviewWindow with injected print button
//
// macOS / Linux:
//   • Printer enumeration: `lpstat -p -d`
//   • Silent print:        Write HTML → temp file → `lpr -P <printer> <file>`
//   • Preview:             Same WebviewWindow approach

use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PrinterInfo {
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
}

/// Printer settings persisted to $APPDATA/com.aalsi.chatore.sales/printer_settings.json
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PrinterSettings {
    #[serde(rename = "printerName", default)]
    pub printer_name: String,
    /// Paper roll width in mm. Default: 80.
    #[serde(rename = "paperWidthMm", default = "default_paper_width")]
    pub paper_width_mm: u32,
}

fn default_paper_width() -> u32 {
    80
}

impl Default for PrinterSettings {
    fn default() -> Self {
        Self {
            printer_name: String::new(),
            paper_width_mm: 80,
        }
    }
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

fn settings_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("printer_settings.json")
}

fn load_settings(app: &AppHandle) -> PrinterSettings {
    let path = settings_path(app);
    if let Ok(data) = std::fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        PrinterSettings::default()
    }
}

fn persist_settings(app: &AppHandle, settings: &PrinterSettings) -> Result<(), String> {
    let path = settings_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tauri Commands — Settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_printer_settings(app: AppHandle) -> PrinterSettings {
    load_settings(&app)
}

#[tauri::command]
pub fn save_printer_settings(
    app: AppHandle,
    settings: PrinterSettings,
) -> Result<(), String> {
    persist_settings(&app, &settings)
}

// ---------------------------------------------------------------------------
// Tauri Commands — Printer Discovery
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_printers() -> Vec<PrinterInfo> {
    enumerate_printers()
}

#[tauri::command]
pub fn get_default_printer() -> String {
    find_default_printer()
}

// ---------------------------------------------------------------------------
// Platform-specific printer enumeration
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn enumerate_printers() -> Vec<PrinterInfo> {
    // Use wmic to list printers — available on all modern Windows versions
    // Output format (CSV): Caption,Default,PrinterStatus,...
    let output = std::process::Command::new("wmic")
        .args(["printer", "get", "Name,Default", "/format:csv"])
        .output();

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            parse_wmic_printers(&text)
        }
        Err(e) => {
            log::warn!("wmic printer enumeration failed: {e}");
            vec![]
        }
    }
}

#[cfg(target_os = "windows")]
fn parse_wmic_printers(csv: &str) -> Vec<PrinterInfo> {
    let mut printers = Vec::new();
    let mut lines = csv.lines().filter(|l| !l.trim().is_empty());

    // First non-empty line is header: Node,Default,Name
    let header = match lines.next() {
        Some(h) => h,
        None => return printers,
    };

    let cols: Vec<&str> = header.split(',').collect();
    let default_idx = cols.iter().position(|c| c.trim().eq_ignore_ascii_case("Default"));
    let name_idx = cols.iter().position(|c| c.trim().eq_ignore_ascii_case("Name"));

    let (di, ni) = match (default_idx, name_idx) {
        (Some(d), Some(n)) => (d, n),
        _ => return printers,
    };

    for line in lines {
        let fields: Vec<&str> = line.split(',').collect();
        if fields.len() <= ni || fields.len() <= di {
            continue;
        }
        let name = fields[ni].trim().to_string();
        if name.is_empty() {
            continue;
        }
        let is_default = fields[di].trim().eq_ignore_ascii_case("TRUE");
        printers.push(PrinterInfo { name, is_default });
    }
    printers
}

#[cfg(target_os = "windows")]
fn find_default_printer() -> String {
    enumerate_printers()
        .into_iter()
        .find(|p| p.is_default)
        .map(|p| p.name)
        .unwrap_or_default()
}

#[cfg(not(target_os = "windows"))]
fn enumerate_printers() -> Vec<PrinterInfo> {
    // macOS / Linux: use lpstat
    let default_name = find_default_printer();
    let output = std::process::Command::new("lpstat")
        .args(["-p"])
        .output();

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.lines()
                .filter(|l| l.starts_with("printer "))
                .filter_map(|l| {
                    let parts: Vec<&str> = l.split_whitespace().collect();
                    parts.get(1).map(|name| PrinterInfo {
                        name: name.to_string(),
                        is_default: name.to_string() == default_name,
                    })
                })
                .collect()
        }
        Err(e) => {
            log::warn!("lpstat failed: {e}");
            vec![]
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn find_default_printer() -> String {
    let output = std::process::Command::new("lpstat")
        .args(["-d"])
        .output();
    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            // "system default destination: PrinterName"
            text.split(':')
                .nth(1)
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        }
        Err(_) => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands — Printing
// ---------------------------------------------------------------------------

/// Silently prints an HTML receipt to the named printer.
/// No browser popup dialog shown to the user.
///
/// Windows: writes HTML to a temp file, then uses ShellExecuteW "print" verb.
/// macOS/Linux: uses `lpr -P <printer>`.
#[tauri::command]
pub fn print_html_receipt(
    html: String,
    printer_name: String,
) -> Result<(), String> {
    // Write HTML to a temporary file
    let temp_path = write_temp_html(&html)?;

    let result = silent_print(&temp_path, &printer_name);

    // Clean up temp file after a short delay (print spooler needs time to read it)
    // We spawn a thread to delete after 10 seconds
    let cleanup_path = temp_path.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        let _ = std::fs::remove_file(&cleanup_path);
    });

    result
}

/// Opens a visible preview window displaying the receipt HTML.
/// The window has a "Print" button that triggers the system print dialog.
#[tauri::command]
pub async fn preview_html_receipt(
    app: AppHandle,
    html: String,
) -> Result<(), String> {
    // Inject a print button and print-trigger script into the HTML
    let preview_html = inject_preview_controls(&html);

    // Write to temp file so the webview can load it via file:// URL
    let temp_path = write_temp_html(&preview_html)?;
    let file_url = path_to_file_url(&temp_path)?;

    // Create (or reuse) a preview window
    let window_label = "receipt-preview";

    // If a preview window already exists, close it first
    if let Some(existing) = app.get_webview_window(window_label) {
        let _ = existing.close();
        // Small delay to allow close to complete
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    WebviewWindowBuilder::new(&app, window_label, WebviewUrl::External(file_url))
        .title("Receipt Preview")
        .inner_size(420.0, 700.0)
        .theme(Some(tauri::Theme::Dark))
        .resizable(true)
        .center()
        .build()
        .map_err(|e| format!("Failed to open preview window: {e}"))?;

    // Clean up temp file when preview window is closed
    let cleanup_path = temp_path.clone();
    if let Some(win) = app.get_webview_window(window_label) {
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                let _ = std::fs::remove_file(&cleanup_path);
            }
        });
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Platform-specific silent print
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn silent_print(html_path: &PathBuf, printer_name: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    // Build the path as a wide string for ShellExecuteW
    let path_wide: Vec<u16> = OsStr::new(html_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // Build printer parameter string: "/d:<printer_name>"
    let printer_param = if printer_name.is_empty() {
        String::new()
    } else {
        format!("/d:\"{printer_name}\"")
    };
    let params_wide: Vec<u16> = OsStr::new(&printer_param)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let verb: Vec<u16> = OsStr::new("print")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // SAFETY: ShellExecuteW is a standard Win32 call. All pointers are valid for the duration of the call.
    let result = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            path_wide.as_ptr(),
            if printer_name.is_empty() {
                std::ptr::null()
            } else {
                params_wide.as_ptr()
            },
            std::ptr::null(),
            windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE as i32,
        )
    };

    // ShellExecuteW returns > 32 on success
    if result as usize > 32 {
        Ok(())
    } else {
        Err(format!(
            "ShellExecuteW print failed with code {result}. \
             Ensure the printer '{printer_name}' is installed and the HTML file association is set."
        ))
    }
}

#[cfg(not(target_os = "windows"))]
fn silent_print(html_path: &PathBuf, printer_name: &str) -> Result<(), String> {
    let mut cmd = std::process::Command::new("lpr");
    if !printer_name.is_empty() {
        cmd.args(["-P", printer_name]);
    }
    cmd.arg(html_path);

    let status = cmd.status().map_err(|e| format!("lpr failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "lpr exited with status {status}. Check that the printer '{printer_name}' is configured."
        ))
    }
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

fn write_temp_html(html: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir();
    let filename = format!("receipt_{}.html", uuid_simple());
    let path = dir.join(filename);
    std::fs::write(&path, html.as_bytes()).map_err(|e| format!("Failed to write temp file: {e}"))?;
    Ok(path)
}

fn path_to_file_url(path: &PathBuf) -> Result<url::Url, String> {
    url::Url::from_file_path(path)
        .map_err(|_| format!("Cannot convert path to file URL: {}", path.display()))
}

/// Injects a floating print button and print-on-load blocker into the HTML.
/// The button uses `window.print()` which shows the system print dialog.
fn inject_preview_controls(html: &str) -> String {
    let title = if let Some(start_idx) = html.find("<title>") {
        if let Some(end_idx) = html[start_idx..].find("</title>") {
            html[start_idx + 7..start_idx + end_idx].to_string()
        } else {
            "Receipt Preview".to_string()
        }
    } else {
        "Receipt Preview".to_string()
    };

    let controls = format!(
        r#"
<style>
  #preview-print-bar {{
    position: fixed;
    top: 0; left: 0; right: 0;
    background: #1a1a2e;
    color: #fff;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 9999;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    gap: 12px;
  }}
  #preview-print-bar span {{ color: #ffffff; opacity: 1; font-size: 13px; font-weight: 600; }}
  #preview-print-btn {{
    background: #4ade80;
    color: #111;
    border: none;
    border-radius: 6px;
    padding: 6px 18px;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
  }}
  #preview-print-btn:hover {{ background: #22c55e; }}
  body {{ padding-top: 44px !important; }}
  @media print {{
    #preview-print-bar {{ display: none !important; }}
    body {{ padding-top: 0 !important; }}
  }}
</style>
<div id="preview-print-bar">
  <span>{}</span>
  <button id="preview-print-btn" onclick="window.print()">Print</button>
</div>
"#,
        title
    );

    // Insert controls right after <body> tag
    if let Some(idx) = html.find("<body") {
        if let Some(end) = html[idx..].find('>') {
            let insert_at = idx + end + 1;
            let mut result = html.to_string();
            result.insert_str(insert_at, &controls);
            return result;
        }
    }

    // Fallback: prepend to the HTML
    format!("{controls}{html}")
}

/// Simple UUID-like unique string using timestamp + random-ish counter
fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{ts:x}")
}
