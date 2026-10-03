export type ScreenShareStatus = 'idle' | 'choosing' | 'starting' | 'sharing' | 'stopping' | 'error';

export interface ScreenShareUiState {
  status: ScreenShareStatus;
  error: string | null;
}

export type ScreenShareAction =
  | { type: 'open-picker' }
  | { type: 'cancel' }
  | { type: 'start' }
  | { type: 'published' }
  | { type: 'stop' }
  | { type: 'stopped' }
  | { type: 'capture-ended' }
  | { type: 'room-disconnected' }
  | { type: 'failed'; error: string }
  | { type: 'clear-error' };

export const initialScreenShareState: ScreenShareUiState = { status: 'idle', error: null };

export function reduceScreenShareState(state: ScreenShareUiState, action: ScreenShareAction): ScreenShareUiState {
  switch (action.type) {
    case 'open-picker':
      return state.status === 'idle' || state.status === 'error' ? { status: 'choosing', error: null } : state;
    case 'cancel':
    case 'stopped':
    case 'capture-ended':
    case 'room-disconnected':
      return { status: 'idle', error: null };
    case 'start':
      return state.status === 'choosing' ? { status: 'starting', error: null } : state;
    case 'published':
      return state.status === 'starting' ? { status: 'sharing', error: null } : state;
    case 'stop':
      return state.status === 'sharing' ? { status: 'stopping', error: null } : state;
    case 'failed':
      return { status: 'error', error: action.error };
    case 'clear-error':
      return state.status === 'error' ? initialScreenShareState : state;
  }
}

export interface ScreenShareRoom {
  localParticipant: {
    setScreenShareEnabled(enabled: boolean, options?: { audio?: boolean }): Promise<unknown>;
  };
}

export interface ScreenShareBridge {
  selectScreenShareSource(sourceId: string): Promise<void>;
  cancelScreenShareSelection(): Promise<void>;
}

export function publishSelectedScreenShare(room: ScreenShareRoom): Promise<void> {
  return room.localParticipant.setScreenShareEnabled(true, { audio: false }).then(() => undefined);
}

export async function startScreenShare(room: ScreenShareRoom, bridge: ScreenShareBridge, sourceId: string): Promise<void> {
  await bridge.selectScreenShareSource(sourceId);
  try {
    await room.localParticipant.setScreenShareEnabled(true, { audio: false });
  } catch (error) {
    await bridge.cancelScreenShareSelection().catch(() => undefined);
    throw error;
  }
}

export async function stopScreenShare(room: ScreenShareRoom | null, bridge: ScreenShareBridge): Promise<void> {
  try {
    if (room) await room.localParticipant.setScreenShareEnabled(false);
  } finally {
    await bridge.cancelScreenShareSelection();
  }
}

export interface ScreenShareTrackLike {
  identity: string;
  name: string;
  isLocal: boolean;
  videoTrack: unknown;
  subscribed: boolean;
}

export function visibleScreenShares<T>(participants: readonly ScreenShareTrackLike[]): Array<ScreenShareTrackLike & { videoTrack: T }> {
  return participants.filter((participant): participant is ScreenShareTrackLike & { videoTrack: T } =>
    participant.videoTrack !== null && participant.videoTrack !== undefined
      && (participant.isLocal || participant.subscribed)
  );
}
