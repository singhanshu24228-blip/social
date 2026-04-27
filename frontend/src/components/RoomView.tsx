import React, { useEffect, useState, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getRoomDetails, postRoomComment, getRoomComments, canSendMediaInRoom, uploadFile, resolveMediaUrl } from '../services/api';
import { connectSocket, getSocket } from '../services/socket';

interface RoomViewProps {
  roomId: string;
  onClose: () => void;
  currentUserId: string;
}

interface Comment {
  _id: string;
  content?: string;
  author: { username: string; name: string };
  createdAt: string;
  displayId?: string;
  mediaUrl?: string;
  mediaType?: string;
}

interface FloatingComment extends Comment {
  displayId: string;
  willRemoveAt: number;
}

const RoomView: React.FC<RoomViewProps> = ({ roomId, onClose, currentUserId }) => {
  const [room, setRoom] = useState<any>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [floatingComments, setFloatingComments] = useState<FloatingComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [canSendMedia, setCanSendMedia] = useState(false);
  const [error, setError] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaInputRef = React.useRef<HTMLInputElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const broadcasterPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const broadcasterPendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const viewerPendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteStreamerSocketIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isStreamingRef = useRef(false);
  const [remoteStreamActive, setRemoteStreamActive] = useState(false);
  const [hostIsLive, setHostIsLive] = useState(false);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Attach local stream to the preview element (the element mounts only after isStreaming flips true)
  useEffect(() => {
    if (!isStreaming) return;
    if (!localStream) return;
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = localStream;
    el.muted = true;
    el.play?.().catch(() => {});
    return () => {
      try {
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      } catch {}
    };
  }, [isStreaming, localStream]);

  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
    ],
  };

  const stopViewer = () => {
    try {
      if (viewerPeerRef.current) viewerPeerRef.current.close();
    } catch {}
    viewerPeerRef.current = null;
    viewerPendingIceRef.current = [];
    remoteStreamerSocketIdRef.current = null;
    setRemoteStreamActive(false);
    setHostIsLive(false);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const stopBroadcasterPeers = () => {
    for (const pc of broadcasterPeersRef.current.values()) {
      try {
        pc.close();
      } catch {}
    }
    broadcasterPeersRef.current.clear();
    broadcasterPendingIceRef.current.clear();
  };

  // Socket room join + WebRTC signaling for the room stream
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    socketRef.current = socket;
    socket.emit('nightroom:join', { roomId });

    const onAnnounce = async (payload: any) => {
      if (!payload || String(payload.roomId) !== String(roomId)) return;
      if (String(payload.streamerUserId) === String(currentUserId)) return;

      setHostIsLive(true);
      setRemoteStreamActive(false);
      const streamerSocketId = String(payload.streamerSocketId || '');
      if (!streamerSocketId) return;

      // (Re)start viewer peer
      stopViewer();
      remoteStreamerSocketIdRef.current = streamerSocketId;

      const pc = new RTCPeerConnection(rtcConfig);
      viewerPeerRef.current = pc;

      pc.ontrack = (ev) => {
        const stream = ev.streams?.[0];
        if (!stream) return;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          // Keep muted by default so autoplay works reliably across browsers.
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.play?.().catch(() => {});
        }
        setRemoteStreamActive(true);
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        socketRef.current?.emit('nightroom:stream:ice', {
          roomId,
          targetSocketId: streamerSocketId,
          candidate: ev.candidate,
        });
      };

      socketRef.current?.emit('nightroom:stream:viewer-ready', { roomId, streamerSocketId });
    };

    const onStop = (payload: any) => {
      if (!payload || String(payload.roomId) !== String(roomId)) return;
      stopViewer();
    };

    const onViewerReady = async (payload: any) => {
      if (!payload || String(payload.roomId) !== String(roomId)) return;
      if (!isStreamingRef.current) return;
      const stream = localStreamRef.current;
      if (!stream) return;

      const viewerSocketId = String(payload.viewerSocketId || '');
      if (!viewerSocketId) return;

      if (broadcasterPeersRef.current.has(viewerSocketId)) return;

      const pc = new RTCPeerConnection(rtcConfig);
      broadcasterPeersRef.current.set(viewerSocketId, pc);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        socketRef.current?.emit('nightroom:stream:ice', {
          roomId,
          targetSocketId: viewerSocketId,
          candidate: ev.candidate,
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          try { pc.close(); } catch {}
          broadcasterPeersRef.current.delete(viewerSocketId);
          broadcasterPendingIceRef.current.delete(viewerSocketId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('nightroom:stream:offer', {
        roomId,
        targetSocketId: viewerSocketId,
        sdp: pc.localDescription,
      });
    };

    const onOffer = async (payload: any) => {
      if (!payload || String(payload.roomId) !== String(roomId)) return;
      const fromSocketId = String(payload.fromSocketId || '');
      if (!fromSocketId) return;

      const pc = viewerPeerRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('nightroom:stream:answer', {
          roomId,
          targetSocketId: fromSocketId,
          sdp: pc.localDescription,
        });

        const pending = viewerPendingIceRef.current.splice(0);
        for (const c of pending) {
          try {
            await pc.addIceCandidate(c);
          } catch {}
        }
      } catch (err) {
        console.error('Failed handling offer', err);
      }
    };

    const onAnswer = async (payload: any) => {
      if (!payload || String(payload.roomId) !== String(roomId)) return;
      const fromSocketId = String(payload.fromSocketId || '');
      if (!fromSocketId) return;

      const pc = broadcasterPeersRef.current.get(fromSocketId);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(payload.sdp);
        const pending = broadcasterPendingIceRef.current.get(fromSocketId) || [];
        broadcasterPendingIceRef.current.delete(fromSocketId);
        for (const c of pending) {
          try {
            await pc.addIceCandidate(c);
          } catch {}
        }
      } catch (err) {
        console.error('Failed handling answer', err);
      }
    };

    const onIce = async (payload: any) => {
      if (!payload || String(payload.roomId) !== String(roomId)) return;
      const fromSocketId = String(payload.fromSocketId || '');
      const candidate: RTCIceCandidateInit | undefined = payload.candidate;
      if (!fromSocketId || !candidate) return;

      if (isStreamingRef.current) {
        const pc = broadcasterPeersRef.current.get(fromSocketId);
        if (!pc) return;
        if (!pc.remoteDescription) {
          const pending = broadcasterPendingIceRef.current.get(fromSocketId) || [];
          pending.push(candidate);
          broadcasterPendingIceRef.current.set(fromSocketId, pending);
          return;
        }
        try {
          await pc.addIceCandidate(candidate);
        } catch {}
        return;
      }

      if (remoteStreamerSocketIdRef.current && fromSocketId !== remoteStreamerSocketIdRef.current) return;
      const pc = viewerPeerRef.current;
      if (!pc) return;

      if (!pc.remoteDescription) {
        viewerPendingIceRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {}
    };

    socket.on('nightroom:stream:announce', onAnnounce);
    socket.on('nightroom:stream:stop', onStop);
    socket.on('nightroom:stream:viewer-ready', onViewerReady);
    socket.on('nightroom:stream:offer', onOffer);
    socket.on('nightroom:stream:answer', onAnswer);
    socket.on('nightroom:stream:ice', onIce);

    return () => {
      try {
        socket.emit('nightroom:leave', { roomId });
      } catch {}
      socket.off('nightroom:stream:announce', onAnnounce);
      socket.off('nightroom:stream:stop', onStop);
      socket.off('nightroom:stream:viewer-ready', onViewerReady);
      socket.off('nightroom:stream:offer', onOffer);
      socket.off('nightroom:stream:answer', onAnswer);
      socket.off('nightroom:stream:ice', onIce);
      stopViewer();
      stopBroadcasterPeers();
    };
  }, [roomId, currentUserId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [roomRes, commentsRes, mediaRes] = await Promise.all([
          getRoomDetails(roomId),
          getRoomComments(roomId),
          canSendMediaInRoom(roomId),
        ]);
        setRoom(roomRes.data.room);
        setComments(commentsRes.data.comments || []);
        // Log media permission response for debugging
        console.log('can-send-media response:', mediaRes.data);
        setCanSendMedia(mediaRes.data.canSend);
      } catch (e) {
        console.error('Failed to load room', e);
        setError('Failed to load room');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [roomId]);

  // Poll for new comments every 2 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await getRoomComments(roomId);
        setComments(res.data.comments || []);
      } catch (e) {
        console.error('Failed to fetch comments', e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [roomId]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const res = await postRoomComment(roomId, newComment);
      const comment = res.data.comment;

      // Add to comments
      setComments((prev) => [...prev, comment]);

      // Add to floating comments with removal timeout
      const displayId = `${comment._id}-${Date.now()}`;
      const floatingComment: FloatingComment = {
        ...comment,
        displayId,
        willRemoveAt: Date.now() + 10000, // 10 seconds
      };
      setFloatingComments((prev) => [...prev, floatingComment]);

      // Remove after 10 seconds
      setTimeout(() => {
        setFloatingComments((prev) => prev.filter((c) => c.displayId !== displayId));
      }, 10000);

      setNewComment('');
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to post comment');
    }
  };

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      setError('Please select a valid image or video file');
      return;
    }

    setMediaFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setMediaPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    setError('');
  };

  const handleSendMedia = async () => {
    if (!mediaFile) return;
    setUploading(true);
    try {
      const res = await uploadFile(mediaFile);
      const mediaUrl = res.data.url;
      console.log('Media uploaded:', mediaUrl);
      // Post media as a room comment so it appears in chat
      const postRes = await postRoomComment(roomId, undefined, mediaUrl, mediaFile.type);
      const comment = postRes.data.comment;
      // Add to comments and floating comments
      setComments((prev) => [...prev, comment]);
      const displayId = `${comment._id}-${Date.now()}`;
      const floatingComment: FloatingComment = {
        ...comment,
        displayId,
        willRemoveAt: Date.now() + 10000,
      };
      setFloatingComments((prev) => [...prev, floatingComment]);
      setTimeout(() => {
        setFloatingComments((prev) => prev.filter((c) => c.displayId !== displayId));
      }, 10000);

      setMediaFile(null);
      setMediaPreview('');
      if (mediaInputRef.current) mediaInputRef.current.value = '';
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload media');
    } finally {
      setUploading(false);
    }
  };

  const toggleStream = () => {
    if (!canSendMedia) return;
    // Start streaming (with required video preview)
    const start = async () => {
      try {
        // Ensure we're joined before starting (helps if user clicks quickly after opening the room)
        socketRef.current?.emit('nightroom:join', { roomId });

        // Check if we have camera permissions first
        if (navigator.permissions) {
          const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (cameraPermission.state === 'denied') {
            setError('Camera access denied. Please allow camera access in your browser settings and try again.');
            return;
          }
        }

        // Try to get basic video + audio
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(s);
        setIsStreaming(true);
        setHostIsLive(false);
        setError('');
        socketRef.current?.emit('nightroom:stream:start', { roomId });
      } catch (err: any) {
        console.error('Failed to start streaming', err);
        let errorMessage = 'Failed to access camera: ';
        if (err?.message?.includes('Requested device not found')) {
          errorMessage += 'No camera device found. Please check that your camera is connected and not being used by another application.';
        } else if (err?.message?.includes('Permission denied')) {
          errorMessage += 'Camera access denied. Please allow camera access in your browser settings.';
        } else {
          errorMessage += (err?.message || 'Unknown error occurred. Please check permissions and ensure no other app is using the camera.');
        }
        setError(errorMessage);
      }
    };

    const stop = () => {
      try {
        socketRef.current?.emit('nightroom:stream:stop', { roomId });
      } catch {}
      stopBroadcasterPeers();
      try {
        if (localStream) {
          localStream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {
        console.warn('Error stopping local stream', e);
      }
      setLocalStream(null);
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setIsStreaming(false);
    };

    if (!isStreaming) start();
    else stop();
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        try {
          try {
            socketRef.current?.emit('nightroom:stream:stop', { roomId });
          } catch {}
          stopBroadcasterPeers();
          localStream.getTracks().forEach((t) => t.stop());
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, [localStream]);

  if (loading) return <div className="text-gray-400">Loading room…</div>;
  if (!room) return <div className="text-red-400">Room not found</div>;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'linear-gradient(160deg,#0f172a,#1e293b)', display: 'flex', flexDirection: 'column', color: '#e2e8f0', fontFamily: '"Inter",system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(251,191,36,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15,23,42,.8)', backdropFilter: 'blur(10px)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fbbf24' }}>📹 {room.name}</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>by {room.creator?.name} · {room.participants?.length || 0} participants</p>
        </div>
        <button onClick={onClose}
          style={{ padding: '8px 14px', background: 'rgba(100,116,139,.2)', color: '#94a3b8', border: '1px solid rgba(100,116,139,.3)', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>
          ✕ Leave
        </button>
      </div>

      {/* Camera Controls — all participants */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(251,191,36,.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {canSendMedia ? '🎥 You can open your camera' : '⏳ Join the room to use camera'}
          </span>
        </div>
        {canSendMedia && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={toggleStream}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: isStreaming ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
              {isStreaming ? '🔴 Stop Camera' : '🎥 Open Camera'}
            </button>
            <button onClick={() => mediaInputRef.current?.click()}
              style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(251,191,36,.3)', background: 'rgba(251,191,36,.15)', color: '#fbbf24', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              📎 Share File
            </button>
            <input ref={mediaInputRef} type="file" accept="image/*,video/*" onChange={handleMediaSelect} style={{ display: 'none' }} />
          </div>
        )}
    
        {/* Media Preview */}
        {mediaPreview && (
          <div style={{ marginTop: 10 }}>
            {mediaFile?.type.startsWith('image/') ? (
              <img src={mediaPreview} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '60vh', objectFit: 'contain', borderRadius: 10 }} />
            ) : (
              <video src={mediaPreview} style={{ maxWidth: '90vw', maxHeight: '60vh', objectFit: 'contain', borderRadius: 10 }} controls autoPlay muted />
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleSendMedia} disabled={uploading}
                style={{ flex: 1, padding: '8px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, cursor: 'pointer', opacity: uploading ? .6 : 1 }}>
                {uploading ? '⏳ Uploading…' : '✅ Send'}
              </button>
              <button onClick={() => { setMediaFile(null); setMediaPreview(''); if (mediaInputRef.current) mediaInputRef.current.value = ''; }}
                style={{ padding: '8px 14px', background: 'rgba(100,116,139,.2)', color: '#94a3b8', border: 'none', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,.15)', borderBottom: '1px solid rgba(239,68,68,.3)', color: '#fca5a5', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Floating comments */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 16, zIndex: 5 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {floatingComments.map((comment) => (
              <div key={comment.displayId}
                style={{ fontSize: 13, background: 'rgba(15,23,42,.85)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10, padding: '8px 12px', maxWidth: '90vw', animation: 'floatUp 10s linear forwards', color: '#e2e8f0' }}>
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{comment.author.name}: </span>
                {comment.mediaUrl ? (
                  comment.mediaType?.startsWith('image/') ? (
                    <img src={resolveMediaUrl(comment.mediaUrl)} alt="media" style={{ display: 'inline-block', marginLeft: 8, maxWidth: '60vw', maxHeight: '40vh', objectFit: 'contain', borderRadius: 6 }} />
                  ) : (
                    <video src={resolveMediaUrl(comment.mediaUrl)} style={{ display: 'inline-block', marginLeft: 8, maxWidth: '60vw', maxHeight: '40vh', objectFit: 'contain', borderRadius: 6 }} controls autoPlay muted />
                  )
                ) : (
                  <span style={{ marginLeft: 4 }}>{comment.content}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Comments List */}
        <div style={{ height: '100%', overflowY: 'auto', padding: '12px 16px 80px' }}>
          {/* Video section */}
          <div style={{ marginBottom: 12, background: 'rgba(15,23,42,.6)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>📹 Live Cameras</span>
              {isStreaming ? (
                <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, background: 'rgba(239,68,68,.15)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(239,68,68,.3)' }}>● LIVE</span>
              ) : hostIsLive ? (
                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>{remoteStreamActive ? 'WATCHING' : 'CONNECTING…'}</span>
              ) : (
                <span style={{ fontSize: 11, color: '#475569' }}>No cameras active</span>
              )}
            </div>
            {isStreaming ? (
              <>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>You are live — everyone in the room can watch</div>
                <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', maxHeight: '45vh', objectFit: 'cover', borderRadius: 10, background: '#000' }} />
              </>
            ) : hostIsLive ? (
              <>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Someone is live</div>
                <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', maxHeight: '45vh', objectFit: 'cover', borderRadius: 10, background: '#000' }} />
              </>
            ) : (
              <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                🎥 Open your camera to start discussing with others
              </div>
            )}
          </div>

          {/* Chat messages */}
          {comments.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>No messages yet — say hello!</div>
          ) : (
            comments.map((comment) => (
              <div key={comment._id} style={{ marginBottom: 8, background: 'rgba(30,41,59,.6)', border: '1px solid rgba(96,165,250,.12)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>{comment.author.name}</div>
                {comment.mediaUrl ? (
                  <div style={{ marginTop: 4 }}>
                    {comment.mediaType?.startsWith('image/') ? (
                      <img src={resolveMediaUrl(comment.mediaUrl)} alt="media" style={{ maxWidth: '90vw', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8 }} />
                    ) : (
                      <video src={resolveMediaUrl(comment.mediaUrl)} style={{ maxWidth: '90vw', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8 }} controls autoPlay muted />
                    )}
                    {comment.content && <div style={{ color: '#cbd5e1', marginTop: 6, fontSize: 13 }}>{comment.content}</div>}
                  </div>
                ) : (
                  <div style={{ color: '#cbd5e1', fontSize: 14 }}>{comment.content}</div>
                )}
                <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>{new Date(comment.createdAt).toLocaleTimeString()}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Message Input */}
      <form onSubmit={handlePostComment} style={{ padding: '12px 16px', borderTop: '1px solid rgba(251,191,36,.15)', display: 'flex', gap: 10, background: 'rgba(15,23,42,.95)', backdropFilter: 'blur(10px)' }}>
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '10px 14px', background: 'rgba(30,41,59,.8)', color: '#e2e8f0', border: '1px solid rgba(96,165,250,.25)', borderRadius: 20, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
        />
        <button type="submit" disabled={!newComment.trim()}
          style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', border: 'none', borderRadius: 20, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: !newComment.trim() ? .5 : 1 }}>
          Send
        </button>
      </form>

      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-80px); }
        }
      `}</style>
    </div>
  );
};

export default RoomView;
