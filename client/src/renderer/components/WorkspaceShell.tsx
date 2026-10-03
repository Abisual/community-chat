import { ReactNode } from 'react';

export type WorkspaceView = 'friends' | 'requests' | 'messages' | 'chat' | 'voice' | 'settings';

interface WorkspaceShellProps {
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  badges: Partial<Record<WorkspaceView, number>>;
  username: string;
  onLogout: () => void;
  sidebar: ReactNode;
  children: ReactNode;
  details: ReactNode;
  voiceDock: ReactNode;
}

const navigation: Array<{ view: WorkspaceView; icon: string; label: string }> = [
  { view: 'chat', icon: '#', label: 'Community chat' },
  { view: 'friends', icon: '◎', label: 'Friends' },
  { view: 'requests', icon: '↗', label: 'Friend requests' },
  { view: 'messages', icon: '✉', label: 'Direct messages' },
  { view: 'voice', icon: '◖', label: 'Voice rooms' }
];

export function WorkspaceShell({ activeView, onNavigate, badges, username, onLogout, sidebar, children, details, voiceDock }: WorkspaceShellProps) {
  return <main className="desktop-shell">
    <nav className="navigation-rail" aria-label="Main navigation">
      <button className="rail-brand" aria-label="Community Chat" title="Community Chat">C</button>
      <div className="rail-divider" />
      {navigation.map((item) => <button
        key={item.view}
        className={`rail-item ${activeView === item.view ? 'selected' : ''}`}
        aria-label={item.label}
        aria-current={activeView === item.view ? 'page' : undefined}
        title={item.label}
        onClick={() => onNavigate(item.view)}
      >
        <span aria-hidden="true">{item.icon}</span>
        {!!badges[item.view] && <small>{badges[item.view]! > 9 ? '9+' : badges[item.view]}</small>}
      </button>)}
      <div className="rail-spacer" />
      <button className={`rail-item ${activeView === 'settings' ? 'selected' : ''}`} aria-label="Settings" title="Settings" onClick={() => onNavigate('settings')}>
        <span aria-hidden="true">⚙</span>
      </button>
    </nav>

    <aside className="workspace-sidebar">{sidebar}</aside>
    <section className="workspace-main">{children}</section>
    <aside className="details-panel">{details}</aside>

    <footer className="voice-account-dock">
      <div className="voice-dock-content">{voiceDock}</div>
      <div className="account-dock">
        <span className="account-avatar">{username.slice(0, 1).toUpperCase()}</span>
        <span className="account-copy"><strong>{username}</strong><small><i />Online</small></span>
        <button className="dock-icon-button" aria-label="Open settings" title="Settings" onClick={() => onNavigate('settings')}>⚙</button>
        <button className="dock-icon-button" aria-label="Sign out" title="Sign out" onClick={onLogout}>⇥</button>
      </div>
    </footer>
  </main>;
}
