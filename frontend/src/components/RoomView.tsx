import React, { useEffect, useState, useRef } from 'react';
import { getRoomDetails, postRoomComment, getRoomComments, canSendMediaInRoom, uploadFile, resolveMediaUrl } from '../services/api';

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
  const streamVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaInputRef = React.useRef<HTMLInputElement>(null);

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
        if (streamVideoRef.current) {
          streamVideoRef.current.srcObject = s;
          streamVideoRef.current.muted = true; // Prevent feedback
        }
        setIsStreaming(true);
        setError('');
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
        if (localStream) {
          localStream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {
        console.warn('Error stopping local stream', e);
      }
      setLocalStream(null);
      if (streamVideoRef.current) streamVideoRef.current.srcObject = null;
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
            {/* Local preview for streamer */}
            {isStreaming && (
              <div className="w-full mt-3">
                <video
                  ref={(el) => (streamVideoRef.current = el)}
                  autoPlay
                  muted
                  playsInline
                  className="w-full max-h-[40vh] object-cover rounded"
                />
              </div>
            )}
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
