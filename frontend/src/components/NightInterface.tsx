import React, { useEffect, useState } from 'react';
import { exitNightMode, getNightPosts, createNightPost, uploadFile, deleteNightPost, createNightRoom, getNightRooms, joinNightRoom, addNightPostReaction, addNightPostComment } from '../services/api';
import RoomView from './RoomView';

interface StudyPost {
  _id: string;
  user: { _id: string; username: string; name: string; };
  content: string;
  imageUrl?: string;
  anonymous?: boolean;
  isNightPost: boolean;
  likes: string[];
  reactions: { [key: string]: number };
  userReactions: { [key: string]: string };
  comments: any[];
  createdAt: string;
}

interface Props { onExitNightMode?: () => void; }

const NightInterface: React.FC<Props> = ({ onExitNightMode }) => {
  const [posts, setPosts] = useState<StudyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [postingLoading, setPostingLoading] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [showComments, setShowComments] = useState<{ [k: string]: boolean }>({});
  const [commentText, setCommentText] = useState<{ [k: string]: string }>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPosts();
    const iv = setInterval(loadPosts, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const ud = localStorage.getItem('user');
    if (ud) { try { const u = JSON.parse(ud); setCurrentUserId(u._id || u.id); } catch {} }
  }, []);

  const loadPosts = async () => {
    try {
      const r = await getNightPosts();
      if (r.data.success) { setPosts(r.data.posts); setError(''); }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load posts');
      if (e.response?.status === 403) onExitNightMode?.();
    } finally { setLoading(false); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) { setError('Please select an image or video'); return; }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    setError('');
  };

  const clearFile = () => { setSelectedFile(null); setPreviewUrl(''); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() && !selectedFile) return;
    setPostingLoading(true);
    try {
      let uploadedImageUrl = '';
      if (selectedFile) {
        const ur = await uploadFile(selectedFile);
        uploadedImageUrl = ur.data.url;
      }
      const r = await createNightPost(newPostContent, uploadedImageUrl);
      if (r.data.success) { setPosts([r.data.post, ...posts]); setNewPostContent(''); clearFile(); setShowComposer(false); }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create post');
    } finally { setPostingLoading(false); }
  };

  const handleExitStudyMode = async () => {
    try { await exitNightMode(); onExitNightMode?.(); }
    catch (e: any) { setError('Failed to exit: ' + (e.response?.data?.message || e.message)); }
  };

  const handleCreateRoom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!roomName.trim()) { setError('Room name is required'); return; }
    setCreatingRoom(true);
    try {
      await createNightRoom(roomName.trim(), 0);
      setRoomName(''); setShowRoomModal(false); setError('');
    } catch (e: any) { setError(e.response?.data?.message || 'Failed to create room'); }
    finally { setCreatingRoom(false); }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Delete this post?')) return;
    try { await deleteNightPost(postId); setPosts(posts.filter(p => p._id !== postId)); }
    catch (e: any) { setError(e.response?.data?.message || 'Failed to delete'); }
  };

  const handleEmojiReaction = async (postId: string, emoji: string) => {
    try {
      const r = await addNightPostReaction(postId, emoji);
      if (r.data.success) setPosts(posts.map(p => p._id === postId ? r.data.post : p));
    } catch (e: any) { setError(e.response?.data?.message || 'Failed to react'); }
  };

  const handleAddComment = async (postId: string, content: string) => {
    try {
      const r = await addNightPostComment(postId, content);
      if (r.data.success) { setPosts(posts.map(p => p._id === postId ? r.data.post : p)); setCommentText(prev => ({ ...prev, [postId]: '' })); }
      return true;
    } catch (e: any) { setError(e.response?.data?.message || 'Failed to comment'); return false; }
  };

  const ago = (d: string) => {
    try {
      const diff = Date.now() - new Date(d).getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    } catch { return ''; }
  };

  const reactions = [{ e: '💡', c: '#f59e0b' }, { e: '👏', c: '#10b981' }, { e: '🤔', c: '#6366f1' }, { e: '🔥', c: '#ef4444' }];

  if (selectedRoomId) return <RoomView roomId={selectedRoomId} onClose={() => setSelectedRoomId(null)} currentUserId={currentUserId} />;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)', color: '#e2e8f0', fontFamily: '"Inter",system-ui,sans-serif' }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1}50%{opacity:.4} }
        @keyframes slide-in { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
        .study-post { animation: slide-in .3s ease; }
        .study-btn { transition: all .18s ease; }
        .study-btn:hover { transform: translateY(-1px); }
        .room-card:hover { border-color: rgba(251,191,36,.5) !important; background: rgba(251,191,36,.06) !important; }
      `}</style>

      <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 100 }}>
        {/* ── Header ── */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(251,191,36,.15)', background: 'rgba(15,23,42,.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 28 }}>📚</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, background: 'linear-gradient(90deg,#fbbf24,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Study Mode</h1>
                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Collaborate · Learn · Discuss</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowRoomModal(true)}
                style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(251,191,36,.4)', background: 'rgba(251,191,36,.12)', color: '#fbbf24', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                className="study-btn">
                🎥 New Room
              </button>
              <button onClick={handleExitStudyMode}
                style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(100,116,139,.4)', background: 'rgba(100,116,139,.12)', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}
                className="study-btn">
                Exit
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 10, color: '#fca5a5', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Study Rooms ── */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', letterSpacing: .4 }}>📹 STUDY ROOMS</span>
            <span style={{ fontSize: 11, color: '#475569' }}>Open your camera · Discuss problems</span>
          </div>
          <RoomList onOpenRoom={setSelectedRoomId} />
        </div>

        {/* ── Post Composer ── */}
        <div style={{ padding: '16px 16px 0' }}>
          {!showComposer ? (
            <button onClick={() => setShowComposer(true)}
              style={{ width: '100%', padding: '13px 16px', borderRadius: 14, border: '1px dashed rgba(96,165,250,.3)', background: 'rgba(96,165,250,.06)', color: '#93c5fd', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
              className="study-btn">
              ✏️ Share what you studied today or ask a question...
            </button>
          ) : (
            <form onSubmit={handleCreatePost} style={{ background: 'rgba(30,41,59,.8)', border: '1px solid rgba(96,165,250,.25)', borderRadius: 14, padding: 16 }}>
              <textarea
                value={newPostContent}
                onChange={e => setNewPostContent(e.target.value)}
                placeholder="What did you study today? Share notes, ask doubts, or inspire your peers..."
                style={{ width: '100%', padding: '10px 12px', background: 'rgba(15,23,42,.6)', color: '#e2e8f0', border: '1px solid rgba(96,165,250,.2)', borderRadius: 10, fontSize: 14, resize: 'vertical', minHeight: 90, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                rows={3} autoFocus />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} style={{ display: 'none' }} id="sm-file" />
                <label htmlFor="sm-file" style={{ padding: '7px 12px', background: 'rgba(96,165,250,.15)', color: '#93c5fd', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(96,165,250,.2)' }}>📎 Attach</label>
                {selectedFile && <button type="button" onClick={clearFile} style={{ padding: '7px 12px', background: 'rgba(100,116,139,.15)', color: '#94a3b8', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: 'none' }}>✕ Remove</button>}
                <button type="submit" disabled={postingLoading || (!newPostContent.trim() && !selectedFile)}
                  style={{ marginLeft: 'auto', padding: '7px 18px', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#0f172a', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', opacity: postingLoading || (!newPostContent.trim() && !selectedFile) ? .5 : 1 }}>
                  {postingLoading ? 'Posting…' : 'Post'}
                </button>
                <button type="button" onClick={() => { setShowComposer(false); clearFile(); }}
                  style={{ padding: '7px 12px', background: 'none', color: '#64748b', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(100,116,139,.3)' }}>
                  Cancel
                </button>
              </div>
              {previewUrl && (
                <div style={{ marginTop: 10 }}>
                  {selectedFile?.type.startsWith('image/') ? <img src={previewUrl} style={{ width: '100%', borderRadius: 10, maxHeight: 200, objectFit: 'cover' }} alt="preview" /> : <video src={previewUrl} style={{ width: '100%', borderRadius: 10, maxHeight: 200 }} controls muted />}
                </div>
              )}
            </form>
          )}
        </div>

        {/* ── Feed ── */}
        <div style={{ marginTop: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>Loading posts…</div>}
          {!loading && posts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
              <p style={{ color: '#60a5fa', fontWeight: 600, marginBottom: 4 }}>No study posts yet</p>
              <p style={{ color: '#334155', fontSize: 13 }}>Be the first to share what you're learning!</p>
            </div>
          )}
          {posts.map(post => {
            const isOwner = currentUserId === post.user?._id;
            const userEmoji = post.userReactions?.[currentUserId];
            return (
              <div key={post._id} className="study-post" style={{ margin: '12px 16px', background: 'rgba(30,41,59,.7)', border: '1px solid rgba(96,165,250,.12)', borderRadius: 16, overflow: 'hidden' }}>
                {/* Post header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                      {post.user?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>
                        {post.user?.name || 'Student'}
                      </div>
                      <div style={{ fontSize: 11, color: '#475569' }}>
                        @{post.user?.username} · {ago(post.createdAt)}
                      </div>
                    </div>
                  </div>
                  {isOwner && (
                    <button onClick={() => handleDeletePost(post._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: 4, opacity: .7 }}>🗑️</button>
                  )}
                </div>

                {post.content && <p style={{ padding: '0 14px 10px', fontSize: 14, color: '#cbd5e1', lineHeight: 1.55, margin: 0 }}>{post.content}</p>}

                {post.imageUrl && (
                  <div style={{ position: 'relative' }}>
                    <img src={post.imageUrl} alt="post" style={{ width: '100%', maxHeight: '70vh', objectFit: 'cover', display: 'block' }} />
                  </div>
                )}

                {/* Reactions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px 6px', flexWrap: 'wrap' }}>
                  {reactions.map(({ e, c }) => {
                    const has = userEmoji === e;
                    const cnt = post.reactions?.[e] || 0;
                    return (
                      <button key={e} onClick={() => handleEmojiReaction(post._id, e)}
                        disabled={!!(userEmoji && userEmoji !== e)}
                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 10px', borderRadius: 20, border: `1px solid ${has ? c + '80' : 'rgba(100,116,139,.25)'}`, background: has ? c + '18' : 'rgba(100,116,139,.08)', cursor: 'pointer', fontSize: 15, opacity: (userEmoji && userEmoji !== e) ? .4 : 1, transition: 'all .15s' }}>
                        {e}{cnt > 0 && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{cnt}</span>}
                      </button>
                    );
                  })}
                  <button onClick={() => setShowComments(p => ({ ...p, [post._id]: !p[post._id] }))}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 13 }}>
                    💬 {post.comments?.length || 0}
                  </button>
                </div>

                {/* Comments */}
                {showComments[post._id] && (
                  <div style={{ borderTop: '1px solid rgba(96,165,250,.1)', padding: '10px 14px' }}>
                    {post.comments?.length > 0 && (
                      <div style={{ marginBottom: 10, maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {post.comments.map((c: any, i: number) => (
                          <div key={i} style={{ fontSize: 13 }}>
                            <span style={{ color: '#93c5fd', fontWeight: 600 }}>@{c.user?.username || 'user'} </span>
                            <span style={{ color: '#cbd5e1' }}>{c.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="text" value={commentText[post._id] || ''}
                        onChange={e => setCommentText(prev => ({ ...prev, [post._id]: e.target.value }))}
                        onKeyPress={e => { if (e.key === 'Enter' && commentText[post._id]?.trim()) handleAddComment(post._id, commentText[post._id]); }}
                        placeholder="Add a comment…"
                        style={{ flex: 1, padding: '8px 12px', background: 'rgba(15,23,42,.6)', color: '#e2e8f0', border: '1px solid rgba(96,165,250,.2)', borderRadius: 20, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                      <button onClick={() => commentText[post._id]?.trim() && handleAddComment(post._id, commentText[post._id])}
                        style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', border: 'none', borderRadius: 20, fontSize: 13, cursor: 'pointer' }}>
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Create Room Modal ── */}
      {showRoomModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)' }} onClick={() => setShowRoomModal(false)} />
          <div style={{ position: 'relative', zIndex: 51, width: '100%', maxWidth: 400, margin: '0 16px', background: 'linear-gradient(135deg,#1e293b,#0f172a)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 20, padding: 24 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>📹 Create Study Room</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>All participants can open their camera to discuss problems together</p>
            <form onSubmit={handleCreateRoom}>
              <input value={roomName} onChange={e => setRoomName(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', background: 'rgba(15,23,42,.8)', color: '#e2e8f0', border: '1px solid rgba(251,191,36,.3)', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16 }}
                placeholder="Room name (e.g. Physics Doubt Session)" autoFocus />
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowRoomModal(false)}
                  style={{ flex: 1, padding: '11px', background: 'rgba(100,116,139,.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,.3)', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={creatingRoom || !roomName.trim()}
                  style={{ flex: 2, padding: '11px', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#0f172a', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: creatingRoom || !roomName.trim() ? .6 : 1 }}>
                  {creatingRoom ? 'Creating…' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ── RoomList sub-component ──
function RoomList({ onOpenRoom }: { onOpenRoom: (id: string) => void }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [processingRoomId, setProcessingRoomId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getNightRooms().then(r => { if (mounted) setRooms(r.data.rooms || []); }).catch(console.error).finally(() => { if (mounted) setLoadingRooms(false); });
    return () => { mounted = false; };
  }, []);

  const reloadRooms = async () => { const r = await getNightRooms(); setRooms(r.data.rooms || []); };

  const handleJoinRoom = async (room: any) => {
    const roomId = String(room?._id || '');
    if (!roomId) return;
    try {
      setProcessingRoomId(roomId);
      await joinNightRoom(roomId);
      await reloadRooms();
    } catch (e) { console.error('Join failed', e); }
    finally { setProcessingRoomId(null); }
  };

  const currentUser = (() => { try { const d = localStorage.getItem('user'); return d ? JSON.parse(d) : null; } catch { return null; } })();

  if (loadingRooms) return <div style={{ color: '#475569', fontSize: 13, padding: '8px 0' }}>Loading rooms…</div>;
  if (rooms.length === 0) return (
    <div style={{ textAlign: 'center', padding: '16px 0', color: '#334155', fontSize: 13 }}>
      No study rooms yet — create one to start a discussion!
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rooms.map(r => {
        const isParticipant = currentUser && r.participants?.map((p: any) => String(p)).includes(String(currentUser._id || currentUser.id));
        return (
          <div key={r._id} className="room-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(251,191,36,.2)', background: 'rgba(251,191,36,.05)', cursor: 'default', transition: 'all .2s' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#fbbf24' }}>📹 {r.name}</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                by {r.creator?.name || r.creator?.username} · {r.participants?.length || 0} participants
              </div>
            </div>
            <div>
              {!isParticipant ? (
                <button onClick={() => handleJoinRoom(r)} disabled={processingRoomId === r._id}
                  style={{ padding: '7px 16px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: processingRoomId === r._id ? .6 : 1 }}>
                  {processingRoomId === r._id ? '…' : 'Join'}
                </button>
              ) : (
                <button onClick={() => onOpenRoom(r._id)}
                  style={{ padding: '7px 16px', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#0f172a', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Open
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default NightInterface;
