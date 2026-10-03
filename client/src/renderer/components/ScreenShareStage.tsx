import { useEffect, useRef } from 'react';
import type { VideoTrack } from 'livekit-client';

export interface ScreenShareTileData {
  identity: string;
  name: string;
  isLocal: boolean;
  videoTrack: VideoTrack;
}

function ScreenShareTile({ tile }: { tile: ScreenShareTileData }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    tile.videoTrack.attach(video);
    return () => {
      tile.videoTrack.detach(video);
      video.srcObject = null;
    };
  }, [tile.videoTrack]);

  return <article className="share-tile">
    <header><span>{tile.name}{tile.isLocal ? ' · You are sharing' : ' is sharing'}</span><span className="share-live">LIVE</span></header>
    <video ref={videoRef} autoPlay playsInline muted={tile.isLocal} aria-label={`${tile.name} screen share`} />
  </article>;
}

export function ScreenShareStage({ tiles, connected }: { tiles: ScreenShareTileData[]; connected: boolean }) {
  return <section className="screen-share-stage" aria-label="Screen shares">
    <header className="stage-heading"><div><p className="eyebrow">VOICE ROOM STAGE</p><h2>Screen sharing</h2></div>{tiles.length > 0 && <span className="stage-count">{tiles.length} active</span>}</header>
    {tiles.length ? <div className="share-grid">{tiles.map((tile) => <ScreenShareTile key={tile.identity} tile={tile} />)}</div> : <div className="stage-empty">
      <span className="stage-empty-icon">▧</span>
      <h3>{connected ? 'No one is sharing yet' : 'Join a voice room to share your screen'}</h3>
      <p>{connected ? 'Start screen sharing from the voice controls below.' : 'Your room participants and shared screens will appear here.'}</p>
    </div>}
  </section>;
}
