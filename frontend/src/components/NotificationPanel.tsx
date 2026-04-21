import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { decryptFromPeer } from '../services/e2ee';

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  let me: any = null;
  try {
    me = JSON.parse(localStorage.getItem('user') || 'null');
  } catch (err) {
    me = null;
  }

  useEffect(() => {
    loadNotifications();
    const cleanup = setupSocketListener();
    return cleanup;
  }, []);

  const upsertNotification = (incoming: any) => {
    setNotifications((prev) => {
      const index = prev.findIndex((n) => String(n.messageId || '') === String(incoming.messageId || ''));
      if (index === -1) return [incoming, ...prev];
      const next = [...prev];
      next[index] = { ...next[index], ...incoming, fromUser: incoming.fromUser || next[index].fromUser };
      return next;
    });
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications?limit=50');
      const loaded = res.data.notifications || [];
      setNotifications(loaded);
      setUnreadCount(res.data.unread || 0);

      const encryptedNotifications = loaded.filter(
        (notification: any) =>
          notification?.type === 'message' &&
          notification?.messageId &&
          String(notification?.content || '').trim() === '[Encrypted message]'
      );

      await Promise.all(
        encryptedNotifications.map(async (notification: any) => {
          try {
            const messageRes = await api.get(`/chats/private/message/${notification.messageId}`);
            const message = messageRes?.data?.message;
            if (!message) return;
            let content = String(message.message || '').trim();
            const senderId = String(message.senderId || message.sender?.id || '');
            if (!content && message?.e2ee?.ciphertext && senderId) {
              content = await decryptFromPeer(api, senderId, message.e2ee);
            }
            if (!content) return;
            upsertNotification({ ...notification, content, fromUser: notification.fromUser || message.sender });
          } catch (err) {
            console.warn('Failed to resolve encrypted notification preview', err);
          }
        })
      );
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
    setLoading(false);
  };

  const setupSocketListener = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('notification:new', (notification: any) => {
      setNotifications((prev) => {
        const index = prev.findIndex((n) => String(n.messageId || '') === String(notification.messageId || ''));
        if (index === -1) { setUnreadCount((count) => count + 1); return [notification, ...prev]; }
        const next = [...prev];
        next[index] = { ...next[index], ...notification };
        return next;
      });
    });

    socket.on('private:message', async (payload: any) => {
      const myId = String(me?._id || me?.id || '');
      const senderId = String(payload?.senderId || payload?.sender?.id || '');
      if (!payload?.id || !senderId || senderId === myId) return;
      let content = String(payload?.message || '').trim();
      if (!content && payload?.e2ee?.ciphertext) {
        try { content = await decryptFromPeer(api, senderId, payload.e2ee); }
        catch (err) { console.warn('Failed to decrypt notification message preview', err); return; }
      }
      if (!content) return;
      upsertNotification({
        _id: `local-message-${payload.id}`,
        type: 'message', content,
        messageId: payload.id,
        fromUser: payload.sender,
        createdAt: payload.createdAt || new Date().toISOString(),
        isRead: false,
      });
    });

    return () => {
      socket.off('notification:new');
      socket.off('private:message');
    };
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.patch(`/notifications/${notificationId}/read`);
      setNotifications((prev) => prev.map((n) => n._id === notificationId ? { ...n, isRead: true } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) { console.error('Failed to mark as read', err); }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) { console.error('Failed to mark all as read', err); }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
    } catch (err) { console.error('Failed to delete notification', err); }
  };

  const deleteAllNotifications = async () => {
    if (!window.confirm('Delete all notifications?')) return;
    try {
      await api.delete('/notifications/delete-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) { console.error('Failed to delete all notifications', err); }
  };

  const replyToNotification = async (notification: any) => {
    const senderId = String(notification?.fromUser?._id || notification?.fromUser?.id || '');
    if (!senderId) return;
    if (!notification?.isRead && notification?._id && !String(notification._id).startsWith('local-message-')) {
      try { await api.patch(`/notifications/${notification._id}/read`); } catch { }
    }
    window.location.href = `/message/chat?uid=${encodeURIComponent(senderId)}`;
    onClose();
  };

  const getNotificationIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      like: '♡', comment: '💬', follow: '👤',
      message: '📨', reaction: '😊', mention: '@', post: '📸',
    };
    return icons[type] || '🔔';
  };

  const getNotificationText = (notification: any) => {
    const username = notification.fromUser?.username || 'User';
    const texts: { [key: string]: string } = {
      like: `${username} liked your post`,
      comment: `${username} commented on your post`,
      follow: `${username} followed you`,
      message: `New message from ${username}`,
      reaction: `${username} reacted to your message`,
      mention: `${username} mentioned you`,
      post: `${username} posted something new`,
    };
    return texts[notification.type] || 'New notification';
  };

  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const recentNotifications = notifications.filter((n) => n.isRead);

  return (
    <div className="w-full h-full bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-gray-800 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">Notifications</h2>
          {unreadCount > 0 && <p className="text-xs text-blue-400 mt-0.5">{unreadCount} unread</p>}
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="text-xs text-blue-400 hover:text-blue-300 font-semibold px-3 py-1.5 bg-blue-900/40 rounded-full transition">
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl font-bold leading-none transition">✕</button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
            <p className="text-sm">Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-5xl mb-3">🔔</p>
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {unreadNotifications.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-900/80 sticky top-0 z-10">
                  <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Unread ({unreadNotifications.length})</h3>
                </div>
                {unreadNotifications.map((n) => (
                  <div key={n._id} className="px-4 py-3 bg-blue-950/30 hover:bg-blue-900/20 transition">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">{getNotificationIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{n.fromUser?.username || 'User'}</p>
                        <p className="text-xs text-gray-300 mt-0.5">{getNotificationText(n)}</p>
                        {n.content && <p className="text-xs text-gray-400 mt-1 truncate">"{n.content}"</p>}
                        <p className="text-xs text-gray-500 mt-1">{formatTime(n.createdAt)}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {n.type === 'message' && (
                            <button onClick={() => replyToNotification(n)} className="text-xs text-green-400 font-semibold px-2 py-1 rounded-full bg-green-900/30 hover:bg-green-900/50 transition">Reply</button>
                          )}
                          <button onClick={() => markAsRead(n._id)} className="text-xs text-blue-400 font-semibold px-2 py-1 rounded-full bg-blue-900/30 hover:bg-blue-900/50 transition">Mark read</button>
                          <button onClick={() => deleteNotification(n._id)} className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded-full hover:bg-red-900/20 transition">Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {recentNotifications.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-900/80 sticky top-0 z-10">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent</h3>
                </div>
                {recentNotifications.slice(0, 20).map((n) => (
                  <div key={n._id} className="px-4 py-3 hover:bg-gray-800/40 transition">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-xl flex-shrink-0 opacity-70">{getNotificationIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-200">{n.fromUser?.username || 'User'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{getNotificationText(n)}</p>
                        {n.content && <p className="text-xs text-gray-500 mt-1 truncate">"{n.content}"</p>}
                        <p className="text-xs text-gray-600 mt-1">{formatTime(n.createdAt)}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {n.type === 'message' && (
                            <button onClick={() => replyToNotification(n)} className="text-xs text-green-400 px-2 py-1 rounded-full bg-green-900/20 hover:bg-green-900/40 transition">Reply</button>
                          )}
                          <button onClick={() => deleteNotification(n._id)} className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded-full hover:bg-red-900/20 transition">Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-800 flex-shrink-0">
          <button onClick={deleteAllNotifications} className="w-full text-xs text-gray-500 hover:text-red-400 font-semibold py-2 rounded-xl hover:bg-red-900/20 transition">
            Clear all notifications
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
