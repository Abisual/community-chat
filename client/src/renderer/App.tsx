import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Participant, Room, RoomEvent, Track } from 'livekit-client';

interface Session {
  user: { id: number; username: string };
  accessToken: string;
}

interface ChatEvent {
  type: string;
  message?: ChatMessage;
  messages?: ChatMessage[];
  users?: Array<{ id: number; username: string }>;
  user?: { id: number; username: string; status: 'online' | 'offline' };
  error?: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<Map<number, string>>(new Map());
  const [chatStatus, setChatStatus] = useState('Connecting');
  const [draft, setDraft] = useState('');
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [voiceRoom, setVoiceRoom] = useState<Room | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<Room | null>(null);
  const micRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const updateSessionToken = useCallback((accessToken: string) => {
    setSession((current) => {
      if (!current) return current;
      const updated = { ...current, accessToken };
      sessionRef.current = updated;
      return updated;
    });
  }, []);

  const refreshRoomParticipants = useCallback((room: Room) => {
    setParticipants([room.localParticipant, ...room.remoteParticipants.values()]);
  }, []);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !micRef.current;
    micRef.current = enabled;
    setMicEnabled(enabled);
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
    } catch (reason) {
      micRef.current = false;
      setMicEnabled(false);
      setError(reason instanceof Error ? reason.message : 'Could not change microphone state');
    }
  }, []);

  useEffect(() => {
    let active = true;
    window.desktop.restoreSession()
      .then((restored) => { if (active) { sessionRef.current = restored; setSession(restored); } })
      .catch(() => { if (active) setError('Could not restore your session'); })
      .finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => window.desktop.onToggleMute(() => { void toggleMicrophone(); }), [toggleMicrophone]);

  useEffect(() => {
    if (!session) {
      setRooms([]);
      return;
    }
    let active = true;
    window.desktop.getVoiceRooms(session.accessToken)
      .then((result) => {
        if (!active) return;
        updateSessionToken(result.accessToken);
        setRooms(result.data.rooms);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load voice rooms'); });
    return () => { active = false; };
  }, [session?.user.id, session?.accessToken, updateSessionToken]);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;
    let socket: WebSocket;

    const connect = async (accessToken: string) => {
      if (disposed) return;
      const url = await window.desktop.getChatSocketUrl();
      if (disposed) return;
      socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        reconnectAttempt = 0;
        socket.send(JSON.stringify({ type: 'authenticate', accessToken }));
      };
      socket.onmessage = (event) => {
        let payload: ChatEvent;
        try { payload = JSON.parse(String(event.data)) as ChatEvent; }
        catch { return; }
        if (payload.type === 'authenticated') setChatStatus('Connected');
        if (payload.type === 'error') setError(payload.error || 'Chat request failed');
        if (payload.type === 'chat.history' && payload.messages) {
          setChatMessages(payload.messages);
        }
        if (payload.type === 'chat.message' && payload.message) {
          setChatMessages((current) => current.some((item) => item.id === payload.message!.id)
            ? current
            : [...current, payload.message!].slice(-100));
        }
        if (payload.type === 'presence.snapshot' && payload.users) {
          setPresence(new Map(payload.users.map((user) => [user.id, user.username])));
        }
        if (payload.type === 'presence.changed' && payload.user) {
          setPresence((current) => {
            const next = new Map(current);
            if (payload.user!.status === 'online') next.set(payload.user!.id, payload.user!.username);
            else next.delete(payload.user!.id);
            return next;
          });
        }
      };
      socket.onerror = () => setChatStatus('Connection problem');
      socket.onclose = () => {
        socketRef.current = null;
        if (disposed) return;
        setChatStatus('Reconnecting');
        reconnectAttempt++;
        const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempt - 1, 4), 15000);
        reconnectTimer = setTimeout(async () => {
          const refreshed = await window.desktop.refreshAccessToken().catch(() => undefined);
          if (refreshed === undefined) {
            if (!disposed) await connect(accessToken).catch(() => undefined);
            return;
          }
          if (refreshed === null) {
            if (!disposed) { setSession(null); sessionRef.current = null; }
            return;
          }
          if (disposed) return;
          updateSessionToken(refreshed.accessToken);
          await connect(refreshed.accessToken);
        }, delay);
      };
    };

    void connect(session.accessToken).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not connect to chat'));
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [session?.user.id, session?.accessToken, updateSessionToken]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => () => {
    roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setAuthBusy(true);
    try {
      const next = authMode === 'login'
        ? await window.desktop.login(username, password)
        : await window.desktop.register(username, password);
      sessionRef.current = next;
      setSession(next);
      setPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setVoiceRoom(null);
    setParticipants([]);
    await window.desktop.logout().catch(() => undefined);
    sessionRef.current = null;
    setSession(null);
    setChatMessages([]);
    setPresence(new Map());
  };

  const joinVoiceRoom = async (selected: VoiceRoom) => {
    if (!session || voiceBusy) return;
    setVoiceBusy(true);
    setError('');
    try {
      const response = await window.desktop.getVoiceToken(session.accessToken, selected.id);
      updateSessionToken(response.accessToken);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      const refresh = () => refreshRoomParticipants(room);
      room.on(RoomEvent.ParticipantConnected, refresh);
      room.on(RoomEvent.ParticipantDisconnected, refresh);
      room.on(RoomEvent.ActiveSpeakersChanged, refresh);
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        element.style.display = 'none';
        document.body.appendChild(element);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((element) => element.remove()));
      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setVoiceRoom(null);
        setVoiceName('');
        setParticipants([]);
        micRef.current = false;
        setMicEnabled(false);
      });
      await room.connect(response.data.url, response.data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setVoiceRoom(room);
      setVoiceName(response.data.room.name);
      micRef.current = true;
      setMicEnabled(true);
      refreshRoomParticipants(room);
    } catch (reason) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setError(reason instanceof Error ? reason.message : 'Could not join the voice room');
    } finally {
      setVoiceBusy(false);
    }
  };

  const leaveVoiceRoom = async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setVoiceRoom(null);
    setVoiceName('');
    setParticipants([]);
    micRef.current = false;
    setMicEnabled(false);
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    const socket = socketRef.current;
    if (!content || !socket || socket.readyState !== WebSocket.OPEN || content.length > 2000) return;
    socket.send(JSON.stringify({ type: 'chat.send', content }));
    setDraft('');
  };

  if (sessionLoading) return <main className="loading">Starting Community Chat…</main>;
  if (!session) {
    return <main className="auth-screen">
      <form className="auth-card" onSubmit={submitAuth}>
        <div className="brand-mark">C</div>
        <p className="eyebrow">COMMUNITY CHAT</p>
        <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">Sign in to join the conversation.</p>
        <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={50} required /></label>
        <label>Password<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary full" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Register'}</button>
        <button type="button" className="link-button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}>
          {authMode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
        </button>
      </form>
    </main>;
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><span className="brand-mark small">C</span><span>Community</span></div>
      <div className="section-title">VOICE ROOMS <span>{rooms.length}</span></div>
      <div className="room-list">
        {rooms.map((room) => <button key={room.id} className={`room-item ${voiceRoom?.name === room.name ? 'selected' : ''}`} disabled={voiceBusy || !!voiceRoom} onClick={() => void joinVoiceRoom(room)}>
          <span className="room-icon">◖</span><span className="room-copy"><strong>{room.name}</strong><small>{room.description}</small></span>
        </button>)}
        {rooms.length === 0 && <p className="sidebar-empty">No active rooms</p>}
      </div>
      {voiceRoom && <div className="voice-sidebar">
        <div className="voice-heading"><span className="live-dot" /> IN VOICE <span>{participants.length}</span></div>
        <strong className="voice-room-name">{voiceName}</strong>
        <div className="participant-list">{participants.map((participant) => <div className="participant" key={participant.identity}>
          <span className={`avatar ${participant.isSpeaking ? 'speaking' : ''}`}>{(participant.name || participant.identity).slice(0, 1).toUpperCase()}</span>
          <span>{participant.name || participant.identity}{participant.isLocal ? ' (you)' : ''}</span>
          <span className={`mic-state ${participant.isSpeaking ? 'speaking-text' : ''}`}>{participant.isSpeaking ? 'Speaking' : ''}</span>
        </div>)}</div>
        <div className="voice-sidebar-controls">
          <button className={`control-button ${micEnabled ? '' : 'muted'}`} onClick={() => void toggleMicrophone()} title="Toggle microphone (Ctrl+Shift+M)">{micEnabled ? '🎙 Mic on' : '🔇 Muted'}</button>
          <button className="leave-button" onClick={() => void leaveVoiceRoom()}>Leave voice</button>
        </div>
      </div>}
      <div className="account-card">
        <span className="avatar account-avatar">{session.user.username.slice(0, 1).toUpperCase()}</span>
        <span className="account-name"><strong>{session.user.username}</strong><small>Online</small></span>
        <button className="icon-button" title="Sign out" onClick={() => void logout()}>↪</button>
      </div>
    </aside>

    <section className="chat-panel">
      <header className="chat-header">
        <div><div className="chat-title"><span className="hash">#</span> community</div><small>One place to talk with everyone</small></div>
        <div className="chat-connection"><span className={`status-dot ${chatStatus === 'Connected' ? 'online' : ''}`} />{chatStatus}</div>
      </header>
      <div className="chat-body">
        {chatMessages.length === 0 && <div className="chat-intro"><div className="intro-hash">#</div><h2>Welcome to the community</h2><p>This is the beginning of the global chat.</p></div>}
        {chatMessages.map((message) => <article className="message" key={message.id}>
          <span className="avatar message-avatar">{message.username.slice(0, 1).toUpperCase()}</span>
          <div className="message-content"><div><strong>{message.username}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.content}</p></div>
        </article>)}
        <div ref={chatEndRef} />
      </div>
      <form className="composer" onSubmit={sendMessage}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message #community`} maxLength={2000} />
        <button className="send-button" disabled={!draft.trim() || chatStatus !== 'Connected'} aria-label="Send message">↑</button>
      </form>
    </section>

    <aside className="members-panel">
      <div className="members-title">ONLINE — {presence.size}</div>
      {[...presence.entries()].map(([id, name]) => <div className="member" key={id}>
        <span className="avatar member-avatar">{name.slice(0, 1).toUpperCase()}<i /></span><span>{name}{id === session.user.id ? ' (you)' : ''}</span>
      </div>)}
    </aside>

    {error && <div role="alert" className="toast-error"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    {voiceBusy && <div className="busy-indicator">Connecting to voice…</div>}
  </main>;
}
