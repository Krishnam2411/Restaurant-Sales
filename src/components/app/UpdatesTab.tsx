import type { UpdateStatus } from './appTypes';

interface UpdatesTabProps {
  updateStatus: UpdateStatus;
  updateNote: string;
  updateVersion: string | null;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
}

export default function UpdatesTab({
  updateStatus,
  updateNote,
  updateVersion,
  onCheckUpdates,
  onInstallUpdate,
}: UpdatesTabProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>App Updates</h2>
        </div>
      </div>
      <div className="updates-card">
        <div className="updates-row">
          <div>
            <div className="updates-title">Status</div>
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
    </div>
  );
}