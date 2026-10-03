import { describe, expect, it, vi } from 'vitest';
import {
  initialScreenShareState,
  reduceScreenShareState,
  startScreenShare,
  stopScreenShare,
  visibleScreenShares
} from './screen-share';

describe('screen share state and lifecycle', () => {
  it('moves through picker, publish, sharing and stop states', () => {
    let state = reduceScreenShareState(initialScreenShareState, { type: 'open-picker' });
    expect(state.status).toBe('choosing');
    state = reduceScreenShareState(state, { type: 'start' });
    expect(state.status).toBe('starting');
    state = reduceScreenShareState(state, { type: 'published' });
    expect(state.status).toBe('sharing');
    state = reduceScreenShareState(state, { type: 'stop' });
    expect(state.status).toBe('stopping');
    expect(reduceScreenShareState(state, { type: 'stopped' })).toEqual(initialScreenShareState);
  });

  it('cancels source selection without requesting capture', () => {
    const picker = reduceScreenShareState(initialScreenShareState, { type: 'open-picker' });
    expect(reduceScreenShareState(picker, { type: 'cancel' })).toEqual(initialScreenShareState);
  });

  it('selects a source before asking LiveKit to publish video only', async () => {
    const calls: string[] = [];
    const room = { localParticipant: { setScreenShareEnabled: vi.fn(async (enabled, options) => { calls.push(`${enabled}:${options?.audio}`); }) } };
    const bridge = { selectScreenShareSource: vi.fn(async (id: string) => { calls.push(`source:${id}`); }), cancelScreenShareSelection: vi.fn(async () => undefined) };
    await startScreenShare(room, bridge, 'window:4');
    expect(calls).toEqual(['source:window:4', 'true:false']);
    expect(bridge.cancelScreenShareSelection).not.toHaveBeenCalled();
  });

  it('clears the selected source when LiveKit capture or publishing fails', async () => {
    const room = { localParticipant: { setScreenShareEnabled: vi.fn(async () => { throw new Error('capture failed'); }) } };
    const bridge = { selectScreenShareSource: vi.fn(async () => undefined), cancelScreenShareSelection: vi.fn(async () => undefined) };
    await expect(startScreenShare(room, bridge, 'screen:0')).rejects.toThrow('capture failed');
    expect(bridge.cancelScreenShareSelection).toHaveBeenCalledOnce();
    expect(reduceScreenShareState({ status: 'starting', error: null }, { type: 'failed', error: 'capture failed' })).toEqual({ status: 'error', error: 'capture failed' });
  });

  it('stops a share on leave and always clears pending source selection', async () => {
    const room = { localParticipant: { setScreenShareEnabled: vi.fn(async () => undefined) } };
    const bridge = { selectScreenShareSource: vi.fn(async () => undefined), cancelScreenShareSelection: vi.fn(async () => undefined) };
    await stopScreenShare(room, bridge);
    expect(room.localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(false);
    expect(bridge.cancelScreenShareSelection).toHaveBeenCalledOnce();
    await stopScreenShare(null, bridge);
    expect(bridge.cancelScreenShareSelection).toHaveBeenCalledTimes(2);
  });

  it('clears state when capture ends and displays only subscribed participant tracks', () => {
    const sharing = { status: 'sharing' as const, error: null };
    expect(reduceScreenShareState(sharing, { type: 'capture-ended' })).toEqual(initialScreenShareState);
    expect(reduceScreenShareState(sharing, { type: 'room-disconnected' })).toEqual(initialScreenShareState);
    const track = {};
    expect(visibleScreenShares([
      { identity: 'local', name: 'A', isLocal: true, videoTrack: track, subscribed: false },
      { identity: 'remote', name: 'B', isLocal: false, videoTrack: track, subscribed: true },
      { identity: 'pending', name: 'C', isLocal: false, videoTrack: track, subscribed: false },
      { identity: 'none', name: 'D', isLocal: false, videoTrack: null, subscribed: true }
    ])).toHaveLength(2);
  });
});
