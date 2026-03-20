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
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [isUpdatingBio, setIsUpdatingBio] = useState(false);
  const [bioError, setBioError] = useState('');
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

  const handleBioUpdate = async () => {
    if (!bioInput.trim()) {
      setBioError('Bio cannot be empty');
      return;
    }

    if (bioInput.length > 280) {
      setBioError('Bio must be 280 characters or less');
      return;
    }

    setIsUpdatingBio(true);
    setBioError('');

    try {
      const response = await api.put('/users/bio', {
        about: bioInput.trim(),
      });

      console.log('Bio update response:', response);

      // Update local user object
      setUser(response.data.user);

      // Update localStorage if this is the current user
      if (isOwnProfile && me) {
        me.about = response.data.user.about;
        localStorage.setItem('user', JSON.stringify(me));
      }

      setEditingBio(false);
    } catch (err: any) {
      setBioError(err?.response?.data?.message || 'Failed to update bio');
      console.error('Bio update error:', err);
    } finally {
      setIsUpdatingBio(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;
  if (!user) return <div className="text-center py-8">User not found</div>;

  return (
    <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Profile</h1>
        {isOwnProfile && (
          <button
            onClick={() => (window.location.pathname = '/message/payment')}
            className="w-10 h-10 rounded-full bg-green-600 text-white hover:bg-green-700 flex items-center justify-center"
            title="Payments"
            aria-label="Payments"
            type="button"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
              <path
                d="M9.2 10.3c.3-1.2 1.4-2 2.8-2 1.6 0 2.8 1 2.8 2.4 0 1.3-1 2.1-2.6 2.3l-1.1.2c-1.1.2-1.9.7-1.9 1.7 0 1.1 1 1.9 2.5 1.9 1.3 0 2.3-.6 2.7-1.6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="bg-white p-6 rounded shadow">
        <div className="flex items-center gap-4 mb-4">
          {/* Profile Picture */}
          <div
            className={`relative w-20 h-20 flex-shrink-0 ${isOwnProfile ? 'cursor-pointer' : ''}`}
            onClick={handleProfilePictureClick}
          >
            {profilePicSrc ? (
              <img
                key={profilePicSrc}
                src={profilePicSrc}
                alt={user.name}
                className="w-full h-full rounded-full object-cover border-2 border-blue-500 hover:opacity-80 transition"
                onError={(e) => {
                  console.error('Profile picture failed to load:', profilePicSrc);
                  (e.target as HTMLImageElement).src = defaultInfinityLogo;
                }}
              />
            ) : (
              <img
                src={defaultInfinityLogo}
                alt="Infinity Logo"
                className="w-full h-full rounded-full object-cover border-2 border-blue-500 hover:opacity-80 transition"
              />
            )}
            {isOwnProfile && (
              <div className="absolute bottom-0 right-0 bg-blue-600 rounded-full p-2 text-white hover:bg-blue-700 transition">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureChange}
              className="hidden"
            />
          </div>

          {/* User Info */}
          <div className="flex-1">
            <div className="text-lg text-blue-600 font-semibold">@{user.username}</div>
            <div className="text-gray-600">{user.name}</div>
            {editingBio ? (
              <div className="mt-2">
                <textarea
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  maxLength={280}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add a bio (max 280 characters)"
                  rows={3}
                />
                <div className="text-xs text-gray-500 mt-1">{bioInput.length}/280</div>
                {bioError && (
                  <div className="text-sm text-red-600 mt-2">{bioError}</div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleBioUpdate}
                    disabled={isUpdatingBio}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isUpdatingBio ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingBio(false);
                      setBioInput('');
                      setBioError('');
                    }}
                    disabled={isUpdatingBio}
                    className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {user.about && (
                  <div className="text-sm text-gray-700 mt-2 italic">{user.about}</div>
                )}
                {isOwnProfile && (
                  <button
                    onClick={() => {
                      setEditingBio(true);
                      setBioInput(user.about || '');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                  >
                    {user.about ? 'Edit bio' : 'Add bio'}
                  </button>
                )}
              </>
            )}
            <div className="text-sm text-gray-500 mt-2">
              Status: {user.isOnline ? 'Online' : 'Offline'}
            </div>
            <div className="text-sm text-gray-500">
              Joined: {new Date(user.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {isUploadingProfilePic && (
          <div className="text-center py-2 text-blue-600">Uploading profile picture...</div>
        )}
        {profilePicError && (
          <div className="text-center py-2 text-red-600 text-sm">{profilePicError}</div>
        )}
      </div>

      {postsLoading && <div className="text-center py-4">Loading posts...</div>}
      {postsError && <div className="text-center py-4 text-red-600">{postsError}</div>}
      {posts && posts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold mb-4">Posts</h2>
          {posts.map((post) => (
            <Post key={post._id} post={post} hideInteractions={false} hideAudioControls={false} />
          ))}
        </div>
      )}
      <button
        onClick={() => window.history.back()}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Back
      </button>
    </div>
  );
}
