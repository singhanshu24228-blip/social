import React, { useEffect, useState } from 'react';
import api from '../services/api';
import Post from '../components/Post';

export default function Profile({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) return;
      try {
        const res = await api.get(`/users/profile/${userId}`);
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

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;
  if (!user) return <div className="text-center py-8">User not found</div>;

  return (
    <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Profile</h1>
      <div className="bg-white p-4 rounded shadow">
        <div className="text-lg text-blue-600 font-semibold">@{user.username}</div>
        <div className="text-gray-600">{user.name}</div>
        <div className="text-sm text-gray-500 mt-2">
          Status: {user.isOnline ? 'Online' : 'Offline'}
        </div>
        <div className="text-sm text-gray-500">
          Joined: {new Date(user.createdAt).toLocaleDateString()}
        </div>
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
