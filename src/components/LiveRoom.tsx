import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteParticipant,
  createLocalTracks,
  LocalTrack,
  LocalVideoTrack,
  ConnectionQuality,
  VideoPresets,
} from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type StreamQuality = "auto" | "low" | "medium" | "high";

interface Props {
  roomName: string;
  role: "publisher" | "viewer";
  identity: string;
  displayName: string;
  quality?: StreamQuality;
  onReady?: (room: Room) => void;
  onLocalVideoTrack?: (track: MediaStreamTrack | null) => void;
  onConnectionQuality?: (q: ConnectionQuality) => void;
  onBufferingChange?: (buffering: boolean) => void;
}

export interface LiveRoomHandle {
  toggleScreenShare: () => Promise<boolean>;
  isScreenSharing: () => boolean;
}

const qualityToMaxDim: Record<Exclude<StreamQuality, "auto">, number> = {
  low: 240,
  medium: 540,
  high: 1080,
};

const LiveRoom = forwardRef<LiveRoomHandle, Props>(({ roomName, role, identity, displayName, quality = "auto", onReady, onLocalVideoTrack, onConnectionQuality, onBufferingChange }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const screenTrackRef = useRef<LocalVideoTrack | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const [buffering, setBuffering] = useState(false);

  useImperativeHandle(ref, () => ({
    isScreenSharing: () => !!screenTrackRef.current,
    toggleScreenShare: async () => {
      const room = roomRef.current;
      if (!room) return false;
      if (screenTrackRef.current) {
        await room.localParticipant.unpublishTrack(screenTrackRef.current);
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
        return false;
      }
      try {
        const tracks = await room.localParticipant.createScreenTracks({ audio: false });
        for (const t of tracks) {
          await room.localParticipant.publishTrack(t);
          if (t.kind === Track.Kind.Video) {
            screenTrackRef.current = t as LocalVideoTrack;
            if (videoRef.current) (t as LocalVideoTrack).attach(videoRef.current);
          }
        }
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Screen share failed");
        return false;
      }
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let localTracks: LocalTrack[] = [];
    let bufferTimer: any;

    const connect = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("livekit-token", {
          body: { room: roomName, role, identity, name: displayName },
        });
        if (error || !data?.token) throw new Error(error?.message || "No token");
        if (cancelled) return;

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        const attachTrack = (track: Track) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            setHasVideo(true);
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
          }
        };

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => attachTrack(track));
        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach(el => el.remove()));
        room.on(RoomEvent.ConnectionQualityChanged, (q) => onConnectionQuality?.(q));

        await room.connect(data.wsUrl, data.token);
        if (cancelled) { room.disconnect(); return; }

        if (role === "publisher") {
          const videoConstraints: any = { facingMode: "user" };
          if (quality !== "auto") {
            const max = qualityToMaxDim[quality];
            videoConstraints.resolution = max === 240 ? VideoPresets.h180 : max === 540 ? VideoPresets.h540 : VideoPresets.h1080;
          }
          localTracks = await createLocalTracks({ audio: true, video: videoConstraints });
          for (const t of localTracks) {
            await room.localParticipant.publishTrack(t);
            if (t.kind === Track.Kind.Video && videoRef.current) {
              t.attach(videoRef.current);
              setHasVideo(true);
              const ms = (t as LocalVideoTrack).mediaStreamTrack;
              onLocalVideoTrack?.(ms);
            }
          }
        } else {
          // attach already-subscribed tracks
          room.remoteParticipants.forEach((p: RemoteParticipant) => {
            p.trackPublications.forEach(pub => {
              if (pub.track) attachTrack(pub.track);
            });
          });
          // For viewers, set preferred video quality on each subscribed video pub
          const applyViewerQuality = () => {
            if (quality === "auto") return;
            const vq = quality === "low" ? 0 /* LOW */ : quality === "medium" ? 1 /* MEDIUM */ : 2; /* HIGH */
            room.remoteParticipants.forEach((p) => {
              p.videoTrackPublications.forEach((pub) => {
                try { (pub as any).setVideoQuality?.(vq); } catch {}
              });
            });
          };
          applyViewerQuality();
          room.on(RoomEvent.TrackSubscribed, applyViewerQuality);
        }

        setConnecting(false);
        onReady?.(room);

        // Buffering detector — watch <video> element waiting/playing events
        const v = videoRef.current;
        if (v) {
          const onWait = () => { setBuffering(true); onBufferingChange?.(true); };
          const onPlay = () => { setBuffering(false); onBufferingChange?.(false); };
          v.addEventListener("waiting", onWait);
          v.addEventListener("playing", onPlay);
          v.addEventListener("stalled", onWait);
          v.addEventListener("canplay", onPlay);
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || "Failed to join stream");
        setConnecting(false);
      }
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(bufferTimer);
      localTracks.forEach(t => t.stop());
      if (screenTrackRef.current) { screenTrackRef.current.stop(); screenTrackRef.current = null; }
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, role, identity, quality]);

  return (
    <div className="absolute inset-0 bg-black">
      <video ref={videoRef} autoPlay playsInline muted={role === "publisher"} className="w-full h-full object-cover" />
      <audio ref={audioRef} autoPlay />
      {connecting && (
        <div className="absolute inset-0 flex items-center justify-center text-foreground/70 text-xs">
          Connecting to live...
        </div>
      )}
      {!connecting && buffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 border border-border/30">
            <div className="size-3 rounded-full border-2 border-gold border-t-transparent animate-spin" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Buffering</span>
          </div>
        </div>
      )}
      {!connecting && !hasVideo && role === "viewer" && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          Waiting for broadcaster's video...
        </div>
      )}
    </div>
  );
});
LiveRoom.displayName = "LiveRoom";

export default LiveRoom;