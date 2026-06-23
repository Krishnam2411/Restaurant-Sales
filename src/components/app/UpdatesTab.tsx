import type { UpdateStatus } from './appTypes';

interface UpdatesTabProps {
  updateStatus: UpdateStatus;
  updateNote: string;
  updateVersion: string | null;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
  backupUrl: string;
  onBackupUrlChange: (url: string) => void;
  lastBackupTime: string | null;
  isBackuping: boolean;
  onBackupOnline: () => void;
  onDownloadBackup: () => void;
  onRestoreBackup: () => void;

  // Google Drive Sync properties
  isGDriveConnected: boolean;
  isGDriveSyncing: boolean;
  gdriveLastSync: string | null;
  gdriveAutoSyncStartup: boolean;
  gdriveAutoSyncShutdown: boolean;
  onConnectGDrive: () => void;
  onDisconnectGDrive: () => void;
  onSyncGDriveNow: () => void;
  onToggleGDriveAutoSyncStartup: () => void;
  onToggleGDriveAutoSyncShutdown: () => void;
}

export default function UpdatesTab({
  updateStatus,
  updateNote,
  updateVersion,
  onCheckUpdates,
  onInstallUpdate,
  backupUrl,
  onBackupUrlChange,
  lastBackupTime,
  isBackuping,
  onBackupOnline,
  onDownloadBackup,
  onRestoreBackup,

  isGDriveConnected,
  isGDriveSyncing,
  gdriveLastSync,
  gdriveAutoSyncStartup,
  gdriveAutoSyncShutdown,
  onConnectGDrive,
  onDisconnectGDrive,
  onSyncGDriveNow,
  onToggleGDriveAutoSyncStartup,
  onToggleGDriveAutoSyncShutdown,
}: UpdatesTabProps) {
  return (
    <div className="panel" style={{ paddingBottom: '40px' }}>
      <div className="panel-header">
        <div>
          <h2>App Settings & Updates</h2>
        </div>
      </div>

      {/* App Version / Updates Card */}
      <div className="updates-card">
        <div className="updates-row">
          <div>
            <div className="updates-title">App Version</div>
            <div className="updates-note">{updateNote || 'Ready to check for updates.'}</div>
          </div>
          <span className={`pill ${updateStatus === 'available' ? 'active' : 'inactive'}`}>
            {updateStatus === 'available' ? 'Update available' : 'Up to date'}
          </span>
        </div>
        {updateVersion && <div className="updates-meta">Latest version: {updateVersion}</div>}
        <div className="updates-actions">
          <button
            className="btn btn-ghost"
            onClick={onCheckUpdates}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
          >
            Check for Updates
          </button>
          <button
            className="btn btn-primary"
            onClick={onInstallUpdate}
            disabled={updateStatus !== 'available'}
          >
            Install Update
          </button>
        </div>
      </div>

      {/* Native Google Drive Sync Card */}
      <div className="updates-card" style={{ marginTop: '24px' }}>
        <div className="updates-row">
          <div>
            <div className="updates-title">Google Drive Sync</div>
            <div className="updates-note">
              {isGDriveConnected
                ? 'Automatically or manually sync your sales database to your Google Drive account.'
                : 'Authorize the application to backup your data directly to a file on your Google Drive.'}
            </div>
          </div>
          <span className={`pill ${isGDriveConnected ? 'active' : 'inactive'}`}>
            {isGDriveConnected ? 'Linked' : 'Not Connected'}
          </span>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!isGDriveConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="updates-meta" style={{ margin: 0, fontSize: '0.85rem', color: '#a6adc8' }}>
                Note: Backups will be saved as a visible database file (`aalsi_chatore_backup.db`) on your GDrive.
              </div>
              <div style={{ marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onConnectGDrive}
                  style={{ width: 'auto' }}
                >
                  Link Google Drive Account
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Auto Sync Settings */}
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', borderBottom: '1px solid #313244', paddingBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#cdd6f4' }}>
                  <input
                    type="checkbox"
                    checked={gdriveAutoSyncStartup}
                    onChange={onToggleGDriveAutoSyncStartup}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  Auto-Sync on Startup
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#cdd6f4' }}>
                  <input
                    type="checkbox"
                    checked={gdriveAutoSyncShutdown}
                    onChange={onToggleGDriveAutoSyncShutdown}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  Auto-Sync on Close
                </label>
              </div>

              {/* Sync Actions Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <span className="updates-meta" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Last Google Drive backup: {gdriveLastSync ? new Date(gdriveLastSync).toLocaleString() : 'Never'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onDisconnectGDrive}
                    style={{ color: '#f38ba8' }}
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onSyncGDriveNow}
                    disabled={isGDriveSyncing}
                    style={{ minWidth: '130px' }}
                  >
                    {isGDriveSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Local Backup & Restore Card */}
      <div className="updates-card" style={{ marginTop: '24px' }}>
        <div className="updates-row">
          <div>
            <div className="updates-title">Database Backup & Restore</div>
            <div className="updates-note">Export/import your local SQLite database directly or save a copy to your online backup server.</div>
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="input-label" htmlFor="backup-url-input" style={{ fontWeight: '500', fontSize: '0.9rem' }}>
              Backup Server URL
            </label>
            <input
              id="backup-url-input"
              type="url"
              className="input-field"
              placeholder="https://example.com/api/backup"
              value={backupUrl}
              onChange={e => onBackupUrlChange(e.target.value)}
              style={{ width: '100%', padding: '10px 12px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
            <span className="updates-meta" style={{ margin: 0, fontSize: '0.85rem' }}>
              Last online backup: {lastBackupTime ? new Date(lastBackupTime).toLocaleString() : 'Never'}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onDownloadBackup}
              >
                Export Database (.db)
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onRestoreBackup}
              >
                Restore Database (.db)
              </button>
              <button
                className="btn btn-primary"
                onClick={onBackupOnline}
                disabled={isBackuping || !backupUrl.trim()}
                style={{ minWidth: '130px' }}
              >
                {isBackuping ? 'Saving Online...' : 'Save Online'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}