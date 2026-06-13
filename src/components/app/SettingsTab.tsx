import { usePrinterSettings } from '../../hooks/usePrinterSettings';

interface SettingsTabProps {
  testingMode: boolean;
  analyticsExperimentalEnabled: boolean;
  exportFolderPath: string;
  onToggleTestingMode: (value: boolean) => void;
  onToggleAnalyticsExperimental: (value: boolean) => void;
  onChooseExportFolder: () => void;
  onClearExportFolder: () => void;
  onCleanDatabase: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Printer Settings Section (self-contained sub-component)
// ---------------------------------------------------------------------------

function PrinterSettingsSection() {
  const {
    printers,
    settings,
    isLoading,
    error,
    setPrinter,
    refreshPrinters,
  } = usePrinterSettings();

  return (
    <div className="settings-card" style={{ marginTop: 24 }}>
      {/* Section heading */}
        <div style={{ padding: '10px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="settings-title" style={{ fontSize: 20 }}>Printer Settings</div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            margin: '12px 20px 0',
            padding: '8px 12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#b91c1c',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Printer selection */}
      <div className="settings-row">
        <div>
          <div className="settings-title">Receipt Printer</div>
          <div className="muted">
            {printers.length === 0 && !isLoading
              ? 'No printers found. Install a printer driver and click Refresh.'
              : 'Select the thermal printer to print bills and KOTs.'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, minWidth: 280, maxWidth: 400 }}>
          <select
            id="printer-select"
            className="input-field"
            value={settings.printerName}
            disabled={isLoading}
            onChange={e => void setPrinter(e.target.value)}
            style={{ width: '100%' }}
            aria-label="Select printer"
          >
            {settings.printerName === '' && (
              <option value="" disabled>— choose a printer —</option>
            )}
            {printers.map(p => (
              <option key={p.name} value={p.name}>
                {p.name}{p.isDefault ? ' (default)' : ''}
              </option>
            ))}
            {/* If saved printer isn't in the current list, keep it visible */}
            {settings.printerName !== '' && !printers.some(p => p.name === settings.printerName) && (
              <option value={settings.printerName}>{settings.printerName} (not detected)</option>
            )}
          </select>

          <button
            type="button"
            className="btn btn-ghost"
            disabled={isLoading}
            onClick={() => void refreshPrinters()}
            style={{ justifySelf: 'flex-start' }}
          >
            {isLoading ? 'Loading…' : '↻ Refresh printers'}
          </button>
        </div>
      </div>

      {/* Preview test print */}
      {/* <div className="settings-row">
        <div>
          <div className="settings-title">Print Preview</div>
          <div className="muted">
            Opens a sample receipt at the configured paper width. Use to verify layout before printing.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handlePreview}
          >
            Preview sample bill
          </button>
        </div>
      </div> */}

      {/* Current config summary */}
      {/* {(settings.printerName || settings.paperWidthMm) && (
        <div
          style={{
            margin: '0 20px 16px',
            padding: '10px 14px',
            background: 'var(--surface-alt, #f9fafb)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 8,
            fontSize: 11,
            color: 'var(--muted, #6b7280)',
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong>Printer:</strong>{' '}
            {settings.printerName || <em>not set</em>}
          </span>
          <span>
            <strong>Paper:</strong> {settings.paperWidthMm} mm
          </span>
        </div>
      )} */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsTab
// ---------------------------------------------------------------------------

export default function SettingsTab({
  testingMode,
  analyticsExperimentalEnabled,
  exportFolderPath,
  onToggleTestingMode,
  onToggleAnalyticsExperimental,
  onChooseExportFolder,
  onClearExportFolder,
  onCleanDatabase,
}: SettingsTabProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Settings</h2>
        </div>
        <div>Mode: <span style={{ fontWeight: 700 }}>{testingMode ? " Test Mode" : " Main Mode"}</span></div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <div className="settings-title">Export folder path</div>
            <div className="muted">All exported ledger pdfs and xlsx are saved here.</div>
          </div>
          <div style={{ display: 'grid', gap: 8, minWidth: 280, maxWidth: 420, width: '100%' }}>
            <div
              className="input-field"
              style={{ display: 'flex', alignItems: 'center', minHeight: 42, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={exportFolderPath || 'No folder selected'}
              >
              {exportFolderPath || 'No folder selected'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={onChooseExportFolder}>Choose folder</button>
              <button type="button" className="btn btn-ghost" onClick={onClearExportFolder}>Clear</button>
            </div>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-title">Experimental analytics</div>
            <div className="muted">Enable the analytics tab (experimental). Still in development.</div>
          </div>
          <label className="switch" aria-label="Experimental analytics toggle">
            <input
              type="checkbox"
              checked={analyticsExperimentalEnabled}
              onChange={e => onToggleAnalyticsExperimental(e.target.checked)}
              />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-title">Testing mode</div>
            <div className="muted">Temporary database is used for experimentation only.</div>
          </div>
          <label className="switch" aria-label="Testing mode toggle">
            <input
              type="checkbox"
              checked={testingMode}
              onChange={e => onToggleTestingMode(e.target.checked)}
            />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-title">Clean current database</div>
            <div className="muted">Erases whole data in current database. Carefully proceed!</div>
          </div>
          <div>
            <button className="btn btn-danger" onClick={() => void onCleanDatabase()}>
              Clean current DB
            </button>
          </div>
        </div>
      </div>

      {/* Printer Settings — separate card below */}
      <PrinterSettingsSection />
    </div>
  );
}