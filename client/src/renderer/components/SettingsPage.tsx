type SettingsSection = 'account' | 'voice' | 'appearance';

export function SettingsPage({ username, section, onSectionChange }: { username: string; section: SettingsSection; onSectionChange: (section: SettingsSection) => void }) {
  return <div className="settings-page">
    <header className="page-heading"><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p>Manage your Community Chat desktop experience.</p></header>
    <nav className="settings-tabs" aria-label="Settings sections">
      {(['account', 'voice', 'appearance'] as const).map((item) => <button key={item} className={section === item ? 'selected' : ''} onClick={() => onSectionChange(item)}>{item === 'voice' ? 'Voice & Audio' : item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>
    <section className="settings-section">
      {section === 'account' && <><h2>Account</h2><p className="muted">Signed in as <strong>{username}</strong></p><div className="setting-row"><div><strong>Presence</strong><small>Your status is online while Community Chat is open.</small></div><span className="online-pill"><i />Online</span></div></>}
      {section === 'voice' && <><h2>Voice & Audio</h2><p className="muted">Voice uses your system’s current microphone and speaker.</p><div className="setting-row"><div><strong>Microphone controls</strong><small>Mute in voice with the microphone button or Ctrl+Shift+M.</small></div><span className="setting-note">Device options are planned for a later milestone.</span></div></>}
      {section === 'appearance' && <><h2>Appearance</h2><p className="muted">The desktop client currently uses the Community dark theme.</p><div className="setting-row"><div><strong>Theme</strong><small>Interface appearance</small></div><span className="setting-note">Dark</span></div></>}
    </section>
  </div>;
}
