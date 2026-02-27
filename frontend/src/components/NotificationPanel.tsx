import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';

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
    setupSocketListener();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications?limit=50');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread || 0);
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
    setLoading(false);
  };

  const setupSocketListener = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('notification:new', (notification: any) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.off('notification:new');
    };
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.patch(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read', err);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
    } catch (err) {
      console.error('Failed to delete notification', err);
    }
  };

  const deleteAllNotifications = async () => {
    if (!window.confirm('Delete all notifications?')) return;
    try {
      await api.delete('/notifications/delete-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to delete all notifications', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      like: '❤️',
      comment: '💬',
      follow: '👤',
      message: '📨',
      mention: '@',
      post: '📸',
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
      mention: `${username} mentioned you`,
      post: `${username} posted something new`,
    };
    return texts[notification.type] || 'New notification';
  };

  // Separate unread and recent notifications
  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const recentNotifications = notifications.filter((n) => n.isRead);

  return (
    <div className="w-[92vw] max-w-sm sm:w-80 bg-blue-200 rounded-lg shadow-lg border border-gray-200 max-h-[70vh] sm:max-h-[600px] flex flex-col scrollbar-hide">
      {/* Header */}
      <div className="p-1 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-bold">Notifications</h2>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-300 text-2xl font-bold"
        >
          ✕
        </button>
      </div>

      {/* Toolbar */}
      {unreadCount > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-b border-gray-200 flex justify-between items-center">
          <span className="text-sm text-blue-700 font-semibold">
            {unreadCount} unread
          </span>
          <button
            onClick={markAllAsRead}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
          >
            Mark all as read
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <p>Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-3xl mb-2">🔔</p>
            <p>No notifications yet</p>
          </div>
        ) : (
          <div>
            {/* Unread Notifications */}
            {unreadNotifications.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-black-50 border-b border-yellow-200 sticky top-0">
                  <h3 className="font-semibold text-yellow-900 text-sm">
                    Unread ({unreadNotifications.length})
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {unreadNotifications.map((notification) => (
                    <div
                      key={notification._id}
                      className="p-3 bg-blue-50 hover:bg-blue-100 transition"
                    >
                      <div className="flex gap-2">
                        <div className="text-2xl flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">
                                {notification.fromUser?.username || 'User'}
                              </p>
                              <p className="text-xs text-gray-700 mt-0.5">
                                {getNotificationText(notification)}
                              </p>
                              {notification.content && (
                                <p className="text-xs text-white mt-1 truncate">
                                  "{notification.content}"
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                {formatTime(notification.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => markAsRead(notification._id)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-200"
                            >
                              Mark as read
                            </button>
                            <button
                              onClick={() => deleteNotification(notification._id)}
                              className="text-xs text-gray-600 hover:text-red-600 font-semibold px-2 py-1 rounded hover:bg-gray-200"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Notifications */}
            {recentNotifications.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0">
                  <h3 className="font-semibold text-gray-800 text-sm">
                    Recent
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {recentNotifications.slice(0, 10).map((notification) => (
                    <div
                      key={notification._id}
                      className="p-3 hover:bg-gray-50 transition"
                    >
                      <div className="flex gap-2">
                        <div className="text-2xl flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {notification.fromUser?.username || 'User'}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {getNotificationText(notification)}
                          </p>
                          {notification.content && (
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              "{notification.content}"
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {formatTime(notification.createdAt)}
                          </p>
                          <button
                            onClick={() => deleteNotification(notification._id)}
                            className="text-xs text-gray-500 hover:text-red-600 mt-2"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={deleteAllNotifications}
            className="w-full text-xs text-gray-600 hover:text-red-600 font-semibold py-2"
          >
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
