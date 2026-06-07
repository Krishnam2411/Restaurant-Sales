import type { TabConfig, TabKey, UpdateStatus } from './appTypes';
import Icon from '../shared/Icon';

interface AppSidebarProps {
  tabs: TabConfig[];
  activeTab: TabKey;
  sidebarCollapsed: boolean;
  updateStatus: UpdateStatus;
  restaurantName: string;
  restaurantTagline: string;
  mascotSrc: string;
  onToggleSidebar: () => void;
  onSelectTab: (tab: TabKey) => void;
  onOpenUpdates: () => void;
  onOpenSettings: () => void;
}

export default function AppSidebar({
  tabs,
  activeTab,
  sidebarCollapsed,
  updateStatus,
  restaurantName,
  restaurantTagline,
  mascotSrc,
  onToggleSidebar,
  onSelectTab,
  onOpenUpdates,
  onOpenSettings,
}: AppSidebarProps) {
  return (
    <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="brand-card"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="brand-mark">
          <img className="brand-mascot" src={mascotSrc} alt={`${restaurantName} mascot`} />
          <Icon
            name={sidebarCollapsed ? 'panel-left-open' : 'panel-left-close'}
            size={24}
            className="brand-toggle-icon"
          />
        </span>
        <div className="brand-copy">
          <div className="brand-title">{restaurantName}</div>
          <div className="brand-subtitle">{restaurantTagline}</div>
        </div>
      </button>

      <nav className="sidebar-nav">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`nav-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => onSelectTab(tab.key)}
            title={sidebarCollapsed ? tab.label : undefined}
          >
            <span className="nav-tab-icon-wrap">
              <Icon name={tab.icon} size={24} className="nav-tab-icon" />
            </span>
            <span className="nav-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`nav-tab${activeTab === 'updates' ? ' active' : ''}`}
          onClick={onOpenUpdates}
          title={sidebarCollapsed ? 'Updates' : undefined}
        >
          <span className="nav-tab-icon-wrap">
            <Icon name="download" size={24} className="nav-tab-icon" />
          </span>
          <span className="nav-tab-label">Updates</span>
          <span className="nav-tab-sub">
            {updateStatus === 'available'
              ? 'Update available'
              : updateStatus === 'checking'
                ? 'Checking...'
                : updateStatus === 'unsupported'
                  ? 'Desktop only'
                  : 'Auto updates'}
          </span>
        </button>
        <button
          type="button"
          className={`nav-tab${activeTab === 'settings' ? ' active' : ''}`}
          onClick={onOpenSettings}
          title={sidebarCollapsed ? 'Settings' : undefined}
        >
          <span className="nav-tab-icon-wrap">
            <Icon name="settings" size={24} className="nav-tab-icon" />
          </span>
          <span className="nav-tab-label">Settings</span>
          <span className="nav-tab-sub">Preferences</span>
        </button>
      </div>
    </aside>
  );
}