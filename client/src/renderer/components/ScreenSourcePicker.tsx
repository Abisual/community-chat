interface ScreenSourcePickerProps {
  sources: ScreenShareSource[];
  selectedId: string | null;
  busy: boolean;
  loading: boolean;
  error: string | null;
  onSelect: (source: ScreenShareSource) => void;
  onStart: () => void;
  onCancel: () => void;
}

export function ScreenSourcePicker({ sources, selectedId, busy, loading, error, onSelect, onStart, onCancel }: ScreenSourcePickerProps) {
  return <div className="modal-backdrop" role="presentation">
    <section className="source-picker" role="dialog" aria-modal="true" aria-labelledby="source-picker-title">
      <header className="source-picker-header">
        <div><p className="eyebrow">LIVEKIT SCREEN SHARE</p><h2 id="source-picker-title">Choose what to share</h2></div>
        <button className="subtle-button" onClick={onCancel} aria-label="Cancel screen sharing">×</button>
      </header>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading ? <p className="empty-state compact">Looking for screens and windows…</p> : sources.length === 0 ? <p className="empty-state compact">No screens or windows are available.</p> : <div className="source-grid">
        {sources.map((source) => <button
          key={source.id}
          className={`source-option ${selectedId === source.id ? 'selected' : ''}`}
          aria-pressed={selectedId === source.id}
          disabled={busy}
          onClick={() => onSelect(source)}
        >
          <img src={source.thumbnail} alt="" />
          <span className="source-kind">{source.kind === 'screen' ? 'Entire screen' : 'Application window'}</span>
          <strong>{source.name}</strong>
        </button>)}
      </div>}
      <footer className="source-picker-footer">
        <p>Your microphone continues to use the current voice connection.</p>
        <div><button className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary-button" disabled={!selectedId || busy} onClick={onStart}>{busy ? 'Starting…' : 'Share screen'}</button></div>
      </footer>
    </section>
  </div>;
}
