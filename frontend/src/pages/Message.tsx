import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { formatDistanceToNow } from "date-fns";
import api, { getUploadBaseURL, uploadFile } from '../services/api';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import NotificationPanel from '../components/NotificationPanel';
import NightInterface from '../components/NightInterface';
import ActiveIcon from '../components/ActiveIcon';
import { getTimeUntilNightMode, enterNightMode } from '../services/api';

export default function Message({ groupName }: { groupName?: string | null }) {
  const isNightMode = window.location.pathname === '/message/night';
  let me: any = null;
  try {
    me = JSON.parse(localStorage.getItem('user') || 'null');
  } catch (err) {
    me = null;
  }
  const myId = String(me?._id || me?.id || '');
  const [mode, setMode] = useState<'groups' | 'private' | 'status' | 'posts' | 'messages' | 'random'>('posts');
  const [showNotifications, setShowNotifications] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroup, setActiveGroup] = useState<any | null>(null);
  const [privateSearch, setPrivateSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activePrivateUser, setActivePrivateUser] = useState<any | null>(null);
  const [text, setText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');
  const [messages, setMessages] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageMediaUrl, setMessageMediaUrl] = useState('');
  const [messageMediaType, setMessageMediaType] = useState<'image' | 'video' | ''>('');
  const [messageSelectedFileName, setMessageSelectedFileName] = useState('');
  const [messageMediaFile, setMessageMediaFile] = useState<File | null>(null);
  const [isUploadingMessageMedia, setIsUploadingMessageMedia] = useState(false);
  const [postMediaRetry, setPostMediaRetry] = useState<Record<string, number>>({});
  const [attachOpen, setAttachOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);

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

  const openFile = () => { setAttachOpen(false); fileInputRef.current?.click(); };

  const getRandomOnlineUser = () => {
    if (!randomUsers || randomUsers.length === 0) return null;
    
    const onlineUsers = randomUsers.filter(u => u.isOnline && String(u._id || u.id) !== String(me?.id));
    if (onlineUsers.length === 0) return null;
    
    const availableUsers = onlineUsers.filter(u => !usedRandomUsers.has(String(u._id || u.id)));
    const usersToSelect = availableUsers.length > 0 ? availableUsers : onlineUsers;
    
    if (usersToSelect.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * usersToSelect.length);
    return usersToSelect[randomIndex];
  };

  const handleSelectStatus = async (s: any) => {
    try {
      const id = s._id || s.id;
      // If the current user is the owner, fetch status (owner can see viewers)
      if (String(s.userId) === myId) {
        try {
          const res = await api.get(`/status/${id}`);
          const updated = res.data?.status;
          if (updated) {
            setStatuses((prev) => prev.map((x) => {
              const xid = x._id || x.id;
              if (String(xid) === String(id)) {
                return { ...x, views: updated.views, viewers: updated.viewers };
              }
              return x;
            }));
          }
        } catch (e) {
          console.warn('Failed to fetch status for owner', e);
        }
        setSelectedStatusId(String(id));
        return;
      }

      // record view on server for non-owners
      const res = await api.post(`/status/${id}/view`);
      // server won't return viewers to the viewer; update local view count if provided
      const updated = res.data?.status;
      if (updated) {
        setStatuses((prev) => prev.map((x) => {
          const xid = x._id || x.id;
          if (String(xid) === String(id)) {
            return { ...x, views: updated.views, viewers: updated.viewers };
          }
          return x;
        }));
      }
      setSelectedStatusId(String(id));
    } catch (err: any) {
      console.warn('Failed to record status view', err?.message || err);
      setSelectedStatusId(String(s._id || s.id));
    }
  };

  const startRandomChat = () => {
    const randomUser = getRandomOnlineUser();
    if (randomUser) {
      setCurrentRandomUser(randomUser);
      setUsedRandomUsers(new Set(usedRandomUsers));
    } else {
      setMsg('No online users available');
    }
  };

  const skipRandomUser = () => {
    if (currentRandomUser) {
      const newUsedUsers = new Set(usedRandomUsers);
      newUsedUsers.add(String(currentRandomUser._id || currentRandomUser.id));
      setUsedRandomUsers(newUsedUsers);
      
      const nextUser = getRandomOnlineUser();
      if (nextUser) {
        setCurrentRandomUser(nextUser);
      } else {
        setCurrentRandomUser(null);
        setMsg('No more online users available. Try again later!');
      }
    }
  };

  const chatWithRandomUser = () => {
    if (currentRandomUser) {
      openPrivateChat(currentRandomUser);
      const newUsedUsers = new Set(usedRandomUsers);
      newUsedUsers.add(String(currentRandomUser._id || currentRandomUser.id));
      setUsedRandomUsers(newUsedUsers);
      setCurrentRandomUser(null);
    }
  };

  const speakText = () => {
    if (!text) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const ut = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(ut);
      } catch (e) {
        // ignore speech errors
      }
    }
  };
  
  const [statuses, setStatuses] = useState<any[]>([]);
  const [statusContent, setStatusContent] = useState('');
  const [statusMediaUrl, setStatusMediaUrl] = useState('');
  const [statusFormOpen, setStatusFormOpen] = useState(false);
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [showViewerDropdown, setShowViewerDropdown] = useState(false);
  const [statusMediaType, setStatusMediaType] = useState<'image' | 'video' | ''>('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isUploadingStatusMedia, setIsUploadingStatusMedia] = useState(false);
  const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);
  const [randomUsers, setRandomUsers] = useState<any[]>([]);
  const [recentChats, setRecentChats] = useState<any[]>([]);

  const [msg, setMsg] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const wallpapers = ['wallpaper1.jpg', 'wallpaper2.jpg', 'wallpaper3.jpg', 'wallpaper4.jpg', 'wallpaper5.jpg'];
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [currentChatWallpaper, setCurrentChatWallpaper] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<
    | null
    | {
        type: 'post' | 'user';
        postId?: string;
        userId?: string;
        username?: string;
      }
  >(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const textColors = ['red', 'white', 'black', 'green', 'blue', 'orange'];
  const [textColor, setTextColor] = useState<string>('black');
  const [showTextSizePicker, setShowTextSizePicker] = useState(false);
  const textSizes = ['small', 'medium', 'large', 'xlarge'];
  const [textSize, setTextSize] = useState<string>('medium');
  const [timeInfo, setTimeInfo] = useState<any>(null);
  const [enteringNightMode, setEnteringNightMode] = useState(false);
  const [currentRandomUser, setCurrentRandomUser] = useState<any>(null);
  const [usedRandomUsers, setUsedRandomUsers] = useState<Set<string>>(new Set());
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [loadingFollows, setLoadingFollows] = useState<Record<string, boolean>>({});
  const [showFollowersFollowingDropdown, setShowFollowersFollowingDropdown] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [loadingFollowersList, setLoadingFollowersList] = useState(false);
  const [selectedFollowersList, setSelectedFollowersList] = useState<'followers' | 'following' | null>(null);

  const resolveMediaUrl = (u: any) => {
    const s = String(u || '');
    if (!s) return '';
    if (s.startsWith('data:') || s.startsWith('blob:')) return s;

    // If the backend (or a proxy) returned an absolute /uploads URL with the *wrong origin*
    // (e.g. frontend origin), rewrite it to the upload base origin derived from VITE_API_URL.
    // This prevents images loading as HTML (SPA fallback) which appears as "corrupted" in <img>.
    if (s.startsWith('http://') || s.startsWith('https://')) {
      try {
        const parsed = new URL(s);
        if (parsed.pathname.startsWith('/uploads/')) {
          const base = getUploadBaseURL();
          if (base) {
            const baseUrl = new URL(base, window.location.origin);
            if (parsed.origin !== baseUrl.origin) {
              return `${baseUrl.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
          }
        }
      } catch {
        // ignore URL parsing failures; fall through
      }
      return s;
    }
    if (s.startsWith('/uploads/')) return `${getUploadBaseURL()}${s}`;
    if (s.startsWith('uploads/')) return `${getUploadBaseURL()}/${s}`;

    // Back-compat: sometimes older data stores just the filename (no /uploads prefix)
    // e.g. "image-123.png". Treat it as an uploads asset.
    if (!s.includes('/') && /\.(png|jpe?g|gif|webp|mp4|webm|ogg|mov|m4v)$/i.test(s)) {
      const base = getUploadBaseURL();
      return base ? `${base}/uploads/${s}` : `/uploads/${s}`;
    }

    return s;
  };

  const getFontSize = (size: string) => {
    switch (size) {
      case 'small': return '12px';
      case 'medium': return '16px';
      case 'large': return '20px';
      case 'xlarge': return '24px';
      default: return '16px';
    }
  };

  useEffect(() => {
    try {
      const w = localStorage.getItem('wallpaper');
      if (w) {
        setWallpaperUrl(w);
      }
      const tc = localStorage.getItem('textColor');
      if (tc) {
        setTextColor(tc);
      }
    } catch (err) {
      // ignore
    }
    fetchNightModeTime();
    const interval = setInterval(fetchNightModeTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Restore mode from localStorage on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('messageMode');
      if (savedMode === 'groups' || savedMode === 'private' || savedMode === 'status' || savedMode === 'posts' || savedMode === 'messages' || savedMode === 'random') {
        setMode(savedMode);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  // Save mode to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('messageMode', mode);
    } catch (err) {
      // ignore
    }
  }, [mode]);
  
  const fetchNightModeTime = async () => {
    try {
      const response = await getTimeUntilNightMode();
      setTimeInfo(response.data);
    } catch (err) {
      console.error('Error fetching night mode time:', err);
    }
  };
  
  const handleEnterNightMode = async () => {
    setEnteringNightMode(true);
    try {
      const response = await enterNightMode();
      if (response.data.success) {
        localStorage.setItem('isInNightMode', 'true');
        window.location.pathname = '/message/night';
      } else {
        setMsg('Failed to enter night mode: ' + response.data.message);
      }
    } catch (err: any) {
      setMsg('Error entering night mode: ' + (err.response?.data?.message || err.message));
    } finally {
      setEnteringNightMode(false);
    }
  };

  // Load per-chat wallpaper when active chat changes
  useEffect(() => {
    try {
      if (activeGroup) {
        const key = `wallpaper_group_${activeGroup.id}`;
        const v = localStorage.getItem(key);
        setCurrentChatWallpaper(v);
      } else if (activePrivateUser) {
        const uid = activePrivateUser._id || activePrivateUser.id;
        const key = `wallpaper_private_${uid}`;
        const v = localStorage.getItem(key);
        setCurrentChatWallpaper(v);
      } else {
        setCurrentChatWallpaper(null);
      }
    } catch (err) {
      setCurrentChatWallpaper(null);
    }
  }, [activeGroup, activePrivateUser]);

  // Load followed users on mount
  useEffect(() => {
    const loadFollowedUsers = async () => {
      try {
        const res = await api.get('/users/following');
        if (res.data?.following) {
          setFollowedUsers(new Set(res.data.following));
        }
      } catch (err) {
        console.error('Failed to load followed users:', err);
      }
    };

    loadFollowedUsers();
  }, []);

  // Posts state
  const [posts, setPosts] = useState<any[]>([]);
  const [postContent, setPostContent] = useState('');
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postSong, setPostSong] = useState<string>('');
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [postLoading, setPostLoading] = useState(false);
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [postSearchResults, setPostSearchResults] = useState<any[]>([]);
  const [postIsSearching, setPostIsSearching] = useState(false);
  const [selectedPostUsername, setSelectedPostUsername] = useState<string | null>(null);
  const [postSearchOpen, setPostSearchOpen] = useState(false);
  const [viewingOwnPosts, setViewingOwnPosts] = useState(false);
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const [privateSongs, setPrivateSongs] = useState<string[]>([]);
  const [postMuted, setPostMuted] = useState<Record<string, boolean>>({});
  // Comment state
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});
  // songs shipped in frontend/public (update when adding/removing files there)
  const publicSongs = [
    'Aakh talabani.m4a',
    'ishqa be (2).m4a',
    'Ishqa be.m4a',
    'Runway (2).m4a',
    'Runway.m4a',
  ];
  
  const filteredPosts = useMemo(() => {
    if (viewingOwnPosts) {
      return posts.filter((post: any) => {
        const postUserId = post.user?._id || post.user?.id || post.userId;
        return String(postUserId) === String(me?.id);
      });
    }
    if (selectedPostUsername) return postSearchResults;
    return posts;
  }, [posts, viewingOwnPosts, selectedPostUsername, postSearchResults, me]);

  const handlePostHover = (post: any, isHovering: boolean) => {
    const pid = post._id || post.id;
    if (post.songUrl && !postMuted[pid]) {
      if (isHovering) {
        // Stop any currently playing audio
        if (currentPlayingAudio) {
          currentPlayingAudio.pause();
          currentPlayingAudio.currentTime = 0;
        }
        // Create and play new audio
        const audioUrl = resolveMediaUrl(post.songUrl);
        console.log('Playing audio for post', pid, audioUrl);
        const audio = new Audio(audioUrl);
        audio.volume = 0.3; // Set low volume
        audio.play().catch(err => console.error('Audio play failed:', err));
        setCurrentPlayingAudio(audio);
      } else {
        // Stop audio on mouse leave
        if (currentPlayingAudio) {
          currentPlayingAudio.pause();
          currentPlayingAudio.currentTime = 0;
          setCurrentPlayingAudio(null);
        }
      }
    }
  };

  const togglePostMute = (postId: string) => {
    const pid = postId || '';
    setPostMuted(prev => {
      const newMuted = { ...prev };
      if (newMuted[pid]) {
        delete newMuted[pid];
      } else {
        newMuted[pid] = true;
        // Stop any playing audio for this post
        if (currentPlayingAudio) {
          currentPlayingAudio.pause();
          currentPlayingAudio.currentTime = 0;
          setCurrentPlayingAudio(null);
        }
      }
      return newMuted;
    });
  };

  // Post scoring algorithm
  // const calculateScore = (post: any) => {
  //   const baseScore =
  //     (post.reactions?.['😍'] || 0) * 4 +  // love
  //     (post.reactions?.['😂'] || 0) * 2 +  // laugh
  //     (post.reactions?.['😠'] || 0) * 4 +  // angry
  //     (post.reactions?.['😢'] || 0) * 2;   // sad

  //   const hoursSincePost =
  //     (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

  //   const timeFactor = 1 / (hoursSincePost + 1);

  //   return baseScore * timeFactor;
  // };
   const calculateScore = (post: any, isFollowing: boolean) => {
  const baseScore =
    (post.reactions?.['😍'] || 0) * 4 +  
    (post.reactions?.['😂'] || 0) * 2 +  
    (post.reactions?.['😢'] || 0) * 3 +  
    (post.reactions?.['😠'] || 0) * 2;   

  
  const hoursSincePost =
    (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

  const timeFactor = 1 / (hoursSincePost + 2);

  let score = baseScore * timeFactor;

 
  const positive =
    (post.reactions?.['😍'] || 0) +
    (post.reactions?.['😂'] || 0);

  const negative =
    (post.reactions?.['😠'] || 0);

  const sentimentBoost = (positive - negative) * 2;

  score += sentimentBoost;

  
  // add boost for posts by followed users (was 30, now 20 as requested)
  if (isFollowing) {
    score += 20;
  }

  return score;
};
  // Notification state
  const [notification, setNotification] = useState<{ message: string; timestamp: number } | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unread messages state
  const [unreadMessages, setUnreadMessages] = useState<any[]>([]);
  // Grouped unread counts (by senderId for private, by groupId for groups)
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of unreadMessages) {
      if (m.type === 'group') {
        const key = m.normalizedGroupId || normalizeGroupId(m) || String(m.groupId || m.id || m._id || 'unknown');
        counts[key] = (counts[key] || 0) + 1;
      } else {
        // private: group by normalized sender id
        const senderId = m.normalizedSenderId || normalizeUserId(m.sender || m) || String(m.senderId || m.sender?._id || m.sender?.id || 'unknown');
        counts[senderId] = (counts[senderId] || 0) + 1;
      }
    }
    return counts;
  }, [unreadMessages]);

  // Helpers to normalize ids from various payload shapes
  const normalizeUserId = (obj: any) => {
    if (!obj) return null;
    return String(obj._id || obj.id || obj.senderId || obj.userId || obj.from || obj.userid || obj.userId || '');
  };
  const normalizeGroupId = (obj: any) => {
    if (!obj) return null;
    return String(obj.groupId || obj.id || obj._id || '');
  };
  
  // Recent messages/chats state for messages view
  const [recentMessagesData, setRecentMessagesData] = useState<any[]>([]);

  // Load persisted recent messages (per-user) so sent chats survive refresh
  useEffect(() => {
    try {
      const key = `recentMessagesData_${me?.id}`;
      const raw = localStorage.getItem(key) || '[]';
      const parsed = JSON.parse(raw);
      setRecentMessagesData(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      setRecentMessagesData([]);
    }
  }, []);

  // Load songs from /private directory
  useEffect(() => {
    const loadPrivateSongs = async () => {
      try {
        const response = await api.get('/posts/private-songs');
        console.log('Songs loaded:', response.data);
        setPrivateSongs(response.data || []);
      } catch (err: any) {
        console.log('Failed to load private songs:', err?.message);
        setPrivateSongs([]);
      }
    };
    loadPrivateSongs();
  }, []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      setMsg('Please login first');
      return;
    }

    const s = connectSocket();
    s.on('connect_error', (err) => console.error('Socket error', err));

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      try {
        const res = await api.get(`/groups/available?lat=${lat}&lng=${lng}`);
        const fetchedGroups = res.data.groups || [];
        setGroups(fetchedGroups);


        try {

          // fetch feed (statuses from people the user follows + self)
          const sres = await api.get(`/status/feed`);
          const fetchedStatuses = sres.data.statuses || [];
          setStatuses(fetchedStatuses);
        } catch (err) {

        }

        try {
          const ures = await api.get(`/users/nearby?lat=${lat}&lng=${lng}`);
          setNearbyUsers(ures.data.users || []);
        } catch (err) {
        }

        try {
          const rres = await api.get(`/users/random`);
          setRandomUsers(rres.data.users || []);
        } catch (err) {
        }

        if (groupName) {
          const group = fetchedGroups.find((g: any) => g.groupName === groupName);
          if (group) {
            if (group.isMember) {
              enterGroup(group);
            } else {
              joinAndEnter(group);
            }
          } else {
            setMsg(`Group "${groupName}" not found or not available`);
          }
        }
      } catch (err: any) {
        setMsg(err?.response?.data?.message || 'Failed to fetch groups');
      }
    }, () => setMsg('Location permission required'));

    try {
      const rc = JSON.parse(localStorage.getItem(`recentPrivateChats_${me?.id}`) || '[]');
      setRecentChats(Array.isArray(rc) ? rc : []);
    } catch (e) {
      setRecentChats([]);
    }

    // Load notifications
    loadNotifications();

    return () => {

      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    if (mode === 'posts') {
      fetchPosts();
    }
  }, [mode]);

  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;

    const onGroupMessage = (payload: any) => {
      const incomingGroupId = normalizeGroupId(payload);
      if (incomingGroupId !== String(activeGroup?.id)) {
        // Show notification for messages in other groups
        const senderName = payload.sender?.username || payload.sender?.name || 'User';
        showNotification(`message send by ${senderName}`);
        // normalize and add to unread messages
        const normalized = { ...payload, type: 'group', groupName: payload.groupName, normalizedGroupId: incomingGroupId };
        setUnreadMessages((prev) => [normalized, ...prev]);
        // Add to recent messages only for incoming (do not add sent messages elsewhere)
        addToRecentMessagesData(normalized, 'group');
        return;
      }
      setMessages((prev) => {
        if (payload.localId) {
          const hasLocal = prev.some((m) => m.localId && m.localId === payload.localId);
          if (hasLocal) {
            return prev.map((m) => (m.localId === payload.localId ? payload : m));
          }
        }
        return [...prev, payload];
      });
    };

    const onPrivateMessage = (payload: any) => {
      const senderId = normalizeUserId(payload.sender || { senderId: payload.senderId } || payload);
      const meId = String(me?._id || me?.id || '');
      if (activePrivateUser && senderId && senderId === String(activePrivateUser._id || activePrivateUser.id)) {
        setMessages((prev) => [...prev, payload]);
        // incoming in active chat - no unread but keep recent updated by incoming
        addToRecentMessagesData({ ...payload, normalizedSenderId: senderId }, 'private');
      } else if (senderId && senderId !== meId) {
        // Show notification for messages from other users when chat is not active
        const senderName = payload.sender?.username || payload.sender?.name || 'User';
        showNotification(`message send by ${senderName}`);
        // Add to unread messages with normalized sender id
        const normalized = { ...payload, type: 'private', normalizedSenderId: senderId };
        setUnreadMessages((prev) => [normalized, ...prev]);
        // Add to recent messages only for incoming
        addToRecentMessagesData(normalized, 'private');
      }
    };

    const onPrivateMessageSent = (payload: any) => {
      if (payload.localId) {
        setMessages((prev) => {
          const hasLocal = prev.some((m) => m.localId && m.localId === payload.localId);
          if (hasLocal) {
            return prev.map((m) => (m.localId === payload.localId ? { ...payload, status: 'sent' } : m));
          }
          return [...prev, payload];
        });
        try {
          addToRecentMessagesData({ ...payload, normalizedSenderId: String(payload.senderId || payload.sender?.id) }, 'private');
        } catch (err) {
          console.warn('Failed to add sent message to recent list (onPrivateMessageSent)', err);
        }
      }
    };

    const onPrivateStatus = (payload: any) => {
      setMessages((prev) => prev.map((m) => (String(m.id) === String(payload.messageId) ? { ...m, status: payload.status } : m)));
    };

    const onStatusNew = (payload: any) => {
  
      setStatuses((prev) => [payload, ...prev]);
    };

    const onStatusDeleted = (payload: any) => {
      setStatuses((prev) => prev.filter((s) => String(s._id || s.id) !== String(payload.id)));
    };

    const onStatusView = async (payload: any) => {
      try {
        const id = payload.id;
        console.log('Received status:view socket event', payload);
        const res = await api.get(`/status/${id}`);
        const updated = res.data?.status;
        if (updated) {
          setStatuses((prev) => prev.map((s) => {
            const sid = s._id || s.id;
            if (String(sid) === String(id)) return { ...s, views: updated.views, viewers: updated.viewers };
            return s;
          }));
        }
      } catch (err) {
        console.warn('Failed to refresh status after view event', err);
      }
    };

    const onNotificationNew = (payload: any) => {
      setUnreadCount((prev) => prev + 1);
    };

    const onGroupMessageError = (payload: any) => {
      console.error('Group message error:', payload);
      setMsg('Failed to send group message: ' + (payload?.message || 'Unknown error'));
    };

    const onPrivateMessageError = (payload: any) => {
      console.error('Private message error:', payload);
      setMsg('Failed to send private message: ' + (payload?.message || 'Unknown error'));
    };

    sock.on('group:message', onGroupMessage);
    sock.on('group:message:error', onGroupMessageError);
    sock.on('private:message', onPrivateMessage);
    sock.on('private:message:sent', onPrivateMessageSent);
    sock.on('private:message:error', onPrivateMessageError);
    sock.on('private:status', onPrivateStatus);
    sock.on('status:new', onStatusNew);
    sock.on('status:deleted', onStatusDeleted);
    sock.on('status:view', onStatusView);
    sock.on('notification:new', onNotificationNew);

    return () => {
      sock.off('group:message', onGroupMessage);
      sock.off('group:message:error', onGroupMessageError);
      sock.off('private:message', onPrivateMessage);
      sock.off('private:message:sent', onPrivateMessageSent);
      sock.off('private:message:error', onPrivateMessageError);
      sock.off('private:status', onPrivateStatus);
      sock.off('status:new', onStatusNew);
      sock.off('status:deleted', onStatusDeleted);
      sock.off('status:view', onStatusView);
      sock.off('notification:new', onNotificationNew);
    }; 
  }, [activeGroup, activePrivateUser]);

  const joinAndEnter = async (g: any) => {
    try {
      setMsg('Joining...');
      await api.post(`/groups/${g.id}/join`);
      // update groups state
      setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, isMember: true } : x)));
      setActiveGroup(g);
      const sock = getSocket();
      if (sock) sock.emit('group:subscribe', { groupId: g.id });
      setMsg('Joined');
      setMessages([]);

      
      try {
        const res = await api.get(`/groups/${g.id}/messages`);
        setMessages(res.data.messages || []);
      } catch (err) {
        
      }

      
      history.pushState(null, '', `/message`);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to join group');
    }
  };

  const enterGroup = async (g: any) => {
    setMode('groups');
    setActiveGroup(g);
    const sock = getSocket();
    if (sock) sock.emit('group:subscribe', { groupId: g.id });
    setMessages([]);
    clearUnreadForChat(null, g.id);

    try {
      const res = await api.get(`/groups/${g.id}/messages`);
      setMessages(res.data.messages || []);
    } catch (err: any) {
      
    }
    
    history.pushState(null, '', `/message`);
  };

  const loadNotifications = async () => {
    try {
      const res = await api.get('/notifications?limit=10');
      setUnreadCount(res.data.unread || 0);
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  };

  const searchUsers = async () => {
    if (!privateSearch.trim()) return setSearchResults([]);
    try {
      const res = await api.get(`/users/find?username=${encodeURIComponent(privateSearch.trim())}`);
      const users = res.data.users || [];
      setSearchResults(users);

      
      try {
        const rc = JSON.parse(localStorage.getItem(`recentPrivateChats_${me?.id}`) || '[]');
        const arr = Array.isArray(rc) ? rc : [];
        const existingIds = new Set(arr.map((x: any) => String(x._id || x.id)));
        const newUsers = users.filter((u: any) => !existingIds.has(String(u._id || u.id)));
        const updated = [...newUsers, ...arr].slice(0, 20); // Keep up to 20
        localStorage.setItem(`recentPrivateChats_${me?.id}`, JSON.stringify(updated));
        setRecentChats(updated);
      } catch (e) {
        
      }
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Search failed');
    }
  };

  const openPrivateChat = async (u: any) => {
    // Normalize and validate user id
    const uid = u?._id || u?.id;
    if (!uid) {
      setMsg('Invalid user selected');
      return;
    }

    setMode('private');
    setActivePrivateUser(u);
    setMessages([]);
    clearUnreadForChat(uid, null);

    try {
      const rc = JSON.parse(localStorage.getItem(`recentPrivateChats_${me?.id}`) || '[]');
      const arr = Array.isArray(rc) ? rc : [];
      const filtered = arr.filter((x: any) => String(x._id || x.id) !== String(uid));
      filtered.unshift(u);
      const trimmed = filtered.slice(0, 10);
      localStorage.setItem(`recentPrivateChats_${me?.id}`, JSON.stringify(trimmed));
      setRecentChats(trimmed);
    } catch (e) {
      
    }

    try {
      const res = await api.get(`/chats/private/${uid}`);
      setMessages(res.data.messages || []);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to load messages');
    }
  };

  const deleteFromRecentChats = (u: any) => {
    try {
      const rc = JSON.parse(localStorage.getItem(`recentPrivateChats_${me?.id}`) || '[]');
      const arr = Array.isArray(rc) ? rc : [];
      const filtered = arr.filter((x: any) => String(x._id || x.id) !== String(u._id || u.id));
      localStorage.setItem(`recentPrivateChats_${me?.id}`, JSON.stringify(filtered));
      setRecentChats(filtered);
    } catch (e) {
      
    }
  };

  const deleteFromSearchResults = (u: any) => {
    setSearchResults((prev) => prev.filter((x) => String(x._id) !== String(u._id)));
  };

  const showNotification = (message: string) => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    setNotification({ message, timestamp: Date.now() });
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null);
    }, 5000); // Show notification for 5 seconds
  };

  const clearUnreadForChat = (senderId: string | null, groupId: string | null) => {
    if (groupId) {
      const gid = String(groupId);
      setUnreadMessages((prev) => prev.filter((m) => {
        const mg = m.normalizedGroupId || normalizeGroupId(m) || String(m.groupId || m.id || m._id || '');
        return mg !== gid;
      }));
    } else if (senderId) {
      const sid = String(senderId);
      setUnreadMessages((prev) => prev.filter((m) => {
        const ms = m.normalizedSenderId || normalizeUserId(m.sender || m) || String(m.senderId || m.sender?._id || m.sender?.id || '');
        return ms !== sid;
      }));
    }
  };

  const addToRecentMessagesData = (messageData: any, type: 'group' | 'private') => {
    setRecentMessagesData((prev) => {
      let filteredPrev;
      if (type === 'group') {
        filteredPrev = prev.filter((m) => String(m.groupId) !== String(messageData.groupId || messageData.id));
      } else {
        // For private messages, check if it's the same conversation (either direction)
        const myId = String(me?.id);
        const otherId = String(messageData.senderId === myId ? messageData.receiverId || messageData.receiver?.id : messageData.senderId || messageData.sender?.id);
        filteredPrev = prev.filter((m) => {
          const msgMyId = String(m.senderId === myId ? m.receiverId || m.receiver?.id : m.senderId || m.sender?.id);
          return msgMyId !== otherId;
        });
      }
      const updated = [{ ...messageData, type, timestamp: Date.now() }, ...filteredPrev].slice(0, 50);
      console.log('Recent messages updated:', updated);
      try {
        const key = `recentMessagesData_${me?.id}`;
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (err) {
        // ignore
      }
      return updated;
    });
  };

  const handleMessageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      setMessageMediaUrl('');
      setMessageMediaType('');
      setMessageSelectedFileName('');
      setMessageMediaFile(null);
      return;
    }

    setMessageSelectedFileName(f.name);
    setMessageMediaFile(f);

    // Validate file size (50MB max)
    if (f.size > 50 * 1024 * 1024) {
      setMsg(`File size (${(f.size / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit`);
      setMessageMediaFile(null);
      setMessageSelectedFileName('');
      return;
    }

    if (f.type.startsWith('image/') && isUnsupportedImageFile(f)) {
      setMsg('HEIC/HEIF images are not supported. Please upload JPG/PNG/WebP instead.');
      setMessageMediaUrl('');
      setMessageMediaType('');
      setMessageSelectedFileName('');
      setMessageMediaFile(null);
      try { e.target.value = ''; } catch {}
      return;
    }

    if (f.type.startsWith('image/')) setMessageMediaType('image');
    else if (f.type.startsWith('video/')) setMessageMediaType('video');
    else setMessageMediaType('');

    // Upload file immediately to get the URL
    setIsUploadingMessageMedia(true);
    setMsg('Uploading media...');
    try {
      console.log('[chat] Uploading file:', { name: f.name, type: f.type, size: f.size });
      const result = await uploadFile(f);
      console.log('[chat] Upload response:', result);
      if (result.data?.url) {
        setMessageMediaUrl(result.data.url);
        setMsg('');
        console.log('[chat] Message media uploaded successfully:', result.data.url);
      } else {
        setMsg('Failed to upload media: No URL returned');
        setMessageMediaFile(null);
        setMessageSelectedFileName('');
        setMessageMediaType('');
      }
    } catch (err: any) {
      console.error('[chat] Message media upload error:', err);
      const errorMsg = err?.response?.data?.message || err?.message || 'Failed to upload media';
      setMsg(errorMsg);
      setMessageMediaFile(null);
      setMessageSelectedFileName('');
      setMessageMediaType('');
    } finally {
      setIsUploadingMessageMedia(false);
    }
  };

  const sendMessage = () => {
    const sock = getSocket();
    if (!text.trim() && !messageMediaUrl) return;

    if (mode === 'groups') {
      if (!activeGroup) return;
      const localId = `local:${Date.now()}`;
      const payload: any = { groupId: activeGroup.id, message: text.trim(), localId };
      if (messageMediaUrl) {
        // Send only the URL, not base64 data
        payload.mediaUrl = messageMediaUrl;
        payload.mediaType = messageMediaType;
      }
      if (isVoiceMode && text.trim()) {
        payload.isVoice = true;
        payload.voiceGender = voiceGender;
      }
      if (sock) {
        sock.emit('group:message', payload);
        const messageObj = { ...payload, id: localId, localId, groupId: activeGroup.id, groupName: activeGroup.groupName, senderId: me?.id, sender: { id: me?.id, username: me?.username }, createdAt: new Date().toISOString() };
        setMessages((prev) => [...prev, messageObj]);
        // Do not add sent messages to recent list (only show incoming messages)
        setText('');
        setMessageMediaUrl('');
        setMessageMediaType('');
        setMessageSelectedFileName('');
        setMessageMediaFile(null);
      } else {
        setMsg('Socket not connected');
      }
    } else {
      if (!activePrivateUser) return;
      const localId = `local:${Date.now()}`;
      const payload: any = { toUserId: activePrivateUser._id || activePrivateUser.id, message: text.trim(), localId };
      if (messageMediaUrl) {
        // Send only the URL, not base64 data
        payload.mediaUrl = messageMediaUrl;
        payload.mediaType = messageMediaType;
      }
      if (isVoiceMode && text.trim()) {
        payload.isVoice = true;
        payload.voiceGender = voiceGender;
      }
      if (sock) {
        sock.emit('private:message', payload);
        const messageObj = { ...payload, localId, senderId: me?.id, sender: { id: me?.id, username: me?.username }, receiverId: payload.toUserId, receiver: activePrivateUser, createdAt: new Date().toISOString(), status: 'sending' };
        console.log('Sending private message, adding to recent if recipient inactive:', messageObj);
        setMessages((prev) => [...prev, messageObj]);
        // If recipient is not the currently active private chat, add to recent so it appears under Messages
        const recipientId = normalizeUserId(activePrivateUser) || String(activePrivateUser._id || activePrivateUser.id);
        const activeId = String(activePrivateUser?._id || activePrivateUser?.id || '');
        if (!activePrivateUser || recipientId !== String(activePrivateUser._id || activePrivateUser.id)) {
          addToRecentMessagesData({ ...messageObj, normalizedSenderId: recipientId }, 'private');
        }
        setText('');
        setMessageMediaUrl('');
        setMessageMediaType('');
        setMessageSelectedFileName('');
        setMessageMediaFile(null);
      } else {
        setMsg('Socket not connected');
      }
    }
  };

  const createStatus = async () => {
    try {
      if (!statusContent.trim() && !statusMediaUrl) return setMsg('Nothing to post');
      const payload: any = { content: statusContent.trim() };
      if (statusMediaUrl) {
        // Use the URL returned from server upload, not base64
        payload.mediaUrl = statusMediaUrl; 
        if (statusMediaType) payload.mediaType = statusMediaType;
      }
      
      const res = await api.post('/status', payload);
      
      setStatuses((prev) => [{ id: res.data.statusId || res.data.statusId, userId: me?.id, content: statusContent.trim(), mediaUrl: statusMediaUrl, mediaType: statusMediaType, createdAt: new Date().toISOString() }, ...prev]);
      setStatusContent('');
      setStatusMediaUrl('');
      setStatusMediaType('');
      setSelectedFileName('');
      setMsg('Status posted');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to post status');
    }
  };

  const usernameFor = (userId: any) => {
    const u = nearbyUsers.find((x) => String(x.id) === String(userId) || String(x._id) === String(userId));
    return u ? u.username : String(userId).slice(0, 6);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      setStatusMediaUrl('');
      setStatusMediaType('');
      setSelectedFileName('');
      return;
    }

    setSelectedFileName(f.name);
    
    // Validate file size
    if (f.size > 50 * 1024 * 1024) {
      setMsg(`File size (${(f.size / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit`);
      setSelectedFileName('');
      return;
    }

    if (f.type.startsWith('image/') && isUnsupportedImageFile(f)) {
      setMsg('HEIC/HEIF images are not supported. Please upload JPG/PNG/WebP instead.');
      setStatusMediaUrl('');
      setStatusMediaType('');
      setSelectedFileName('');
      try { e.target.value = ''; } catch {}
      return;
    }

    if (f.type.startsWith('image/')) setStatusMediaType('image');
    else if (f.type.startsWith('video/')) setStatusMediaType('video');
    else setStatusMediaType('');

    // Upload file immediately
    setIsUploadingStatusMedia(true);
    try {
      const result = await uploadFile(f);
      if (result.data?.url) {
        setStatusMediaUrl(result.data.url);
        console.log('Status media uploaded successfully:', result.data.url);
      } else {
        setMsg('Failed to upload media: No URL returned');
        setSelectedFileName('');
        setStatusMediaType('');
      }
    } catch (err: any) {
      console.error('Status media upload error:', err);
      setMsg(err?.response?.data?.message || 'Failed to upload media');
      setSelectedFileName('');
      setStatusMediaType('');
    } finally {
      setIsUploadingStatusMedia(false);
    }
  };

  const handlePostImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) {
      setPostImage(null);
      return;
    }
    if (f.type.startsWith('image/') && isUnsupportedImageFile(f)) {
      setMsg('HEIC/HEIF images are not supported. Please upload JPG/PNG/WebP instead.');
      setPostImage(null);
      try { e.target.value = ''; } catch {}
      return;
    }
    setPostImage(f);
  };

  const fetchPosts = useCallback(async () => {
    try {
      const res = await api.get('/posts');
      console.log('fetchPosts response:', res.data);
      if (res.data && res.data.length > 0) {
        console.log('First post:', res.data[0]);
      }
      setPosts(res.data);
    } catch (err: any) {
      console.error('fetchPosts error:', err);
      setMsg(err?.response?.data?.message || 'Failed to fetch posts');
    }
  }, []);

  const createPost = async () => {
    if (!postContent.trim() && !postImage && !postSong) return setMsg('Nothing to post');
    
    // Validate file size for mobile compatibility
    if (postImage) {
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (postImage.size > maxSize) {
        setMsg(`File size (${(postImage.size / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit`);
        return;
      }
    }
    
    console.log('Creating post with:', { content: postContent, hasSong: !!postSong, songValue: postSong });
    setPostLoading(true);
    try {
      const formData = new FormData();
      formData.append('content', postContent);
      formData.append('anonymous', String(postAnonymous));
      if (postImage) formData.append('image', postImage);
      if (postSong) formData.append('songUrl', postSong);

      const response = await api.post('/posts', formData);
      console.log('Post created successfully:', response.data);

      setPostContent('');
      setPostImage(null);
      setPostSong('');
      setMsg('Post created');
      
      // Refetch posts to ensure we have the latest from the server
      // This ensures proper sorting, scoring, and all fields are correctly populated
      await fetchPosts();
    } catch (err: any) {
      console.error('createPost error:', err);
      setMsg(err?.response?.data?.message || 'Failed to create post');
    } finally {
      setPostLoading(false);
    }
  };

  const searchUserPosts = async () => {
    if (!postSearchQuery.trim()) {
      setPostSearchResults([]);
      setPostIsSearching(false);
      setSelectedPostUsername(null);
      return;
    }

    try {
      setPostIsSearching(true);
      const res = await api.get(`/posts/user/${encodeURIComponent(postSearchQuery.trim())}`);
      setPostSearchResults(res.data || []);
      setSelectedPostUsername(postSearchQuery.trim());
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to search user posts');
      setPostSearchResults([]);
      setSelectedPostUsername(null);
    } finally {
      setPostIsSearching(false);
    }
  };

  const clearPostSearch = () => {
    setPostSearchQuery('');
    setPostSearchResults([]);
    setSelectedPostUsername(null);
  };

  const viewOwnPosts = () => {
    setViewingOwnPosts(!viewingOwnPosts);
    if (viewingOwnPosts) {
      setPostSearchOpen(false);
      setPostSearchQuery('');
      setPostSearchResults([]);
      setSelectedPostUsername(null);
    }
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p._id !== postId));
      setMsg('Post deleted');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to delete post');
    }
  };

  const handleEmojiReaction = async (postId: string, emoji: string) => {
    try {
      await api.post(`/posts/${postId}/react`, { emoji });
      fetchPosts();
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to add reaction');
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = commentText[postId];
    if (!text || !text.trim()) return;

    setSubmittingComment(prev => ({ ...prev, [postId]: true }));
    try {
      await api.post(`/posts/${postId}/comment`, { content: text });
      setCommentText(prev => ({ ...prev, [postId]: '' }));
      fetchPosts(); // Refresh posts to get updated comments
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to add comment');
    } finally {
      setSubmittingComment(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleFollowUser = async (userId: string) => {
    if (!userId) return;
    setLoadingFollows(prev => ({ ...prev, [userId]: true }));
    try {
      await api.post(`/users/${userId}/follow`);
      setFollowedUsers(prev => new Set([...prev, userId]));
      setMsg('User followed');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to follow user');
    } finally {
      setLoadingFollows(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleUnfollowUser = async (userId: string) => {
    if (!userId) return;
    if (!confirm('Unfollow this user?')) return;
    setLoadingFollows(prev => ({ ...prev, [userId]: true }));
    try {
      await api.post(`/users/${userId}/unfollow`);
      setFollowedUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
      setMsg('User unfollowed');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to unfollow user');
    } finally {
      setLoadingFollows(prev => ({ ...prev, [userId]: false }));
    }
  };

  const toggleFollowUser = async (userId: string) => {
    if (followedUsers.has(userId)) {
      await handleUnfollowUser(userId);
    } else {
      await handleFollowUser(userId);
    }
  };

  const loadFollowersAndFollowing = async () => {
    setLoadingFollowersList(true);
    try {
      const [followersRes, followingRes] = await Promise.all([
        api.get('/users/followers'),
        api.get('/users/following-list')
      ]);
      setFollowers(followersRes.data?.followers || []);
      setFollowing(followingRes.data?.following || []);
    } catch (err) {
      console.error('Failed to load followers/following:', err);
    } finally {
      setLoadingFollowersList(false);
    }
  };

  // SongSelector component for listening and choosing songs
  const SongSelector: React.FC<{
    songUrl: string;
    songName: string;
    isSelected: boolean;
    onSelect: () => void;
    postImage: File | null;
  }> = ({ songUrl, songName, isSelected, onSelect, postImage }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    const togglePlay = () => {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(err => {
            console.log('Audio play failed:', err);
            setIsPlaying(false);
          });
        }
      }
    };

    const handleAudioEnd = () => {
      setIsPlaying(false);
    };

    return (
      <div className={`flex items-center justify-between p-3 border rounded ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} hover:bg-gray-50`}>
        <div className="flex items-center space-x-3">
          <button
            onClick={togglePlay}
            className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <div>
            <div className="font-medium text-black">{songName}</div>
            {postImage && (
              <div className="text-xs text-gray-500">
                Preview with your image: <span className="font-medium">{postImage.name}</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onSelect}
          className={`px-3 py-1 rounded text-sm ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
        >
          {isSelected ? 'Selected' : 'Choose'}
        </button>
        <audio
          ref={audioRef}
          src={resolveMediaUrl(songUrl)}
          onEnded={handleAudioEnd}
          preload="none"
        />
      </div>
    );
  };

  // Show NightInterface if in night mode route
  if (isNightMode) {
    const handleExitNightMode = async () => {
      try {
        console.log('handleExitNightMode called in Message.tsx');
        // NightInterface already called exitNightMode(), so just navigate
        localStorage.removeItem('isInNightMode');
        console.log('Redirecting to /message...');
        window.location.pathname = '/message';
      } catch (err: any) {
        console.error('Error exiting night mode:', err);
        setMsg('Error exiting night mode: ' + (err.response?.data?.message || err.message));
      }
    };
    
    return <NightInterface onExitNightMode={handleExitNightMode} />;
  }

  const openReportDialog = (target: { type: 'post' | 'user'; postId?: string; userId?: string; username?: string }) => {
    setReportTarget(target);
    setReportReason('');
    setReportDialogOpen(true);
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    if (reportSubmitting) return;

    const reason = reportReason.trim();
    if (reason.length < 3) {
      setMsg('Please add a short reason (at least 3 characters).');
      return;
    }

    try {
      setReportSubmitting(true);
      if (reportTarget.type === 'post') {
        if (!reportTarget.postId) throw new Error('Missing postId');
        const r = await api.post(`/reports/post/${reportTarget.postId}`, { reason });
        if (r.data?.deleted) {
          const pid = String(reportTarget.postId);
          setPosts((prev) => prev.filter((p: any) => String(p._id || p.id) !== pid));
          setPostSearchResults((prev) => prev.filter((p: any) => String(p._id || p.id) !== pid));
          setMsg('Reported. This post was automatically removed.');
        } else {
          setMsg('Report submitted. Thanks for helping keep the community safe.');
        }
      } else {
        if (!reportTarget.userId) throw new Error('Missing userId');
        await api.post(`/reports/user/${reportTarget.userId}`, { reason });
        setMsg('Report submitted. Thanks for helping keep the community safe.');
      }

      setReportDialogOpen(false);
      setReportTarget(null);
      setReportReason('');
    } catch (err: any) {
      console.warn('Failed to submit report', err);
      setMsg(err?.response?.data?.message || err?.message || 'Failed to submit report');
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Notification Display */}
      {notification && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse">
          {notification.message}
        </div>
      )}

      {reportDialogOpen && reportTarget && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !reportSubmitting && setReportDialogOpen(false)} />
          <div className="relative w-[92vw] max-w-md bg-white rounded-lg shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-black">
                {reportTarget.type === 'post' ? 'Report Post' : 'Report User'}
                {reportTarget.type === 'user' && reportTarget.username ? ` (@${reportTarget.username})` : ''}
              </div>
              <button
                onClick={() => {
                  if (reportSubmitting) return;
                  setReportDialogOpen(false);
                }}
                className="text-gray-500 hover:text-gray-800"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Tell us what happened…"
              className="w-full h-28 p-2 border rounded text-black"
              disabled={reportSubmitting}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  if (reportSubmitting) return;
                  setReportDialogOpen(false);
                }}
                className="px-3 py-1 rounded bg-gray-200 text-black hover:bg-gray-300"
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                disabled={reportSubmitting}
              >
                {reportSubmitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
      {!groupName && (
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            <button onClick={() => setMode('posts')} className={`px-3 py-1 rounded ${mode === 'posts' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>🏠</button>
            <button onClick={() => setMode('groups')} className={`px-3 py-1 rounded ${mode === 'groups' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>👥</button>
            <button onClick={() => setMode('private')} className={`px-3 py-1 rounded ${mode === 'private' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>👤</button>
            <button aria-label="Special" onClick={() => setMode('status')} className={`px-3 py-1 rounded ${mode === 'status' ? 'bg-blue-600 text-black' : 'bg-gray-100'}`}>
              <ActiveIcon />
            </button>
            {/* <button onClick={() => setMode('posts')} className={`px-3 py-1 rounded ${mode === 'posts' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>📸</button> */}
            <button onClick={() => setMode('random')} className={`px-3 py-1 rounded ${mode === 'random' ? 'bg-blue-600 text-black' : 'bg-gray-100'}`}>🕵️‍♂️ </button>
          </div>
          <div className="flex items-center space-x-2 relative">
            <div className="fixed top-4 right-4 z-30">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative px-3 py-1 hover:bg-gray-200 rounded transition"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              {msg && (
                <div className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap bg-red-100 text-red-600 text-xs px-3 py-1 rounded shadow-md z-40">
                  {msg}
                </div>
              )}
              {showNotifications && (
                <div className="absolute right-0 mt-2 z-50">
                  <NotificationPanel onClose={() => setShowNotifications(false)} />
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                className="px-3 py-1 bg-blue-500 hover:bg-white rounded transition"
              >
                ☰
              </button>
              {/* Sliding navigation drawer */}
              <>
                <div
                  className={`fixed inset-0 z-40 transition-opacity ${headerMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                  onClick={() => setHeaderMenuOpen(false)}
                  aria-hidden={!headerMenuOpen}
                >
                  <div className="absolute inset-0 bg-black/50" />
                </div>

                <aside
                  className={`fixed top-0 right-0 z-50 h-full w-64 max-w-sm bg-white dark:bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out ${headerMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
                  aria-hidden={!headerMenuOpen}
                >
                  <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold">Menu</h3>
                    <button onClick={() => setHeaderMenuOpen(false)} className="text-gray-600 hover:text-gray-900 dark:text-gray-300">
                      ✕
                    </button>
                  </div>
                  <div className="p-3 space-y-1">
                    <button
                      onClick={async () => {
                        try {
                          await api.post('/auth/logout');
                        } catch (e) {
                          console.warn('Logout request failed', e);
                        }
                        disconnectSocket();
                        localStorage.removeItem('user');
                        window.location.pathname = '/';
                        setHeaderMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded"
                    >
                      <span>🔓</span>
                      <span>Logout</span>
                    </button>
                    <button
                      onClick={() => { setShowWallpaperPicker(true); setHeaderMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded"
                    >
                      <span>🖼️</span>
                      <span>Change Wallpaper</span>
                    </button>
                    <button
                      onClick={() => { setShowTextColorPicker(true); setHeaderMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded"
                    >
                      <span>🎨</span>
                      <span>Text Color</span>
                    </button>
                    <button
                      onClick={() => { setShowTextSizePicker(true); setHeaderMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded"
                    >
                      <span>📏</span>
                      <span>Text Size</span>
                    </button>
                  <button className='text-red-800' onClick={()=>{
                      
                    }} >Report</button>
                    <a href="mailto:singhanshu1234@gmail.com" className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:text-blue-600 hover:bg-black rounded">Contact us</a>
                  </div>
                </aside>
              </>
            </div>

            {showWallpaperPicker && (
              <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[10000] w-56 bg-white border rounded shadow-lg p-2">
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="font-medium">Choose Wallpaper</div>
                  <button onClick={() => setShowWallpaperPicker(false)} className="text-sm text-gray-500">Close</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {wallpapers.map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        try {
                          const path = `/${w}`;
                          if (activeGroup) {
                            const key = `wallpaper_group_${activeGroup.id}`;
                            localStorage.setItem(key, path);
                            setCurrentChatWallpaper(path);
                          } else if (activePrivateUser) {
                            const uid = activePrivateUser._id || activePrivateUser.id;
                            const key = `wallpaper_private_${uid}`;
                            localStorage.setItem(key, path);
                            setCurrentChatWallpaper(path);
                          } else {
                            localStorage.setItem('wallpaper', path);
                            setWallpaperUrl(path);
                            document.body.style.backgroundImage = `url(${path})`;
                            document.body.style.backgroundSize = 'cover';
                          }
                        } catch (err) {
                          console.error('Failed to set wallpaper', err);
                        }
                        setShowWallpaperPicker(false);
                      }}
                      className="p-0 bg-transparent border rounded overflow-hidden"
                    >
                      <img src={`/${w}`} alt={w} className="w-28 h-28 object-cover" />
                    </button>
                  ))}
                </div>
                <div className="mt-2 px-1">
                  <button
                    onClick={() => {
                      try {
                        if (activeGroup) {
                          const key = `wallpaper_group_${activeGroup.id}`;
                          localStorage.removeItem(key);
                          setCurrentChatWallpaper(null);
                        } else if (activePrivateUser) {
                          const uid = activePrivateUser._id || activePrivateUser.id;
                          const key = `wallpaper_private_${uid}`;
                          localStorage.removeItem(key);
                          setCurrentChatWallpaper(null);
                        } else {
                          localStorage.removeItem('wallpaper');
                          setWallpaperUrl(null);
                          document.body.style.backgroundImage = '';
                        }
                      } catch (err) {
                        console.error(err);
                      }
                      setShowWallpaperPicker(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    Clear Wallpaper
                  </button>
                </div>
              </div>
            )}

            {showTextColorPicker && (
              <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[10000] w-56 bg-white border rounded shadow-lg p-2">
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="font-medium">Choose Text Color</div>
                  <button onClick={() => setShowTextColorPicker(false)} className="text-sm text-gray-500">Close</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {textColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        setTextColor(color);
                        localStorage.setItem('textColor', color);
                        setShowTextColorPicker(false);
                      }}
                      className={`p-2 border rounded text-center text-white font-medium`}
                      style={{ backgroundColor: color }}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showTextSizePicker && (
              <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[10000] w-56 bg-white border rounded shadow-lg p-2">
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="font-medium">Choose Text Size</div>
                  <button onClick={() => setShowTextSizePicker(false)} className="text-sm text-gray-500">Close</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {textSizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        setTextSize(size);
                        localStorage.setItem('textSize', size);
                        setShowTextSizePicker(false);
                      }}
                      className={`p-2 border rounded text-center text-black font-medium`}
                      style={{ fontSize: size === 'small' ? '12px' : size === 'medium' ? '16px' : size === 'large' ? '20px' : '24px' }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Hidden file inputs used by the + attach menu */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleMessageFileChange} />
            <input
              ref={wallpaperInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const data = String(reader.result || '');
                  try {
                    localStorage.setItem('wallpaper', data);
                    setWallpaperUrl(data);
                    document.body.style.backgroundImage = `url(${data})`;
                    document.body.style.backgroundSize = 'cover';
                  } catch (err) {
                    console.error('Failed to set wallpaper', err);
                  }
                };
                reader.readAsDataURL(f);
              }}
            />
          </div>
        </div>

      )}

      {/* Messages Mode - Show Unread Messages & Recent Chats */}
      {mode === 'messages' && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
          <div className="mb-3 text-xs text-gray-500">
            Debug: Unread={unreadMessages.length}, Recent={recentMessagesData.length}
          </div>
          {/* Unread Messages */}
          {unreadMessages.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-yellow-900 mb-3">Unread Messages ({unreadMessages.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {unreadMessages.map((msg, idx) => {
                  const key = msg.type === 'group'
                    ? (msg.normalizedGroupId || normalizeGroupId(msg) || String(msg.groupId || msg.id || msg._id || ''))
                    : (msg.normalizedSenderId || normalizeUserId(msg.sender || msg) || String(msg.sender?.id || msg.senderId || msg.sender?._id || ''));
                  const count = unreadCounts[key] || 0;
                  return (
                  <div key={idx} className="p-3 bg-white border border-yellow-200 rounded flex justify-between items-center hover:bg-yellow-50">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-800">
                          {msg.sender?.username || msg.sender?.name || 'Unknown User'}
                        </div>
                        {count > 0 && (
                          <div className="ml-2 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-semibold">
                            {count}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 truncate">
                        {msg.type === 'group' && msg.groupName && `[${msg.groupName}] `}
                        {msg.content || msg.text || '(media message)'}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (msg.type === 'group') {
                          const grp = groups.find((g) => String(g.id) === String(msg.groupId));
                          if (grp) enterGroup(grp);
                        } else {
                          openPrivateChat(msg.sender);
                        }
                      }}
                      className="ml-2 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                    >
                      View
                    </button>
                  </div>
                )})}
              </div>
            </div>
          )}
          
          {/* Recent Messages */}
          {recentMessagesData.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">Recent Messages</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentMessagesData.map((msg, idx) => {
                  const isFromMe = String(msg.senderId || msg.sender?.id) === String(me?.id);
                  const otherUser = msg.type === 'group' ? msg.sender : (isFromMe ? msg.receiver : msg.sender);
                  const displayName = msg.type === 'group' 
                    ? `${msg.groupName} (${msg.sender?.username || 'Unknown'})`
                    : otherUser?.username || otherUser?.name || 'Unknown User';
                  // unread count key
                  const key = msg.type === 'group'
                    ? (msg.normalizedGroupId || normalizeGroupId(msg) || String(msg.groupId || msg.id || msg._id || ''))
                    : (msg.normalizedSenderId || normalizeUserId(msg.sender || msg) || String(msg.senderId || msg.sender?.id || msg.receiverId || msg.receiver?.id || ''));
                  const count = unreadCounts[key] || 0;
                  
                  return (
                    <div key={idx} className={`p-3 border rounded flex justify-between items-center ${isFromMe ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'} hover:opacity-80`}>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-800">
                            {isFromMe ? '📤 ' : '📥 '} {displayName}
                          </div>
                          {count > 0 && (
                            <div className="ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold">
                              {count}
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                          {isFromMe ? 'You: ' : ''}{msg.message || msg.content || msg.text || '(media message)'}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (msg.type === 'group') {
                            const grp = groups.find((g) => String(g.id) === String(msg.groupId));
                            if (grp) enterGroup(grp);
                          } else {
                            openPrivateChat(otherUser);
                          }
                        }}
                        className="ml-2 px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                      >
                        View
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {unreadMessages.length === 0 && recentMessagesData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-lg">No messages yet</p>
              <p className="text-sm">Start a conversation! 💬</p>
            </div>
          )}
        </div>
      )}

      {/* Unread Messages Section - Show in other modes */}
      {unreadMessages.length > 0 && mode !== 'messages' && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
          <h3 className="font-semibold text-yellow-900 mb-3">Unread Messages ({unreadMessages.length})</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {unreadMessages.map((msg, idx) => (
              <div key={idx} className="p-3 bg-white border border-yellow-200 rounded flex justify-between items-center hover:bg-yellow-50">
                <div className="flex-1">
                  <div className="font-medium text-gray-800">
                    {msg.sender?.username || msg.sender?.name || 'Unknown User'}
                  </div>
                  <div className="text-sm text-gray-600 truncate">
                    {msg.type === 'group' && msg.groupName && `[${msg.groupName}] `}
                    {msg.content || msg.text || '(media message)'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (msg.type === 'group') {
                      const grp = groups.find((g) => String(g.id) === String(msg.groupId));
                      if (grp) enterGroup(grp);
                    } else {
                      openPrivateChat(msg.sender);
                    }
                  }}
                  className="ml-2 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'groups' && (
        <div>
          {!groupName && (
            <>
              <h2 className="text-lg font-semibold">Nearby groups</h2>
              <ul className="mt-2 space-y-2">
                {groups.map((g) => (
                  <li key={g.id} className="p-2 border rounded flex justify-between items-center">
                    <div>
                      <div className="font-medium">{g.groupName} • {g.distanceRange}</div>
                      <div className="text-sm text-gray-500">{g.distanceMeters}m away</div>
                    </div>
                    <div className="space-x-2">
                      {g.isMember ? (
                        <button onClick={() => enterGroup(g)} className="px-3 py-1 bg-blue-600 text-white rounded">Enter</button>
                      ) : (
                        <button onClick={() => joinAndEnter(g)} className="px-3 py-1 bg-green-600 text-white rounded">Join</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {activeGroup && (
            <div className={groupName ? '' : 'mt-4'}>
              <h3 className="font-semibold">Group: {activeGroup.groupName}</h3>
              <div
                className="h-96 overflow-auto hide-scrollbar border rounded p-2 mt-2 bg-white text-black"
                style={currentChatWallpaper || wallpaperUrl ? { backgroundImage: `url(${currentChatWallpaper || wallpaperUrl})`, backgroundSize: 'cover' } : undefined}
              >
                {messages.length === 0 && <div className="text-sm text-gray-500">No messages yet — start the conversation</div>}
                {messages.map((m) => {
                  const isMe = m.senderId === 'me' || (m.sender && String(m.sender.id) === String(me?.id));
                  const senderName = isMe ? 'You' : (m.sender?.username || m.senderId);
                  const senderId = m.sender?._id || m.sender?.id || m.senderId;
                  return (
                    <div key={m.id} className={`mb-2 ${isMe ? 'text-right' : ''} text-black`}>
                      <div className="text-sm text-black">
                        <strong>
                          {isMe ? (
                            senderName
                          ) : (
                            <span
                              className="cursor-pointer hover:underline"
                              onClick={() => senderId && (window.location.pathname = `/profile/${senderId}`)}
                            >
                              {senderName}
                            </span>
                          )}
                        </strong>
                      </div>
                      <div className="text-md" style={{ color: textColor, fontSize: getFontSize(textSize) }}>
                        {m.voiceUrl ? (
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">🎵 Voice message</span>
                            <audio controls className="max-w-xs">
                              <source src={resolveMediaUrl(m.voiceUrl)} type="audio/mpeg" />
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        ) : m.mediaUrl ? (
                          (m.mediaType === 'image' || String(m.mediaUrl).startsWith('data:image') || String(m.mediaUrl).match(/\.(png|jpe?g|gif|webp)(\?|$)/i)) ? (
                            <img src={resolveMediaUrl(m.mediaUrl)} alt="media" className="max-h-40 mx-auto" />
                          ) : (
                            <video src={resolveMediaUrl(m.mediaUrl)} controls className="max-h-40 mx-auto" />
                          )
                        ) : (
                          m.message
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleTimeString()}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  {/* <button
                    onClick={() => setIsVoiceMode(!isVoiceMode)}
                    className={`px-3 py-2 rounded ${isVoiceMode ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'}`}
                    title={isVoiceMode ? 'Voice mode enabled' : 'Enable voice mode'}
                  >
                    🎤
                  </button> */}
                  <div className="relative flex-1">
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" className="w-full p-2 pr-10 border rounded text-black" />
                    {/* <button type="button" onClick={speakText} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800">🔊</button> */}
                    <button  onClick={() => setIsVoiceMode(!isVoiceMode)} className={`absolute right-2 top-1/2 transform -translate-y-1/2 ${isVoiceMode ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'} `} title={isVoiceMode ? 'Voice mode enabled' : 'Enable voice mode'}>🔊</button>
                  </div>
                  {isVoiceMode && (
                    <select
                      value={voiceGender}
                      onChange={(e) => setVoiceGender(e.target.value as 'male' | 'female')}
                      className="px-2 py-2 border rounded text-black"
                    >
                      <option value="male">♂️ Male</option>
                      <option value="female">♀️ Female</option>
                    </select>
                  )}
                  <button onClick={sendMessage} disabled={isUploadingMessageMedia} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed">{isUploadingMessageMedia ? '⏳' : '➤'}</button>
                </div>
                <div className="mt-2">
                  <div className="flex items-center space-x-2">
                  <button onClick={openFile} disabled={isUploadingMessageMedia} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{isUploadingMessageMedia ? '⏳ Uploading...' : '📎'}</button>

                    {messageSelectedFileName && <div className="text-sm text-gray-500">{isUploadingMessageMedia ? 'Uploading: ' : 'Selected: '}{messageSelectedFileName}</div>}
                  </div>
                  {messageMediaUrl && (
                    <div className="mt-2">
                      {messageMediaType === 'image' || messageMediaUrl.startsWith('data:image') ? (
                        <img src={resolveMediaUrl(messageMediaUrl)} alt="preview" className="max-h-40" />
                      ) : (
                        <video src={resolveMediaUrl(messageMediaUrl)} controls className="max-h-40" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'status' && (
        <div  >
          <button
            onClick={() => setStatusFormOpen(!statusFormOpen)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-2xl hover:bg-blue-700 transition"
            title="Create status"
          >
            +
          </button>

          {statusFormOpen && (
          <div className="mt-2 border rounded p-2 bg-white">
            <div className="relative">
              <textarea value={statusContent} onChange={(e) => setStatusContent(e.target.value)} placeholder="What's happening?" className="w-full p-2 border rounded text-black pr-10" />
              {statusContent.trim() && (
                <button onClick={() => setStatusContent('')} className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600">🗑️</button>
              )}
            </div>

            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Attach photo or video (optional)</label>
              <input id="status-file" type="file" accept="image/*,video/*" onChange={handleFileChange} className="hidden" disabled={isUploadingStatusMedia} />
              <label htmlFor="status-file" className={`inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded ${isUploadingStatusMedia ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploadingStatusMedia ? '⏳ Uploading...' : 'Choose file'}</label>
              {selectedFileName && <div className="text-sm text-gray-500 mt-2">{isUploadingStatusMedia ? 'Uploading: ' : 'Selected: '}{selectedFileName}</div>}
              {statusMediaUrl && (
                <div className="mt-2">
                  {statusMediaType === 'image' || statusMediaUrl.startsWith('data:image') ? (
                    <img src={statusMediaUrl} alt="preview" className="max-h-40" />
                  ) : (
                    <video src={statusMediaUrl} controls className="max-h-40" />
                  )}
                </div>
              )}
            </div>

            <div className="mt-2">
              <button onClick={createStatus} className="px-3 py-1 bg-green-600 text-white rounded">Post</button>
              <button onClick={() => { setStatusContent(''); setStatusMediaUrl(''); setStatusMediaType(''); setSelectedFileName(''); }} className="ml-2 px-3 py-1 bg-gray-200 rounded text-black">Clear</button>
            </div>
          </div>
          )}

          <h3 className="mt-4 font-semibold">Your spacial</h3>
          {statuses.length === 0 && <div className="text-sm text-gray-500">No special for you</div>}
          {statuses.filter(s => String(s.userId) === myId).map((s) => {
            const id = s._id || s.id;
            const username = usernameFor(s.userId || s.userId);
            return (
              <div key={String(id)} onClick={() => handleSelectStatus(s)} className="mt-1 p-1 border rounded bg-green-400 text-black relative cursor-pointer">
                <div className="font-medium text-black">{username}</div>
                <div className="text-sm text-black">{s.content}</div>
                {s.views ? (
                  <div className="absolute top-0 right-10 mt-2 mr-2 bg-white bg-opacity-75 text-black text-xs px-2 py-0.5 rounded">{s.views} views</div>
                ) : null}
                {s.mediaUrl && (
                  <div className="mt-2">
                    {(s.mediaType === 'image' || String(s.mediaUrl).startsWith('data:image') || String(s.mediaUrl).match(/\.(png|jpe?g|gif|webp)(\?|$)/i)) ? (
                      <img src={resolveMediaUrl(s.mediaUrl)} alt="media" className="h-48 w-full object-cover" />
                    ) : (
                      <video src={resolveMediaUrl(s.mediaUrl)} controls className="h-48 w-full object-cover" />
                    )}
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <button onClick={() => setMenuOpen(menuOpen === String(id) ? null : String(id))} className="px-2 py-1 text-gray-500 hover:text-gray-700 bg-red-200 bg-opacity-75 rounded">⋮</button>
                  {menuOpen === String(id) && (
                    <div className="absolute right-0 mt-1 w-30 bg-green-400 border rounded shadow z-10">
                      <button onClick={() => {
                        const uid = s.userId || s.userId;
                        const u = nearbyUsers.find((x) => String(x.id) === String(uid) || String(x._id) === String(uid));
                        if (u) openPrivateChat(u);
                        else setMsg('User info not available to start chat');
                        setMenuOpen(null);
                      }} className="block w-full text-left px-3 py-2 text-black hover:bg-grey-100">Message</button>
                      {String(s.userId) === myId && (
                        <button onClick={async () => {
                          if (!confirm('Delete this status?')) return;
                          try {
                            await api.delete(`/status/${s._id || s.id}`);
                            setStatuses(prev => prev.filter(x => String(x._id || x.id) !== String(s._id || s.id)));
                            setMsg('Status deleted');
                          } catch (err: any) {
                            setMsg(err?.response?.data?.message || 'Failed to delete status');
                          }
                          setMenuOpen(null);
                        }} className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600">Delete</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400">{new Date(s.createdAt || s.createdAt).toLocaleString()}</div>
              </div>
            );
          })}
          <h3 className="mt-4 font-semibold">Nearby special</h3>
          <div className="mt-2 flex space-x-2 overflow-x-auto">
            {statuses.filter(s => String(s.userId) !== String(me?.id)).map((s) => {
              const id = s._id || s.id;
              const username = usernameFor(s.userId || s.userId);
              const isSelected = String(selectedStatusId) === String(id);
              return (
                <div key={String(id)} className="flex flex-col items-center flex-shrink-0 group cursor-pointer" onClick={() => handleSelectStatus(s)}>
                  <div className={`w-35 h-35 border rounded-full flex items-center justify-center p-2 bg-green-400 text-black overflow-hidden relative transition-all ${isSelected ? 'ring-4 ring-blue-600' : ''}`}>
                    {s.mediaUrl && (
                      <div>
                        {(s.mediaType === 'image' || String(s.mediaUrl).startsWith('data:image') || String(s.mediaUrl).match(/\.(png|jpe?g|gif|webp)(\?|$)/i)) ? (
                          <img src={resolveMediaUrl(s.mediaUrl)} alt="media" className="w-24 h-24 rounded-full object-cover " />
                        ) : (
                          <video src={resolveMediaUrl(s.mediaUrl)} className="w-24 h-24 rounded-full object-cover " />
                        )}
                      </div>
                    )}
                    <div className="absolute top-1 right-1 group-hover:top-2 group-hover:right-2">
                      <button onClick={() => setMenuOpen(menuOpen === String(id) ? null : String(id))} className="px-1 py-0.5 text-gray-500 hover:text-gray-700 text-xs">⋮</button>
                      {menuOpen === String(id) && (
                        <div className="absolute right-0 mt-1 w-24 bg-white border rounded shadow z-10 text-xs">
                          <button onClick={() => {
                            const uid = s.userId || s.userId;
                            const u = nearbyUsers.find((x) => String(x.id) === String(uid) || String(x._id) === String(uid));
                            if (u) openPrivateChat(u);
                            else setMsg('User info not available to start chat');
                            setMenuOpen(null);
                          }} className="block w-full text-left px-2 py-1 text-black hover:bg-grey-100">Message</button>
                          {String(s.userId) === myId && (
                            <button onClick={async () => {
                              if (!confirm('Delete this status?')) return;
                              try {
                                await api.delete(`/status/${s._id || s.id}`);
                                setStatuses(prev => prev.filter(x => String(x._id || x.id) !== String(s._id || s.id)));
                                setMsg('Status deleted');
                              } catch (err: any) {
                                setMsg(err?.response?.data?.message || 'Failed to delete status');
                              }
                              setMenuOpen(null);
                            }} className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-red-600">Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="font-medium text-center text-xs mt-1 text-white">{username}</div>
                  <div className="text-xs text-gray-400 text-center">{new Date(s.createdAt || s.createdAt).toLocaleString()}</div>
                </div>
              );
            })}
          </div>

          {selectedStatusId && (
            <div className="mt-6 p-4 border-2 border-blue-600 rounded-lg bg-white">
              {(() => {
                const selectedStatus = statuses.find(s => String(s._id || s.id) === String(selectedStatusId));
                if (!selectedStatus) return null;
                const username = usernameFor(selectedStatus.userId || selectedStatus.userId);
                return (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <h4 className="font-semibold text-black text-lg">{username}</h4>
                        <p className="text-xs text-gray-500">{new Date(selectedStatus.createdAt || selectedStatus.createdAt).toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => setSelectedStatusId(null)}
                        className="px-2 py-1 bg-gray-300 rounded hover:bg-gray-400 text-black"
                      >
                        ✕
                      </button>
                    </div>
                    {String(selectedStatus.userId) === myId && (
                      <div className="flex items-center justify-between gap-4 relative">
                        <div className="text-sm text-gray-600">Views: <span className="font-medium text-black">{selectedStatus.views || 0}</span></div>
                        <div className="relative">
                          <button
                            onClick={() => setShowViewerDropdown((v) => !v)}
                            className="text-sm text-gray-600 px-2 py-1 bg-grey-100 rounded"
                          >
                            Seen by ▾
                          </button>
                          {showViewerDropdown && (
                            <div className="absolute right-0 mt-2 w-56 max-h-60 overflow-auto bg-black border rounded shadow z-50">
                              {(selectedStatus.viewers || []).length === 0 ? (
                                <div className="p-2 text-sm text-gray-500">No views yet</div>
                              ) : (
                                (selectedStatus.viewers || []).map((v: any) => (
                                  <div key={String(v._id || v.id || v.username || v.name)} className="px-3 py-2 text-sm border-b last:border-b-0">
                                    {v.username || v.name}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedStatus.mediaUrl && (
                      <div className="mt-3">
                        {(selectedStatus.mediaType === 'image' || String(selectedStatus.mediaUrl).startsWith('data:image') || String(selectedStatus.mediaUrl).match(/\.(png|jpe?g|gif|webp)(\?|$)/i)) ? (
                          <img src={resolveMediaUrl(selectedStatus.mediaUrl)} alt="media" className="w-full h-96 object-cover rounded" />
                        ) : (
                          <video src={resolveMediaUrl(selectedStatus.mediaUrl)} controls className="w-full h-96 object-cover rounded" />
                        )}
                      </div>
                    )}
                    <p className="text-sm text-black mt-3">{selectedStatus.content}</p>
                    <button
                      onClick={() => {
                        const uid = selectedStatus.userId || selectedStatus.userId;
                        const u = nearbyUsers.find((x) => String(x.id) === String(uid) || String(x._id) === String(uid));
                        if (u) openPrivateChat(u);
                        else setMsg('User info not available to start chat');
                      }}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full"
                    >
                      Message
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {mode === 'private' && (
        <div>
          <h2 className="text-lg font-semibold">Private chat</h2>
          <div className="mt-2 flex space-x-2">
            <input value={privateSearch} onChange={(e) => setPrivateSearch(e.target.value)} placeholder="Search username" className="flex-1 p-2 border rounded text-black" />
            <button onClick={searchUsers} className="px-3 py-1 bg-gray-200 rounded text-black">Search</button>
          </div>

          {recentChats.length > 0 && (
            <div className="mt-2">
              <h4 className="font-semibold">Recent chats</h4>
              <ul className="mt-1 space-y-1">
                {recentChats.map((u: any) => (
                  <li key={u._id || u.id} className="p-2 border rounded flex justify-between items-center text-black">
                    <div>
                      <div className="font-medium text-black">{u.username}</div>
                      <div className="text-sm text-black">{u.name} • {u.isOnline ? 'Online' : 'Offline'}</div>
                    </div>
                    <div className="space-x-2">
                      <button onClick={() => openPrivateChat(u)} className="px-3 py-1 bg-blue-600 text-white rounded">Chat</button>
                      <button onClick={() => deleteFromRecentChats(u)} className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">×</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-2 space-y-2">
            {searchResults.map((u) => (
              <li key={u._id} className="p-2 border rounded flex justify-between items-center text-black">
                <div>
                  <div className="font-medium text-black">{u.username}</div>
                  <div className="text-sm text-black">{u.name} • {u.isOnline ? 'Online' : 'Offline'}</div>
                </div>
                <div className="space-x-2">
                  <button onClick={() => openPrivateChat(u)} className="px-3 py-1 bg-blue-600 text-white rounded">Chat</button>
                  <button onClick={() => deleteFromSearchResults(u)} className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">×</button>
                </div>
              </li>
            ))}
          </ul>

          {activePrivateUser && (
            <div className="mt-4">
              <h3 className="font-semibold">Chat with: {activePrivateUser.username}</h3>

              <div
                className="h-96 overflow-auto hide-scrollbar border rounded p-2 mt-2 bg-white text-black"
                style={currentChatWallpaper || wallpaperUrl ? { backgroundImage: `url(${currentChatWallpaper || wallpaperUrl})`, backgroundSize: 'cover' } : undefined}
              >
                {messages.length === 0 && <div className="text-sm text-gray-500">No messages yet — say hi</div>}
                {messages.map((m) => {
                  const isMe = m.senderId === 'me' || (m.sender && String(m.sender.id) === String(me?.id));
                  const senderName = isMe ? 'You' : (m.sender?.username || m.senderId);
                  return (
                    <div key={m.id} className={`mb-2 ${isMe ? 'text-right' : ''} text-black`}>
                      <div className="text-sm text-black"><strong>{senderName}</strong></div>
                      <div className="text-md" style={{ color: textColor, fontSize: getFontSize(textSize) }}>
                        {m.voiceUrl ? (
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">🎵 Voice message</span>
                            <audio controls className="max-w-xs">
                              <source src={resolveMediaUrl(m.voiceUrl)} type="audio/mpeg" />
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        ) : m.mediaUrl ? (
                          (m.mediaType === 'image' || String(m.mediaUrl).startsWith('data:image') || String(m.mediaUrl).match(/\.(png|jpe?g|gif|webp)(\?|$)/i)) ? (
                            <img src={resolveMediaUrl(m.mediaUrl)} alt="media" className="max-h-40 mx-auto" />
                          ) : (
                            <video src={resolveMediaUrl(m.mediaUrl)} controls className="max-h-40 mx-auto" />
                          )
                        ) : (
                          m.message
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleTimeString()} {m.status ? ` • ${m.status}` : ''}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  {/* <button
                    onClick={() => setIsVoiceMode(!isVoiceMode)}
                    className={`px-3 py-2 rounded ${isVoiceMode ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'}`}
                    title={isVoiceMode ? 'Voice mode enabled' : 'Enable voice mode'}
                  >
                    🎤
                  </button> */}
                  <div className="relative flex-1">
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" className="w-full p-2 pr-10 border rounded text-black" />
                    {/* <button type="button" onClick={speakText} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800">🔊</button> */}
                    <button  onClick={() => setIsVoiceMode(!isVoiceMode)} className={`absolute right-2 top-1/2 transform -translate-y-1/2 ${isVoiceMode ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'} `} title={isVoiceMode ? 'Voice mode enabled' : 'Enable voice mode'}>🔊</button>
                  {/* <button
                    onClick={() => setIsVoiceMode(!isVoiceMode)}
                    className={`px-3 py-2  rounded ${isVoiceMode ? 'bg-green-600 text-white' : 'bg-gray-200 text-black'}`}
                    title={isVoiceMode ? 'Voice mode enabled' : 'Enable voice mode'}
                  >
                    🎤
                  </button> */}
                  </div>
                  {isVoiceMode && (
                    <select
                      value={voiceGender}
                      onChange={(e) => setVoiceGender(e.target.value as 'male' | 'female')}
                      className="px-2 py-2 border rounded text-black"
                    >
                      <option value="male">♂️ Male</option>
                      <option value="female">♀️ Female</option>
                    </select>
                  )}
                  <button onClick={openFile} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">📎</button>
                  <button onClick={sendMessage} className="px-4 py-2 bg-blue-600 text-white rounded">➤</button>
                </div>

                {messageSelectedFileName && <div className="text-sm text-gray-500 mt-2">Selected: {messageSelectedFileName}</div>}
                {messageMediaUrl && (
                  <div className="mt-2">
                    {messageMediaType === 'image' || messageMediaUrl.startsWith('data:image') ? (
                      <img src={resolveMediaUrl(messageMediaUrl)} alt="preview" className="max-h-40" />
                    ) : (
                      <video src={resolveMediaUrl(messageMediaUrl)} controls className="max-h-40" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'posts' && (
        <div>
          <h2 className="text-lg font-semibold">Posts</h2>

          <div className="mt-2 flex gap-2">
            <button onClick={() => setPostContent(postContent ? '' : ' ')} className="px-3 py-1 bg-blue-600 text-white rounded">
              +
            </button>
            <button onClick={() => setPostSearchOpen(!postSearchOpen)} className="px-3 py-1 bg-green-600 text-white rounded">
              🔍
            </button>
            <button
              onClick={() => {
                viewOwnPosts();
                if (!viewingOwnPosts) {
                  setShowFollowersFollowingDropdown(true);
                  loadFollowersAndFollowing();
                } else {
                  setShowFollowersFollowingDropdown(false);
                }
              }}
              className={`px-3 py-1 rounded ${viewingOwnPosts ? 'bg-purple-600 text-white' : 'bg-gray-300'}`}
            >
              👁️
            </button>
            {timeInfo?.isInEntryWindow && (
              <button
                onClick={handleEnterNightMode}
                disabled={enteringNightMode}
                className="text-2xl hover:scale-110 transition-transform cursor-pointer disabled:opacity-50 animate-pulse"
                title="Enter Night Mode"
              >
                🌙
              </button>
            )}
          </div>

          {postSearchOpen && (
            <div className="mt-3 p-3 border rounded bg-black-500">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={postSearchQuery}
                  onChange={(e) => setPostSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchUserPosts()}
                  placeholder="Enter username..."
                  className="flex-1 p-2 border rounded text-sm text-black"
                />
                <button
                  onClick={searchUserPosts}
                  disabled={postIsSearching}
                  className="bg-blue-500 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
                >
                  {postIsSearching ? 'Searching...' : 'Search'}
                </button>
                {selectedPostUsername && (
                  <button
                    onClick={() => {
                      clearPostSearch();
                      setPostSearchOpen(false);
                    }}
                    className="bg-gray-400 text-white px-2 py-2 rounded text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {showFollowersFollowingDropdown && viewingOwnPosts && !selectedFollowersList && (
            <div className="mt-3 p-4 border rounded bg-gray-900 shadow-lg">
              <div className="flex gap-8">
                {/* Followers Section */}
                <div className="flex-1">
                  <h3 
                    onClick={() => setSelectedFollowersList('followers')}
                    className="font-semibold text-white cursor-pointer hover:text-blue-400 transition text-lg"
                  >
                    👥 Followers ({followers.length})
                  </h3>
                </div>

                {/* Following Section */}
                <div className="flex-1">
                  <h3 
                    onClick={() => setSelectedFollowersList('following')}
                    className="font-semibold text-white cursor-pointer hover:text-green-400 transition text-lg"
                  >
                    👉 Following ({following.length})
                  </h3>
                </div>
              </div>
            </div>
          )}

          {showFollowersFollowingDropdown && viewingOwnPosts && selectedFollowersList === 'followers' && (
            <div className="mt-3 p-4 border rounded bg-gray-900 shadow-lg max-h-80 overflow-y-auto">
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => setSelectedFollowersList(null)}
                  className="text-white hover:text-gray-300 transition"
                >
                  ← Back
                </button>
                <h3 className="font-semibold text-white">All Followers ({followers.length})</h3>
              </div>
              {followers.length === 0 ? (
                <div className="text-gray-400 text-sm">No followers yet</div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {followers.map((user: any) => (
                    <div key={user._id} className="flex items-center justify-between bg-gray-800 p-2 rounded text-sm hover:bg-gray-700 transition">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                          {user.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="text-white font-medium">{user.username}</div>
                          <div className="text-gray-400 text-xs">{user.isOnline ? '🟢 Online' : '⚫ Offline'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showFollowersFollowingDropdown && viewingOwnPosts && selectedFollowersList === 'following' && (
            <div className="mt-3 p-4 border rounded bg-gray-900 shadow-lg max-h-80 overflow-y-auto">
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => setSelectedFollowersList(null)}
                  className="text-white hover:text-gray-300 transition"
                >
                  ← Back
                </button>
                <h3 className="font-semibold text-white">All Following ({following.length})</h3>
              </div>
              {following.length === 0 ? (
                <div className="text-gray-400 text-sm">Not following anyone yet</div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {following.map((user: any) => (
                    <div key={user._id} className="flex items-center justify-between bg-gray-800 p-2 rounded text-sm hover:bg-gray-700 transition">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold">
                          {user.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="text-white font-medium">{user.username}</div>
                          <div className="text-gray-400 text-xs">{user.isOnline ? '🟢 Online' : '⚫ Offline'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            {postContent && (
              <div className="mt-2 border rounded p-2 bg-gray-100">
                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="What's on your mind?"
                  className="w-full p-2 border rounded text-black"
                  rows={3}
                />
                <div className="mt-2">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handlePostImageChange}
                    className="hidden"
                    id="post-image"
                  />
                  <label htmlFor="post-image" className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded cursor-pointer">
                    Choose file
                  </label>
                  {postImage && <div className="text-sm text-gray-500 mt-2">Selected: {postImage.name}</div>}
                </div>
                <div className="mt-2">
                  <label className="block text-sm font-medium mb-1 text-black">Attach song </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {publicSongs.map((name) => {
                      const songUrl = `/${encodeURIComponent(name)}`;
                      return (
                        <SongSelector
                          key={name}
                          songUrl={songUrl}
                          songName={name}
                          isSelected={postSong === songUrl}
                          onSelect={() => setPostSong(songUrl)}
                          postImage={postImage}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center text-sm text-gray-700">
                      <input type="checkbox" checked={postAnonymous} onChange={(e) => setPostAnonymous(e.target.checked)} className="mr-2" />
                      Post anonymously
                    </label>

                    <span className="ml-2">{postAnonymous ? '⚠️' : me?.username}</span>
                    <button onClick={createPost} disabled={postLoading} className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50">
                    {postLoading ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                  <button onClick={() => { setPostContent(''); setPostImage(null); setPostSong(''); }} className="ml-2 px-3 py-1 bg-gray-200 rounded text-black">
                    Clear
                  </button>
                </div>
              </div>
            )}

          <div className="mt-4 space-y-4">
            {selectedPostUsername && (
              <div className="p-3 bg-blue-50 border  text-black border-blue-200 rounded text-sm">
                <strong>Posts by @{selectedPostUsername}</strong>
                {postSearchResults.length === 0 && <p className="text-gray-600 mt-1">No posts found</p>}
              </div>
            )}

            {viewingOwnPosts && (
              <div className="p-3 bg-purple-50 border text-black border-purple-200 rounded text-sm">
                <strong>My Posts</strong>
                {posts.filter((post: any) => {
                  const postUserId = post.user?._id || post.user?.id || post.userId;
                  return String(postUserId) === String(me?.id);
                }).length === 0 && (
                  <p className="text-gray-600 mt-1">You haven't posted yet</p>
                )}
              </div>
            )}

            {filteredPosts.map((post: any) => {
              const isAnonymousPost = (post as any).anonymous === true || (post as any).anonymous === 'true';
              const postUserId = String(post.user?._id || post.user?.id || '');
              const showFollowButton = !isAnonymousPost && postUserId && postUserId !== 'undefined' && postUserId !== String(me?.id);
              console.log('Rendering post:', { id: post._id, hasSongUrl: !!post.songUrl, songUrl: post.songUrl, createdAt: post.createdAt, postUserId, showFollowButton });
              return (
                <div
                  key={post._id}
                  //  className="border rounded-lg p-4 bg-white relative"
                   className="border rounded-lg p-4 bg-black relative"
                  onMouseEnter={() => handlePostHover(post, true)}
                  onMouseLeave={() => handlePostHover(post, false)}
                >
                  
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {/* <div className="font-semibold text-blue-500"><h1>{post.user?.name || 'Unknown'} ---------</h1></div> */}
                    <div className='flex  gap-2'>
                      {isAnonymousPost ? (
                        <span className='text-red-600 font-semibold'>⚠️ Anonymous</span>
                      ) : (
                        <h1 className='text-blue-500 cursor-pointer hover:underline' onClick={() => window.location.pathname = `/profile/${post.user?._id || post.user?.id}`}>
                          ~~(@{post.user?.username || 'unknown'})
                        </h1>
                      )}
                      {/* <h2 className="text-sm text-gray-500 py-1" >{post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'No date'}</h2> */}
                      {showFollowButton && (
                        <button 
                          onClick={() => toggleFollowUser(postUserId)}
                          disabled={loadingFollows[postUserId]}
                          className={`px-2 py-1 rounded text-white transition ${
                            followedUsers.has(postUserId) 
                              ? 'bg-red-500 hover:bg-red-600' 
                              : 'bg-blue-500 hover:bg-blue-600'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {loadingFollows[postUserId] ? '...' : (
                            followedUsers.has(postUserId) ? 'Unfollow' : 'Follow'
                          )}
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'No date'}</div>
                    <p className="mt-0 text-black">{post.content}</p>
                  </div>
                  <div className="flex items-center gap-2 relative z-20">
                    {post.songUrl && (
                      <button
                        onClick={() => togglePostMute(post._id || post.id)}
                        className="px-2 py-1 text-gray-500 hover:text-gray-700 z-20 relative"
                        title={postMuted[post._id || post.id] ? 'Unmute' : 'Mute'}
                      >
                        {postMuted[post._id || post.id] ? '🔇' : '🔊'}
                      </button>
                    )}
                    <button onClick={() => setMenuOpen(menuOpen === post._id ? null : post._id)} className="px-2 py-1 text-gray-500 hover:text-gray-700 z-20 relative">⋮</button>
                    {menuOpen === post._id && (
                      <div className="absolute right-0 mt-1 w-32 bg-white border rounded shadow z-10">
                        {String(post.user?._id || post.user?.id) === String(myId) ? (
                          <button onClick={() => {
                            deletePost(post._id);
                            setMenuOpen(null);
                          }} className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600">
                            Delete
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                openReportDialog({
                                  type: 'post',
                                  postId: String(post._id || post.id),
                                  userId: String(post.user?._id || post.user?.id || ''),
                                  username: String(post.user?.username || ''),
                                });
                                setMenuOpen(null);
                              }}
                              className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-red-700"
                            >
                              Report Post
                            </button>
                            {!isAnonymousPost && String(post.user?._id || post.user?.id || '') && (
                              <button
                                onClick={() => {
                                  openReportDialog({
                                    type: 'user',
                                    userId: String(post.user?._id || post.user?.id),
                                    username: String(post.user?.username || ''),
                                  });
                                  setMenuOpen(null);
                                }}
                                className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-red-700"
                              >
                                Report User
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {post.imageUrl && (
                  <div className="mt-2 shadow-lg rounded-lg overflow-hidden relative">
                    {(() => {
                      const pid = String(post._id || post.id || '');
                      const baseUrl = resolveMediaUrl(post.imageUrl);
                      const retry = postMediaRetry[pid];
                      const src = retry
                        ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${retry}`
                        : baseUrl;
                      const isVideo = src.match(/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i);

                      return isVideo ? (
                        <video
                          src={src}
                          controls
                          className="w-full h-auto max-h-[60vh] object-contain"
                          onError={() => {
                            if (!retry) setPostMediaRetry((prev) => ({ ...prev, [pid]: Date.now() }));
                          }}
                        />
                      ) : (
                        <img
                          src={src}
                          alt="Post"
                          className="w-full h-auto max-h-[60vh] object-contain"
                          onError={() => {
                            if (!retry) setPostMediaRetry((prev) => ({ ...prev, [pid]: Date.now() }));
                          }}
                        />
                      );
                    })()}
                    <button
                      onClick={() => {
                        setShowComments(prev => ({ ...prev, [post._id]: !prev[post._id] }));
                      }}
                      className="absolute bottom-2 right-2 text-white text-2xl bg-green-500 bg-opacity-75 rounded-full p-1 border border-white z-10 shadow-xl cursor-pointer hover:bg-opacity-90"
                      title="View/Add comments"
                    >
                      💬
                    </button>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 flex-nowrap overflow-x-auto bg-black">
                  {(() => {
                    const userEmoji = post.userReactions?.[me?.id];
                    const hasReacted = !!userEmoji;
                    
                    return (
                      <>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button 
                            onClick={() => handleEmojiReaction(post._id, '😍')} 
                            disabled={hasReacted && userEmoji !== '😍'}
                            className={`px-2 py-1 rounded text-2xl transition ${
                              userEmoji === '😍' ? 'bg-red-200' : 'hover:bg-red-100'
                            } ${hasReacted && userEmoji !== '😍' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            😍
                          </button>
                          <div className=" rounded px-1 py-1 min-w-[10px] text-center text-lg font-semibold flex-shrink-0">
                            {post.reactions?.['😍'] || 0}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button 
                            onClick={() => handleEmojiReaction(post._id, '😂')} 
                            disabled={hasReacted && userEmoji !== '😂'}
                            className={`px-2 py-1 rounded text-2xl transition ${
                              userEmoji === '😂' ? 'bg-yellow-200' : 'hover:bg-yellow-100'
                            } ${hasReacted && userEmoji !== '😂' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            😂
                          </button>
                          <div className=" rounded px-2 py-1 min-w-[10px] text-center text-xl font-semibold flex-shrink-0">
                            {post.reactions?.['😂'] || 0}
                          </div>
                        </div>
                        {/* <div className="flex items-center gap-1 flex-shrink-0">
                          <button 
                            onClick={() => handleEmojiReaction(post._id, '😐')} 
                            disabled={hasReacted && userEmoji !== '😐'}
                            className={`px-2 py-1 rounded text-2xl transition ${
                              userEmoji === '😐' ? 'bg-blue-200' : 'hover:bg-blue-100'
                            } ${hasReacted && userEmoji !== '😐' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            😐
                          </button>
                          <div className="bg-gray-200 rounded px-2 py-1 min-w-[30px] text-center text-sm font-semibold flex-shrink-0">
                            {post.reactions?.['😐'] || 0}
                          </div>
                        </div> */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button 
                            onClick={() => handleEmojiReaction(post._id, '😢')} 
                            disabled={hasReacted && userEmoji !== '😢'}
                            className={`px-2 py-1 rounded text-2xl transition ${
                              userEmoji === '😢' ? 'bg-blue-300' : 'hover:bg-blue-200'
                            } ${hasReacted && userEmoji !== '😢' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            😢
                          </button>
                          <div className=" rounded px-2 py-1 min-w-[10px] text-center text-xl font-semibold flex-shrink-0">
                            {post.reactions?.['😢'] || 0}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button 
                            onClick={() => handleEmojiReaction(post._id, '😠')} 
                            disabled={hasReacted && userEmoji !== '😠'}
                            className={`px-2 py-1 rounded text-2xl transition ${
                              userEmoji === '😠' ? 'bg-red-300' : 'hover:bg-red-200'
                            } ${hasReacted && userEmoji !== '😠' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            😠
                          </button>
                          <div className=" rounded px-2 py-1 min-w-[10px] text-center text-xl font-semibold flex-shrink-0">
                            {post.reactions?.['😠'] || 0}
                          </div>
                        </div>
                        
                      </>
                    );
                  })()}
                </div>

                {showComments[post._id] && (
                  <div className="mt-4 pt-4 border-t border-gray-200 bg-gray-50 rounded p-3">
                    <h4 className="font-semibold text-black mb-3">Comments ({post.comments?.length || 0})</h4>
                    
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                      {!post.comments || post.comments.length === 0 ? (
                        <p className="text-gray-400 text-sm">No comments yet</p>
                      ) : (
                        post.comments.map((comment: any, idx: number) => (
                          <div key={idx} className="bg-white rounded p-2 text-sm">
                            <div className="flex gap-2">
                              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-gray-600 font-semibold text-xs">
                                  {(comment.user?.name || 'U').charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-xs text-black">
                                  {comment.user?.name}
                                  <span className="text-gray-500 font-normal ml-1">@{comment.user?.username}</span>
                                </p>
                                <p className="text-gray-700 text-xs break-words">{comment.content}</p>
                                <p className="text-gray-400 text-xs mt-1">
                                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Comment input */}
                    <div className="flex gap-2 border-t pt-3">
                      <input
                        type="text"
                        value={commentText[post._id] || ''}
                        onChange={(e) => setCommentText(prev => ({ ...prev, [post._id]: e.target.value }))}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddComment(post._id)}
                        placeholder="Write a comment..."
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs text-black placeholder-gray-400 focus:outline-none focus:border-blue-500"
                        disabled={submittingComment[post._id] || false}
                      />
                      <button
                        onClick={() => handleAddComment(post._id)}
                        disabled={submittingComment[post._id] || !commentText[post._id]?.trim()}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {submittingComment[post._id] ? '...' : 'Post'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'random' && (
        <div>
          <h2 className="text-lg font-semibold">Random Chat 🕵️‍♂️</h2>
          <p className="text-sm text-gray-600 mt-2">Meet random online users nearby and start a conversation!</p>

          {!currentRandomUser && (
            <div className="mt-4 p-6 border rounded bg-gradient-to-r from-blue-50 to-purple-50 text-center">
              <p className="text-gray-700 mb-4">Ready to meet someone new?</p>
              <button
                onClick={startRandomChat}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition text-lg font-semibold"
              >
                🎲 Get Random User
              </button>
            </div>
          )}

          {currentRandomUser && (
            <div className="mt-4 p-6 border-2 border-purple-400 rounded-lg bg-white">
              <div className="flex flex-col items-center">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white text-5xl font-bold mb-4">
                  {(currentRandomUser.name || currentRandomUser.username || 'U').charAt(0).toUpperCase()}
                </div>
                
                <div className="text-center mb-4">
                  <h3 className="text-2xl font-bold text-black">{currentRandomUser.name || currentRandomUser.username}</h3>
                  <p className="text-sm text-gray-600 mt-1">@{currentRandomUser.username}</p>
                  
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-sm font-medium text-green-600">Online Now</span>
                  </div>
                </div>

                <div className="w-full bg-gray-100 rounded p-3 mb-4 text-center">
                  <p className="text-sm text-gray-700">
                    {currentRandomUser.about || 'No bio provided yet'}
                  </p>
                </div>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={skipRandomUser}
                    className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-semibold"
                  >
                    ⏭️ Skip
                  </button>
                  <button
                    onClick={chatWithRandomUser}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:opacity-90 transition font-semibold"
                  >
                    ✨ Chat Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {nearbyUsers.filter(u => u.isOnline).length === 0 && (
            <div className="mt-4 p-4 border rounded bg-yellow-50 text-center">
              <p className="text-yellow-800">No online users available right now. Try again later! 😴</p>
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <h4 className="font-semibold text-blue-900 mb-2">How it works:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✨ Click "Get Random User" to meet someone new</li>
              <li>👀 See their profile information</li>
              <li>⏭️ Skip to meet another user if not interested</li>
              <li>💬 Start chatting with users you like!</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
