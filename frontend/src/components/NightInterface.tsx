import React, { useEffect, useState } from 'react';
import { getNightModeStatus, exitNightMode, getNightPosts, createNightPost, uploadFile, getUploadBaseURL, deleteNightPost, createNightRoom, getNightRooms, joinNightRoom, verifyNightRoomEntryPayment, getRoomDetails, postRoomComment, getRoomComments, canSendMediaInRoom, addNightPostReaction, addNightPostComment } from '../services/api';
import Post from './Post';
import RoomView from './RoomView';

interface NightPost {
  _id: string;
  user: {
    _id: string;
    username: string;
    name: string;
  };
  content: string;
  imageUrl?: string;
  songUrl?: string;
  anonymous?: boolean;
  isNightPost: boolean;
  likes: string[];
  reactions: { [key: string]: number };
  userReactions: { [key: string]: string };
  comments: any[];
  createdAt: string;
}

interface NightInterfaceProps {
  onExitNightMode?: () => void;
}

const NightInterface: React.FC<NightInterfaceProps> = ({ onExitNightMode }) => {
  const [posts, setPosts] = useState<NightPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [postingLoading, setPostingLoading] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomEntryType, setRoomEntryType] = useState<'free' | 'paid'>('free');
  const [roomEntryFee, setRoomEntryFee] = useState<number>(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});
  const [commentText, setCommentText] = useState<{ [key: string]: string }>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadNightPosts();
    const interval = setInterval(loadNightPosts, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadNightPosts = async () => {
    try {
      const response = await getNightPosts();
      if (response.data.success) {
        setPosts(response.data.posts);
        setError('');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load night posts');
      if (err.response?.status === 403) {
        // User lost night mode access
        onExitNightMode?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const validateFileDimensions = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const isValid = img.width >= 200 && img.height >= 200;
          resolve(isValid);
        };
        img.onerror = () => resolve(false);
        img.src = URL.createObjectURL(file);
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          const isValid = video.videoWidth <= 340 && video.videoHeight >= 300 && video.videoHeight <= 600;
          resolve(isValid);
        };
        video.onerror = () => resolve(false);
        video.src = URL.createObjectURL(file);
      } else {
        resolve(false);
      }
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      setError('Please select a valid image or video file');
      return;
    }

    // Validate dimensions
    const isValidDimensions = await validateFileDimensions(file);
    if (!isValidDimensions) {
      setError('File must be at least 200px wide and 200px tall');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    setError(''); // Clear any previous errors
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() && !selectedFile) return;

    setPostingLoading(true);
    try {
      // If file is selected, upload it first
      let uploadedImageUrl = '';
      if (selectedFile) {
        try {
          console.log('Uploading file:', selectedFile.name, selectedFile.type, selectedFile.size);
          const uploadResponse = await uploadFile(selectedFile);
          console.log('Upload response:', uploadResponse.data);
          uploadedImageUrl = uploadResponse.data.url;
          console.log('Uploaded image URL:', uploadedImageUrl);
          
          // Verify the image can be loaded
          const img = new Image();
          img.onload = () => console.log('Image verified - can be loaded');
          img.onerror = () => console.error('Image failed to load from URL:', uploadedImageUrl);
          img.src = uploadedImageUrl;
        } catch (uploadErr: any) {
          console.error('Upload error:', uploadErr);
          setError('Failed to upload file: ' + (uploadErr.response?.data?.message || uploadErr.message));
          setPostingLoading(false);
          return;
        }
      }

      const response = await createNightPost(newPostContent, uploadedImageUrl);
      console.log('Create post response:', response.data);
      if (response.data.success) {
        setPosts([response.data.post, ...posts]);
        setNewPostContent('');
        clearFileSelection();
        setShowComposer(false);
        setError('');
      }
    } catch (err: any) {
      console.error('Create post error:', err);
      setError(err.response?.data?.message || 'Failed to create post');
      if (err.response?.status === 403) {
        // User lost night mode access
        onExitNightMode?.();
      }
    } finally {
      setPostingLoading(false);
    }
  };

  const handleExitNightMode = async () => {
    try {
      console.log('Exit button clicked, calling exitNightMode API...');
      await exitNightMode();
      console.log('exitNightMode API succeeded, calling onExitNightMode callback...');
      onExitNightMode?.();
    } catch (err: any) {
      console.error('Error exiting night mode:', err);
      setError('Failed to exit night mode: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleCreateRoom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }
    const fee = roomEntryType === 'paid' ? Number(roomEntryFee || 0) : 0;
    if (roomEntryType === 'paid' && (!Number.isFinite(fee) || fee <= 0)) {
      setError('Please enter a valid entry fee');
      return;
    }
    setCreatingRoom(true);
    try {
      const res = await createNightRoom(roomName.trim(), fee);
      console.log('Create room response:', res.data);
      setRoomName('');
      setRoomEntryType('free');
      setRoomEntryFee(0);
      setShowRoomModal(false);
      setError('');
      // Optionally: navigate or add to local state
    } catch (err: any) {
      console.error('Create room error:', err);
      setError(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post?')) {
      return;
    }

    try {
      const response = await deleteNightPost(postId);
      console.log('Delete response:', response);
      setPosts(posts.filter(post => post._id !== postId));
      setError('');
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.response?.data?.message || 'Failed to delete post');
    }
  };

  const handleEmojiReaction = async (postId: string, emoji: string) => {
    try {
      const response = await addNightPostReaction(postId, emoji);
      if (response.data.success) {
        setPosts(posts.map(post => 
          post._id === postId ? response.data.post : post
        ));
      }
    } catch (err: any) {
      console.error('Error adding reaction:', err);
      setError(err.response?.data?.message || 'Failed to add reaction');
    }
  };

  const handleAddComment = async (postId: string, content: string) => {
    try {
      const response = await addNightPostComment(postId, content);
      if (response.data.success) {
        setPosts(posts.map(post => 
          post._id === postId ? response.data.post : post
        ));
        // Clear the comment text after successful posting
        setCommentText(prev => ({ ...prev, [postId]: '' }));
      }
      return true;
    } catch (err: any) {
      console.error('Error adding comment:', err);
      setError(err.response?.data?.message || 'Failed to add comment');
      return false;
    }
  };

  useEffect(() => {
    // Get current user ID from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setCurrentUserId(user._id || user.id);
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }
  }, []);

  // CommentInput sub-component
  const CommentInput: React.FC<{ postId: string; onCommentAdded: (content: string) => Promise<boolean> }> = ({ postId, onCommentAdded }) => {
    const [commentText, setCommentText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
      if (!commentText.trim()) return;

      setSubmitting(true);
      const success = await onCommentAdded(commentText);
      if (success) {
        setCommentText('');
      }
      setSubmitting(false);
    };

    return (
      <div className="flex gap-2 w-full">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Add a comment..."
          className="flex-1 px-2 py-1 bg-gray-700 text-white text-sm rounded border border-purple-500/30 focus:border-purple-500 focus:outline-none placeholder-gray-400"
          disabled={submitting}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !commentText.trim()}
          className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? '...' : '💬'}
        </button>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0d0d1a 0%,#1a0a2e 40%,#0d0d1a 100%)', color: 'white', overflow: 'hidden', fontFamily: 'Inter,system-ui,sans-serif' }}>
      {/* Starfield */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {Array.from({length: 60}).map((_,i) => (
          <div key={i} style={{ position:'absolute', left:`${Math.random()*100}%`, top:`${Math.random()*100}%`, width:`${Math.random()*2+1}px`, height:`${Math.random()*2+1}px`, borderRadius:'50%', background:'white', opacity: Math.random()*0.6+0.2, animation:`twinkleNI ${Math.random()*3+2}s ease-in-out infinite alternate` }} />
        ))}
      </div>
      {/* Nebula blobs */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, background:'radial-gradient(ellipse at 15% 40%,rgba(109,40,217,0.18) 0%,transparent 55%),radial-gradient(ellipse at 85% 70%,rgba(219,39,119,0.12) 0%,transparent 55%)' }} />
      <style>{`@keyframes twinkleNI{0%{opacity:0.15;transform:scale(0.8)}100%{opacity:0.9;transform:scale(1.3)}}`}</style>

      {/* Room View Modal */}
      {selectedRoomId && (
        <RoomView roomId={selectedRoomId} onClose={() => setSelectedRoomId(null)} currentUserId={currentUserId} />
      )}

      {!selectedRoomId && (
      <>
      {/* Main Content */}
      <div className="relative z-10 max-w-2xl mx-auto p-4" style={{ position:'relative', zIndex:1 }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'32px' }}>
          <div style={{ flex:1, textAlign:'center', padding:'36px 16px 28px', borderBottom:'1px solid rgba(139,92,246,0.25)' }}>
            <div style={{ fontSize:'72px', lineHeight:1, marginBottom:'16px', filter:'drop-shadow(0 0 24px rgba(196,181,253,0.9)) drop-shadow(0 0 48px rgba(139,92,246,0.5))', display:'inline-block', animation:'moonFloat 4s ease-in-out infinite' }}>🌙</div>
            <h1 style={{ fontSize:'36px', fontWeight:800, letterSpacing:'0.04em', background:'linear-gradient(90deg,#c4b5fd,#f472b6,#818cf8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:'8px' }}>Night Mode</h1>
            <p style={{ color:'#a78bfa', fontSize:'13px', opacity:0.85 }}>Enter the realm of shadows. What happens here, stays in the night 🖤</p>
          </div>
          {!showComposer && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', paddingTop:'36px' }}>
              <button
                onClick={() => setShowRoomModal(true)}
                title="Create a room"
                aria-label="Create room"
                style={{ marginLeft:'8px', width:'52px', height:'52px', borderRadius:'50%', border:'none', background:'linear-gradient(135deg,#7c3aed,#db2777)', color:'white', fontSize:'24px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 0 20px rgba(139,92,246,0.5)', transition:'transform 0.2s' }}
                onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.12)')}
                onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}
              >+</button>
            </div>
          )}
        </div>
        <style>{`@keyframes moonFloat{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-10px) rotate(5deg)}}`}</style>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 animate-pulse">
            {error}
          </div>
        )}

        {/* Composer Section */}
        {!showComposer ? (
          <button
            onClick={() => setShowComposer(true)}
            style={{ width:'100%', marginBottom:'24px', padding:'16px', borderRadius:'16px', border:'1px solid rgba(139,92,246,0.35)', background:'linear-gradient(135deg,rgba(109,40,217,0.4),rgba(190,24,93,0.3))', color:'white', fontSize:'16px', fontWeight:700, cursor:'pointer', backdropFilter:'blur(10px)', boxShadow:'0 0 30px rgba(139,92,246,0.2)', transition:'all 0.3s', letterSpacing:'0.02em' }}
            onMouseEnter={e=>{ e.currentTarget.style.transform='scale(1.02)'; e.currentTarget.style.boxShadow='0 0 40px rgba(139,92,246,0.4)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='0 0 30px rgba(139,92,246,0.2)'; }}
          >
            ✍️ Share a Secret
          </button>
        ) : (
          <form onSubmit={handleCreatePost} className="mb-6 p-6 bg-gray-800/50 border border-purple-500/30 rounded-lg backdrop-blur-sm">
            <textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="What's on your mind in the darkness?"
              className="w-full p-3 bg-gray-900 text-white border border-purple-500/50 rounded-lg focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 resize-none"
              rows={4}
            />
            
            {/* File Input */}
            <div className="mt-4 flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
                id="night-post-file"
              />
              <label
                htmlFor="night-post-file"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all cursor-pointer font-semibold"
              >
                🖼️ Add Photo/Video
              </label>
              {selectedFile && (
                <button
                  type="button"
                  onClick={clearFileSelection}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all font-semibold"
                >
                  ✕ Remove
                </button>
              )}
            </div>

            {/* File Preview */}
            {previewUrl && (
              <div className="mt-4 relative">
                {selectedFile?.type.startsWith('image/') ? (
                  <img src={previewUrl} alt="Preview" className="w-full rounded-lg max-h-60 object-cover" />
                ) : (
                  <video src={previewUrl} className="w-full rounded-lg max-h-60 object-cover" controls autoPlay muted />
                )}
                <p className="text-sm text-gray-400 mt-2">📎 {selectedFile?.name}</p>
              </div>
            )}
            
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={postingLoading || (!newPostContent.trim() && !selectedFile)}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all font-semibold"
              >
                {postingLoading ? '🌀 Posting...' : '📤 Post Secret'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowComposer(false);
                  clearFileSelection();
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Rooms List (show before posts) */}
        <div className="mt-6 mb-8">
          <h3 className="text-lg font-semibold mb-3">Night Rooms</h3>
          <RoomList onOpenRoom={setSelectedRoomId} />
        </div>

        {/* Create Room Modal */}
        {showRoomModal && (
          <div className="fixed inset-0 z-30 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowRoomModal(false)} />
            <div className="relative z-40 w-full max-w-md p-6 bg-gray-900 border border-purple-500/30 rounded-lg">
              <h2 className="text-xl font-semibold mb-3">Create Night Room</h2>
              <form onSubmit={handleCreateRoom}>
                <label className="block text-sm text-gray-300 mb-2">Room name</label>
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full p-3 bg-gray-800 text-white border border-purple-500/30 rounded-lg mb-4"
                  placeholder="Enter a room name"
                  autoFocus
                />
                <label className="block text-sm text-gray-300 mb-2">Entry</label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRoomEntryType('free');
                      setRoomEntryFee(0);
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm transition ${
                      roomEntryType === 'free' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-purple-500/30 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    Free
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoomEntryType('paid')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm transition ${
                      roomEntryType === 'paid' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-purple-500/30 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    Paid
                  </button>
                </div>
                {roomEntryType === 'paid' && (
                  <div className="mb-4">
                    <label className="block text-sm text-gray-300 mb-2">Entry fee (₹)</label>
                    <input
                      type="number"
                      min={1}
                      value={roomEntryFee || ''}
                      onChange={(e) => setRoomEntryFee(Number(e.target.value))}
                      className="w-full p-3 bg-gray-800 text-white border border-purple-500/30 rounded-lg"
                      placeholder="e.g. 10"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRoomModal(false)}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingRoom}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg"
                  >
                    {creatingRoom ? 'Creating…' : 'Create Room'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block">
              <div className="text-4xl animate-spin mb-4">⚫</div>
              <p className="text-purple-300">Unveiling secrets...</p>
            </div>
          </div>
        )}

        {/* No Posts State */}
        {!loading && posts.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-5xl mb-4">🕷️</div>
            <p className="text-purple-300 text-lg">The silence is deafening...</p>
            <p className="text-gray-500 text-sm mt-2">Be the first to share a secret in the night</p>
          </div>
        )}

        {/* Posts Feed */}
        {!loading && posts.length > 0 && (
          <div className="space-y-4 mb-8">
            {posts.map((post) => {
              const postWithUser = {
                ...post,
                user: post.user || { _id: '', username: '', name: '' },
                likes: post.likes || [],
                reactions: post.reactions || {},
                userReactions: post.userReactions || {},
                comments: post.comments || [],
              };

              return (
                <div
                  key={post._id}
                  style={{ borderRadius:'20px', overflow:'hidden', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(139,92,246,0.25)', backdropFilter:'blur(16px)', boxShadow:'0 4px 24px rgba(0,0,0,0.4)', transition:'all 0.3s' }}
                  onMouseEnter={e=>{ e.currentTarget.style.border='1px solid rgba(196,181,253,0.45)'; e.currentTarget.style.boxShadow='0 8px 40px rgba(139,92,246,0.2)'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.border='1px solid rgba(139,92,246,0.25)'; e.currentTarget.style.boxShadow='0 4px 24px rgba(0,0,0,0.4)'; }}
                >
                  {/* Night Mode Post Wrapper */}
                  <div style={{ padding:'20px' }}>
                    {/* Post Header */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'linear-gradient(135deg,#7c3aed,#db2777)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 }}>
                          {post.anonymous ? '👤' : (post.user?.name?.[0] || '?')}
                        </div>
                        <div>
                          <p style={{ color:'#c4b5fd', fontWeight:600, fontSize:'14px', margin:0 }}>
                            {post.anonymous ? 'Anonymous' : post.user?.name}
                          </p>
                          <p style={{ color:'#4b5563', fontSize:'11px', margin:0 }}>
                            {new Date(post.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {currentUserId === post.user?._id && (
                        <button
                          onClick={() => handleDeletePost(post._id)}
                          style={{ padding:'6px', background:'transparent', border:'none', color:'#ef4444', cursor:'pointer', borderRadius:'8px', opacity:0.7, transition:'opacity 0.2s' }}
                          title="Delete post"
                          onMouseEnter={e=>e.currentTarget.style.opacity='1'}
                          onMouseLeave={e=>e.currentTarget.style.opacity='0.7'}
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    
                    <p className="text-gray-200 mb-4 leading-relaxed">{post.content}</p>

                    
                    {post.imageUrl && (
                      <div className="mb-4 rounded-lg overflow-hidden border border-purple-500/20">
                        <img
                          src={post.imageUrl}
                          alt="Post"
                          className="w-full max-h-96 object-cover hover:opacity-80 transition-opacity"
                        />
                      </div>
                    )}

                    {/* Reactions */}
                    <div style={{ marginTop:'14px', display:'flex', alignItems:'center', gap:'6px', flexWrap:'nowrap', overflowX:'auto', background:'rgba(0,0,0,0.2)', padding:'8px 12px', borderRadius:'12px', border:'1px solid rgba(139,92,246,0.15)' }}>
                      {[
                        { emoji: '😍', color: '#f43f5e' },
                        { emoji: '😂', color: '#eab308' },
                        { emoji: '😢', color: '#60a5fa' },
                        { emoji: '😠', color: '#f97316' },
                      ].map(({ emoji, color }) => {
                        const userEmoji = post.userReactions?.[currentUserId];
                        const hasReacted = userEmoji === emoji;
                        const count = post.reactions?.[emoji] || 0;
                        return (
                          <div key={emoji} style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0 }}>
                            <button
                              onClick={() => handleEmojiReaction(post._id, emoji)}
                              style={{ padding:'6px 10px', borderRadius:'20px', border: hasReacted ? `1.5px solid ${color}` : '1.5px solid transparent', background: hasReacted ? `${color}22` : 'transparent', cursor:'pointer', fontSize:'18px', transition:'all 0.2s', transform: hasReacted ? 'scale(1.15)' : 'scale(1)' }}
                            >{emoji}</button>
                            {count > 0 && <span style={{ fontSize:'11px', color:'#9ca3af' }}>{count}</span>}
                          </div>
                        );
                      })}
                      <button
                        onClick={() => setShowComments(prev => ({ ...prev, [post._id]: !prev[post._id] }))}
                        style={{ marginLeft:'auto', padding:'6px 12px', borderRadius:'20px', border:`1.5px solid ${showComments[post._id] ? 'rgba(139,92,246,0.7)' : 'transparent'}`, background: showComments[post._id] ? 'rgba(139,92,246,0.25)' : 'transparent', cursor:'pointer', fontSize:'16px', color: showComments[post._id] ? '#c4b5fd' : '#6b7280', display:'flex', alignItems:'center', gap:'5px', flexShrink:0, transition:'all 0.2s' }}
                        title="Toggle comments"
                      >
                        💬 <span style={{ fontSize:'11px' }}>{post.comments?.length || 0}</span>
                      </button>
                    </div>

                    
                    {showComments[post._id] && (
                      <div className="mt-3 border-t border-purple-500/20 pt-3 bg-gray-900/30 rounded p-3">
                        <h4 className="font-semibold text-purple-300 mb-3 text-sm">Comments</h4>
                        
                        
                        {post.comments && post.comments.length > 0 && (
                          <div className="space-y-2 mb-3 max-h-40 overflow-y-auto bg-gray-800/50 p-2 rounded">
                            {post.comments.map((comment: any, idx: number) => (
                              <div key={idx} className="bg-gray-800/70 p-2 rounded text-sm">
                                <p className="text-purple-300 font-semibold text-xs">
                                  {comment.user?.name || 'Anonymous'}
                                </p>
                                <p className="text-gray-300 text-xs mt-1">{comment.content}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {(!post.comments || post.comments.length === 0) && (
                          <p className="text-gray-500 text-xs mb-3">No comments yet. Be the first!</p>
                        )}

                        
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={commentText[post._id] || ''}
                            onChange={(e) => setCommentText(prev => ({ ...prev, [post._id]: e.target.value }))}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter' && commentText[post._id]?.trim()) {
                                handleAddComment(post._id, commentText[post._id]);
                              }
                            }}
                            placeholder="Add a comment..."
                            className="flex-1 px-2 py-1 bg-gray-700 text-white text-xs rounded border border-purple-500/30 focus:border-purple-500 focus:outline-none placeholder-gray-400"
                          />
                          <button
                            onClick={() => {
                              if (commentText[post._id]?.trim()) {
                                handleAddComment(post._id, commentText[post._id]);
                              }
                            }}
                            disabled={!commentText[post._id]?.trim()}
                            className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            💬
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

        {/* Exit Button - Bottom Middle */}
        <div style={{ position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)', zIndex:20 }}>
          <button
            onClick={handleExitNightMode}
            style={{ padding:'12px 32px', borderRadius:'50px', border:'1px solid rgba(239,68,68,0.4)', background:'rgba(15,10,30,0.8)', color:'#f87171', fontSize:'15px', fontWeight:600, cursor:'pointer', backdropFilter:'blur(12px)', boxShadow:'0 0 24px rgba(239,68,68,0.15)', transition:'all 0.3s', letterSpacing:'0.02em' }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(127,29,29,0.4)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.8)'; e.currentTarget.style.boxShadow='0 0 32px rgba(239,68,68,0.3)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(15,10,30,0.8)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.4)'; e.currentTarget.style.boxShadow='0 0 24px rgba(239,68,68,0.15)'; }}
          >
            ☀️ Exit Night Mode
          </button>
        </div>
      </>
      )}
    </div>
  );
};



// --- Rooms subcomponent ---
function RoomList({ onOpenRoom }: { onOpenRoom: (roomId: string) => void }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [processingRoomId, setProcessingRoomId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await getNightRooms();
        if (mounted) setRooms(res.data.rooms || []);
      } catch (e) {
        console.error('Failed to load rooms', e);
      } finally {
        if (mounted) setLoadingRooms(false);
      }
    };
    load();
    return () => { mounted = false };
  }, []);

  const ensureRazorpayScript = () =>
    new Promise<void>((resolve, reject) => {
      if ((window as any).Razorpay) return resolve();
      const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay'));
      document.body.appendChild(script);
    });

  const reloadRooms = async () => {
    const res = await getNightRooms();
    setRooms(res.data.rooms || []);
  };

  const handleJoinRoom = async (room: any) => {
    const roomId = String(room?._id || '');
    if (!roomId) return;

    try {
      setProcessingRoomId(roomId);
      const res = await joinNightRoom(roomId);

      if (res.data?.paymentRequired) {
        await ensureRazorpayScript();

        const options: any = {
          key: res.data.key,
          amount: Number(res.data.amount || 0) * 100,
          currency: 'INR',
          name: 'Night Room Entry',
          description: `Entry fee for ${String(room?.name || 'room')}`,
          order_id: res.data.orderId,
          handler: async (resp: any) => {
            await verifyNightRoomEntryPayment(roomId, resp.razorpay_order_id, resp.razorpay_payment_id, resp.razorpay_signature);
            await reloadRooms();
          },
          notes: { roomId },
          theme: { color: '#a855f7' },
        };

        const razorpay = new (window as any).Razorpay(options);
        razorpay.on('payment.failed', (resp: any) => {
          console.warn('Room entry payment failed', resp);
        });
        razorpay.open();
      } else {
        await reloadRooms();
      }
    } catch (e) {
      console.error('Join failed', e);
    } finally {
      setProcessingRoomId(null);
    }
  };

  const currentUserData = localStorage.getItem('user');
  const currentUser = currentUserData ? JSON.parse(currentUserData) : null;

  if (loadingRooms) return <div className="text-gray-400">Loading rooms…</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      {rooms.length === 0 && (
        <div style={{ textAlign:'center', padding:'20px', color:'#6b7280', fontSize:'13px' }}>No rooms yet — create one!</div>
      )}
      {rooms.map((r) => {
        const isParticipant = currentUser && r.participants && r.participants.map((p:any)=>String(p)).includes(String(currentUser._id || currentUser.id));
        const fee = Number(r?.entryFee || 0);
        return (
          <div key={r._id} style={{ padding:'14px 16px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(139,92,246,0.2)', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'space-between', backdropFilter:'blur(10px)', transition:'border 0.2s' }}
            onMouseEnter={e=>e.currentTarget.style.border='1px solid rgba(196,181,253,0.4)'}
            onMouseLeave={e=>e.currentTarget.style.border='1px solid rgba(139,92,246,0.2)'}
          >
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, color:'#c4b5fd', fontSize:'14px', marginBottom:'4px' }}>🏠 {r.name}</div>
              <div style={{ fontSize:'11px', color:'#6b7280', display:'flex', alignItems:'center', gap:'8px' }}>
                <span>by {r.creator?.name || r.creator?.username}</span>
                <span style={{ padding:'2px 8px', borderRadius:'20px', border: fee > 0 ? '1px solid rgba(244,114,182,0.4)' : '1px solid rgba(74,222,128,0.4)', color: fee > 0 ? '#f9a8d4' : '#86efac', fontSize:'11px' }}>
                  {fee > 0 ? `₹${fee} entry` : 'Free'}
                </span>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              {!isParticipant && (
                <button
                  onClick={() => handleJoinRoom(r)}
                  disabled={processingRoomId===r._id}
                  style={{ padding:'7px 16px', borderRadius:'20px', border:'none', background:'linear-gradient(135deg,#2563eb,#4f46e5)', color:'white', fontSize:'13px', fontWeight:600, cursor:'pointer', opacity: processingRoomId===r._id ? 0.6 : 1, transition:'all 0.2s' }}
                >{processingRoomId===r._id ? '...' : (fee > 0 ? `Join ₹${fee}` : 'Join')}</button>
              )}
              {isParticipant && (
                <button onClick={() => onOpenRoom(r._id)} style={{ padding:'7px 16px', borderRadius:'20px', border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontSize:'13px', fontWeight:600, cursor:'pointer', transition:'all 0.2s' }}>Open</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default NightInterface;
