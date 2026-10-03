import { FormEvent, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Participant, Room, RoomEvent, Track } from 'livekit-client';
import { mergePrivateMessages, updateFriendPresence } from './social-state';
import { mergeRecentConversation, loadRecentConversations, saveRecentConversations } from './recent-conversations';
import type { RecentConversation } from './recent-conversations';
import { initialScreenShareState, publishSelectedScreenShare, reduceScreenShareState, stopScreenShare, visibleScreenShares } from './screen-share';
import { ScreenShareStage } from './components/ScreenShareStage';
import type { ScreenShareTileData } from './components/ScreenShareStage';
import { ScreenSourcePicker } from './components/ScreenSourcePicker';
import { SettingsPage } from './components/SettingsPage';
import { WorkspaceShell, WorkspaceView } from './components/WorkspaceShell';

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
  const [roomsLoading, setRoomsLoading] = useState(true);
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
  const [activeView, setActiveView] = useState<WorkspaceView>('chat');
  const [unreadGlobalMessages, setUnreadGlobalMessages] = useState(0);
  const [unreadPrivateMessages, setUnreadPrivateMessages] = useState<Map<number, number>>(new Map());
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([]);
  const [settingsSection, setSettingsSection] = useState<'account' | 'voice' | 'appearance'>('account');
  const [screenSources, setScreenSources] = useState<ScreenShareSource[]>([]);
  const [selectedScreenSourceId, setSelectedScreenSourceId] = useState<string | null>(null);
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  const [screenPickerError, setScreenPickerError] = useState<string | null>(null);
  const [screenSourcesLoading, setScreenSourcesLoading] = useState(false);
  const [screenSourceBusy, setScreenSourceBusy] = useState(false);
  const [screenShareState, dispatchScreenShare] = useReducer(reduceScreenShareState, initialScreenShareState);
  const [voiceConnectionState, setVoiceConnectionState] = useState<'Disconnected' | 'Connecting' | 'Connected' | 'Reconnecting'>('Disconnected');
  const socketRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<Room | null>(null);
  const micRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const activeViewRef = useRef<WorkspaceView>('chat');
  const recentConversationsRef = useRef<RecentConversation[]>([]);
  selectedConversationRef.current = selectedConversation;
  activeViewRef.current = activeView;

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

  const rememberConversation = useCallback((conversation: RecentConversation) => {
    const recent = mergeRecentConversation(recentConversationsRef.current, conversation);
    recentConversationsRef.current = recent;
    setRecentConversations(recent);
    const userId = sessionRef.current?.user.id;
    if (userId) saveRecentConversations(userId, recent);
  }, []);

  const navigate = useCallback((view: WorkspaceView) => {
    activeViewRef.current = view;
    setActiveView(view);
    if (view === 'chat') setUnreadGlobalMessages(0);
  }, []);

  useEffect(() => {
    if (!session) {
      recentConversationsRef.current = [];
      setRecentConversations([]);
      setUnreadPrivateMessages(new Map());
      return;
    }
    const recent = loadRecentConversations(session.user.id);
    recentConversationsRef.current = recent;
    setRecentConversations(recent);
  }, [session?.user.id]);

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
      setRoomsLoading(false);
      return;
    }
    let active = true;
    setRoomsLoading(true);
    window.desktop.getVoiceRooms(session.accessToken)
      .then((result) => {
        if (!active) return;
        updateSessionToken(result.accessToken);
        setRooms(result.data.rooms);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load voice rooms'); })
      .finally(() => { if (active) setRoomsLoading(false); });
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
          if (message.user_id !== sessionRef.current?.user.id && activeViewRef.current !== 'chat') {
            setUnreadGlobalMessages((current) => Math.min(current + 1, 99));
          }
        }
        if (payload.type === 'private.message' && payload.message) {
          const message = payload.message as PrivateMessage;
          if (message.conversation_id === selectedConversationRef.current?.id) {
            setPrivateMessages((current) => mergePrivateMessages(current, [message]).slice(-500));
          }
          const currentSession = sessionRef.current;
          const knownConversation = recentConversationsRef.current.find((item) => item.id === message.conversation_id)
            || (selectedConversationRef.current?.id === message.conversation_id ? selectedConversationRef.current : null);
          const conversation = knownConversation || (currentSession && message.sender_id !== currentSession.user.id
            ? { id: message.conversation_id, user: { id: message.sender_id, username: message.sender_username, status: 'offline' as const } }
            : null);
          if (conversation) rememberConversation(conversation);
          if (currentSession && message.sender_id !== currentSession.user.id
            && (activeViewRef.current !== 'messages' || selectedConversationRef.current?.id !== message.conversation_id)) {
            setUnreadPrivateMessages((current) => {
              const next = new Map(current);
              next.set(message.conversation_id, Math.min((next.get(message.conversation_id) || 0) + 1, 99));
              return next;
            });
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
  }, [session?.user.id, updateSessionToken, refreshSocialData, rememberConversation]);

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
    setScreenPickerOpen(false);
    await stopScreenShare(roomRef.current, window.desktop).catch(() => undefined);
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setVoiceRoom(null);
    setParticipants([]);
    setVoiceConnectionState('Disconnected');
    dispatchScreenShare({ type: 'room-disconnected' });
    setScreenSources([]);
    setSelectedScreenSourceId(null);
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
    setUnreadPrivateMessages(new Map());
    setUnreadGlobalMessages(0);
    setRecentConversations([]);
    recentConversationsRef.current = [];
  };

  const joinVoiceRoom = async (selected: VoiceRoom) => {
    if (!session || voiceBusy) return;
    setVoiceBusy(true);
    setVoiceConnectionState('Connecting');
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
      room.on(RoomEvent.TrackPublished, refresh);
      room.on(RoomEvent.TrackUnpublished, refresh);
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        refresh();
        if (publication.source === Track.Source.ScreenShare) dispatchScreenShare({ type: 'published' });
      });
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        refresh();
        if (publication.source === Track.Source.ScreenShare) {
          dispatchScreenShare({ type: 'capture-ended' });
          void window.desktop.cancelScreenShareSelection().catch(() => undefined);
        }
      });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        refresh();
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.autoplay = true;
          element.style.display = 'none';
          document.body.appendChild(element);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
        refresh();
      });
      room.on(RoomEvent.Reconnecting, () => setVoiceConnectionState('Reconnecting'));
      room.on(RoomEvent.Reconnected, () => {
        setVoiceConnectionState('Connected');
        refresh();
        if (room.localParticipant.getTrackPublication(Track.Source.ScreenShare)) dispatchScreenShare({ type: 'published' });
        else dispatchScreenShare({ type: 'capture-ended' });
      });
      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setVoiceRoom(null);
        setVoiceName('');
        setParticipants([]);
        setVoiceConnectionState('Disconnected');
        setScreenPickerOpen(false);
        setScreenSources([]);
        setSelectedScreenSourceId(null);
        dispatchScreenShare({ type: 'room-disconnected' });
        void window.desktop.cancelScreenShareSelection().catch(() => undefined);
        micRef.current = false;
        setMicEnabled(false);
      });
      await room.connect(response.data.url, response.data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setVoiceRoom(room);
      setVoiceConnectionState('Connected');
      setVoiceName(response.data.room.name);
      micRef.current = true;
      setMicEnabled(true);
      refreshRoomParticipants(room);
    } catch (reason) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setVoiceConnectionState('Disconnected');
      setError(reason instanceof Error ? reason.message : 'Could not join the voice room');
    } finally {
      setVoiceBusy(false);
    }
  };

  const leaveVoiceRoom = async () => {
    setScreenPickerOpen(false);
    await stopScreenShare(roomRef.current, window.desktop).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not stop screen sharing'));
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setVoiceRoom(null);
    setVoiceName('');
    setParticipants([]);
    setVoiceConnectionState('Disconnected');
    dispatchScreenShare({ type: 'room-disconnected' });
    setScreenSources([]);
    setSelectedScreenSourceId(null);
    micRef.current = false;
    setMicEnabled(false);
  };

  const openScreenSharePicker = async () => {
    if (!roomRef.current || screenShareState.status === 'sharing' || screenShareState.status === 'starting') return;
    dispatchScreenShare({ type: 'open-picker' });
    setScreenPickerOpen(true);
    setScreenPickerError(null);
    setSelectedScreenSourceId(null);
    setScreenSourcesLoading(true);
    try {
      await window.desktop.cancelScreenShareSelection();
      setScreenSources(await window.desktop.getScreenShareSources());
    } catch (reason) {
      setScreenPickerError(reason instanceof Error ? reason.message : 'Could not list screens and windows');
    } finally {
      setScreenSourcesLoading(false);
    }
  };

  const chooseScreenSource = async (source: ScreenShareSource) => {
    setScreenPickerError(null);
    setScreenSourceBusy(true);
    try {
      await window.desktop.selectScreenShareSource(source.id);
      setSelectedScreenSourceId(source.id);
    } catch (reason) {
      setSelectedScreenSourceId(null);
      setScreenPickerError(reason instanceof Error ? reason.message : 'This screen is no longer available');
    } finally {
      setScreenSourceBusy(false);
    }
  };

  const cancelScreenSharePicker = async () => {
    setScreenPickerOpen(false);
    setScreenSources([]);
    setScreenSourcesLoading(false);
    setScreenSourceBusy(false);
    setSelectedScreenSourceId(null);
    await window.desktop.cancelScreenShareSelection().catch(() => undefined);
    dispatchScreenShare({ type: 'cancel' });
  };

  const beginScreenShare = () => {
    const room = roomRef.current;
    if (!room || !selectedScreenSourceId || screenShareState.status !== 'choosing') return;
    dispatchScreenShare({ type: 'start' });
    setScreenPickerOpen(false);
    setScreenSources([]);
    setScreenSourcesLoading(false);
    setScreenPickerError(null);
    void publishSelectedScreenShare(room).then(() => {
      dispatchScreenShare({ type: 'published' });
    }).catch((reason) => {
      const captureWasCancelled = reason instanceof Error && ['AbortError', 'NotAllowedError'].includes(reason.name);
      dispatchScreenShare(captureWasCancelled
        ? { type: 'cancel' }
        : { type: 'failed', error: reason instanceof Error ? reason.message : 'Could not start screen sharing' });
      if (!captureWasCancelled) setError(reason instanceof Error ? reason.message : 'Could not start screen sharing');
      void window.desktop.cancelScreenShareSelection().catch(() => undefined);
      setSelectedScreenSourceId(null);
    });
  };

  const stopCurrentScreenShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    dispatchScreenShare({ type: 'stop' });
    try {
      await stopScreenShare(room, window.desktop);
      dispatchScreenShare({ type: 'stopped' });
    } catch (reason) {
      dispatchScreenShare({ type: 'failed', error: reason instanceof Error ? reason.message : 'Could not stop screen sharing' });
      setError(reason instanceof Error ? reason.message : 'Could not stop screen sharing');
    } finally {
      setSelectedScreenSourceId(null);
    }
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
      setUnreadPrivateMessages((current) => {
        const next = new Map(current);
        next.delete(result.data.conversation.id);
        return next;
      });
      rememberConversation(result.data.conversation);
      activeViewRef.current = 'messages';
      setActiveView('messages');
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

  const screenShareTracks = voiceRoom
    ? [voiceRoom.localParticipant, ...voiceRoom.remoteParticipants.values()].map((participant) => {
      const publication = participant.getTrackPublication(Track.Source.ScreenShare);
      return { identity: participant.identity, name: participant.name || participant.identity, isLocal: participant.isLocal, videoTrack: publication?.videoTrack ?? null, subscribed: !!publication?.isSubscribed };
    })
    : [];
  const screenShareTiles = visibleScreenShares<ScreenShareTileData['videoTrack']>(screenShareTracks);
  const selectedFriend = selectedConversation && friends.find((friend) => friend.id === selectedConversation.user.id);
  const friendStatus = selectedFriend?.status || (selectedConversation && presence.has(selectedConversation.user.id) ? 'online' : 'offline');

  const friendRow = (friend: SocialUser) => <div className="person-row" key={friend.id}>
    <button className="person-open" onClick={() => void openPrivateConversation(friend)} disabled={socialBusyId === friend.id}><span className={`presence-indicator ${friend.status}`} /><span className="person-copy"><strong>{friend.username}</strong><small>{friend.status}</small></span></button>
    <button className="person-action" title={`Remove ${friend.username}`} aria-label={`Remove ${friend.username}`} onClick={() => void removeFriend(friend)}>×</button>
  </div>;

  const sidebar = <>
    <header className="sidebar-top"><span className="workspace-mark">C</span><span><strong>Community</strong><small>Community Chat</small></span></header>
    <div className="sidebar-scroll">
      <div className="sidebar-section-label">{activeView === 'chat' ? 'CHANNELS' : activeView === 'friends' ? 'PEOPLE' : activeView === 'requests' ? 'FRIEND REQUESTS' : activeView === 'messages' ? 'DIRECT MESSAGES' : activeView === 'voice' ? 'VOICE ROOMS' : 'SETTINGS'}</div>
      {activeView === 'chat' && <button className="sidebar-link selected" onClick={() => navigate('chat')}><span className="sidebar-link-icon">#</span><span>community</span>{!!unreadGlobalMessages && <b className="unread-count">{unreadGlobalMessages}</b>}</button>}
      {activeView === 'friends' && <>
        <label className="search-field"><span>Find people</span><input value={socialSearch} onChange={(event) => setSocialSearch(event.target.value)} placeholder="Search username" maxLength={50} /></label>
        {socialSearch.trim().length >= 2 && <div className="sidebar-list" aria-live="polite">{searchLoading && <p className="sidebar-message">Searching…</p>}{searchResults.map((user) => {
          const isFriend = friends.some((friend) => friend.id === user.id);
          const isPending = outgoingRequests.some((item) => item.user.id === user.id);
          return <div className="search-result" key={user.id}><span className={`presence-indicator ${user.status}`} /><span className="result-name">{user.username}</span>{isFriend ? <button className="tiny-action" onClick={() => void openPrivateConversation(user)}>Message</button> : <button className="tiny-action" disabled={isPending || socialBusyId === user.id} onClick={() => void sendFriendRequest(user)}>{isPending ? 'Pending' : 'Add'}</button>}</div>;
        })}{!searchLoading && !searchResults.length && <p className="sidebar-message">No matching users.</p>}</div>}
        <div className="sidebar-section-label sub">FRIENDS <span>{friends.length}</span></div>{socialLoading && <p className="sidebar-message">Loading friends…</p>}{!socialLoading && !friends.length && <p className="sidebar-message">Your friends will appear here.</p>}{friends.map(friendRow)}
      </>}
      {activeView === 'requests' && <>
        <div className="sidebar-section-label sub">INCOMING <span>{incomingRequests.length}</span></div>{socialLoading && <p className="sidebar-message">Loading requests…</p>}{!socialLoading && !incomingRequests.length && <p className="sidebar-message">No incoming requests.</p>}
        {incomingRequests.map((item) => <div className="request-sidebar-row" key={item.id}><strong>{item.user.username}</strong><div><button className="tiny-action accept" disabled={socialBusyId === item.id} onClick={() => void respondToRequest(item, 'accept')}>Accept</button><button className="tiny-action reject" disabled={socialBusyId === item.id} onClick={() => void respondToRequest(item, 'reject')}>Reject</button></div></div>)}
        <div className="sidebar-section-label sub">OUTGOING <span>{outgoingRequests.length}</span></div>{!outgoingRequests.length && <p className="sidebar-message">No outgoing requests.</p>}{outgoingRequests.map((item) => <div className="request-sidebar-row" key={item.id}><strong>{item.user.username}</strong><span className="pending-state">Pending</span></div>)}
      </>}
      {activeView === 'messages' && <>
        {!recentConversations.length && <p className="sidebar-message">No recent messages. Open a friend to start a conversation.</p>}
        {recentConversations.map((conversation) => { const status = friends.find((friend) => friend.id === conversation.user.id)?.status || (presence.has(conversation.user.id) ? 'online' : 'offline'); const unread = unreadPrivateMessages.get(conversation.id) || 0; return <button className={`conversation-link ${selectedConversation?.id === conversation.id ? 'selected' : ''}`} key={conversation.id} onClick={() => void openPrivateConversation({ ...conversation.user, status })}><span className={`presence-indicator ${status}`} /><span className="conversation-name">{conversation.user.username}</span>{!!unread && <b className="unread-count">{unread}</b>}</button>; })}
        <div className="sidebar-section-label sub">START A MESSAGE</div>{friends.map((friend) => <button key={friend.id} className="conversation-link" onClick={() => void openPrivateConversation(friend)}><span className={`presence-indicator ${friend.status}`} /><span className="conversation-name">{friend.username}</span></button>)}
      </>}
      {activeView === 'voice' && <>
        {roomsLoading && <p className="sidebar-message">Loading public rooms…</p>}{!roomsLoading && !rooms.length && <p className="sidebar-message">No public rooms are available.</p>}{rooms.map((room) => <button key={room.id} className={`room-link ${voiceName === room.name ? 'selected' : ''}`} disabled={voiceBusy || !!voiceRoom} onClick={() => void joinVoiceRoom(room)}><span>◖</span><span><strong>{room.name}</strong><small>{room.description}</small></span></button>)}
        {voiceRoom && <><div className="sidebar-section-label sub">IN THIS ROOM</div>{participants.map((participant) => <div className="participant-row" key={participant.identity}><span className={`presence-indicator ${participant.isSpeaking ? 'speaking' : 'online'}`} /><span>{participant.name || participant.identity}{participant.isLocal ? ' · you' : ''}</span>{participant.isSpeaking && <small>Speaking</small>}</div>)}</>}
      </>}
      {activeView === 'settings' && <div className="settings-sidebar-list">{(['account', 'voice', 'appearance'] as const).map((item) => <button key={item} className={settingsSection === item ? 'selected' : ''} onClick={() => setSettingsSection(item)}>{item === 'voice' ? 'Voice & Audio' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>}
    </div>
  </>;

  const details = activeView === 'voice' ? <>
    <div className="details-heading"><p className="eyebrow">VOICE</p><h2>Room participants</h2></div>{!voiceRoom && <div className="empty-state"><p>Join a public room to see who is there.</p></div>}
    {voiceRoom && <><div className="details-room"><span className="live-dot" /><strong>{voiceName}</strong><small>{voiceConnectionState}</small></div><div className="details-participants">{participants.map((participant) => <div className="details-person" key={participant.identity}><span className={`avatar ${participant.isSpeaking ? 'speaking' : ''}`}>{(participant.name || participant.identity).slice(0, 1).toUpperCase()}</span><span><strong>{participant.name || participant.identity}{participant.isLocal ? ' (you)' : ''}</strong><small className={participant.isSpeaking ? 'speaking-copy' : ''}>{participant.isSpeaking ? 'Speaking' : 'In voice'}</small></span>{participant.isSpeaking && <span className="speaking-wave">▂▅</span>}</div>)}</div><div className="share-status-list"><h3>Screen sharing</h3>{screenShareTiles.length ? screenShareTiles.map((tile) => <p key={tile.identity}><i className="share-dot" />{tile.isLocal ? 'You are sharing' : `${tile.name} is sharing`}</p>) : <p>No active shares</p>}</div></>}
  </> : activeView === 'messages' && selectedConversation ? <><div className="details-heading"><p className="eyebrow">DIRECT MESSAGE</p><h2>Conversation</h2></div><div className="profile-detail"><span className="profile-avatar">{selectedConversation.user.username.slice(0, 1).toUpperCase()}</span><strong>{selectedConversation.user.username}</strong><span className={`status-label ${friendStatus}`}><i />{friendStatus}</span><button className="secondary-button" onClick={() => navigate('friends')}>View friends</button></div></> : activeView === 'chat' ? <>
    <div className="details-heading"><p className="eyebrow">COMMUNITY</p><h2>Online now</h2><span>{presence.size} connected</span></div>{presence.size === 0 && <p className="sidebar-message">Waiting for presence…</p>}{[...presence.entries()].map(([id, name]) => <div className="details-person compact" key={id}><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span><strong>{name}{id === session.user.id ? ' (you)' : ''}</strong><small>Online</small></span></div>)}
  </> : <><div className="details-heading"><p className="eyebrow">COMMUNITY CHAT</p><h2>Stay connected</h2></div><p className="details-copy">Friends, conversations, and public voice rooms are available from the workspace navigation.</p></>;

  const mainContent = activeView === 'chat' ? <>
    <header className="content-header"><div><p className="eyebrow">GLOBAL CHANNEL</p><h1><span className="hash-mark">#</span> community</h1></div><span className={`connection-pill ${chatStatus.toLowerCase().replaceAll(' ', '-')}`}><i />{chatStatus}</span></header>
    <section className="message-timeline" aria-label="Global chat messages">{chatMessages.length === 0 && <div className="empty-state timeline-empty"><span className="empty-mark">#</span><h2>Welcome to the community</h2><p>Start the conversation.</p></div>}{chatMessages.map((message) => <article className="timeline-message" key={message.id}><span className="message-avatar">{message.username.slice(0, 1).toUpperCase()}</span><div><header><strong>{message.username}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header><p>{message.content}</p></div></article>)}<div ref={chatEndRef} /></section>
    <form className="message-composer" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={chatStatus === 'Connected' ? 'Message #community' : `${chatStatus}…`} maxLength={2000} disabled={chatStatus !== 'Connected'} /><button disabled={!draft.trim() || chatStatus !== 'Connected'}>Send <span>↗</span></button></form>
  </> : activeView === 'messages' ? selectedConversation ? <>
    <header className="content-header"><div><p className="eyebrow">DIRECT MESSAGE</p><h1><span className={`presence-indicator ${friendStatus}`} />{selectedConversation.user.username}</h1></div><span className={`connection-pill ${chatStatus.toLowerCase().replaceAll(' ', '-')}`}><i />{chatStatus}</span></header>
    <section className="message-timeline private-timeline" aria-label={`Messages with ${selectedConversation.user.username}`}>{privateHasMore && <button className="load-older-button" disabled={privateLoading} onClick={() => void loadOlderPrivateMessages()}>{privateLoading ? 'Loading…' : 'Load older messages'}</button>}{privateLoading && !privateMessages.length && <div className="empty-state"><p>Loading conversation…</p></div>}{!privateLoading && !privateMessages.length && <div className="empty-state timeline-empty"><span className="empty-mark">✉</span><h2>Start a conversation</h2><p>Messages are shared only with {selectedConversation.user.username}.</p></div>}{privateMessages.map((message) => <article className="timeline-message" key={message.id}><span className="message-avatar">{message.sender_username.slice(0, 1).toUpperCase()}</span><div><header><strong>{message.sender_id === session.user.id ? 'You' : message.sender_username}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header><p>{message.content}</p></div></article>)}</section>
    <form className="message-composer" onSubmit={(event) => void sendPrivateMessage(event)}><input value={privateDraft} onChange={(event) => setPrivateDraft(event.target.value)} placeholder={`Message ${selectedConversation.user.username}`} maxLength={2000} /><button disabled={!privateDraft.trim() || privateBusy}>Send <span>↗</span></button></form>
  </> : <div className="empty-state workspace-empty"><span className="empty-mark">✉</span><h2>Your direct messages</h2><p>Choose a recent conversation or start a message with a friend.</p></div> : activeView === 'friends' ? <>
    <header className="content-header"><div><p className="eyebrow">YOUR COMMUNITY</p><h1>Friends</h1><p className="header-subtitle">People you have connected with.</p></div><span className="section-count">{friends.length} friends</span></header><section className="directory-grid">{socialLoading && <p className="muted">Loading your friends…</p>}{!socialLoading && !friends.length && <div className="empty-state"><span className="empty-mark">◎</span><h2>No friends yet</h2><p>Search for someone by username in the sidebar.</p></div>}{friends.map((friend) => <article className="friend-card" key={friend.id}><span className="profile-avatar">{friend.username.slice(0, 1).toUpperCase()}</span><div><strong>{friend.username}</strong><span className={`status-label ${friend.status}`}><i />{friend.status}</span></div><div className="friend-card-actions"><button className="secondary-button" onClick={() => void openPrivateConversation(friend)}>Message</button><button className="subtle-button" aria-label={`Remove ${friend.username}`} onClick={() => void removeFriend(friend)}>×</button></div></article>)}</section>
  </> : activeView === 'requests' ? <>
    <header className="content-header"><div><p className="eyebrow">YOUR COMMUNITY</p><h1>Friend requests</h1><p className="header-subtitle">Manage incoming and outgoing requests.</p></div><span className="section-count">{incomingRequests.length} incoming</span></header><section className="request-content"><h2>Incoming</h2>{socialLoading && <p className="muted">Loading requests…</p>}{!socialLoading && !incomingRequests.length && <div className="empty-state"><h3>You’re all caught up</h3><p>New friend requests will show here.</p></div>}{incomingRequests.map((item) => <article className="request-card" key={item.id}><span className="profile-avatar">{item.user.username.slice(0, 1).toUpperCase()}</span><strong>{item.user.username}</strong><button className="primary-button" disabled={socialBusyId === item.id} onClick={() => void respondToRequest(item, 'accept')}>Accept</button><button className="secondary-button" disabled={socialBusyId === item.id} onClick={() => void respondToRequest(item, 'reject')}>Decline</button></article>)}<h2>Outgoing</h2>{!outgoingRequests.length && <p className="muted">No outgoing requests.</p>}{outgoingRequests.map((item) => <div className="outgoing-card" key={item.id}><span>{item.user.username}</span><small>Request pending</small></div>)}</section>
  </> : activeView === 'voice' ? <>
    <header className="content-header"><div><p className="eyebrow">PUBLIC VOICE</p><h1>{voiceName || 'Voice rooms'}</h1><p className="header-subtitle">{voiceRoom ? `${participants.length} participant${participants.length === 1 ? '' : 's'} · ${voiceConnectionState}` : 'Choose a public room from the sidebar to join.'}</p></div>{voiceRoom && <span className={`connection-pill ${voiceConnectionState.toLowerCase()}`}><i />{voiceConnectionState}</span>}</header><ScreenShareStage tiles={screenShareTiles} connected={!!voiceRoom} />
  </> : <SettingsPage username={session.user.username} section={settingsSection} onSectionChange={setSettingsSection} />;

  const voiceDock = voiceRoom ? <><div className="dock-room-state"><span className={`voice-status-indicator ${voiceConnectionState.toLowerCase()}`} /><span><strong>{voiceName}</strong><small>{voiceConnectionState}</small></span></div><div className="dock-controls"><button className={`dock-control ${micEnabled ? '' : 'is-muted'}`} onClick={() => void toggleMicrophone()} aria-pressed={!micEnabled} title="Toggle microphone (Ctrl+Shift+M)">{micEnabled ? 'Mic on' : 'Muted'} <kbd>Ctrl+Shift+M</kbd></button>{screenShareState.status === 'sharing' ? <button className="dock-control share-active" onClick={() => void stopCurrentScreenShare()}>Stop sharing</button> : <button className="dock-control" disabled={screenShareState.status === 'starting' || screenShareState.status === 'stopping'} onClick={() => void openScreenSharePicker()}>{screenShareState.status === 'starting' ? 'Starting share…' : 'Start sharing'}</button>}<button className="dock-leave" onClick={() => void leaveVoiceRoom()}>Leave voice</button></div></> : <div className="dock-room-state not-in-voice"><span className="voice-status-indicator" /><span><strong>Not in a voice room</strong><small>Join from Voice rooms</small></span>{voiceBusy && <span className="dock-progress">Connecting…</span>}</div>;

  return <>
    <WorkspaceShell activeView={activeView} onNavigate={navigate} badges={{ requests: incomingRequests.length, messages: [...unreadPrivateMessages.values()].reduce((sum, count) => sum + count, 0), chat: unreadGlobalMessages }} username={session.user.username} onLogout={() => void logout()} sidebar={sidebar} details={details} voiceDock={voiceDock}>{mainContent}</WorkspaceShell>
    {screenPickerOpen && <ScreenSourcePicker sources={screenSources} selectedId={selectedScreenSourceId} busy={screenSourceBusy || screenShareState.status === 'starting'} loading={screenSourcesLoading} error={screenPickerError} onSelect={(source) => void chooseScreenSource(source)} onStart={beginScreenShare} onCancel={() => void cancelScreenSharePicker()} />}
    {error && <div role="alert" className="toast-error"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
  </>;
}
