import React, { useEffect, useState, useMemo } from 'react';
import api, { uploadFile, resolveMediaUrl, getUploadBaseURL } from '../services/api';
import Post from '../components/Post';

export default function Profile({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState('');
  const [isUploadingProfilePic, setIsUploadingProfilePic] = useState(false);
  const [profilePicError, setProfilePicError] = useState('');
  const [editingDetail, setEditingDetail] = useState(false);
  const [professionTypeInput, setProfessionTypeInput] = useState('');
  const [professionDetailInput, setProfessionDetailInput] = useState('');
  const [isUpdatingDetail, setIsUpdatingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isUnsupportedImageFile = (f: File) => {
    const t = String((f as any)?.type || '').toLowerCase();
    const n = String((f as any)?.name || '').toLowerCase();
    return (
      t === 'image/heic' ||
      t === 'image/heif' ||
      t === 'image/heic-sequence' ||
      t === 'image/heif-sequence' ||
      n.endsWith('.heic') ||
      n.endsWith('.heif')
    );
  };

  // Memoize the current user from localStorage to avoid re-renders
  const me = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const isOwnProfile = me?._id === userId || me?.id === userId;

  // Derive profile picture URL from user state to keep it in sync
  const profilePicSrc = useMemo(() => {
    if (!user?.profilePicture) {
      return '';
    }
    return resolveMediaUrl(user.profilePicture);
  }, [user?.profilePicture]);

  // Default infinity logo as SVG data URL
  const defaultInfinityLogo = useMemo(() => {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="40" r="35" fill="#f3f4f6" stroke="#3b82f6" stroke-width="2"/>
        <path d="M25 35c0-5.5 4.5-10 10-10s10 4.5 10 10c0 3.5-1.8 6.6-4.6 8.4l-5.4 3.6c-2.8 1.8-4.6 5-4.6 8.4 0 5.5 4.5 10 10 10s10-4.5 10-10" 
              stroke="#3b82f6" stroke-width="3" stroke-linecap="round" fill="none"/>
        <circle cx="35" cy="35" r="2" fill="#3b82f6"/>
        <circle cx="45" cy="45" r="2" fill="#3b82f6"/>
      </svg>
    `)}`;
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) return;
      try {
        const res = await api.get(`/users/profile/${userId}`);
        console.log('Profile fetched:', res.data);
        setUser(res.data.user);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  useEffect(() => {
    const fetchPosts = async () => {
      if (!user) return;
      const me = localStorage.getItem('user');
      if (!me) {
        setPostsError('Please log in to view posts');
        return;
      }
      setPostsLoading(true);
      try {
        console.log('Fetching posts for user:', user.username);
        const res = await api.get(`/posts/user/${user.username}`);
        console.log('Posts response:', res.data);
        setPosts(res.data);
      } catch (err: any) {
        console.log('Error fetching posts:', err);
        setPostsError(err?.response?.data?.message || 'Failed to load posts');
      } finally {
        setPostsLoading(false);
      }
    };
    fetchPosts();
  }, [user]);

  const handleProfilePictureClick = () => {
    if (isOwnProfile) {
      fileInputRef.current?.click();
    }
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 256; // Profile picture size
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions to maintain aspect ratio
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
          }

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            0.8 // 80% quality for good balance between quality and size
          );
        };
        img.onerror = () => {
          // Some formats (e.g. HEIC) can't be decoded by the browser; fall back to original file.
          resolve(file);
        };
      };
    });
  };

  const handleProfilePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingProfilePic(true);
    setProfilePicError('');

    try {
      if (isUnsupportedImageFile(file)) {
        setProfilePicError('HEIC/HEIF images are not supported. Please upload JPG/PNG/WebP instead.');
        return;
      }

      // Compress the image before uploading
      console.log('Original file size:', file.size, 'bytes');
      const compressedFile = await compressImage(file);
      console.log('Compressed file size:', compressedFile.size, 'bytes');

      // Upload the compressed file
      const uploadResponse = await uploadFile(compressedFile);
      console.log('Upload response:', uploadResponse);

      // Prefer the returned absolute URL (supports Cloudinary); fall back to filename-based /uploads path.
      const uploadedUrl = String(uploadResponse.data?.url || '');
      const uploadedFilename = String(uploadResponse.data?.filename || '');
      const baseUrl = getUploadBaseURL();

      const profilePictureUrl =
        uploadedUrl ||
        (uploadedFilename ? `${baseUrl}/uploads/${uploadedFilename}` : '');

      console.log('Profile picture URL:', profilePictureUrl);

      // Update user profile with the image URL
      const updateResponse = await api.put('/users/profile-picture', {
        profilePictureUrl,
      });

      console.log('Profile picture update response:', updateResponse);

      // Update local user object - this will trigger profilePicSrc useMemo to update
      setUser(updateResponse.data.user);

      // Update localStorage if this is the current user
      if (isOwnProfile && me) {
        me.profilePicture = updateResponse.data?.user?.profilePicture || profilePictureUrl;
        localStorage.setItem('user', JSON.stringify(me));
      }
    } catch (err: any) {
      setProfilePicError(err?.response?.data?.message || 'Failed to upload profile picture');
      console.error('Profile picture upload error:', err);
    } finally {
      setIsUploadingProfilePic(false);
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDetailUpdate = async () => {
    if (professionTypeInput && !['Student', 'Working Professional'].includes(professionTypeInput)) {
      setDetailError('Invalid profession type');
      return;
    }

    if (professionDetailInput.length > 280) {
      setDetailError('Detail must be 280 characters or less');
      return;
    }

    setIsUpdatingDetail(true);
    setDetailError('');

    try {
      const response = await api.put('/users/bio', {
        professionType: professionTypeInput,
        professionDetail: professionDetailInput.trim(),
      });

      console.log('Detail update response:', response);

      // Update local user object
      setUser(response.data.user);

      // Update localStorage if this is the current user
      if (isOwnProfile && me) {
        me.professionType = response.data.user.professionType;
        me.professionDetail = response.data.user.professionDetail;
        localStorage.setItem('user', JSON.stringify(me));
      }

      setEditingDetail(false);
    } catch (err: any) {
      setDetailError(err?.response?.data?.message || 'Failed to update details');
      console.error('Detail update error:', err);
    } finally {
      setIsUpdatingDetail(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;
  if (!user) return <div className="text-center py-8">User not found</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0f0c1d', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', maxWidth: '480px', margin: '0 auto', position: 'relative' }}>

      {/* Sticky Top Nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(15,12,29,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => window.history.back()}
          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '18px' }}
        >←</button>
        <span style={{ fontWeight: 700, fontSize: '15px', color: '#c4b5fd', letterSpacing: '0.02em' }}>@{user?.username}</span>
        <div style={{ width: '36px' }} />
      </div>

      {user ? (
        <>
          {/* Cover Banner */}
          <div style={{ position: 'relative', height: '130px', background: 'linear-gradient(135deg, #1e1040 0%, #7c3aed 50%, #db2777 100%)', overflow: 'hidden' }}>
            {/* Decorative blobs */}
            <div style={{ position: 'absolute', top: '-20px', left: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(139,92,246,0.3)', filter: 'blur(30px)' }} />
            <div style={{ position: 'absolute', bottom: '-30px', right: '20px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(219,39,119,0.4)', filter: 'blur(25px)' }} />
            <div style={{ position: 'absolute', top: '10px', right: '40%', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(245,158,11,0.2)', filter: 'blur(20px)' }} />
          </div>

          {/* Avatar overlapping the banner */}
          <div style={{ position: 'relative', padding: '0 20px' }}>
            <div style={{ position: 'relative', display: 'inline-block', marginTop: '-48px' }}>
              {/* Glow ring */}
              <div style={{ width: '96px', height: '96px', borderRadius: '50%', padding: '3px', background: 'linear-gradient(135deg,#7c3aed,#db2777,#f59e0b)', boxShadow: '0 0 24px rgba(139,92,246,0.6)' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#1e1040', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <span style={{ color: '#c4b5fd', fontWeight: 700, fontSize: '32px' }}>
                    {(user.username || 'U').charAt(0).toUpperCase()}
                  </span>
                  {profilePicSrc && (
                    <img
                      src={profilePicSrc}
                      alt={user.name}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>
              </div>
              {/* Online indicator */}
              {user.isOnline && (
                <div style={{ position: 'absolute', bottom: '4px', right: '4px', width: '14px', height: '14px', borderRadius: '50%', background: '#22c55e', border: '2px solid #0f0c1d', boxShadow: '0 0 6px rgba(34,197,94,0.8)' }} />
              )}
              {/* Camera button for own profile */}
              {isOwnProfile && (
                <div
                  onClick={handleProfilePictureClick}
                  style={{ position: 'absolute', bottom: 2, right: 2, width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#db2777)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '13px', border: '2px solid #0f0c1d' }}
                >📷</div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleProfilePictureChange} style={{ display: 'none' }} />
            </div>

            {/* Action button top-right */}
            {!isOwnProfile && (
              <div style={{ position: 'absolute', right: '20px', bottom: '0', display: 'flex', gap: '8px' }}>
                <button style={{ padding: '8px 20px', background: 'linear-gradient(135deg,#7c3aed,#db2777)', color: '#fff', border: 'none', borderRadius: '20px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(139,92,246,0.4)' }}>
                  Follow
                </button>
                <button style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                  Message
                </button>
              </div>
            )}
            {isOwnProfile && (
              <div style={{ position: 'absolute', right: '20px', bottom: '0' }}>
                <button
                  onClick={() => window.location.href = '/set-detail'}
                  style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Edit Profile
                </button>
              </div>
            )}
          </div>

          {/* Name & Bio */}
          <div style={{ padding: '14px 20px 0' }}>
            <div style={{ fontWeight: 700, fontSize: '20px', color: '#fff', letterSpacing: '0.01em' }}>{user.name}</div>
            <div style={{ color: '#a78bfa', fontSize: '13px', marginTop: '2px', fontWeight: 500 }}>@{user.username}</div>

            {/* Profession Tag */}
            {(user.professionType || user.professionDetail) && (
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                {user.professionType && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🎓 {user.professionType}
                  </span>
                )}
                {user.professionDetail && (
                  <span style={{ color: '#d1d5db', fontSize: '13px' }}>{user.professionDetail}</span>
                )}
              </div>
            )}

            {/* Additional details */}
            {user.additionalDetails && user.additionalDetails.length > 0 && (
              <div style={{ marginTop: '6px' }}>
                {user.additionalDetails.map((detail: string, idx: number) => (
                  <div key={idx} style={{ color: '#9ca3af', fontSize: '12px', marginTop: '2px' }}>• {detail}</div>
                ))}
              </div>
            )}

            {/* Joined */}
            <div style={{ color: '#6b7280', fontSize: '11px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              🗓 Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* Stats Row — Glassmorphism */}
          <div style={{ margin: '16px 16px 0', display: 'flex', gap: '8px' }}>
            {[
              { label: 'Posts', value: posts.length },
              { label: 'Followers', value: user.followersCount || 0 },
              { label: 'Following', value: user.followingCount || 0 },
            ].map(stat => (
              <div key={stat.label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '14px', padding: '12px 8px', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
                <div style={{ fontWeight: 800, fontSize: '18px', color: '#e9d5ff', lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Divider with tab */}
          <div style={{ margin: '16px 0 0', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex' }}>
            <div style={{ flex: 1, padding: '12px 0', textAlign: 'center', borderBottom: '2px solid #7c3aed', color: '#c4b5fd' }}>
              <svg style={{ width: '20px', height: '20px', display: 'inline' }} fill="currentColor" viewBox="0 0 24 24">
                <rect fill="none" height="18" stroke="currentColor" strokeWidth="2" width="18" x="3" y="3"></rect>
                <line stroke="currentColor" strokeWidth="2" x1="9" x2="9" y1="3" y2="21"></line>
                <line stroke="currentColor" strokeWidth="2" x1="15" x2="15" y1="3" y2="21"></line>
                <line stroke="currentColor" strokeWidth="2" x1="3" x2="21" y1="9" y2="9"></line>
                <line stroke="currentColor" strokeWidth="2" x1="3" x2="21" y1="15" y2="15"></line>
              </svg>
            </div>
          </div>

          {/* Posts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', paddingBottom: '80px' }}>
            {postsLoading ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: '#a78bfa' }}>Loading posts...</div>
            ) : postsError ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: '#f87171' }}>{postsError}</div>
            ) : posts.length === 0 ? (
              <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', border: '2px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', fontSize: '28px' }}>📷</div>
                <div style={{ fontWeight: 700, fontSize: '18px', color: '#e5e7eb' }}>No Posts Yet</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>When {user.name} posts, you'll see it here.</div>
              </div>
            ) : (
              posts.map((post) => {
                const urlPath = (post.imageUrl || '').split('?')[0].toLowerCase();
                const isVideo = /\.(mp4|mov|avi|webm|ogv)$/i.test(urlPath);
                return (
                  <div
                    key={post._id}
                    style={{ aspectRatio: '1', position: 'relative', overflow: 'hidden', cursor: 'pointer', background: '#1e1040' }}
                    onClick={() => window.location.href = '/message'}
                    className="group"
                  >
                    {post.imageUrl ? (
                      isVideo ? (
                        <video src={resolveMediaUrl(post.imageUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <img src={resolveMediaUrl(post.imageUrl)} alt="post" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1e1040,#7c3aed,#db2777)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
                        <span style={{ color: '#fff', fontSize: '11px', fontWeight: 600, textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.content}</span>
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                      <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ❤️ {post.likes?.length || 0}
                      </span>
                      <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        💬 {post.comments?.length || 0}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a78bfa' }}>Loading profile...</div>
      )}
    </div>
  );
}


