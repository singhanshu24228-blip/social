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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-black text-white overflow-hidden">
      {/* Room View Modal */}
      {selectedRoomId && (
        <RoomView roomId={selectedRoomId} onClose={() => setSelectedRoomId(null)} currentUserId={currentUserId} />
      )}

      {!selectedRoomId && (
      <>
      {/* Animated Background */}
      <div className="fixed inset-0 opacity-30 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(139,69,19,0.3),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(75,0,130,0.3),transparent_50%)]" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-2xl mx-auto p-4">
        {/* Header with Create Button */}
        <div className="flex justify-between items-start mb-8">
          <div className="text-center flex-1 py-8 border-b border-purple-500/30">
            <div className="text-6xl mb-4 drop-shadow-lg animate-bounce" style={{ animationDuration: '3s' }}>
              🌙
            </div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
              Night Mode
            </h1>
            <p className="text-purple-300 text-sm">
              Enter the realm of shadows. What happens here, stays in the night 🖤
            </p>
          </div>
          {!showComposer && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRoomModal(true)}
                className="ml-2 p-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full hover:from-purple-500 hover:to-pink-500 transition-all duration-300 shadow-lg hover:shadow-pink-500/50 transform hover:scale-110 text-3xl leading-none w-14 h-14 flex items-center justify-center"
                title="Create a room"
                aria-label="Create room"
              >
                +
              </button>
              {/* <button
                onClick={() => setShowRoomModal(true)}
                className="p-2 bg-gray-800/40 text-white rounded-md hover:bg-gray-800/60 transition"
                title="Create room"
                aria-label="Create room"
              >
                🏠
              </button> */}
            </div>
          )}
        </div>

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
            className="w-full mb-6 p-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all duration-300 shadow-lg hover:shadow-pink-500/50 transform hover:scale-105"
          >
            <span className="text-lg font-semibold">✍️ Share a Secret</span>
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
                  className="bg-gray-800/30 border border-purple-500/30 rounded-lg overflow-hidden hover:border-purple-400/50 transition-all duration-300 backdrop-blur-sm hover:bg-gray-800/50 hover:shadow-lg hover:shadow-purple-500/10"
                >
                  {/* Night Mode Post Wrapper */}
                  <div className="p-4">
                    {/* Post Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-purple-300 font-semibold">
                          {post.anonymous ? '👤 Anonymous' : post.user?.name}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {new Date(post.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {currentUserId === post.user?._id && (
                        <button
                          onClick={() => handleDeletePost(post._id)}
                          className="p-2 text-red-400 hover:bg-red-900/30 hover:text-red-300 rounded-lg transition-all duration-200"
                          title="Delete post"
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
                    <div className="mt-4 flex items-center gap-2 flex-nowrap overflow-x-auto bg-gray-800/50 p-2 rounded">
                      {[
                        { emoji: '😍', bg: 'bg-red-100' },
                        { emoji: '😂', bg: 'bg-yellow-100' },
                        { emoji: '😢', bg: 'bg-blue-200' },
                        { emoji: '😠', bg: 'bg-red-300' },
                      ].map(({ emoji, bg }) => {
                        const userEmoji = post.userReactions?.[currentUserId];
                        const hasReacted = userEmoji === emoji;
                        const count = post.reactions?.[emoji] || 0;

                        return (
                          <div key={emoji} className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEmojiReaction(post._id, emoji)}
                              className={`px-2 py-1 rounded text-lg transition ${
                                hasReacted ? bg : 'hover:bg-gray-600'
                              }`}
                            >
                              {emoji}
                            </button>
                            {count > 0 && (
                              <span className="text-xs text-gray-300">{count}</span>
                            )}
                          </div>
                        );
                      })}
                      
                      
                      <button
                        onClick={() => setShowComments(prev => ({ ...prev, [post._id]: !prev[post._id] }))}
                        className={`ml-2 px-2 py-1 rounded text-lg transition flex items-center gap-1 flex-shrink-0 ${
                          showComments[post._id] ? 'bg-purple-500 text-white' : 'hover:bg-gray-600 text-gray-300'
                        }`}
                        title="Toggle comments"
                      >
                        💬 <span className="text-xs">{post.comments?.length || 0}</span>
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
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-20">
          <button
            onClick={handleExitNightMode}
            className="px-8 py-3 bg-gray-800 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-900/20 hover:border-red-400 transition-all duration-300 font-semibold shadow-lg text-lg"
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
    <div className="space-y-3">
      {rooms.map((r) => {
        const isParticipant = currentUser && r.participants && r.participants.map((p:any)=>String(p)).includes(String(currentUser._id || currentUser.id));
        const fee = Number(r?.entryFee || 0);
        return (
          <div key={r._id} className="p-3 bg-gray-800/20 border border-purple-500/20 rounded-lg flex items-center justify-between">
            <div className="flex-1">
              <div className="font-semibold text-purple-300">{r.name}</div>
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <span>by {r.creator?.name || r.creator?.username}</span>
                <span className={`px-2 py-0.5 rounded-full border text-[11px] ${fee > 0 ? 'border-pink-500/40 text-pink-200' : 'border-green-500/40 text-green-200'}`}>
                  {fee > 0 ? `₹${fee} entry` : 'Free entry'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isParticipant && (
                <button
                  onClick={() => handleJoinRoom(r)}
                  disabled={processingRoomId===r._id}
                  className="px-3 py-1 bg-blue-600 rounded-md text-sm hover:bg-blue-500 disabled:opacity-50"
                >
                  {processingRoomId===r._id ? '...' : (fee > 0 ? `Join ₹${fee}` : 'Join')}
                </button>
              )}
              {isParticipant && (
                <button onClick={() => onOpenRoom(r._id)} className="px-3 py-1 bg-purple-600 rounded-md text-sm hover:bg-purple-500">
                  Open
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default NightInterface;
