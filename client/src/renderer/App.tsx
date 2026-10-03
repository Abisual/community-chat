import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Participant, Room, RoomEvent, Track } from 'livekit-client';
import { mergePrivateMessages, updateFriendPresence } from './social-state';

interface Session {
  user: { id: number; username: string };
  accessToken: string;
}

interface ChatEvent {
  type: string;
  message?: ChatMessage | PrivateMessage;
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
  const [friends, setFriends] = useState<SocialUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [socialSearch, setSocialSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SocialUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialBusyId, setSocialBusyId] = useState<number | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [privateMessages, setPrivateMessages] = useState<PrivateMessage[]>([]);
  const [privateHasMore, setPrivateHasMore] = useState(false);
  const [privateCursor, setPrivateCursor] = useState<string | null>(null);
  const [privateDraft, setPrivateDraft] = useState('');
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateBusy, setPrivateBusy] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<Room | null>(null);
  const micRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);
  selectedConversationRef.current = selectedConversation;

  const updateSessionToken = useCallback((accessToken: string) => {
    setSession((current) => {
      if (!current) return current;
      const updated = { ...current, accessToken };
      sessionRef.current = updated;
      return updated;
    });
  }, []);

  const refreshSocialData = useCallback(async (accessToken: string) => {
    const [friendResult, requestResult] = await Promise.all([
      window.desktop.getFriends(accessToken),
      window.desktop.getFriendRequests(accessToken)
    ]);
    updateSessionToken(requestResult.accessToken);
    setFriends(friendResult.data.friends);
    setIncomingRequests(requestResult.data.incoming);
    setOutgoingRequests(requestResult.data.outgoing);
  }, [updateSessionToken]);

  useEffect(() => {
    if (!session) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setSearchResults([]);
      setSelectedConversation(null);
      setPrivateMessages([]);
      return;
    }
    let active = true;
    setSocialLoading(true);
    refreshSocialData(session.accessToken)
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load friends'); })
      .finally(() => { if (active) setSocialLoading(false); });
    return () => { active = false; };
  }, [session?.user.id, refreshSocialData]);

  useEffect(() => {
    const query = socialSearch.trim();
    if (!session || query.length < 2) { setSearchResults([]); setSearchLoading(false); return; }
    let active = true;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      window.desktop.searchUsers(sessionRef.current?.accessToken ?? session.accessToken, query)
        .then((result) => {
          if (!active) return;
          updateSessionToken(result.accessToken);
          setSearchResults(result.data.users);
        })
        .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'User search failed'); })
        .finally(() => { if (active) setSearchLoading(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [socialSearch, session?.user.id, updateSessionToken]);

  useEffect(() => {
    if (!session || !selectedConversation) { setPrivateMessages([]); return; }
    let active = true;
    setPrivateLoading(true);
    window.desktop.getPrivateMessages(sessionRef.current?.accessToken ?? session.accessToken, selectedConversation.id, 50)
      .then((result) => {
        if (!active) return;
        updateSessionToken(result.accessToken);
        setPrivateMessages(result.data.messages);
        setPrivateHasMore(result.data.hasMore);
        setPrivateCursor(result.data.nextBeforeId);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load conversation'); })
      .finally(() => { if (active) setPrivateLoading(false); });
    return () => { active = false; };
  }, [selectedConversation?.id, session?.user.id, updateSessionToken]);

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
          const message = payload.message as ChatMessage;
          setChatMessages((current) => current.some((item) => item.id === message.id)
            ? current
            : [...current, message].slice(-100));
        }
        if (payload.type === 'private.message' && payload.message) {
          const message = payload.message as PrivateMessage;
          if (message.conversation_id === selectedConversationRef.current?.id) {
            setPrivateMessages((current) => mergePrivateMessages(current, [message]).slice(-500));
          }
        }
        if (payload.type.startsWith('friend.')) {
          const current = sessionRef.current;
          if (current) void refreshSocialData(current.accessToken).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not refresh friends'));
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
          setFriends((current) => updateFriendPresence(current, payload.user!.id, payload.user!.status));
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
  }, [session?.user.id, updateSessionToken, refreshSocialData]);

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
    setFriends([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setSearchResults([]);
    setSelectedConversation(null);
    setPrivateMessages([]);
    setPrivateDraft('');
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

  const runSocialAction = async (userId: number, action: () => Promise<unknown>) => {
    if (!session) return;
    setSocialBusyId(userId);
    setError('');
    try {
      await action();
      await refreshSocialData(sessionRef.current?.accessToken ?? session.accessToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Social action failed');
    } finally { setSocialBusyId(null); }
  };

  const sendFriendRequest = (user: SocialUser) => runSocialAction(user.id, async () => {
    const result = await window.desktop.createFriendRequest(sessionRef.current!.accessToken, user.id);
    updateSessionToken(result.accessToken);
  });

  const respondToRequest = (item: FriendRequest, action: 'accept' | 'reject') => runSocialAction(item.id, async () => {
    const result = await window.desktop.respondFriendRequest(sessionRef.current!.accessToken, item.id, action);
    updateSessionToken(result.accessToken);
  });

  const removeFriend = (friend: SocialUser) => runSocialAction(friend.id, async () => {
    const result = await window.desktop.removeFriend(sessionRef.current!.accessToken, friend.id);
    updateSessionToken(result.accessToken);
    if (selectedConversationRef.current?.user.id === friend.id) setSelectedConversation(null);
  });

  const openPrivateConversation = async (user: SocialUser | { id: number; username: string }) => {
    if (!session) return;
    setSocialBusyId(user.id);
    setError('');
    try {
      const result = await window.desktop.openConversation(sessionRef.current?.accessToken ?? session.accessToken, user.id);
      updateSessionToken(result.accessToken);
      setPrivateDraft('');
      setSelectedConversation(result.data.conversation);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open conversation');
    } finally { setSocialBusyId(null); }
  };

  const loadOlderPrivateMessages = async () => {
    if (!session || !selectedConversation || !privateCursor || privateLoading) return;
    setPrivateLoading(true);
    try {
      const result = await window.desktop.getPrivateMessages(sessionRef.current?.accessToken ?? session.accessToken, selectedConversation.id, 50, privateCursor);
      updateSessionToken(result.accessToken);
      setPrivateMessages((current) => mergePrivateMessages(current, result.data.messages).slice(-500));
      setPrivateHasMore(result.data.hasMore);
      setPrivateCursor(result.data.nextBeforeId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load older messages');
    } finally { setPrivateLoading(false); }
  };

  const sendPrivateMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = privateDraft.trim();
    if (!session || !selectedConversation || !content || content.length > 2000 || privateBusy) return;
    setPrivateBusy(true);
    try {
      const result = await window.desktop.sendPrivateMessage(sessionRef.current?.accessToken ?? session.accessToken, selectedConversation.id, content);
      updateSessionToken(result.accessToken);
      const message = result.data.message;
      setPrivateMessages((current) => mergePrivateMessages(current, [message]).slice(-500));
      setPrivateDraft('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send private message');
    } finally { setPrivateBusy(false); }
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
      <div className="social-panel">
        <div className="social-heading">PEOPLE <span>{friends.length}</span></div>
        <label className="social-search-label">
          <span>Find people</span>
          <input value={socialSearch} onChange={(event) => setSocialSearch(event.target.value)} placeholder="Search username" maxLength={50} />
        </label>
        {socialSearch.trim().length >= 2 && <div className="social-results" aria-live="polite">
          {searchLoading && <p className="social-empty">Searching…</p>}
          {searchResults.map((user) => {
            const isFriend = friends.some((friend) => friend.id === user.id);
            const isPending = outgoingRequests.some((item) => item.user.id === user.id);
            return <div className="social-person" key={user.id}>
              <span className="social-person-name"><i className={`presence-dot ${user.status}`} />{user.username}</span>
              {isFriend
                ? <button className="mini-button" onClick={() => void openPrivateConversation(user)}>Message</button>
                : <button className="mini-button" disabled={isPending || socialBusyId === user.id} onClick={() => void sendFriendRequest(user)}>{isPending ? 'Pending' : 'Add'}</button>}
            </div>;
          })}
          {!searchLoading && !searchResults.length && <p className="social-empty">No users found.</p>}
        </div>}
        <div className="social-subheading">REQUESTS {incomingRequests.length ? `· ${incomingRequests.length}` : ''}</div>
        {socialLoading && !friends.length && <p className="social-empty">Loading people…</p>}
        {!socialLoading && !incomingRequests.length && !outgoingRequests.length && <p className="social-empty">No pending requests.</p>}
        {incomingRequests.map((item) => <div className="social-person request-row" key={item.id}>
          <span className="social-person-name">{item.user.username}</span>
          <button className="mini-button accept" disabled={socialBusyId === item.id} onClick={() => void respondToRequest(item, 'accept')}>Accept</button>
          <button className="mini-button reject" disabled={socialBusyId === item.id} onClick={() => void respondToRequest(item, 'reject')}>Reject</button>
        </div>)}
        {outgoingRequests.map((item) => <div className="social-person" key={item.id}><span className="social-person-name">{item.user.username}</span><small className="pending-label">Pending</small></div>)}
        <div className="social-subheading">FRIENDS</div>
        {!socialLoading && !friends.length && <p className="social-empty">Your friends will appear here.</p>}
        {friends.map((friend) => <div className="friend-row" key={friend.id}>
          <button className="friend-open" disabled={socialBusyId === friend.id} onClick={() => void openPrivateConversation(friend)}>
            <span className={`presence-dot ${friend.status}`} />
            <span><strong>{friend.username}</strong><small>{friend.status}</small></span>
          </button>
          <button className="friend-remove" title={`Remove ${friend.username}`} aria-label={`Remove ${friend.username}`} onClick={() => void removeFriend(friend)}>×</button>
        </div>)}
      </div>
      <div className="account-card">
        <span className="avatar account-avatar">{session.user.username.slice(0, 1).toUpperCase()}</span>
        <span className="account-name"><strong>{session.user.username}</strong><small>Online</small></span>
        <button className="icon-button" title="Sign out" onClick={() => void logout()}>↪</button>
      </div>
    </aside>

    <section className="chat-panel">
      <header className="chat-header">
        <div>{selectedConversation
          ? <><div className="chat-title">@ {selectedConversation.user.username}</div><small>Private conversation</small></>
          : <><div className="chat-title"><span className="hash">#</span> community</div><small>One place to talk with everyone</small></>}</div>
        {selectedConversation && <button className="mini-button" onClick={() => { setSelectedConversation(null); setPrivateDraft(''); }}>Global chat</button>}
        <div className="chat-connection"><span className={`status-dot ${chatStatus === 'Connected' ? 'online' : ''}`} />{chatStatus}</div>
      </header>
      {selectedConversation ? <>
        <div className="chat-body private-chat-body">
          {privateHasMore && <button className="load-older" disabled={privateLoading} onClick={() => void loadOlderPrivateMessages()}>{privateLoading ? 'Loading…' : 'Load older messages'}</button>}
          {privateLoading && !privateMessages.length && <p className="private-empty">Loading conversation…</p>}
          {!privateLoading && !privateMessages.length && <div className="private-empty"><h2>Start a conversation</h2><p>Messages here are visible only to you and {selectedConversation.user.username}.</p></div>}
          {privateMessages.map((message) => <article className="message" key={message.id}>
            <span className="avatar message-avatar">{message.sender_username.slice(0, 1).toUpperCase()}</span>
            <div className="message-content"><div><strong>{message.sender_id === session.user.id ? 'You' : message.sender_username}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.content}</p></div>
          </article>)}
        </div>
        <form className="composer" onSubmit={(event) => void sendPrivateMessage(event)}>
          <input value={privateDraft} onChange={(event) => setPrivateDraft(event.target.value)} placeholder={`Message ${selectedConversation.user.username}`} maxLength={2000} />
          <button className="send-button" disabled={!privateDraft.trim() || privateBusy} aria-label="Send private message">↑</button>
        </form>
      </> : <>
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
      </>}
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
