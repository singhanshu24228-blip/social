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
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-purple-500/30 flex justify-between items-center">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold truncate max-w-[70vw]">{room.name}</h2>
          <p className="text-xs text-gray-400">by {room.creator?.name}</p>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 touch-manipulation"
          aria-label="Close room"
        >
          ✕
        </button>
      </div>

      {/* Info */}
      <div className="p-4 border-b border-purple-500/30 text-sm text-gray-300">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span>Participants: {room.participants?.length || 0}</span>
            {canSendMedia && <span className="ml-3 block sm:inline">✅ You can stream/send photos</span>}
            {!canSendMedia && String(currentUserId) !== String(room.creator._id) && (
              <span className="ml-3 block sm:inline text-gray-400">Only creator can stream/send photos</span>
            )}
          </div>
        </div>

        {/* Creator Media Controls */}
        {canSendMedia && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={toggleStream}
              className={`px-3 py-1 rounded text-sm font-semibold transition-all ${
                isStreaming
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              }`}
            >
              {isStreaming ? '🔴 Stop Stream' : '🎥 Start Stream'}
            </button>
            <button
              onClick={() => mediaInputRef.current?.click()}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-500 font-semibold touch-manipulation"
            >
              📸 Send Photo/Video
            </button>
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleMediaSelect}
              className="hidden"
            />
          </div>
        )}

        {/* Media Preview */}
        {mediaPreview && (
          <div className="mt-3 relative">
            {mediaFile?.type.startsWith('image/') ? (
              <img src={mediaPreview} alt="Preview" className="max-w-[90vw] max-h-[60vh] object-contain rounded" />
            ) : (
              <video src={mediaPreview} className="max-w-[90vw] max-h-[60vh] object-contain rounded" controls />
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSendMedia}
                disabled={uploading}
                className="flex-1 px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-500 disabled:opacity-50 touch-manipulation"
              >
                {uploading ? '⏳ Uploading...' : '✅ Send'}
              </button>
              <button
                onClick={() => {
                  setMediaFile(null);
                  setMediaPreview('');
                  if (mediaInputRef.current) mediaInputRef.current.value = '';
                }}
                className="px-3 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-600 touch-manipulation"
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Floating Comments Layer */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-4">
          <div className="space-y-2">
            {floatingComments.map((comment) => (
              <div
                key={comment.displayId}
                className="animate-float text-sm bg-gray-800/80 border border-purple-500/30 rounded p-2 text-gray-200 max-w-[90vw]"
                style={{
                  animation: `floatUp 10s linear forwards`,
                }}
              >
                <span className="text-purple-300 font-semibold">{comment.author.name}: </span>
                {comment.mediaUrl ? (
                  comment.mediaType?.startsWith('image/') ? (
                    <img src={resolveMediaUrl(comment.mediaUrl)} alt="media" className="inline-block ml-2 max-w-[60vw] max-h-[40vh] object-contain rounded" />
                  ) : (
                    <video src={resolveMediaUrl(comment.mediaUrl)} className="inline-block ml-2 max-w-[60vw] max-h-[40vh] object-contain rounded" controls />
                  )
                ) : (
                  <span className="ml-1">{comment.content}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Comments List */}
        <div className="h-full overflow-y-auto p-4 space-y-2 pb-28" style={{ paddingBottom: '4.5rem' }}>
          <div className="mb-3 bg-black/30 border border-purple-500/30 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-200 font-semibold">🎥 Live Stream</div>
              {isStreaming ? (
                <span className="text-xs text-red-300 font-semibold">LIVE</span>
              ) : hostIsLive ? (
                <span className="text-xs text-green-300 font-semibold">{remoteStreamActive ? 'WATCHING' : 'CONNECTING'}</span>
              ) : (
                <span className="text-xs text-gray-400">OFFLINE</span>
              )}
            </div>

            {isStreaming ? (
              <>
                <div className="text-xs text-gray-400 mb-2">You are live. Everyone in the room can watch.</div>
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full max-h-[45vh] object-cover rounded bg-black" />
              </>
            ) : hostIsLive ? (
              <>
                <div className="text-xs text-gray-400 mb-2">{room?.creator?.name || 'Host'} is live.</div>
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full max-h-[45vh] object-cover rounded bg-black" />
              </>
            ) : (
              <div className="text-gray-400 text-sm">No one is streaming right now.</div>
            )}
          </div>

          {comments.length === 0 ? (
            <div className="text-gray-400 text-center mt-8">No comments yet. Start commenting!</div>
          ) : (
            comments.map((comment) => (
              <div key={comment._id} className="text-sm bg-gray-800/30 border border-purple-500/20 rounded p-2">
                <div className="text-purple-300 font-semibold text-xs">{comment.author.name}</div>
                {comment.mediaUrl ? (
                  <div className="mt-1">
                    {comment.mediaType?.startsWith('image/') ? (
                      <img src={resolveMediaUrl(comment.mediaUrl)} alt="media" className="max-w-[90vw] max-h-[60vh] object-contain rounded mt-1" />
                    ) : (
                      <video src={resolveMediaUrl(comment.mediaUrl)} className="max-w-[90vw] max-h-[60vh] object-contain rounded mt-1" controls />
                    )}
                    {comment.content && <div className="text-gray-200 mt-2">{comment.content}</div>}
                  </div>
                ) : (
                  <div className="text-gray-200">{comment.content}</div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(comment.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Comment Input */}
      <form onSubmit={handlePostComment} className="sticky bottom-0 p-3 border-t border-purple-500/30 flex gap-2 bg-gray-900/95">
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Type a comment…"
          className="flex-1 p-3 bg-gray-800 text-white border border-purple-500/30 rounded text-sm"
        />
        <button
          type="submit"
          disabled={!newComment.trim()}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded text-sm disabled:opacity-50 touch-manipulation"
        >
          Send
        </button>
      </form>

      <style>{`
        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          70% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-80px);
          }
        }
      `}</style>
    </div>
  );
};

export default RoomView;
