import React, { useState, useEffect, useRef } from 'react';
import api, { resolveMediaUrl } from '../services/api';
import { connectSocket, getSocket } from '../services/socket';

export default function InstagramMessenger({ user }: { user: any }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handlePrivateMessage = (payload: any) => {
      const otherUserId = String(payload.senderId || payload.sender?.id || '');
      const meId = String(user?._id || user?.id || '');
      
      if (activeChat && otherUserId === String(activeChat.userId)) {
        setMessages((prev) => [...prev, payload]);
        // Mark as seen
        api.patch(`/chats/private/${payload.id}/status`, { status: 'seen' });
      }
    };

    const handleTyping = (payload: any) => {
      if (activeChat && payload.userId === String(activeChat.userId)) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.add(payload.userId);
          return next;
        });
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(payload.userId);
            return next;
          });
        }, 3000);
      }
    };

    const handleReaction = (payload: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m
        )
      );
    };

    const handleMessageDeleted = (payload: any) => {
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    };

    socket.on('private:message', handlePrivateMessage);
    socket.on('typing', handleTyping);
    socket.on('message:reaction', handleReaction);
    socket.on('message:deleted', handleMessageDeleted);

    return () => {
      socket.off('private:message', handlePrivateMessage);
      socket.off('typing', handleTyping);
      socket.off('message:reaction', handleReaction);
      socket.off('message:deleted', handleMessageDeleted);
    };
  }, [activeChat, user]);

  const loadConversations = async () => {
    try {
      const res = await api.get('/chats/conversations/list');
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const openChat = async (conversation: any) => {
    setActiveChat(conversation);
    setLoading(true);
    try {
      const res = await api.get(`/chats/private/${conversation.userId}`);
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeChat) return;
    const toUserId = activeChat.userId;
    const messageText = text;
    setText('');
    setSending(true);

    try {
      const res = await api.post('/chats/private/send', {
        toUserId,
        message: messageText,
        isVoice: isVoiceMode,
        voiceGender: isVoiceMode ? voiceGender : null,
      });
      setMessages((prev) => [...prev, res.data.message]);
      setIsVoiceMode(false);
    } catch (err) {
      console.error('Failed to send message', err);
      setText(messageText);
    } finally {
      setSending(false);
    }
  };

  const addReaction = async (messageId: string, emoji: string) => {
    try {
      await api.post(`/chats/private/${messageId}/reaction`, { emoji });
    } catch (err) {
      console.error('Failed to add reaction', err);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await api.delete(`/chats/private/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString();
  };

  const emojis = ['❤️', '😂', '😮', '😢', '🔥', '👍', '😍', '🙏'];

  return (
    <div className="flex h-screen bg-white">
      {/* Conversations Sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold">Messages</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p>No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.userId}
                onClick={() => openChat(conv)}
                className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition ${
                  activeChat?.userId === conv.userId ? 'bg-gray-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={conv.user?.profilePicture || 'https://via.placeholder.com/48'}
                      alt={conv.user?.username}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    {conv.user?.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{conv.user?.username}</p>
                    <p className="text-xs text-gray-500 truncate">{conv.lastMessage}</p>
                  </div>
                  <p className="text-xs text-gray-400">{formatTime(conv.lastMessageTime)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      {activeChat ? (
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={activeChat.user?.profilePicture || 'https://via.placeholder.com/40'}
                alt={activeChat.user?.username}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div>
                <p className="font-semibold">{activeChat.user?.username}</p>
                <p className="text-xs text-gray-500">
                  {activeChat.user?.isOnline ? 'Active now' : 'Offline'}
                </p>
              </div>
            </div>
            <button className="text-gray-600 hover:text-gray-800">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <p className="text-gray-400">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center items-center h-full">
                <div className="text-center">
                  <img
                    src={activeChat.user?.profilePicture || 'https://via.placeholder.com/80'}
                    alt={activeChat.user?.username}
                    className="w-20 h-20 rounded-full mx-auto mb-4 object-cover"
                  />
                  <p className="font-semibold">{activeChat.user?.username}</p>
                  <p className="text-sm text-gray-500">Start a conversation</p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderId === user?._id || msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                  onMouseEnter={() => {
                    // Show actions on hover
                  }}
                >
                  <div
                    className={`group relative max-w-xs px-4 py-2 rounded-2xl ${
                      msg.senderId === user?._id || msg.senderId === user?.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-black'
                    }`}
                  >
                    {msg.mediaUrl && (
                      <img
                        src={resolveMediaUrl(msg.mediaUrl)}
                        alt="media"
                        className="max-w-xs rounded-lg mb-2"
                      />
                    )}

                    {/* Voice Message */}
                    {msg.voiceUrl && (
                      <div className="flex items-center gap-2 mb-2 bg-opacity-20 bg-black rounded-lg p-2">
                        <span className="text-lg">🔊</span>
                          <audio 
                          controls 
                          className="flex-1 h-6"
                          style={{ maxWidth: '200px' }}
                        >
                          <source src={resolveMediaUrl(msg.voiceUrl)} type="audio/mpeg" />
                          Your browser does not support the audio element.
                        </audio>
                        {msg.voiceGender && (
                          <span className="text-xs opacity-70">({msg.voiceGender})</span>
                        )}
                      </div>
                    )}

                    {msg.message && <p className="break-words">{msg.message}</p>}

                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {msg.reactions.map((r: any, i: number) => (
                          <span key={i} className="text-lg">
                            {r.emoji}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Message Status */}
                    {(msg.senderId === user?._id || msg.senderId === user?.id) && (
                      <p className="text-xs mt-1 opacity-70">
                        {msg.status === 'seen' && '✓✓'}
                        {msg.status === 'delivered' && '✓'}
                        {msg.status === 'sent' && '◌'}
                      </p>
                    )}

                    {/* Hover Actions */}
                    <div className="hidden group-hover:flex absolute -top-8 left-0 gap-1">
                      {emojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => addReaction(msg.id, emoji)}
                          className="bg-white rounded-full w-8 h-8 flex items-center justify-center hover:scale-125 transition"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    {/* Delete Option */}
                    {(msg.senderId === user?._id || msg.senderId === user?.id) && (
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        className="hidden group-hover:block absolute -right-8 top-0 text-gray-400 hover:text-red-500 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-1 mx-2">
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              ))
            )}

            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <button className="text-blue-500 hover:text-blue-600 text-2xl">
                +
              </button>
              
              {/* Voice Mode Indicator & Dropdown */}
              {isVoiceMode && (
                <div className="flex items-center gap-2 bg-blue-100 px-3 py-2 rounded-full">
                  <span className="text-sm font-semibold text-blue-700">🎤 Voice</span>
                  <select
                    value={voiceGender}
                    onChange={(e) => setVoiceGender(e.target.value as 'male' | 'female')}
                    className="text-sm bg-white border border-blue-300 rounded-full px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              )}

              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !sending && sendMessage()}
                placeholder={isVoiceMode ? "Type text to convert to voice..." : "Aa"}
                className="flex-1 bg-gray-100 rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                disabled={sending}
              />

              {/* Speaker Button */}
              <button
                onClick={() => setIsVoiceMode(!isVoiceMode)}
                disabled={!text.trim() || sending}
                className={`text-2xl transition ${
                  isVoiceMode
                    ? 'text-blue-500 hover:text-blue-600'
                    : 'text-gray-400 hover:text-gray-600 disabled:opacity-50'
                }`}
                title={isVoiceMode ? 'Click to send as voice' : 'Click to enable voice mode'}
              >
                🔊
              </button>

              <button
                onClick={sendMessage}
                disabled={!text.trim() || sending}
                className="text-blue-500 hover:text-blue-600 disabled:opacity-50 text-2xl transition"
              >
                {sending ? '⏳' : '❤️'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-pink-400 to-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-4xl">💬</span>
            </div>
            <p className="text-gray-600 text-lg">Select a conversation to start messaging</p>
          </div>
        </div>
      )}
    </div>
  );
}
