import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { formatDistanceToNow } from "date-fns";
import api, { getUploadBaseURL, uploadFile, requestAccountDeletion, deleteAccount as apiDeleteAccount, requestUsernameChange, changeUsername as apiChangeUsername, resolveMediaUrl } from '../services/api';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import NotificationPanel from '../components/NotificationPanel';
import NightInterface from '../components/NightInterface';
import ActiveIcon from '../components/ActiveIcon';
import { getTimeUntilNightMode, enterNightMode } from '../services/api';
import {
  decryptFromGroup,
  decryptFromPeer,
  encryptForGroup,
  encryptForPeer,
  E2EEGroupMembersMissingKeysError,
  E2EEPeerKeyChangedError,
  E2EEPeerMissingKeyError,
  getPeerE2EEPublicKey,
  registerMyE2EEPublicKey,
} from '../services/e2ee';

function AutoPlayOnScreenVideo({
  className,
  onClick,
  onError,
  src,
}: {
  className?: string;
  onClick?: React.MouseEventHandler<HTMLVideoElement>;
  onError?: React.ReactEventHandler<HTMLVideoElement>;
  src: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.7 }
    );

    observer.observe(videoElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isVisible) {
      videoElement.play().catch(() => {
        // Browser autoplay can still reject in some cases.
      });
      return;
    }

    videoElement.pause();
  }, [isVisible]);

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      autoPlay
      muted
      playsInline
      preload="metadata"
      className={className}
      onClick={onClick}
      onError={onError}
    />
  );
}

export default function Message({ groupName }: { groupName?: string | null }) {
  const isNightMode = window.location.pathname === '/message/night';
  const isPrivateChatPage = window.location.pathname.startsWith('/message/chat');
  let me: any = null;
  try {
    me = JSON.parse(localStorage.getItem('user') || 'null');
  } catch (err) {
    me = null;
  }
  const myId = String(me?._id || me?.id || '');
  const [mode, setMode] = useState<'groups' | 'communities' | 'private' | 'status' | 'posts' | 'messages' | 'random'>('posts');
  const [showNotifications, setShowNotifications] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [myPublicGroups, setMyPublicGroups] = useState<any[]>([]);
  const [communityDirectory, setCommunityDirectory] = useState<any[]>([]);
  const [publicGroupSearch, setPublicGroupSearch] = useState('');
  const [publicGroupResults, setPublicGroupResults] = useState<any[]>([]);
  const [newPublicGroupName, setNewPublicGroupName] = useState('');
  const [newPublicGroupPurpose, setNewPublicGroupPurpose] = useState('');
  const [newPublicGroupProfilePicture, setNewPublicGroupProfilePicture] = useState('');
  const [isCreatingPublicGroup, setIsCreatingPublicGroup] = useState(false);
  const [isSearchingPublicGroups, setIsSearchingPublicGroups] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeGroup, setActiveGroup] = useState<any | null>(null);
  const [activeCommunity, setActiveCommunity] = useState<any | null>(null);
  const [activeCommunityDetails, setActiveCommunityDetails] = useState<any | null>(null);
  const [communityPosts, setCommunityPosts] = useState<any[]>([]);
  const [communityPostsLoading, setCommunityPostsLoading] = useState(false);
  const [communityPostContent, setCommunityPostContent] = useState('');
  const [communityPostImage, setCommunityPostImage] = useState<File | null>(null);
  const [communityPosting, setCommunityPosting] = useState(false);
  const [communityManageOpen, setCommunityManageOpen] = useState(false);
  const [communityManageName, setCommunityManageName] = useState('');
  const [communityManagePurpose, setCommunityManagePurpose] = useState('');
  const [communityManageProfilePicture, setCommunityManageProfilePicture] = useState('');
  const [communitySaving, setCommunitySaving] = useState(false);
  const [communityRemovingMemberId, setCommunityRemovingMemberId] = useState('');
  const [privateSearch, setPrivateSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activePrivateUser, setActivePrivateUser] = useState<any | null>(null);
  const activePrivateUserId = String(activePrivateUser?._id || activePrivateUser?.id || '');
  const [peerE2EEState, setPeerE2EEState] = useState<'unknown' | 'ready' | 'missing' | 'changed' | 'error'>('unknown');
  const [text, setText] = useState('');
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

  useEffect(() => {
    if (!myId) return;
    registerMyE2EEPublicKey(api).catch((e: any) => {
      console.warn('Failed to register E2EE key', e);
    });
  }, [myId]);

  useEffect(() => {
    if (!activePrivateUserId) {
      setPeerE2EEState('unknown');
      return;
    }

    let cancelled = false;
    let interval: any;

    const check = async () => {
      try {
        const peer = await getPeerE2EEPublicKey(api, activePrivateUserId);
        if (cancelled) return;
        if (peer) {
          setPeerE2EEState('ready');
          if (interval) clearInterval(interval);
        } else {
          setPeerE2EEState('missing');
        }
      } catch (e: any) {
        if (cancelled) return;
        if (e instanceof E2EEPeerKeyChangedError) {
          setPeerE2EEState('changed');
          if (interval) clearInterval(interval);
          return;
        }
        setPeerE2EEState('error');
      }
    };

    check();
    interval = setInterval(check, 5000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [activePrivateUserId]);

  const getUserKey = (u: any) => String(u?._id || u?.id || u?.userId || u?.username || '');

  const getGroupById = (groupId: any) => {
    const id = String(groupId || '');
    if (!id) return null;
    return (
      (groups || []).find((g) => String(g?.id) === id) ||
      null
    );
  };

  const visibleGroups = useMemo(() => groups || [], [groups]);

  const dedupeUsers = (list: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const u of list || []) {
      const k = getUserKey(u);
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(u);
    }
    return out;
  };

  const decryptGroupPayload = useCallback(async (payload: any) => {
    if (!payload?.e2ee?.ciphertext) return payload;

    try {
      const senderId = String(payload.senderId || payload.sender?.id || '');
      if (!senderId || !myId) return { ...payload, message: '[Encrypted message]' };
      const decrypted = await decryptFromGroup(api, String(payload.groupId || ''), senderId, myId, payload.e2ee);
      return { ...payload, message: decrypted };
    } catch (e) {
      console.error('Failed to decrypt group message:', e);
      return { ...payload, message: '[Encrypted message]' };
    }
  }, [myId]);

  const loadGroupMessages = useCallback(async (groupId: string) => {
    const res = await api.get(`/groups/${groupId}/messages`);
    const loadedMessages = res.data.messages || [];
    const decryptedMessages = await Promise.all(
      loadedMessages.map(async (msg: any) => decryptGroupPayload(msg))
    );
    setMessages(decryptedMessages);
  }, [decryptGroupPayload]);

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

  const pickRandomOnlineUser = (list: any[]) => {
    if (!list || list.length === 0) return null;

    const onlineUsers = list.filter((u) => u?.isOnline && String(u?._id || u?.id) !== String(me?.id));
    if (onlineUsers.length === 0) return null;

    const availableUsers = onlineUsers.filter((u) => !usedRandomUsers.has(String(u?._id || u?.id)));
    const usersToSelect = availableUsers.length > 0 ? availableUsers : onlineUsers;
    if (usersToSelect.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * usersToSelect.length);
    return usersToSelect[randomIndex];
  };

  const getRandomOnlineUser = () => pickRandomOnlineUser(randomUsers);

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

  const startRandomChat = async () => {
    try {
      const rres = await api.get(`/users/random`);
      const fresh = rres.data?.users || [];
      setRandomUsers(fresh);

      const randomUser = pickRandomOnlineUser(fresh);
      if (randomUser) {
        setCurrentRandomUser(randomUser);
        setUsedRandomUsers(new Set(usedRandomUsers));
        return;
      }

      setMsg('No online users available');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to load random users');
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
        // Try refreshing the random pool once before giving up.
        (async () => {
          try {
            const rres = await api.get(`/users/random`);
            const fresh = rres.data?.users || [];
            setRandomUsers(fresh);
            const picked = pickRandomOnlineUser(fresh);
            if (picked) {
              setCurrentRandomUser(picked);
              return;
            }
          } catch (err: any) {
            // ignore, we'll show the generic message below
          }
          setCurrentRandomUser(null);
          setMsg('No more online users available. Try again later!');
        })();
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
  const [myStreak, setMyStreak] = useState<number>(0);
  const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);
  const [randomUsers, setRandomUsers] = useState<any[]>([]);
  const [recentChats, setRecentChats] = useState<any[]>([]);

  const [msg, setMsg] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);

  // Close post three-dot menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  // Auto-clear msg after 5 seconds
  useEffect(() => {
    if (msg) {
      const timer = setTimeout(() => {
        setMsg('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [msg]);

  // handlers
  const sendDeleteOtp = async () => {
    try {
      setDeleteMsg('');
      await requestAccountDeletion();
      setDeleteMsg('OTP sent to your email');
    } catch (err: any) {
      setDeleteMsg(err?.response?.data?.message || err?.message || 'Error');
    }
  };

  const doDeleteAccount = async () => {
    try {
      setDeleteMsg('');
      await apiDeleteAccount(deleteForm.password, deleteForm.otp);
      // clear session and redirect
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      window.location.replace('/');
    } catch (err: any) {
      setDeleteMsg(err?.response?.data?.message || err?.message || 'Error');
    }
  };
  const wallpapers = ['wallpaper1.jpg', 'wallpaper2.jpg', 'wallpaper3.jpg', 'wallpaper4.jpg', 'wallpaper5.jpg', 'wallpaper6.jpg', 'wallpaper7.jpg', 'wallpaper8.jpg', 'wallpaper9.jpg', 'wallpaper10.jpg'];
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

  // account deletion dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: '', otp: '' });
  const [deleteMsg, setDeleteMsg] = useState('');

  // blocked users dialog state
  const [showBlockedUsersDialog, setShowBlockedUsersDialog] = useState(false);
  const [blockedUsersList, setBlockedUsersList] = useState<any[]>([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);
  const [blockedUsersError, setBlockedUsersError] = useState('');

  // username change dialog state
  const [showUsernameDialog, setShowUsernameDialog] = useState(false);
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '', otp: '' });
  const [usernameMsg, setUsernameMsg] = useState('');

  const [showTextColorPicker, setShowTextColorPicker] = useState(false);

  // handlers for username change
  const sendUsernameOtp = async () => {
    try {
      setUsernameMsg('');
      await requestUsernameChange(usernameForm.newUsername);
      setUsernameMsg('OTP sent to your email');
    } catch (err: any) {
      setUsernameMsg(err?.response?.data?.message || err?.message || 'Error');
    }
  };

  const doChangeUsername = async () => {
    try {
      setUsernameMsg('');
      await apiChangeUsername(usernameForm.password, usernameForm.otp);
      // clear local user info to avoid stale username
      const userObj = localStorage.getItem('user');
      if (userObj) {
        try {
          const u = JSON.parse(userObj);
          u.username = usernameForm.newUsername;
          localStorage.setItem('user', JSON.stringify(u));
        } catch { }
      }
      window.location.reload();
    } catch (err: any) {
      setUsernameMsg(err?.response?.data?.message || err?.message || 'Error');
    }
  };
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
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [loadingFollows, setLoadingFollows] = useState<Record<string, boolean>>({});
  const [showFollowersFollowingDropdown, setShowFollowersFollowingDropdown] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [loadingFollowersList, setLoadingFollowersList] = useState(false);
  const [selectedFollowersList, setSelectedFollowersList] = useState<'followers' | 'following' | null>(null);
  const [zoomedProfilePicSrc, setZoomedProfilePicSrc] = useState<string>('');
  const [zoomedPostMedia, setZoomedPostMedia] = useState<null | { src: string; kind: 'image' | 'video' }>(null);
  const [showMyProfileModal, setShowMyProfileModal] = useState(false);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [myProfessionTypeDraft, setMyProfessionTypeDraft] = useState('');
  const [myProfessionDetailDraft, setMyProfessionDetailDraft] = useState('');
  const [myProfileLoading, setMyProfileLoading] = useState(false);
  const [myProfileSavingBio, setMyProfileSavingBio] = useState(false);
  const [myProfileError, setMyProfileError] = useState('');
  const [isUploadingMyProfilePic, setIsUploadingMyProfilePic] = useState(false);
  const [myProfilePicError, setMyProfilePicError] = useState('');
  const myProfilePicInputRef = useRef<HTMLInputElement | null>(null);


  useEffect(() => {
    if (!zoomedProfilePicSrc && !zoomedPostMedia && !showMyProfileModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedProfilePicSrc('');
        setZoomedPostMedia(null);
        setShowMyProfileModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomedProfilePicSrc, zoomedPostMedia, showMyProfileModal]);

  const openMyProfileModal = async () => {
    if (!myId) {
      setMsg('Please log in');
      return;
    }
    setShowMyProfileModal(true);
    setMyProfileError('');
    setMyProfilePicError('');
    setMyProfileLoading(true);
    try {
      const res = await api.get(`/users/profile/${encodeURIComponent(myId)}`);
      const u = res.data?.user;
      setMyProfile(u);
      setMyProfessionTypeDraft(String(u?.professionType || ''));
      setMyProfessionDetailDraft(String(u?.professionDetail || ''));
      // Preload followers/following so counts render quickly
      if (!loadingFollowersList && followers.length === 0 && following.length === 0) {
        loadFollowersAndFollowing();
      }
    } catch (err: any) {
      setMyProfileError(err?.response?.data?.message || 'Failed to load profile');
    } finally {
      setMyProfileLoading(false);
    }
  };

  const saveMyBio = async () => {
    if (!myId) return;
    setMyProfileSavingBio(true);
    setMyProfileError('');
    try {
      const res = await api.put('/users/bio', { professionType: myProfessionTypeDraft, professionDetail: myProfessionDetailDraft });
      const u = res.data?.user;
      if (u) {
        setMyProfile(u);
        setMyProfessionTypeDraft(String(u.professionType || ''));
        setMyProfessionDetailDraft(String(u.professionDetail || ''));
      }
      try {
        const stored = JSON.parse(localStorage.getItem('user') || 'null');
        if (stored) {
          stored.professionType = u?.professionType ?? myProfessionTypeDraft.trim();
          stored.professionDetail = u?.professionDetail ?? myProfessionDetailDraft.trim();
          localStorage.setItem('user', JSON.stringify(stored));
        }
      } catch { }
      setMsg('Details updated');
    } catch (err: any) {
      setMyProfileError(err?.response?.data?.message || 'Failed to update bio');
    } finally {
      setMyProfileSavingBio(false);
    }
  };

  const setMyPostsView = (nextViewingOwnPosts: boolean) => {
    setViewingOwnPosts(nextViewingOwnPosts);
    if (!nextViewingOwnPosts) {
      setPostSearchOpen(false);
      setPostSearchQuery('');
      setPostSearchResults([]);
      setSelectedPostUsername(null);
      setSelectedUserProfile(null);
      setShowFollowersFollowingDropdown(false);
      setSelectedFollowersList(null);
      return;
    }
    setShowFollowersFollowingDropdown(true);
    loadFollowersAndFollowing();
  };

  const resolveMediaUrl = (u: any) => {
    const s = String(u || '');
    if (!s) return '';
    if (s.startsWith('data:') || s.startsWith('blob:')) return s;
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

    // Handle song files that are in public folder (e.g., /Aakh%20talabani.m4a)
    if (s.startsWith('/') && /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(s)) {
      return s; // Return as-is for public folder assets
    }
    if (!s.includes('/') && /\.(png|jpe?g|gif|webp|mp4|webm|ogg|mov|m4v)$/i.test(s)) {
      const base = getUploadBaseURL();
      return base ? `${base}/uploads/${s}` : `/uploads/${s}`;
    }

    return s;
  };

  const shortTimeAgo = (dateStr: string): string => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      if (diff < 60_000) return 'just now';
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
      if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
      if (diff < 2_592_000_000) return `${Math.floor(diff / 604_800_000)}w`;
      if (diff < 31_536_000_000) return `${Math.floor(diff / 2_592_000_000)}mo`;
      return `${Math.floor(diff / 31_536_000_000)}y`;
    } catch {
      return '';
    }
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
      if (savedMode === 'groups') {
        setMode('communities');
      } else if (savedMode === 'communities' || savedMode === 'private' || savedMode === 'status' || savedMode === 'posts' || savedMode === 'messages' || savedMode === 'random') {
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

  // Handle back button navigation - close app when trying to go back to auth pages
  useEffect(() => {
    // Replace current history state to prevent back navigation to auth pages
    window.history.replaceState({ page: 'app' }, '', window.location.pathname);

    const handlePopState = (event: PopStateEvent) => {
      // If user tries to go back and there's no previous app state, close the app
      if (!event.state || event.state.page !== 'app') {
        // Close the current tab/window
        window.close();
        // Fallback: if window.close() doesn't work (some browsers restrict it), redirect to blank page
        setTimeout(() => {
          window.location.href = 'about:blank';
        }, 100);
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

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
        setMsg('Failed to enter Study Mode: ' + response.data.message);
      }
    } catch (err: any) {
      setMsg('Error entering Study Mode: ' + (err.response?.data?.message || err.message));
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

  // Load blocked users on mount
  useEffect(() => {
    const loadBlockedUsers = async () => {
      try {
        const res = await api.get('/users/blocked');
        const ids = (res.data?.blocked || []).map((u: any) => String(u?._id || u?.id || '')).filter(Boolean);
        setBlockedUsers(new Set(ids));
      } catch (err) {
        console.error('Failed to load blocked users:', err);
      }
    };

    loadBlockedUsers();
  }, []);

  // Fetch own profile on mount so profile picture loads from Cloudinary immediately
  useEffect(() => {
    if (!myId) return;
    api.get(`/users/profile/${encodeURIComponent(myId)}`)
      .then((res) => {
        const u = res.data?.user;
        if (u) {
          setMyProfile(u);
          setMyProfessionTypeDraft(String(u?.professionType || ''));
          setMyProfessionDetailDraft(String(u?.professionDetail || ''));
          // Also keep localStorage in sync with the latest Cloudinary URL
          try {
            const stored = JSON.parse(localStorage.getItem('user') || 'null');
            if (stored && u.profilePicture) {
              stored.profilePicture = u.profilePicture;
              localStorage.setItem('user', JSON.stringify(stored));
            }
          } catch { }
        }
      })
      .catch(() => { /* silently ignore */ });
  }, [myId]);

  // Posts state
  const [posts, setPosts] = useState<any[]>([]);
  const [postContent, setPostContent] = useState('');
  const [isPostComposerOpen, setIsPostComposerOpen] = useState(false);
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postSong, setPostSong] = useState<string>('');
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [postPrivate, setPostPrivate] = useState(false);

  const [postLoading, setPostLoading] = useState(false);
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [postSearchResults, setPostSearchResults] = useState<any[]>([]);
  const [postIsSearching, setPostIsSearching] = useState(false);
  const [selectedPostUsername, setSelectedPostUsername] = useState<string | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<any>(null);
  const [selectedCommunitySearch, setSelectedCommunitySearch] = useState<any | null>(null);
  const [postSearchOpen, setPostSearchOpen] = useState(false);
  const [viewingOwnPosts, setViewingOwnPosts] = useState(false);
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const [privateSongs, setPrivateSongs] = useState<string[]>([]);
  const [postMuted, setPostMuted] = useState<Record<string, boolean>>({});
  const [floatingEmojis, setFloatingEmojis] = useState<Array<{ id: string, emoji: string, postId: string }>>([]);
  // Comment state
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});
  // songs shipped in frontend/public (update when adding/removing files there)
  const publicSongs = [
    '24575281-pony-trek-guitar-ahmad-mousavipour-13869.mp3',
    'apalonbeats-phonk-tiktok-instagram-youtube-music-509949.mp3',
    'bfcmusic-lofi-beat-loop-383538.mp3',
    'breakzstudios-epic-trap-cinematic-ident-201069.mp3',
    'burtysounds-stylish-sport-energy-229839.mp3',
    'denielcz-beatbox-445412.mp3',
    'diamond_tunes-jogging-15sec-286798.mp3',
    'good_b_music-happy-birthday-my-kitty-120918.mp3',
    'grand_project-nice-day_verse-3-loop-263108.mp3',
    'haletski-light-logo-136665.mp3',
    'happinessinmusic-happy-joyful-515081.mp3',
    'joelfazhari-inside-serial-killerx27s-cove-thriller-horror-music-loopable-15384.mp3',
    'kaazoom-hawaiian-shuffle-30-sec-edit-happy-ukulele-and-guitar-490375.mp3',
    'kaazoom-reaching-up-30-sec-edit-corporate-ambient-music-473303.mp3',
    'loksii-background-intro-music-15-seconds-232690.mp3',
    'nesterouk-corporate-logo-149111.mp3',
    'nra-lab-sick-energy-stomps-pulsepound-213706.mp3',
    'predicson_music-cinematic-casual-background2-307965.mp3',
    'prettyjohn1-spring-vlog_34sec-508391.mp3',
    'saavane-happy-birthday-254480.mp3',
    'sonican-into-horizon-epic-inspirational-cinematic-30-sec-441073.mp3',
    'soulfuljamtracks-cinematic-rock-music-248929.mp3',
    'soulprodmusic-upbeat-happy-logo-2-versions-146604.mp3',
    'sound_garage-rock-hip-hop-loop-382956.mp3',
    'starostin-upbeat-kids-music-30-sec-338546.mp3',
    'universfield-brass-motivation-143031.mp3',
    'universfield-horror-trailer-30s-217439.mp3',
    'u_dxlduo3m2g-panic-182769.mp3',
    'white_records-background-music-for-vlog-video-funny-dance-tropical-house-30-second-180425.mp3',
    'white_records-neon-drift-phonk-house-background-music-for-video-27-second-496492.mp3',
    'white_records-toxic-drift-house-background-music-for-video-stories-28-second-503885.mp3',
    'white_records-toxic-drift-phonk-house-background-music-for-video-stories-27-second-503884.mp3',
  ];

  const postComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const postImageInputRef = useRef<HTMLInputElement | null>(null);
  const communityPostImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isPostComposerOpen) return;
    const t = window.setTimeout(() => postComposerTextareaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isPostComposerOpen]);

  const postImagePreviewUrl = useMemo(() => {
    if (!postImage) return '';
    try {
      return URL.createObjectURL(postImage);
    } catch {
      return '';
    }
  }, [postImage]);

  useEffect(() => {
    if (!postImagePreviewUrl) return;
    return () => {
      try {
        URL.revokeObjectURL(postImagePreviewUrl);
      } catch { }
    };
  }, [postImagePreviewUrl]);

  const filteredPosts = useMemo(() => {
    if (viewingOwnPosts) {
      return posts.filter((post: any) => {
        const postUserId = post.user?._id || post.user?.id || post.userId;
        return String(postUserId) === String(me?.id);
      });
    }
    if (selectedPostUsername || selectedCommunitySearch) return postSearchResults;
    return posts;
  }, [posts, viewingOwnPosts, selectedPostUsername, selectedCommunitySearch, postSearchResults, me]);

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

  const [audioAutoplayEnabled, setAudioAutoplayEnabled] = useState(false);
  const [didShowAutoplayHint, setDidShowAutoplayHint] = useState(false);
  const [visiblePostId, setVisiblePostId] = useState<string>('');
  const [currentPlayingPostId, setCurrentPlayingPostId] = useState<string>('');
  const postCardElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const currentPlayingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    currentPlayingAudioRef.current = currentPlayingAudio;
  }, [currentPlayingAudio]);

  const registerPostCardEl = (postId: string) => (el: HTMLDivElement | null) => {
    const pid = String(postId || '');
    if (!pid) return;
    const map = postCardElsRef.current;
    if (el) {
      el.dataset.postId = pid;
      map.set(pid, el);
    } else {
      map.delete(pid);
    }
  };

  const loadBlockedUsersList = async () => {
    setBlockedUsersLoading(true);
    setBlockedUsersError('');
    try {
      const res = await api.get('/users/blocked');
      const list = res.data?.blocked || [];
      setBlockedUsersList(list);
      const ids = list.map((u: any) => String(u?._id || u?.id || '')).filter(Boolean);
      setBlockedUsers(new Set(ids));
    } catch (err: any) {
      setBlockedUsersError(err?.response?.data?.message || 'Failed to load blocked users');
    } finally {
      setBlockedUsersLoading(false);
    }
  };

  const handleMyProfilePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMyProfilePicError('');
    setIsUploadingMyProfilePic(true);
    try {
      if (isUnsupportedImageFile(file)) {
        setMyProfilePicError('HEIC/HEIF images are not supported. Please upload JPG/PNG/WebP instead.');
        return;
      }

      const uploadResponse = await uploadFile(file);
      const uploadedUrl = String(uploadResponse.data?.url || '');
      const uploadedFilename = String(uploadResponse.data?.filename || '');
      const baseUrl = getUploadBaseURL();
      const profilePictureUrl =
        uploadedUrl || (uploadedFilename ? `${baseUrl}/uploads/${uploadedFilename}` : '');

      if (!profilePictureUrl) {
        setMyProfilePicError('Upload failed: no URL returned');
        return;
      }

      const updateResponse = await api.put('/users/profile-picture', { profilePictureUrl });
      const updatedUser = updateResponse.data?.user;
      if (updatedUser) {
        setMyProfile(updatedUser);
      }

      try {
        const stored = JSON.parse(localStorage.getItem('user') || 'null');
        if (stored) {
          stored.profilePicture = updatedUser?.profilePicture || profilePictureUrl;
          localStorage.setItem('user', JSON.stringify(stored));
        }
      } catch { }

      setMsg('Profile picture updated');
    } catch (err: any) {
      setMyProfilePicError(err?.response?.data?.message || 'Failed to upload profile picture');
    } finally {
      setIsUploadingMyProfilePic(false);
      try {
        if (myProfilePicInputRef.current) myProfilePicInputRef.current.value = '';
      } catch { }
    }
  };

  useEffect(() => {
    const els = Array.from(postCardElsRef.current.values());
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        // Recompute from all mounted post cards so the active post stays in sync
        // even when the observer callback only contains a subset of changed entries.
        const viewportHeight = window.innerHeight;
        const viewportCenter = viewportHeight / 2;
        const centerTolerance = viewportHeight * 0.2; // 20% of screen height tolerance

        let centerPostId = '';
        let minDistanceToCenter = Infinity;

        els.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const isIntersecting = rect.bottom > 0 && rect.top < viewportHeight;
          if (!isIntersecting) return;

          const elementCenter = rect.top + rect.height / 2;
          const distanceToCenter = Math.abs(elementCenter - viewportCenter);

          // Check if element center is within tolerance of viewport center
          if (distanceToCenter < centerTolerance && distanceToCenter < minDistanceToCenter) {
            centerPostId = el.getAttribute('data-post-id') || '';
            minDistanceToCenter = distanceToCenter;
          }
        });

        setVisiblePostId((prev) => (prev === centerPostId ? prev : centerPostId));
      },
      { threshold: [0.1, 0.3, 0.5, 0.7, 0.9] } // More granular thresholds
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filteredPosts]);

  const stopCurrentPostAudio = useCallback(() => {
    const activeAudio = currentPlayingAudioRef.current;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }
    currentPlayingAudioRef.current = null;
    setCurrentPlayingAudio(null);
    setCurrentPlayingPostId('');
  }, []);

  const playPostSong = useCallback((post: any, options?: { ignoreMute?: boolean }) => {
    const pid = String(post?._id || post?.id || '');
    if (!post?.songUrl || !pid) return;
    if (!options?.ignoreMute && postMuted[pid]) return;
    if (pid === currentPlayingPostId) return;

    stopCurrentPostAudio();

    const audioUrl = resolveMediaUrl(post.songUrl);
    const audio = new Audio(audioUrl);
    audio.volume = 0.3;
    audio.onended = () => {
      if (currentPlayingAudioRef.current === audio) {
        stopCurrentPostAudio();
      }
    };

    audio
      .play()
      .then(() => {
        currentPlayingAudioRef.current = audio;
        setCurrentPlayingAudio(audio);
        setCurrentPlayingPostId(pid);
      })
      .catch(() => {
        if (!audioAutoplayEnabled && !didShowAutoplayHint) {
          setMsg('Tap the play or unmute button once to enable song auto-play');
          setDidShowAutoplayHint(true);
        }
        stopCurrentPostAudio();
      });
  }, [
    postMuted,
    currentPlayingPostId,
    stopCurrentPostAudio,
    audioAutoplayEnabled,
    didShowAutoplayHint,
  ]);

  useEffect(() => {
    if (!visiblePostId) {
      stopCurrentPostAudio();
      return;
    }

    if (!audioAutoplayEnabled) {
      stopCurrentPostAudio();
      return;
    }

    const post = filteredPosts.find((p: any) => String(p?._id || p?.id || '') === String(visiblePostId));
    const pid = String(post?._id || post?.id || '');

    if (!post?.songUrl || !pid || postMuted[pid]) {
      stopCurrentPostAudio();
      return;
    }

    if (pid === currentPlayingPostId) return;

    playPostSong(post);
  }, [
    audioAutoplayEnabled,
    visiblePostId,
    filteredPosts,
    postMuted,
    currentPlayingPostId,
    playPostSong,
    stopCurrentPostAudio,
  ]);

  const togglePostMute = (postId: string) => {
    const pid = postId || '';
    const post = filteredPosts.find((p: any) => String(p?._id || p?.id || '') === pid);

    if (!audioAutoplayEnabled) {
      setAudioAutoplayEnabled(true);
      setPostMuted(prev => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });
      if (post) {
        playPostSong(post, { ignoreMute: true });
      }
      return;
    }

    const isMuted = !!postMuted[pid];

    if (isMuted) {
      setPostMuted(prev => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });

      if (post) {
        playPostSong(post, { ignoreMute: true });
      }
      return;
    }

    setPostMuted(prev => ({ ...prev, [pid]: true }));
    if (currentPlayingPostId === pid) {
      stopCurrentPostAudio();
    }
  };

  // Post scoring algorithm
  // const calculateScore = (post: any) => {
  //   const baseScore =
  //     (post.reactions?.['♡'] || 0) * 4 +  // love
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
      (post.reactions?.['♡'] || 0) * 4 +
      (post.reactions?.['☺'] || 0) * 2 +
      (post.reactions?.['☹'] || 0) * 3 +
      (post.reactions?.['>_<'] || 0) * 2;


    const hoursSincePost =
      (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

    const timeFactor = 1 / (hoursSincePost + 2);

    let score = baseScore * timeFactor;


    const positive =
      (post.reactions?.['♡'] || 0) +
      (post.reactions?.['☺'] || 0);

    const negative =
      (post.reactions?.['>_<'] || 0);

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

    const loadMyCommunities = async () => {
      try {
        const res = await api.get('/communities/mine');
        setMyPublicGroups(res.data?.communities || []);
      } catch (err) {
        setMyPublicGroups([]);
      }
    };

    const loadCommunityDirectory = async () => {
      try {
        const res = await api.get('/communities');
        setCommunityDirectory(res.data?.communities || []);
      } catch (err) {
        setCommunityDirectory([]);
      }
    };

    const loadMyPublicGroups = async () => {
      try {
        const res = await api.get('/groups/mine?type=public');
        const existing = res.data?.groups || [];
        setGroups((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const merged = [...current];
          for (const g of existing) {
            if (!merged.some((item: any) => String(item?.id) === String(g?.id))) merged.push(g);
          }
          return merged;
        });
      } catch (err) {
        // ignore
      }
    };

    loadMyCommunities();
    loadCommunityDirectory();
    loadMyPublicGroups();

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      try {
        // Keep backend location in sync so 1KM/2KM groups and membership are computed for the *current* place.
        // Group auto-creation runs on the backend during this location update.
        await api.put('/users/location', {
          location: { type: 'Point', coordinates: [lng, lat] },
        });

        // List groups using server-stored location (matches join distance validation).
        const res = await api.get(`/groups/available`);
        const fetchedGroups = res.data.groups || [];
        setGroups(fetchedGroups);


        try {

          // fetch feed (statuses from people the user follows + self)
          const sres = await api.get(`/status/feed`);
          const fetchedStatuses = sres.data.statuses || [];
          setStatuses(fetchedStatuses);
          if (sres.data.myStreak !== undefined) setMyStreak(sres.data.myStreak);
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
    }, () => setMsg('Location permission denied (nearby groups disabled)'));

    try {
      const rc = JSON.parse(localStorage.getItem(`recentPrivateChats_${me?.id}`) || '[]');
      const arr = Array.isArray(rc) ? rc : [];
      const deduped = dedupeUsers(arr);
      setRecentChats(deduped);
      if (deduped.length !== arr.length) {
        try {
          localStorage.setItem(`recentPrivateChats_${me?.id}`, JSON.stringify(deduped));
        } catch (e) {
          // ignore
        }
      }
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
      (async () => {
        const incomingGroupId = normalizeGroupId(payload);
        const decryptedPayload = await decryptGroupPayload(payload);

        if (incomingGroupId !== String(activeGroup?.id)) {
          const senderName = decryptedPayload.sender?.username || decryptedPayload.sender?.name || 'User';
          showNotification(`message send by ${senderName}`);
          const normalized = {
            ...decryptedPayload,
            type: 'group',
            groupName: decryptedPayload.groupName,
            normalizedGroupId: incomingGroupId,
          };
          setUnreadMessages((prev) => [normalized, ...prev]);
          addToRecentMessagesData(normalized, 'group');
          return;
        }

        setMessages((prev) => {
          if (payload.localId) {
            const hasLocal = prev.some((m) => m.localId && m.localId === payload.localId);
            if (hasLocal) {
              return prev.map((m) => (
                m.localId === payload.localId
                  ? { ...decryptedPayload, message: decryptedPayload.message || m.message }
                  : m
              ));
            }
          }
          return [...prev, decryptedPayload];
        });
      })();
    };

    const onPrivateMessage = async (payload: any) => {
      const senderId = normalizeUserId(payload.sender || { senderId: payload.senderId } || payload);
      const meId = String(me?._id || me?.id || '');

      // Decrypt the message if it's from someone else
      let decryptedPayload = payload;
      try {
        const peerId =
          senderId && senderId !== meId
            ? senderId
            : String(payload.receiverId || payload.receiver?._id || payload.receiver?.id || '');

        if (payload?.e2ee?.ciphertext && peerId) {
          const decryptedMessage = await decryptFromPeer(api, peerId, payload.e2ee);
          decryptedPayload = { ...payload, message: decryptedMessage };
        }
      } catch (e) {
        console.error('Failed to decrypt message:', e);
        if (payload?.e2ee?.ciphertext) {
          decryptedPayload = { ...payload, message: '[Encrypted message]' };
        }
      }

      if (activePrivateUser && senderId && senderId === String(activePrivateUser._id || activePrivateUser.id)) {
        setMessages((prev) => [...prev, decryptedPayload]);
        // incoming in active chat - no unread but keep recent updated by incoming
        addToRecentMessagesData({ ...decryptedPayload, normalizedSenderId: senderId }, 'private');
      } else if (senderId && senderId !== meId) {
        // Show notification for messages from other users when chat is not active
        const senderName = decryptedPayload.sender?.username || decryptedPayload.sender?.name || 'User';
        showNotification(`message send by ${senderName}`);
        // Add to unread messages with normalized sender id
        const normalized = { ...decryptedPayload, type: 'private', normalizedSenderId: senderId };
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
            return prev.map((m) => {
              if (m.localId === payload.localId) {
                // Keep the original message text for sent messages, update other fields
                return { ...payload, message: m.message, status: 'sent' };
              }
              return m;
            });
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
        await loadGroupMessages(String(g.id));
      } catch (err) {

      }


      history.pushState(null, '', `/message`);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to join group');
    }
  };

  const upsertGroup = (list: any[], g: any) => {
    const id = String(g?.id || g?._id || '');
    if (!id) return list || [];
    const next = [...(list || [])];
    const idx = next.findIndex((x) => String(x?.id || x?._id) === id);
    if (idx >= 0) next[idx] = { ...next[idx], ...g, id };
    else next.unshift({ ...g, id });
    return next;
  };

  const getCommunityId = (community: any) => String(community?._id || community?.id || '');
  const getCommunityName = (community: any) => String(community?.name || community?.groupName || '');
  const withCommunityMeta = (list: any[], community: any) =>
    (Array.isArray(list) ? list : []).map((post: any) => ({
      ...post,
      community: post?.community || community,
      communityId: String(post?.communityId || getCommunityId(community) || ''),
    }));

  const resetCreateCommunityForm = () => {
    setNewPublicGroupName('');
    setNewPublicGroupPurpose('');
    setNewPublicGroupProfilePicture('');
  };

  const loadCommunityDetails = async (groupId: string) => {
    const res = await api.get(`/communities/${groupId}`);
    const community = res.data?.community || null;
    setActiveCommunityDetails(community);
    setCommunityManageName(String(community?.name || ''));
    setCommunityManagePurpose(String(community?.purpose || ''));
    setCommunityManageProfilePicture(String(community?.profilePicture || ''));
  };

  const loadCommunityPosts = async (groupId: string) => {
    try {
      setCommunityPostsLoading(true);
      const res = await api.get(`/posts?communityId=${encodeURIComponent(groupId)}`);
      setCommunityPosts(res.data || []);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to load community posts');
    } finally {
      setCommunityPostsLoading(false);
    }
  };

  const createAndEnterPublicGroup = async () => {
    const name = String(newPublicGroupName || '').trim();
    if (!name) return;
    try {
      setIsCreatingPublicGroup(true);
      setMsg('Creating community...');
      const res = await api.post('/communities', {
        name,
        purpose: newPublicGroupPurpose,
        profilePicture: newPublicGroupProfilePicture,
      });
      const g = res.data?.community;
      if (g) {
        setMyPublicGroups((prev) => upsertGroup(prev, g));
        setCommunityDirectory((prev) => upsertGroup(prev, g));
        resetCreateCommunityForm();
        setShowCreateGroup(false);
        await enterCommunity(g);
      }
      setMsg('');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to create group');
    } finally {
      setIsCreatingPublicGroup(false);
    }
  };

  const searchPublicGroups = async () => {
    const q = String(publicGroupSearch || '').trim();
    if (!q) return setPublicGroupResults([]);
    try {
      setIsSearchingPublicGroups(true);
      const res = await api.get(`/communities/search?q=${encodeURIComponent(q)}`);
      setPublicGroupResults(res.data?.communities || []);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Group search failed');
    } finally {
      setIsSearchingPublicGroups(false);
    }
  };

  const joinAndEnterPublicGroup = async (g: any) => {
    try {
      setMsg('Joining...');
      const res = await api.post(`/communities/${g.id}/join`);
      const joined = { ...g, ...(res.data?.community || {}), isMember: true };
      setMyPublicGroups((prev) => upsertGroup(prev, joined));
      setCommunityDirectory((prev) => upsertGroup(prev, joined));
      setPublicGroupResults((prev) => (prev || []).map((x: any) => (String(x.id) === String(g.id) ? joined : x)));
      await enterCommunity(joined);
      setMsg('Joined');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to join group');
    }
  };

  const deleteOwnedGroup = async (group: any) => {
    if (!group?.id) return;
    const confirmed = window.confirm(`Delete group "${group.groupName}"? This will remove its messages for everyone.`);
    if (!confirmed) return;

    try {
      await api.delete(`/groups/${group.id}`);
      setGroups((prev) => prev.filter((g) => String(g.id) !== String(group.id)));
      setMyPublicGroups((prev) => prev.filter((g) => String(g.id) !== String(group.id)));
      setPublicGroupResults((prev) => prev.filter((g) => String(g.id) !== String(group.id)));
      setUnreadMessages((prev) => prev.filter((msg) => String(msg.groupId || msg.normalizedGroupId) !== String(group.id)));
      if (String(activeGroup?.id || '') === String(group.id)) {
        setActiveGroup(null);
        setActiveCommunityDetails(null);
        setCommunityPosts([]);
        setMessages([]);
      }
      setMsg('Group deleted');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to delete group');
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
      await loadGroupMessages(String(g.id));
    } catch (err: any) {

    }

    history.pushState(null, '', `/message`);
  };

  const enterCommunity = async (community: any) => {
    setMode('communities');
    setActiveCommunity(community);
    await Promise.all([
      loadCommunityDetails(String(community.id)),
      loadCommunityPosts(String(community.id)),
    ]);
  };

  const uploadCommunityProfilePicture = async (file: File) => {
    const uploadRes = await uploadFile(file);
    return String(uploadRes.data?.url || '');
  };

  const saveCommunitySettings = async () => {
    if (!activeCommunity?.id) return;
    try {
      setCommunitySaving(true);
      const res = await api.put(`/communities/${activeCommunity.id}`, {
        name: communityManageName,
        purpose: communityManagePurpose,
        profilePicture: communityManageProfilePicture,
      });
      const nextGroup = { ...(activeCommunity || {}), ...(res.data?.community || {}) };
      setActiveCommunity(nextGroup);
      setActiveCommunityDetails((prev: any) => ({ ...(prev || {}), ...(res.data?.community || {}) }));
      setMyPublicGroups((prev) => upsertGroup(prev, nextGroup));
      setCommunityDirectory((prev) => upsertGroup(prev, nextGroup));
      setPublicGroupResults((prev) => (prev || []).map((x: any) => (String(x.id) === String(nextGroup.id) ? { ...x, ...nextGroup } : x)));
      setMsg('Community updated');
      setCommunityManageOpen(false);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to update community');
    } finally {
      setCommunitySaving(false);
    }
  };

  const removeCommunityMember = async (memberId: string) => {
    if (!activeCommunity?.id || !memberId) return;
    if (!window.confirm('Remove this member from the community?')) return;
    try {
      setCommunityRemovingMemberId(memberId);
      await api.delete(`/communities/${activeCommunity.id}/members/${memberId}`);
      await loadCommunityDetails(String(activeCommunity.id));
      setMsg('Member removed');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to remove member');
    } finally {
      setCommunityRemovingMemberId('');
    }
  };

  const createCommunityPost = async () => {
    if (!activeCommunity?.id) return;
    if (!communityPostContent.trim() && !communityPostImage) {
      setMsg('Nothing to post');
      return;
    }
    try {
      setCommunityPosting(true);
      const formData = new FormData();
      formData.append('communityId', String(activeCommunity.id));
      if (communityPostContent.trim()) formData.append('content', communityPostContent.trim());
      if (communityPostImage) formData.append('image', communityPostImage);
      const res = await api.post('/posts', formData);
      setCommunityPostContent('');
      setCommunityPostImage(null);
      try {
        if (communityPostImageInputRef.current) communityPostImageInputRef.current.value = '';
      } catch { }
      const [createdCommunityPost] = withCommunityMeta([res.data], activeCommunity);
      if (createdCommunityPost) {
        setCommunityPosts((prev) => [createdCommunityPost, ...prev]);
      }
      await fetchPosts();
      setMsg('Community post created');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to create community post');
    } finally {
      setCommunityPosting(false);
    }
  };

  const leaveCommunity = async (communityId: string) => {
    if (!communityId) return;
    setMyPublicGroups((prev) => prev.filter((item: any) => String(item.id) !== String(communityId)));
    setCommunityDirectory((prev) => (prev || []).map((item: any) => (
      String(item.id) === String(communityId) ? { ...item, isMember: false } : item
    )));
    if (String(activeCommunity?.id || '') === String(communityId)) {
      setActiveCommunity(null);
      setActiveCommunityDetails(null);
      setCommunityPosts([]);
    }
    setMsg('Left community view');
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
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Search failed');
    }
  };

  const openPrivateChatById = async (uid: string) => {
    const id = String(uid || '');
    if (!id) return;

    const fromRecent = recentChats.find((x: any) => String(x?._id || x?.id) === id);
    if (fromRecent) {
      openPrivateChat(fromRecent);
      return;
    }

    try {
      const cached = JSON.parse(localStorage.getItem('activePrivateChatUser') || 'null');
      const cachedId = String(cached?._id || cached?.id || '');
      if (cached && cachedId === id) {
        openPrivateChat(cached);
        return;
      }
    } catch (e) {
      // ignore
    }

    try {
      const res = await api.get(`/users/profile/${id}`);
      const u = res.data?.user;
      if (u) {
        openPrivateChat(u);
        return;
      }
      setMsg('User not found');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to open chat');
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
      localStorage.setItem('activePrivateChatUser', JSON.stringify(u));
    } catch (e) {
      // ignore
    }

    try {
      history.pushState(null, '', `/message/chat?uid=${encodeURIComponent(String(uid))}`);
    } catch (e) {
      // ignore
    }

    try {
      const rc = JSON.parse(localStorage.getItem(`recentPrivateChats_${me?.id}`) || '[]');
      const arr = Array.isArray(rc) ? rc : [];
      const filtered = arr.filter((x: any) => String(x._id || x.id) !== String(uid));
      filtered.unshift(u);
      const trimmed = dedupeUsers(filtered).slice(0, 10);
      localStorage.setItem(`recentPrivateChats_${me?.id}`, JSON.stringify(trimmed));
      setRecentChats(trimmed);
    } catch (e) {

    }

    try {
      const res = await api.get(`/chats/private/${uid}`);
      const loadedMessages = res.data.messages || [];

      // Decrypt messages
      const myId = String(me?._id || me?.id || '');
      const peerId = String(uid);
      const decryptedMessages = await Promise.all(loadedMessages.map(async (msg: any) => {
        try {
          if (msg?.e2ee?.ciphertext) {
            const decrypted = await decryptFromPeer(api, peerId, msg.e2ee);
            return { ...msg, message: decrypted };
          }
        } catch (e) {
          console.error('Failed to decrypt message:', e);
          if (msg?.e2ee?.ciphertext) {
            return { ...msg, message: '[Encrypted message]' };
          }
        }
        return msg;
      }));

      setMessages(decryptedMessages);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to load messages');
    }
  };

  useEffect(() => {
    if (!window.location.pathname.startsWith('/message/chat')) return;
    setMode('private');

    try {
      const params = new URLSearchParams(window.location.search);
      const uid = params.get('uid');
      if (uid) {
        openPrivateChatById(uid);
        return;
      }
    } catch (e) {
      // ignore
    }

    try {
      const cached = JSON.parse(localStorage.getItem('activePrivateChatUser') || 'null');
      const cachedId = cached?._id || cached?.id;
      if (cachedId) {
        openPrivateChat(cached);
      }
    } catch (e) {
      // ignore
    }
  }, []);

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
      try { e.target.value = ''; } catch { }
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

  const sendMessage = async () => {
    const sock = getSocket();
    if (!text.trim() && !messageMediaUrl) return;

    if (mode === 'groups') {
      if (!activeGroup) return;
      const localId = `local:${Date.now()}`;
      const payload: any = { groupId: activeGroup.id, localId };
      if (text.trim()) {
        try {
          const enc = await encryptForGroup(api, String(activeGroup.id), text.trim());
          payload.e2ee = enc.e2ee;
          payload.message = '';
        } catch (err: any) {
          console.error('Failed to encrypt group message', err);
          if (err instanceof E2EEGroupMembersMissingKeysError) {
            const names = err.members
              .map((member) => member.username || member.name || member.userId)
              .filter(Boolean)
              .join(', ');
            setMsg(`Encrypted group chat is blocked until all members enable it${names ? `: ${names}` : ''}.`);
          } else {
            setMsg(String(err?.message || 'Failed to encrypt group message'));
          }
          return;
        }
      }
      if (messageMediaUrl) {
        // Send only the URL, not base64 data
        payload.mediaUrl = messageMediaUrl;
        payload.mediaType = messageMediaType;
      }
      if (sock) {
        sock.emit('group:message', payload);
        const messageObj = {
          ...payload,
          message: text.trim(),
          id: localId,
          localId,
          groupId: activeGroup.id,
          groupName: activeGroup.groupName,
          senderId: me?.id,
          sender: { id: me?.id, username: me?.username },
          createdAt: new Date().toISOString()
        };
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
      const myId = String(me?._id || me?.id || '');
      const recipientId = String(activePrivateUser._id || activePrivateUser.id);

      try {
        let encryptedMessage = '';
        let e2ee: any = undefined;
        if (text.trim()) {
          if (peerE2EEState === 'ready') {
            const enc = await encryptForPeer(api, recipientId, text.trim());
            e2ee = enc.e2ee;
            encryptedMessage = '';
          } else {
            if (peerE2EEState === 'missing') {
              setMsg('Encrypted chat is required. The other user has not enabled it yet.');
            } else if (peerE2EEState === 'changed') {
              setMsg('Encrypted chat is blocked because the other user changed keys.');
            } else {
              setMsg('Encrypted chat is not ready yet.');
            }
            return;
          }
        }

        const payload: any = { toUserId: recipientId, message: encryptedMessage, localId, e2ee };
        if (messageMediaUrl) {
          // Send only the URL, not base64 data
          payload.mediaUrl = messageMediaUrl;
          payload.mediaType = messageMediaType;
        }
        if (sock) {
          sock.emit('private:message', payload);
          const messageObj = { ...payload, message: text.trim(), localId, senderId: myId, sender: { id: myId, username: me?.username }, receiverId: payload.toUserId, receiver: activePrivateUser, createdAt: new Date().toISOString(), status: 'sending' };
          console.log('Sending private message, adding to recent if recipient inactive:', messageObj);
          setMessages((prev) => [...prev, messageObj]);
          // If recipient is not the currently active private chat, add to recent so it appears under Messages
          const recipientIdNorm = normalizeUserId(activePrivateUser) || recipientId;
          const activeId = String(activePrivateUser?._id || activePrivateUser?.id || '');
          if (!activePrivateUser || recipientIdNorm !== String(activePrivateUser._id || activePrivateUser.id)) {
            addToRecentMessagesData({ ...messageObj, normalizedSenderId: recipientIdNorm }, 'private');
          }
          setText('');
          setMessageMediaUrl('');
          setMessageMediaType('');
          setMessageSelectedFileName('');
          setMessageMediaFile(null);
        } else {
          setMsg('Socket not connected');
        }
      } catch (err: any) {
        console.error('Failed to send private message', err);
        if (err instanceof E2EEPeerMissingKeyError) {
          setMsg('Encrypted chat is required. The other user has not enabled it yet.');
        } else if (err instanceof E2EEPeerKeyChangedError) {
          setMsg('Encrypted chat is blocked because the other user changed keys.');
        } else {
          setMsg(String(err?.message || 'Failed to send message'));
        }
      }
    }
  };

  const createStatus = async () => {
    try {
      if (!statusContent.trim() && !statusMediaUrl) return setMsg('Nothing to post');
      const payload: any = { content: statusContent.trim() };
      if (statusMediaUrl) {
        payload.mediaUrl = statusMediaUrl;
        if (statusMediaType) payload.mediaType = statusMediaType;
      }

      const res = await api.post('/status', payload);

      if (res.data.streak !== undefined) setMyStreak(res.data.streak);
      setStatuses((prev) => [{ id: res.data.statusId, userId: me?.id, content: statusContent.trim(), mediaUrl: statusMediaUrl, mediaType: statusMediaType, createdAt: new Date().toISOString(), streak: res.data.streak }, ...prev]);
      setStatusContent('');
      setStatusMediaUrl('');
      setStatusMediaType('');
      setSelectedFileName('');
      setStatusFormOpen(false);
      setMsg(`✅ Learning posted! 🔥 ${res.data.streak ?? myStreak} day streak!`);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to post');
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
      try { e.target.value = ''; } catch { }
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
      try { e.target.value = ''; } catch { }
      return;
    }
    setPostImage(f);
  };

  const fetchPosts = useCallback(async () => {
    try {
      const basePostsPromise = api.get('/posts');
      const communitiesPromise = communityDirectory.length
        ? Promise.resolve({ data: { communities: communityDirectory } })
        : api.get('/communities');

      const [basePostsRes, communitiesRes] = await Promise.all([basePostsPromise, communitiesPromise]);
      const basePosts = Array.isArray(basePostsRes.data) ? basePostsRes.data : [];
      const communities = Array.isArray(communitiesRes.data?.communities) ? communitiesRes.data.communities : [];

      const communityPostResults = await Promise.allSettled(
        communities.map(async (community: any) => {
          const communityId = getCommunityId(community);
          if (!communityId) return [];
          const res = await api.get(`/posts?communityId=${encodeURIComponent(communityId)}`);
          return withCommunityMeta(res.data, community);
        })
      );

      const mergedById = new Map<string, any>();
      for (const post of basePosts) {
        const postId = String(post?._id || post?.id || '');
        if (postId) mergedById.set(postId, post);
      }
      for (const result of communityPostResults) {
        if (result.status !== 'fulfilled') continue;
        for (const post of result.value) {
          const postId = String(post?._id || post?.id || '');
          if (!postId) continue;
          mergedById.set(postId, post);
        }
      }

      const mergedPosts = Array.from(mergedById.values()).sort((a: any, b: any) => {
        const aTime = new Date(a?.createdAt || 0).getTime();
        const bTime = new Date(b?.createdAt || 0).getTime();
        return bTime - aTime;
      });

      setPosts(mergedPosts);
    } catch (err: any) {
      console.error('fetchPosts error:', err);
      setMsg(err?.response?.data?.message || 'Failed to fetch posts');
    }
  }, [communityDirectory]);

  const resetPostComposer = () => {
    setPostContent('');
    setPostImage(null);
    setPostSong('');
    setPostPrivate(false);

    try {
      if (postImageInputRef.current) postImageInputRef.current.value = '';
    } catch { }
  };

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
      if (postContent.trim()) formData.append('content', postContent);
      formData.append('anonymous', String(postAnonymous));
      formData.append('isPrivate', String(postPrivate));
      if (postSong) formData.append('songUrl', postSong);

      if (postImage) formData.append('image', postImage);

      const response = await api.post('/posts', formData);
      console.log('Post created successfully:', response.data);

      setPostContent('');
      setPostImage(null);
      setPostSong('');
      setPostPrivate(false);

      setMsg('Post created');
      try {
        if (postImageInputRef.current) postImageInputRef.current.value = '';
      } catch { }
      setIsPostComposerOpen(false);

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

  const openUserPosts = async (usernameRaw: string, userIdHint?: string) => {
    const username = String(usernameRaw || '').trim();
    if (!username) {
      setPostSearchResults([]);
      setSelectedPostUsername(null);
      setSelectedUserProfile(null);
      setSelectedCommunitySearch(null);
      return;
    }

    // Keep search UI/state in sync so "clicked username" looks the same as "searched username"
    setPostSearchQuery(username);
    setPostSearchOpen(true);
    setSelectedPostUsername(username);
    setSelectedUserProfile(null);
    setSelectedCommunitySearch(null);
    setViewingOwnPosts(false);

    try {
      setPostIsSearching(true);
      const res = await api.get(`/posts/user/${encodeURIComponent(username)}`);
      setPostSearchResults(res.data || []);

      const userId =
        userIdHint ||
        res.data?.[0]?.user?._id ||
        res.data?.[0]?.user?.id ||
        '';

      if (userId) {
        try {
          const profileRes = await api.get(`/users/profile/${userId}`);
          setSelectedUserProfile(profileRes.data.user);
        } catch (err) {
          console.error('Failed to fetch user profile:', err);
        }
      }
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to search user posts');
      setPostSearchResults([]);
      setSelectedPostUsername(null);
      setSelectedUserProfile(null);
    } finally {
      setPostIsSearching(false);
    }
  };

  const openCommunityPostsSearch = async (community: any, queryOverride?: string) => {
    const communityId = getCommunityId(community);
    const communityName = getCommunityName(community);
    if (!communityId || !communityName) return;

    setPostSearchQuery(String(queryOverride || communityName));
    setPostSearchOpen(true);
    setSelectedPostUsername(null);
    setSelectedUserProfile(null);
    setSelectedCommunitySearch(community);
    setViewingOwnPosts(false);

    try {
      setPostIsSearching(true);
      const res = await api.get(`/posts?communityId=${encodeURIComponent(communityId)}`);
      setPostSearchResults(withCommunityMeta(res.data, community));
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to search community posts');
      setPostSearchResults([]);
      setSelectedCommunitySearch(null);
    } finally {
      setPostIsSearching(false);
    }
  };

  const searchUserPosts = async () => {
    const query = String(postSearchQuery || '').trim();
    if (!query) {
      clearPostSearch();
      return;
    }

    const normalizedQuery = query.replace(/^r\//i, '').trim().toLowerCase();
    const localCommunityMatch = [...communityDirectory, ...myPublicGroups].find((community: any) => {
      const name = getCommunityName(community).trim().toLowerCase();
      return name && name === normalizedQuery;
    });

    if (/^r\//i.test(query) && localCommunityMatch) {
      return openCommunityPostsSearch(localCommunityMatch, query);
    }

    try {
      setPostIsSearching(true);

      const [userPostsRes, communitiesRes] = await Promise.all([
        api.get(`/posts/user/${encodeURIComponent(query)}`).catch(() => ({ data: [] })),
        api.get(`/communities/search?q=${encodeURIComponent(normalizedQuery || query)}`).catch(() => ({ data: { communities: [] } })),
      ]);

      const userPosts = Array.isArray(userPostsRes.data) ? userPostsRes.data : [];
      const communities = Array.isArray(communitiesRes.data?.communities) ? communitiesRes.data.communities : [];
      const exactCommunityMatch = communities.find((community: any) => getCommunityName(community).trim().toLowerCase() === normalizedQuery);
      const matchedCommunity = localCommunityMatch || exactCommunityMatch || communities[0];

      if (/^r\//i.test(query) || (!userPosts.length && matchedCommunity)) {
        setPostIsSearching(false);
        return openCommunityPostsSearch(matchedCommunity, query);
      }

      setPostSearchQuery(query);
      setPostSearchOpen(true);
      setSelectedPostUsername(query);
      setSelectedUserProfile(null);
      setSelectedCommunitySearch(null);
      setViewingOwnPosts(false);
      setPostSearchResults(userPosts);

      const userId =
        userPosts?.[0]?.user?._id ||
        userPosts?.[0]?.user?.id ||
        '';

      if (userId) {
        try {
          const profileRes = await api.get(`/users/profile/${userId}`);
          setSelectedUserProfile(profileRes.data.user);
        } catch (err) {
          console.error('Failed to fetch user profile:', err);
        }
      }
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to search posts');
      clearPostSearch();
    } finally {
      setPostIsSearching(false);
    }
  };

  const clearPostSearch = () => {
    setPostSearchQuery('');
    setPostSearchResults([]);
    setSelectedPostUsername(null);
    setSelectedUserProfile(null);
    setSelectedCommunitySearch(null);
  };

  const viewOwnPosts = () => {
    setViewingOwnPosts(!viewingOwnPosts);
    if (viewingOwnPosts) {
      setPostSearchOpen(false);
      setPostSearchQuery('');
      setPostSearchResults([]);
      setSelectedPostUsername(null);
      setSelectedCommunitySearch(null);
    }
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p._id !== postId));
      setCommunityPosts((prev) => prev.filter((p: any) => String(p._id || p.id) !== String(postId)));
      setMsg('Post deleted');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to delete post');
    }
  };

  const handleEmojiReaction = async (postId: string, emoji: string) => {
    try {
      // Trigger floating emoji animation
      const floatingId = `${postId}-${Date.now()}-${Math.random()}`;
      setFloatingEmojis(prev => [...prev, { id: floatingId, emoji, postId }]);

      // Remove floating emoji after 2 seconds
      setTimeout(() => {
        setFloatingEmojis(prev => prev.filter(e => e.id !== floatingId));
      }, 2000);

      await api.post(`/posts/${postId}/react`, { emoji });
      fetchPosts();
      if (activeCommunity?.id) {
        loadCommunityPosts(String(activeCommunity.id));
      }
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
      if (activeCommunity?.id) {
        loadCommunityPosts(String(activeCommunity.id));
      }
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

  const handleBlockUser = async (userId: string) => {
    if (!userId) return;
    if (!confirm('Block this user? They will not be able to see your posts/status/profile or message you.')) return;
    try {
      await api.post(`/users/${userId}/block`);
      setBlockedUsers(prev => new Set([...prev, userId]));
      setMsg('User blocked');
      try {
        clearPostSearch();
      } catch { }
      await fetchPosts();
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to block user');
    }
  };

  const handleUnblockUser = async (userId: string) => {
    if (!userId) return;
    if (!confirm('Unblock this user?')) return;
    try {
      await api.post(`/users/${userId}/unblock`);
      setBlockedUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setBlockedUsersList(prev => prev.filter((u: any) => String(u?._id || u?.id || '') !== String(userId)));
      setMsg('User unblocked');
      await fetchPosts();
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to unblock user');
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
    <div className="grid grid-cols-1 gap-0 pb-20 relative">
      {/* Notification Display */}
      {notification && (
        <div className="fixed top-4 right-4 bg-blue-500 text-black px-4 py-3 rounded-lg shadow-lg z-50 animate-pulse">
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
        <div className="flex items-center justify-between mb-0">
          <h1 className="text-blue-500 text-2xl font-bold truncate pr-4">
            Sociovio {me ? `— ${me.username || me.name}` : ''}
          </h1>
          <div className="flex items-center space-x-3 relative">
            {/* Create Post button — only shown in posts mode */}
            {mode === 'posts' && (
              <button
                onClick={() => {
                  if (isPostComposerOpen) {
                    setIsPostComposerOpen(false);
                    resetPostComposer();
                  } else {
                    setIsPostComposerOpen(true);
                  }
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 active:scale-95 transition-all duration-150 text-white text-2xl font-light leading-none shadow-md"
                title={isPostComposerOpen ? 'Close composer' : 'Create post'}
                aria-label={isPostComposerOpen ? 'Close post composer' : 'Open post composer'}
              >
                {isPostComposerOpen ? '✕' : '+'}
              </button>
            )}
            <div className="relative z-30">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) setHeaderMenuOpen(false);
                }}
                className="relative p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition text-xl bg-gray-100 dark:bg-gray-800"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
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
                <div
                  className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm flex flex-col"
                  onClick={() => setShowNotifications(false)}
                >
                  <div onClick={(e) => e.stopPropagation()} className="flex flex-col flex-1 overflow-hidden">
                    <NotificationPanel onClose={() => setShowNotifications(false)} />
                  </div>
                </div>
              )}
            </div>
            <div className="relative z-30">
              <button
                onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                className="px-3 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition"
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
                  className={`fixed top-0 right-0 z-[450] h-full w-64 max-w-sm bg-white dark:bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out overflow-y-auto ${headerMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
                  aria-hidden={!headerMenuOpen}
                >
                  <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold">Menu</h3>
                    <button onClick={() => setHeaderMenuOpen(false)} className="text-gray-600 hover:text-gray-900 dark:text-gray-300">
                      ✕
                    </button>
                  </div>
                  <div className="p-3 space-y-1 pb-6">
                    <button
                      onClick={() => {
                        setShowCreateGroup(true);
                        setHeaderMenuOpen(false);
                        setMode('communities');
                      }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded text-white"
                    >
                      <span>🌐</span>
                      <span>Create Community</span>
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api.post('/auth/logout');
                        } catch (e) {
                          console.warn('Logout request failed', e);
                        }
                        disconnectSocket();
                        localStorage.removeItem('user');
                        localStorage.removeItem('access_token');
                        window.location.replace('/');
                        setHeaderMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded text-white"
                    >
                      <span>🔓</span>
                      <span>Logout</span>
                    </button>
                    <button
                      onClick={() => { setShowWallpaperPicker(true); setHeaderMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded text-white"
                    >
                      <span>🖼️</span>
                      <span>Change Wallpaper</span>
                    </button>
                    <button
                      onClick={() => { setShowTextColorPicker(true); setHeaderMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded text-white"
                    >
                      <span>🎨</span>
                      <span>Text Color</span>
                    </button>
                    <button
                      onClick={() => { setShowTextSizePicker(true); setHeaderMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded text-white"
                    >
                      <span>📏</span>
                      <span>Text Size</span>
                    </button>
                    <button
                      className='w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded text-white'
                      onClick={() => {
                        setShowUsernameDialog(true);
                        setHeaderMenuOpen(false);
                      }}
                    >
                      <span>✏️</span>
                      <span>Change Username</span>
                    </button>
                    <button
                      className='text-red-600 w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded'
                      onClick={() => {
                        setShowDeleteDialog(true);
                        setHeaderMenuOpen(false);
                      }}
                    >
                      <span>🗑️</span>
                      <span>Delete Account</span>
                    </button>
                    <button
                      className='w-full text-left px-3 py-2 flex items-center space-x-2 hover:bg-black rounded text-white'
                      onClick={async () => {
                        setHeaderMenuOpen(false);
                        setShowBlockedUsersDialog(true);
                        await loadBlockedUsersList();
                      }}
                    >
                      <span>🚫</span>
                      <span>Blocked Users</span>
                    </button>
                    <a href="mailto:sociovio4@gmail.com" className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:text-blue-600 hover:bg-black rounded text-white">Contact us</a>
                    <a href="/termandcondition" onClick={() => setHeaderMenuOpen(false)} className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:text-blue-600 hover:bg-black rounded text-white">📋 Terms & Conditions</a>
                    <a href="/PrivacyPolicy" onClick={() => setHeaderMenuOpen(false)} className="w-full text-left px-3 py-2 flex items-center space-x-2 hover:text-blue-600 hover:bg-black rounded text-white">🔒 Privacy Policy</a>
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

            {showDeleteDialog && (
              <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[10000] w-80 bg-white border rounded shadow-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Delete Account</div>
                  <button
                    onClick={() => {
                      setShowDeleteDialog(false);
                      setDeleteForm({ password: '', otp: '' });
                      setDeleteMsg('');
                    }}
                    className="text-sm text-gray-500"
                  >Close</button>
                </div>
                <p className="text-sm mb-2 text-red-600">
                  This action is irreversible. You will need to enter your password and a one‑time code sent to your email.
                </p>
                <input
                  type="password"
                  placeholder="Password"
                  value={deleteForm.password}
                  onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })}
                  className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100"
                />
                <div className="flex items-center space-x-2">
                  <input
                    placeholder="OTP code"
                    value={deleteForm.otp}
                    onChange={(e) => setDeleteForm({ ...deleteForm, otp: e.target.value })}
                    className="flex-1 p-2 border rounded text-black mt-2 shadow-lg shadow-black/100"
                  />
                  <button onClick={sendDeleteOtp} className="px-3 py-2 bg-blue-600 text-white rounded mt-2">
                    Send OTP
                  </button>
                </div>
                <button
                  onClick={doDeleteAccount}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded mt-4"
                >
                  Delete account
                </button>
                {deleteMsg && <p className="mt-2 text-sm text-red-600">{deleteMsg}</p>}
              </div>
            )}

            {showBlockedUsersDialog && (
              <div
                className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-3 sm:p-4"
                onClick={() => {
                  setShowBlockedUsersDialog(false);
                  setBlockedUsersError('');
                }}
              >
                <div className="absolute inset-0 bg-black/50" />
                <div
                  className="relative w-full max-w-md bg-white border rounded-t-2xl sm:rounded shadow-lg p-4 max-h-[85vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Blocked Users</div>
                    <button
                      onClick={() => {
                        setShowBlockedUsersDialog(false);
                        setBlockedUsersError('');
                      }}
                      className="text-sm text-gray-500"
                    >
                      Close
                    </button>
                  </div>

                  {blockedUsersError && (
                    <div className="text-sm text-red-600 mb-2">{blockedUsersError}</div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                    {blockedUsersLoading ? (
                      <div className="text-sm text-gray-600">Loading...</div>
                    ) : blockedUsersList.length === 0 ? (
                      <div className="text-sm text-gray-600">You have not blocked anyone.</div>
                    ) : (
                      blockedUsersList.map((u: any) => {
                        const uid = String(u?._id || u?.id || '');
                        const uname = String(u?.username || '').trim();
                        const displayName = String(u?.name || '').trim();
                        const pic = u?.profilePicture ? resolveMediaUrl(u.profilePicture) : '';
                        return (
                          <div key={uid} className="flex items-center justify-between gap-3 border rounded-xl p-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                                {pic ? (
                                  <img src={pic} alt={displayName || uname || 'User'} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-sm font-semibold text-gray-700">{(uname?.[0] || displayName?.[0] || 'U').toUpperCase()}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{uname ? `@${uname}` : 'User'}</div>
                                {displayName && <div className="text-xs text-gray-600 truncate">{displayName}</div>}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                await handleUnblockUser(uid);
                              }}
                              className="px-3 py-1.5 rounded-full bg-green-600 text-white text-sm hover:bg-green-700"
                            >
                              Unblock
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={loadBlockedUsersList}
                      disabled={blockedUsersLoading}
                      className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                    >
                      Refresh
                    </button>
                    <div className="text-xs text-gray-500">{blockedUsersList.length} blocked</div>
                  </div>
                </div>
              </div>
            )}

            {showUsernameDialog && (
              <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[10000] w-80 bg-white border rounded shadow-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Change Username</div>
                  <button
                    onClick={() => {
                      setShowUsernameDialog(false);
                      setUsernameForm({ newUsername: '', password: '', otp: '' });
                      setUsernameMsg('');
                    }}
                    className="text-sm text-gray-500"
                  >Close</button>
                </div>
                <p className="text-sm mb-2">
                  Provide the new username you want and confirm with your password and an OTP sent to your email.
                </p>
                <input
                  type="text"
                  placeholder="New username"
                  value={usernameForm.newUsername}
                  onChange={(e) => setUsernameForm({ ...usernameForm, newUsername: e.target.value })}
                  className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={usernameForm.password}
                  onChange={(e) => setUsernameForm({ ...usernameForm, password: e.target.value })}
                  className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100"
                />
                <div className="flex items-center space-x-2">
                  <input
                    placeholder="OTP code"
                    value={usernameForm.otp}
                    onChange={(e) => setUsernameForm({ ...usernameForm, otp: e.target.value })}
                    className="flex-1 p-2 border rounded text-black mt-2 shadow-lg shadow-black/100"
                  />
                  <button onClick={sendUsernameOtp} className="px-3 py-2 bg-blue-600 text-white rounded mt-2">
                    Send OTP
                  </button>
                </div>
                <button
                  onClick={doChangeUsername}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded mt-4"
                >
                  Change username
                </button>
                {usernameMsg && <p className="mt-2 text-sm text-red-600">{usernameMsg}</p>}
              </div>
            )}

            {communityManageOpen && activeCommunity && (
              <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                <div className="absolute inset-0 bg-black/60" onClick={() => !communitySaving && setCommunityManageOpen(false)} />
                <div className="relative w-[94vw] max-w-2xl max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-5 text-black">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-semibold text-lg">Manage Community</div>
                    <button onClick={() => setCommunityManageOpen(false)} className="text-gray-500">✕</button>
                  </div>
                  <div className="space-y-3">
                    <input
                      value={communityManageName}
                      onChange={(e) => setCommunityManageName(e.target.value)}
                      placeholder="Community name"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                    <textarea
                      value={communityManagePurpose}
                      onChange={(e) => setCommunityManagePurpose(e.target.value)}
                      placeholder="Community purpose"
                      className="w-full border rounded-lg px-3 py-2 min-h-24"
                    />
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setMsg('Uploading community image...');
                            const url = await uploadCommunityProfilePicture(file);
                            setCommunityManageProfilePicture(url);
                            setMsg('');
                          } catch (err: any) {
                            setMsg(err?.response?.data?.message || 'Failed to upload community image');
                          }
                        }}
                        className="block w-full text-sm"
                      />
                      {communityManageProfilePicture && (
                        <img src={resolveMediaUrl(communityManageProfilePicture)} alt="community" className="w-14 h-14 rounded-full object-cover border" />
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setCommunityManageOpen(false)} className="px-4 py-2 bg-gray-200 rounded-lg">
                        Cancel
                      </button>
                      <button onClick={saveCommunitySettings} disabled={communitySaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                        {communitySaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="font-semibold mb-3">Members</div>
                    <div className="space-y-2">
                      {(activeCommunityDetails?.members || []).map((member: any) => {
                        const memberId = String(member?._id || member?.id || '');
                        const isAdmin = memberId === String(activeCommunityDetails?.createdBy?._id || activeCommunityDetails?.createdBy?.id || '');
                        return (
                          <div key={memberId} className="flex items-center justify-between gap-3 border rounded-xl p-3">
                            <div className="flex items-center gap-3">
                              {member?.profilePicture ? (
                                <img src={resolveMediaUrl(member.profilePicture)} alt={member?.username || member?.name || 'member'} className="w-10 h-10 rounded-full object-cover border" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-semibold">
                                  {String(member?.username || member?.name || 'U').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="text-sm font-medium">
                                  {member?.username || member?.name || 'Member'} {isAdmin ? '(Admin)' : ''}
                                </div>
                                {member?.name && member?.username && member.name !== member.username && (
                                  <div className="text-xs text-gray-500">{member.name}</div>
                                )}
                              </div>
                            </div>
                            {!isAdmin && (
                              <button
                                onClick={() => removeCommunityMember(memberId)}
                                disabled={communityRemovingMemberId === memberId}
                                className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
                              >
                                {communityRemovingMemberId === memberId ? 'Removing...' : 'Remove'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                            const grp = getGroupById(msg.groupId);
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
                  )
                })}
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
                            const grp = getGroupById(msg.groupId);
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
                      const grp = getGroupById(msg.groupId);
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

      {mode === 'communities' && showCreateGroup && (
        <div className="fixed top-4 left-4 z-50">
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-80">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Create Community</h3>
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  resetCreateCommunityForm();
                }}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={newPublicGroupName}
                onChange={(e) => setNewPublicGroupName(e.target.value)}
                placeholder="Community name"
                className="w-full p-2 border rounded text-black"
                onKeyPress={(e) => e.key === 'Enter' && createAndEnterPublicGroup()}
              />
              <textarea
                value={newPublicGroupPurpose}
                onChange={(e) => setNewPublicGroupPurpose(e.target.value)}
                placeholder="Purpose of community"
                className="w-full p-2 border rounded text-black min-h-24"
              />
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setMsg('Uploading community image...');
                      const url = await uploadCommunityProfilePicture(file);
                      setNewPublicGroupProfilePicture(url);
                      setMsg('');
                    } catch (err: any) {
                      setMsg(err?.response?.data?.message || 'Failed to upload community image');
                    }
                  }}
                  className="block w-full text-sm text-black"
                />
              </div>
              {newPublicGroupProfilePicture && (
                <img
                  src={resolveMediaUrl(newPublicGroupProfilePicture)}
                  alt="community"
                  className="w-16 h-16 rounded-full object-cover border"
                />
              )}
              <button
                onClick={createAndEnterPublicGroup}
                disabled={isCreatingPublicGroup}
                className="w-full px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50 hover:bg-green-700"
              >
                {isCreatingPublicGroup ? '...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'communities' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1 bg-gray-800/60 rounded-full p-1 mb-4">
            <button
              onClick={() => setMode('private')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white"
            >
              👤 Private
            </button>
            <button
              onClick={() => setMode('communities')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 bg-blue-600 text-white shadow"
            >
              🌐 Community
            </button>
            <button
              onClick={() => setMode('random')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white"
            >
              🕵️ Random
            </button>
          </div>

          <button
            onClick={() => {
              setShowCreateGroup(true);
            }}
            className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-md"
          >
            <span className="text-lg leading-none">+</span> Create Community
          </button>

           <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
            <aside className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div className="font-semibold text-slate-900">Discover communities</div>
                  <div className="text-xs text-slate-500 mt-0.5">Independent from groups. Join communities and post to their feed.</div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      value={publicGroupSearch}
                      onChange={(e) => setPublicGroupSearch(e.target.value)}
                      placeholder="Search by community name"
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-black"
                    />
                    <button
                      onClick={searchPublicGroups}
                      disabled={isSearchingPublicGroups}
                      className="px-3 py-2 bg-slate-900 text-white rounded-xl disabled:opacity-50"
                    >
                      {isSearchingPublicGroups ? '...' : 'Search'}
                    </button>
                  </div>

                  {(publicGroupSearch.trim() ? publicGroupResults : communityDirectory).slice(0, 12).map((g: any) => (
                    <button
                      key={g.id}
                      onClick={() => g.isMember ? enterCommunity(g) : joinAndEnterPublicGroup(g)}
                      className="w-full text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition p-3"
                    >
                      <div className="flex items-start gap-3">
                        {g.profilePicture ? (
                          <img src={resolveMediaUrl(g.profilePicture)} alt={g.name || 'community'} className="w-11 h-11 rounded-2xl object-cover border border-slate-200 flex-shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {String(g.name || 'C').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 truncate">soc/{g.name || g.groupName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{g.memberCount || 0} members</div>
                          {g.purpose && <div className="text-xs text-slate-600 mt-1 line-clamp-2">{g.purpose}</div>}
                        </div>
                        <div className={`text-[11px] font-semibold px-2 py-1 rounded-full ${g.isMember ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {g.isMember ? 'Open' : 'Join'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div className="font-semibold text-slate-900">Your communities</div>
                </div>
                <div className="p-3 space-y-2">
                  {myPublicGroups.length === 0 ? (
                    <div className="text-sm text-slate-500 px-2 py-4">You have not joined any community yet.</div>
                  ) : myPublicGroups.map((g: any) => (
                    <button
                      key={g.id}
                      onClick={() => enterCommunity(g)}
                      className={`w-full text-left rounded-2xl border px-3 py-3 transition ${String(activeCommunity?.id || '') === String(g.id) ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="font-semibold text-slate-900 truncate">soc/{g.name || g.groupName}</div>
                      <div className="text-xs text-slate-500 mt-1">{g.purpose || `${g.memberCount || 0} members`}</div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="space-y-4">
              {!activeCommunity && (
                <div className="rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-sm">
                  <div className="px-6 py-8 bg-gradient-to-br from-orange-100 via-white to-slate-100">
                    <div className="text-xs uppercase tracking-[0.22em] text-orange-700 font-semibold">Communities</div>
                    <h2 className="mt-2 text-3xl font-black text-slate-900">post something valuable</h2>
                    {/* <p className="mt-2 max-w-2xl text-sm text-slate-600">Communities are feed-based. Members join around a topic, then post to the community.</p> */}
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {communityDirectory.slice(0, 6).map((community: any) => (
                      <div key={community.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-3">
                          {community.profilePicture ? (
                            <img src={resolveMediaUrl(community.profilePicture)} alt={community.name} className="w-14 h-14 rounded-2xl object-cover border border-slate-200" />
                          ) : (
                            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center text-lg font-bold">
                              {String(community.name || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-lg font-bold text-slate-900 truncate">soc/{community.name}</div>
                            <div className="text-xs text-slate-500">{community.memberCount || 0} members</div>
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-slate-600 min-h-[40px]">{community.purpose || 'A topic community waiting for its first strong thread.'}</p>
                        <div className="mt-4 flex items-center gap-2">
                          <button
                            onClick={() => community.isMember ? enterCommunity(community) : joinAndEnterPublicGroup(community)}
                            className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold"
                          >
                            {community.isMember ? 'Open Feed' : 'Join Community'}
                          </button>
                          {community.isCreator && <span className="text-xs text-orange-700 font-semibold">Admin</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeCommunity && (
                <>
                  <div className="rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-sm">
                    <div className="h-20 bg-gradient-to-r from-orange-500 via-red-400 to-amber-300" />
                    <div className="px-5 pb-5">
                      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 -mt-8">
                        <div className="flex items-end gap-4">
                          {activeCommunityDetails?.profilePicture ? (
                            <img src={resolveMediaUrl(activeCommunityDetails.profilePicture)} alt={activeCommunityDetails.name} className="w-20 h-20 rounded-[24px] object-cover border-4 border-white shadow-sm bg-white" />
                          ) : (
                            <div className="w-20 h-20 rounded-[24px] bg-white border-4 border-white shadow-sm flex items-center justify-center text-2xl font-black text-orange-700">
                              {String(activeCommunityDetails?.name || activeCommunity.name || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="pb-1">
                            <div className="text-2xl font-black text-slate-900">soc/{activeCommunityDetails?.name || activeCommunity.name}</div>
                            <div className="text-sm text-slate-500">{activeCommunityDetails?.memberCount || 0} members</div>
                            <div className="mt-1 text-sm text-slate-700 max-w-2xl">{activeCommunityDetails?.purpose || 'No purpose added yet.'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActiveCommunity(null)}
                            className="px-4 py-2 rounded-full border border-slate-300 bg-white text-slate-800 text-sm font-semibold"
                          >
                            Back To Discover
                          </button>
                          {activeCommunity.isCreator && (
                            <button onClick={() => setCommunityManageOpen(true)} className="px-4 py-2 rounded-full bg-amber-600 text-white text-sm font-semibold">
                              Manage Community
                            </button>
                          )}
                          {activeCommunity.isCreator && (
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Delete community "${activeCommunity.name || activeCommunity.groupName}"?`)) return;
                                await api.delete(`/communities/${activeCommunity.id}`);
                                setMyPublicGroups((prev) => prev.filter((item: any) => String(item.id) !== String(activeCommunity.id)));
                                setCommunityDirectory((prev) => prev.filter((item: any) => String(item.id) !== String(activeCommunity.id)));
                                setActiveCommunity(null);
                                setActiveCommunityDetails(null);
                                setCommunityPosts([]);
                              }}
                              className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                      <div className="font-semibold text-slate-900">Create A Post In soc/{activeCommunityDetails?.name || activeCommunity.name}</div>
                      <div className="text-xs text-slate-500 mt-1">Posts appear under the community identity, with the member shown as the author beneath it.</div>
                    </div>
                    <div className="p-5 space-y-4">
                      <textarea
                        value={communityPostContent}
                        onChange={(e) => setCommunityPostContent(e.target.value)}
                        placeholder={`Share something with soc/${activeCommunityDetails?.name || activeCommunity.name}`}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-black min-h-28"
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <input
                          ref={communityPostImageInputRef}
                          type="file"
                          accept="image/*,video/*"
                          onChange={(e) => setCommunityPostImage(e.target.files?.[0] || null)}
                          className="block w-full text-sm"
                        />
                        <button
                          onClick={createCommunityPost}
                          disabled={communityPosting}
                          className="px-5 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {communityPosting ? 'Posting...' : 'Publish Post'}
                        </button>
                      </div>
                      {communityPostImage && (
                        <div className="text-xs text-slate-500">Selected: {communityPostImage.name}</div>
                      )}
                    </div>
                  </div>

                  {communityPostsLoading ? (
                    <div className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">Loading community posts...</div>
                  ) : communityPosts.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
                      <div className="text-lg font-semibold text-slate-900">No posts in this community yet</div>
                      <div className="text-sm text-slate-500 mt-1">Start the first thread for soc/{activeCommunityDetails?.name || activeCommunity.name}.</div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {communityPosts.map((post: any) => {
                        const postId = String(post?._id || post?.id || '');
                        const isAnonymousPost = (post as any).anonymous === true || (post as any).anonymous === 'true';
                        const postUserId = String(post.user?._id || post.user?.id || '');
                        const media = String(post?.imageUrl || '');
                        const isVideo = !!media && /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(media);
                        const userEmoji = post.userReactions?.[me?.id];
                        const hasReacted = !!userEmoji;
                        return (
                          <article key={postId} className="rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="px-5 pt-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  {activeCommunityDetails?.profilePicture ? (
                                    <img src={resolveMediaUrl(activeCommunityDetails.profilePicture)} alt={activeCommunityDetails?.name || 'community'} className="w-12 h-12 rounded-2xl object-cover border border-slate-200 flex-shrink-0" />
                                  ) : (
                                    <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold flex-shrink-0">
                                      {String(activeCommunityDetails?.name || activeCommunity?.name || 'C').charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate">soc/{activeCommunityDetails?.name || activeCommunity?.name}</div>
                                    <div className="text-xs text-slate-500 truncate">
                                      posted by {isAnonymousPost ? 'anonymous member' : `u/${post.user?.username || post.user?.name || 'member'}`} · {shortTimeAgo(post.createdAt)}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 relative">
                                  {String(post.user?._id || post.user?.id) === String(myId) && (
                                    <button onClick={() => deletePost(postId)} className="px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
                                      Delete
                                    </button>
                                  )}
                                  <button onClick={() => setMenuOpen(menuOpen === postId ? null : postId)} className="h-9 w-9 rounded-full bg-slate-100 text-slate-700">
                                    ⋮
                                  </button>
                                  {menuOpen === postId && String(post.user?._id || post.user?.id) !== String(myId) && (
                                    <div className="absolute right-0 top-10 w-40 bg-white border rounded-xl shadow z-30 overflow-hidden">
                                      <button
                                        onClick={() => {
                                          openReportDialog({
                                            type: 'post',
                                            postId,
                                            userId: String(post.user?._id || post.user?.id || ''),
                                            username: String(post.user?.username || ''),
                                          });
                                          setMenuOpen(null);
                                        }}
                                        className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-red-700 text-sm"
                                      >
                                        Report Post
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {post.content && <div className="mt-4 text-[15px] leading-7 text-slate-900 whitespace-pre-wrap">{post.content}</div>}
                            </div>

                            {media && (
                              <div className="mt-4 bg-slate-100">
                                {isVideo ? (
                                  <video src={resolveMediaUrl(media)} controls className="w-full max-h-[70vh] object-cover" />
                                ) : (
                                  <img src={resolveMediaUrl(media)} alt="community post" className="w-full max-h-[70vh] object-cover" />
                                )}
                              </div>
                            )}

                            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
                              <div className="flex flex-wrap items-center gap-2">
                                {[
                                  { emoji: '♡', activeClass: 'text-red-500' },
                                  { emoji: '☺', activeClass: 'text-yellow-500' },
                                  { emoji: '☹', activeClass: 'text-blue-500' },
                                  { emoji: '>_<', activeClass: 'text-red-500' },
                                ].map((item) => (
                                  <button
                                    key={item.emoji}
                                    onClick={() => handleEmojiReaction(postId, item.emoji)}
                                    disabled={hasReacted && userEmoji !== item.emoji}
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white ${userEmoji === item.emoji ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-700'} ${hasReacted && userEmoji !== item.emoji ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    <span className={userEmoji === item.emoji ? item.activeClass : ''}>{item.emoji}</span>
                                    <span>{post.reactions?.[item.emoji] || 0}</span>
                                  </button>
                                ))}
                                <button
                                  onClick={() => setShowComments(prev => ({ ...prev, [postId]: !prev[postId] }))}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm bg-white text-slate-700"
                                >
                                  💬 <span>{post.comments?.length || 0}</span>
                                </button>
                              </div>

                              {showComments[postId] && (
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                                  <div className="font-semibold text-slate-900 mb-3">Comments</div>
                                  <div className="space-y-2 mb-4">
                                    {!post.comments || post.comments.length === 0 ? (
                                      <div className="text-sm text-slate-500">No comments yet.</div>
                                    ) : (
                                      post.comments.map((comment: any, idx: number) => (
                                        <div key={idx} className="rounded-xl bg-slate-50 px-3 py-2">
                                          <div className="text-xs text-slate-500">
                                            u/{comment.user?.username || comment.user?.name || 'member'} · {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                          </div>
                                          <div className="text-sm text-slate-900 mt-1 break-words">{comment.content}</div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={commentText[postId] || ''}
                                      onChange={(e) => setCommentText(prev => ({ ...prev, [postId]: e.target.value }))}
                                      onKeyPress={(e) => e.key === 'Enter' && handleAddComment(postId)}
                                      placeholder={`Reply to soc/${activeCommunityDetails?.name || activeCommunity?.name}`}
                                      className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm text-black"
                                      disabled={submittingComment[postId] || false}
                                    />
                                    <button
                                      onClick={() => handleAddComment(postId)}
                                      disabled={submittingComment[postId] || !commentText[postId]?.trim()}
                                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
                                    >
                                      {submittingComment[postId] ? '...' : 'Reply'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      )}

      {mode === 'status' && (
        <div className="pb-4">
          {/* Header with streak */}
          <div className="flex items-center justify-between px-1 mb-3">
            <div>
              <h2 className="text-white font-bold text-base">📚 Today's Learning</h2>
              <p className="text-gray-400 text-xs">Share what you learned today</p>
            </div>
            {myStreak > 0 && (
              <div className="flex items-center gap-1.5 bg-orange-500/20 border border-orange-500/40 px-3 py-1.5 rounded-full">
                <span className="text-lg">🔥</span>
                <span className="text-orange-400 font-bold text-sm">{myStreak}</span>
                <span className="text-orange-300 text-xs">{myStreak === 1 ? 'day' : 'days'}</span>
              </div>
            )}
          </div>

          {/* Stories Row */}
          <div className="flex items-center gap-3 overflow-x-auto px-1 py-3 no-scrollbar">
            {/* Add Learning Button */}
            <div className="flex flex-col items-center flex-shrink-0">
              <button
                onClick={() => setStatusFormOpen(!statusFormOpen)}
                className="w-16 h-16 rounded-full bg-gray-800 border-2 border-dashed border-orange-500 flex items-center justify-center hover:border-orange-400 transition-all hover:scale-105"
                title="Share Today's Learning"
              >
                <span className="text-3xl text-orange-400">+</span>
              </button>
              <span className="text-[11px] text-gray-400 mt-1">
                {myStreak > 0 ? `🔥 ${myStreak}` : 'Start'}
              </span>
            </div>

            {/* My own statuses — shown first */}
            {statuses.filter(s => String(s.userId) === myId).map((s) => {
              const id = s._id || s.id;
              const isSelected = String(selectedStatusId) === String(id);
              return (
                <div key={String(id)} className="flex flex-col items-center flex-shrink-0 cursor-pointer" onClick={() => handleSelectStatus(s)}>
                  <div className={`w-16 h-16 rounded-full p-0.5 ${isSelected ? 'bg-orange-500' : 'bg-gradient-to-tr from-orange-400 to-yellow-500'}`}>
                    <div className="w-full h-full rounded-full bg-black overflow-hidden flex items-center justify-center relative">
                      {s.mediaUrl ? (
                        <img src={resolveMediaUrl(s.mediaUrl)} alt="my learning" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xs text-center px-1 line-clamp-3">{s.content}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-300 mt-1">
                    {myStreak > 0 ? `🔥${myStreak}` : 'Me'}
                  </span>
                </div>
              );
            })}

            {/* Other users' statuses */}
            {statuses.filter(s => String(s.userId) !== String(me?.id)).map((s) => {
              const id = s._id || s.id;
              const username = usernameFor(s.userId);
              const isSelected = String(selectedStatusId) === String(id);
              const initial = (username || 'U').charAt(0).toUpperCase();
              const streak = s.streak || 0;
              return (
                <div key={String(id)} className="flex flex-col items-center flex-shrink-0 cursor-pointer" onClick={() => handleSelectStatus(s)}>
                  <div className={`w-16 h-16 rounded-full p-0.5 ${isSelected ? 'bg-blue-500' : streak >= 3 ? 'bg-gradient-to-tr from-orange-400 via-red-500 to-yellow-500' : 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'}`}>
                    <div className="w-full h-full rounded-full bg-black overflow-hidden flex items-center justify-center">
                      {s.mediaUrl && (s.mediaType === 'image' || String(s.mediaUrl).match(/\.(png|jpe?g|gif|webp)(\?|$)/i)) ? (
                        <img src={resolveMediaUrl(s.mediaUrl)} alt={username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-xl">{initial}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-300 mt-1 max-w-[64px] truncate text-center">
                    {streak > 0 ? `🔥${streak}` : username}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Compose Learning */}
          {statusFormOpen && (
            <div className="mx-1 mb-4 bg-gray-900 border border-orange-500/30 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold text-base">📚 What did you learn today?</h3>
                    {myStreak > 0 && (
                      <p className="text-orange-400 text-xs mt-0.5">🔥 {myStreak} day streak — keep it going!</p>
                    )}
                  </div>
                  <button onClick={() => setStatusFormOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
                </div>
                <textarea
                  value={statusContent}
                  onChange={(e) => setStatusContent(e.target.value)}
                  placeholder="E.g. Today I learned about React hooks, solved 2 DSA problems, read about neural networks..."
                  rows={4}
                  className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700"
                />
                <div className="mt-3 flex items-center gap-2">
                  <input id="status-file" type="file" accept="image/*,video/*" onChange={handleFileChange} className="hidden" disabled={isUploadingStatusMedia} />
                  <label htmlFor="status-file" className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium cursor-pointer transition ${isUploadingStatusMedia ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>
                    📷 {isUploadingStatusMedia ? 'Uploading...' : 'Photo/Video'}
                  </label>
                  {selectedFileName && <span className="text-xs text-gray-400 truncate max-w-[120px]">{selectedFileName}</span>}
                  <button
                    onClick={createStatus}
                    disabled={!statusContent.trim() && !statusMediaUrl}
                    className="ml-auto px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition"
                  >
                    🔥 Share
                  </button>
                </div>
                {statusMediaUrl && (
                  <div className="mt-3 rounded-xl overflow-hidden max-h-48">
                    {statusMediaType === 'image' || statusMediaUrl.startsWith('data:image') ? (
                      <img src={statusMediaUrl} alt="preview" className="w-full object-cover max-h-48" />
                    ) : (
                      <video src={statusMediaUrl} controls muted className="w-full max-h-48" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Full Status Viewer */}
          {selectedStatusId && (() => {
            const selectedStatus = statuses.find(s => String(s._id || s.id) === String(selectedStatusId));
            if (!selectedStatus) return null;
            const username = usernameFor(selectedStatus.userId);
            const isOwn = String(selectedStatus.userId) === myId;
            const viewerStreak = isOwn ? myStreak : (selectedStatus.streak || 0);
            return (
              <div className="fixed inset-0 z-[200] bg-black flex flex-col" onClick={() => setSelectedStatusId(null)}>
                {/* Header */}
                <div className="flex items-center gap-3 px-4 pt-12 pb-3" onClick={e => e.stopPropagation()}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 via-red-500 to-yellow-500 p-0.5 flex-shrink-0">
                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                      <span className="text-white font-bold">{(username || 'U').charAt(0).toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm">{isOwn ? 'You' : username}</span>
                      {viewerStreak > 0 && (
                        <span className="text-xs bg-orange-500/30 text-orange-300 px-2 py-0.5 rounded-full font-bold">🔥 {viewerStreak}</span>
                      )}
                    </div>
                    <div className="text-orange-400 text-xs font-medium">📚 Today's Learning</div>
                    <div className="text-gray-400 text-xs">{new Date(selectedStatus.createdAt).toLocaleString()}</div>
                  </div>
                  {isOwn && (
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span>👁 {selectedStatus.views || 0}</span>
                      <button onClick={() => setShowViewerDropdown(v => !v)} className="text-gray-400 hover:text-white px-2 py-1 bg-gray-800 rounded-lg text-xs">Seen by ▾</button>
                      {showViewerDropdown && (
                        <div className="absolute right-4 top-24 w-52 max-h-52 overflow-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50">
                          {(selectedStatus.viewers || []).length === 0 ? (
                            <div className="p-3 text-sm text-gray-400 text-center">No views yet</div>
                          ) : (selectedStatus.viewers || []).map((v: any) => (
                            <div key={String(v._id || v.id || v.username)} className="px-4 py-2 text-sm text-white border-b border-gray-800 last:border-0">{v.username || v.name}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => setSelectedStatusId(null)} className="text-white text-2xl ml-2">✕</button>
                </div>

                {/* Media */}
                <div className="flex-1 flex items-center justify-center px-2" onClick={e => e.stopPropagation()}>
                  {selectedStatus.mediaUrl ? (
                    String(selectedStatus.mediaUrl).match(/\.(mp4|webm|mov|m4v)(\?|$)/i) ? (
                      <video src={resolveMediaUrl(selectedStatus.mediaUrl)} autoPlay controls className="max-h-full max-w-full rounded-xl object-contain" />
                    ) : (
                      <img src={resolveMediaUrl(selectedStatus.mediaUrl)} alt="status" className="max-h-full max-w-full rounded-xl object-contain" onClick={() => setZoomedPostMedia({ src: resolveMediaUrl(selectedStatus.mediaUrl), kind: 'image' })} />
                    )
                  ) : (
                    <div className="flex items-center justify-center p-8">
                      <p className="text-white text-xl text-center font-medium leading-relaxed">{selectedStatus.content}</p>
                    </div>
                  )}
                </div>

                {/* Caption & Actions */}
                <div className="px-4 pb-10 pt-3" onClick={e => e.stopPropagation()}>
                  {selectedStatus.content && selectedStatus.mediaUrl && (
                    <p className="text-white text-sm mb-3">{selectedStatus.content}</p>
                  )}
                  {!isOwn && (
                    <button
                      onClick={() => {
                        const uid = selectedStatus.userId;
                        const u = nearbyUsers.find((x: any) => String(x.id) === String(uid) || String(x._id) === String(uid));
                        if (u) { openPrivateChat(u); setSelectedStatusId(null); }
                        else setMsg('User info not available to start chat');
                      }}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold text-sm transition"
                    >
                      💬 Message {username}
                    </button>
                  )}
                  {isOwn && (
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this status?')) return;
                        try {
                          await api.delete(`/status/${selectedStatus._id || selectedStatus.id}`);
                          setStatuses(prev => prev.filter(x => String(x._id || x.id) !== String(selectedStatus._id || selectedStatus.id)));
                          setSelectedStatusId(null);
                          setMsg('Status deleted');
                        } catch (err: any) { setMsg(err?.response?.data?.message || 'Failed to delete'); }
                      }}
                      className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-semibold text-sm transition"
                    >
                      🗑️ Delete Status
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {statuses.length === 0 && !statusFormOpen && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <div className="text-5xl mb-3">🔥</div>
              <p className="text-sm font-semibold text-gray-300">Start your learning streak!</p>
              <p className="text-xs text-gray-500 mt-1">Post daily to keep your 🔥 alive</p>
            </div>
          )}
        </div>
      )}

      {mode === 'private' && !isPrivateChatPage && (
        <div>
          {/* Chat Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-800/60 rounded-full p-1 mb-4">
            <button
              onClick={() => { setMode('private'); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${mode === 'private' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              👤 Private
            </button>
            <button
              onClick={() => { setMode('communities'); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white"
            >
              🌐 Community
            </button>
            <button
              onClick={() => { setMode('random'); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white"
            >
              🕵️ Random
            </button>
          </div>
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
                  <li key={String(u._id || u.id || u.username)} className="p-2 border rounded flex justify-between items-center text-black">
                    <div>
                      <div className="font-medium text-black">{u.username}</div>
                      <div className="text-sm text-black">{u.name} • {u.isOnline ? 'Online' : 'Offline'}</div>
                    </div>
                    <div className="space-x-2">
                      <button
                        onClick={() => openPrivateChat(u)}
                        className="px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-600 hover:text-white transition"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => deleteFromRecentChats(u)}
                        className="px-2 py-1 border border-red-600 text-red-600 rounded hover:bg-red-600 hover:text-white transition"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-2 space-y-2">
            {searchResults.map((u) => (
              <li key={u._id} className="p-2 border rounded flex justify-between items-center text-black">
                <div
                  className="flex-1 cursor-pointer hover:text-blue-600"
                  onClick={() => window.location.pathname = `/profile/${u._id}`}
                >
                  <div className="font-medium text-black hover:text-blue-600">{u.username}</div>
                  <div className="text-sm text-black">{u.name} • {u.isOnline ? 'Online' : 'Offline'}</div>
                </div>
                <div className="space-x-2">
                  <button
                    onClick={() => openPrivateChat(u)}
                    className="px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-600 hover:text-white transition"
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => deleteFromSearchResults(u)}
                    className="px-2 py-1 border border-red-600 text-red-600 rounded hover:bg-red-600 hover:text-white transition"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isPrivateChatPage && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Private chat</h2>
            <button
              onClick={() => {
                try {
                  history.pushState(null, '', `/message`);
                } catch (e) {
                  // ignore
                }
                setMode('private');
              }}
              className="px-3 py-1 bg-gray-200 rounded text-black"
            >
              Back
            </button>
          </div>

          {!activePrivateUser ? (
            <div className="mt-4 text-sm text-gray-500">No chat selected</div>
          ) : (
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
                            <video src={resolveMediaUrl(m.mediaUrl)} controls autoPlay muted className="max-h-40 mx-auto" />
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
                  <div className="relative flex-1">
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" className="w-full p-2 border rounded text-black" />
                  </div>
                  <button onClick={openFile} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">📎</button>
                  <button onClick={sendMessage} className="px-4 py-2 bg-blue-600 text-white rounded">➤</button>
                </div>

                {messageSelectedFileName && <div className="text-sm text-gray-500 mt-2">Selected: {messageSelectedFileName}</div>}
                {messageMediaUrl && (
                  <div className="mt-2">
                    {messageMediaType === 'image' || messageMediaUrl.startsWith('data:image') ? (
                      <img src={resolveMediaUrl(messageMediaUrl)} alt="preview" className="max-h-40" />
                    ) : (
                      <video src={resolveMediaUrl(messageMediaUrl)} controls autoPlay muted className="max-h-40" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'posts' && (
        <div className="mt-1">

          {postSearchOpen && (
            <div className="mt-3 px-1">
              <div className="relative flex items-center gap-2">
                {/* Search icon inside input */}
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none select-none">🔍</span>
                    <input
                      type="text"
                      value={postSearchQuery}
                      onChange={(e) => setPostSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchUserPosts()}
                      placeholder="Search by username or community name..."
                      autoFocus
                      className="w-full pl-9 pr-4 py-2.5 rounded-full bg-gray-800 text-white placeholder-gray-400 text-sm border border-gray-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200"
                    />
                  {postSearchQuery && (
                    <button
                      onClick={clearPostSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition text-sm"
                    >✕</button>
                  )}
                </div>
                <button
                  onClick={searchUserPosts}
                  disabled={postIsSearching || !postSearchQuery.trim()}
                  className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 shadow-md"
                >
                  {postIsSearching ? (
                    <span className="flex items-center gap-1.5"><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>Searching</span>
                  ) : 'Search'}
                </button>
                {(selectedPostUsername || selectedCommunitySearch) && (
                  <button
                    onClick={() => { clearPostSearch(); setPostSearchOpen(false); }}
                    className="flex-shrink-0 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 px-3 py-2.5 rounded-full text-sm transition-all duration-200"
                    title="Clear search"
                  >✕</button>
                )}
              </div>
              {selectedPostUsername && (
                <p className="mt-2 text-xs text-gray-400 pl-1">
                  Showing posts by <span className="text-blue-400 font-semibold">@{selectedPostUsername}</span>
                </p>
              )}
              {selectedCommunitySearch && (
                <p className="mt-2 text-xs text-gray-400 pl-1">
                  Showing posts from <span className="text-orange-400 font-semibold">soc/{getCommunityName(selectedCommunitySearch)}</span>
                </p>
              )}
            </div>
          )}

          {showFollowersFollowingDropdown && viewingOwnPosts && !selectedFollowersList && (
            <div className="mt-2 p-2 border rounded bg-gray-900 shadow-lg">
              <div className="flex gap-4">
                {/* Followers Section */}
                <div className="flex-1">
                  <h3
                    onClick={() => setSelectedFollowersList('followers')}
                    className="font-semibold text-white cursor-pointer hover:text-blue-400 transition text-sm"
                  >
                    👥 Followers ({followers.length})
                  </h3>
                </div>

                {/* Following Section */}
                <div className="flex-1">
                  <h3
                    onClick={() => setSelectedFollowersList('following')}
                    className="font-semibold text-white cursor-pointer hover:text-green-400 transition text-sm"
                  >
                    👉 Following ({following.length})
                  </h3>
                </div>
              </div>
            </div>
          )}

          {showFollowersFollowingDropdown && viewingOwnPosts && selectedFollowersList === 'followers' && (
            <div className="mt-2 p-3 border rounded bg-gray-900 shadow-lg max-h-80 overflow-y-auto">
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
                    <div key={user._id} className="flex items-center justify-between bg-gray-800 p-2 rounded text-sm hover:bg-gray-700 transition cursor-pointer" onClick={() => openUserPosts(user.username, user._id)}>
                      <div className="flex items-center gap-2 flex-1">
                        <div className="relative w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {user.username?.[0]?.toUpperCase() || 'U'}
                          {user.isOnline && (
                            <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-white"></div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium hover:text-blue-400 transition">{user.username}</div>
                          {user.professionDetail && <div className="text-gray-400 text-xs italic">{user.professionType ? `${user.professionType} - ` : ''}{user.professionDetail}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showFollowersFollowingDropdown && viewingOwnPosts && selectedFollowersList === 'following' && (
            <div className="mt-2 p-3 border rounded bg-gray-900 shadow-lg max-h-80 overflow-y-auto">
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
                    <div key={user._id} className="flex items-center justify-between bg-gray-800 p-2 rounded text-sm hover:bg-gray-700 transition cursor-pointer" onClick={() => openUserPosts(user.username, user._id)}>
                      <div className="flex items-center gap-2 flex-1">
                        <div className="relative w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {user.username?.[0]?.toUpperCase() || 'U'}
                          {user.isOnline && (
                            <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-white"></div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium hover:text-green-400 transition">{user.username}</div>
                          {user.professionDetail && <div className="text-gray-400 text-xs italic">{user.professionType ? `${user.professionType} - ` : ''}{user.professionDetail}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isPostComposerOpen && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 flex-shrink-0 rounded-full bg-white/15 ring-1 ring-white/20 flex items-center justify-center text-white font-bold">
                    {postAnonymous ? '🕶️' : (me?.username?.[0]?.toUpperCase() || 'U')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-semibold leading-tight">Create a post</div>
                    <div className="text-xs text-white/80 truncate">
                      {postAnonymous ? 'Posting anonymously' : `Posting as @${me?.username || 'me'}`}
                      {postPrivate ? ' • Followers only' : ' • Public'}
                      
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsPostComposerOpen(false);
                    resetPostComposer();
                  }}
                  className="h-9 w-9 flex-shrink-0 rounded-full bg-white/15 text-white hover:bg-white/25 transition"
                  title="Close"
                  aria-label="Close composer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <textarea
                    ref={postComposerTextareaRef}
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Write something..."
                    className="w-full min-h-[70px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 placeholder-gray-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                    <span>{postContent.trim().length > 0 ? `${postContent.trim().length} characters` : ''}</span>
                    {(postPrivate || postAnonymous) && (
                      <span className="text-gray-600">
                        {postPrivate ? 'Followers only' : 'Public'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        ref={postImageInputRef}
                        type="file"
                        accept="image/*,video/*"
                        onChange={handlePostImageChange}
                        className="sr-only"
                        id="post-image"
                      />
                      <label
                        htmlFor="post-image"
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-sm transition ${postLoading ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800 cursor-pointer'
                          }`}
                      >
                        📎 Attach media from gallery
                      </label>
                      {postImage && (
                        <button
                          type="button"
                          onClick={() => {
                            setPostImage(null);
                            try {
                              if (postImageInputRef.current) postImageInputRef.current.value = '';
                            } catch { }
                          }}
                          className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {postImage ? (
                        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                          <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            {postImage.type.startsWith('video/') ? '🎬' : '🖼️'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{postImage.name}</div>
                            <div className="text-xs text-gray-500">{(postImage.size / 1024 / 1024).toFixed(1)} MB</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500"> upload an image or video</div>
                      )}
                    </div>
                  </div>

                  {postImagePreviewUrl && postImage && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      {postImage.type.startsWith('video/') ? (
                        <video src={postImagePreviewUrl} controls autoPlay muted className="w-full max-h-72 rounded-lg bg-black" />
                      ) : (
                        <img src={postImagePreviewUrl} alt="Selected media preview" className="w-full max-h-72 object-contain rounded-lg bg-white" />
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="text-sm font-medium text-gray-900">Attach a song</div>
                    {postSong && (
                      <button
                        type="button"
                        onClick={() => setPostSong('')}
                        className="text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {publicSongs.map((name) => {
                        const songUrl = `/${encodeURIComponent(name)}`;
                        return (
                          <SongSelector
                            key={name}
                            songUrl={songUrl}
                            songName={name.replace('.mp3', '')}
                            isSelected={postSong === songUrl}
                            onSelect={() => setPostSong(songUrl)}
                            postImage={postImage}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition cursor-pointer select-none ${postAnonymous ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    <input type="checkbox" checked={postAnonymous} onChange={(e) => setPostAnonymous(e.target.checked)} className="h-4 w-4 accent-amber-600" />
                    Anonymous
                  </label>

                  <label
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition cursor-pointer select-none ${postPrivate ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    <input type="checkbox" checked={postPrivate} onChange={(e) => setPostPrivate(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                    Followers only
                  </label>


                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    resetPostComposer();
                    setIsPostComposerOpen(false);
                  }}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 transition"
                >
                  Clear
                </button>
                <button
                  onClick={createPost}
                  disabled={postLoading}
                  className="rounded-full bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {postLoading ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {/* Profile Header for Searched User */}
            {selectedPostUsername && selectedUserProfile && (
              <div className="bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 p-6 rounded shadow border border-transparent">
                <div className="flex items-center gap-4 mb-4">
                  {/* Profile Picture */}
                  <div className="relative w-20 h-20 flex-shrink-0">
                    {selectedUserProfile?.profilePicture ? (
                      <img
                        key={selectedUserProfile?.profilePicture}
                        src={resolveMediaUrl(selectedUserProfile.profilePicture)}
                        alt={selectedUserProfile?.name}
                        className="w-full h-full rounded-full object-cover border-2 border-blue-500"
                      />
                    ) : (
                      <img
                        src={defaultInfinityLogo}
                        alt="Infinity Logo"
                        className="w-full h-full rounded-full object-cover border-2 border-blue-500"
                      />
                    )}
                    {/* Online Indicator */}
                    {selectedUserProfile?.isOnline && (
                      <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>

                  {/* User Info */}
                  <div className="flex-1">
                    <div className="text-lg text-blue-600 font-semibold">@{selectedUserProfile?.username}</div>
                    <div className="text-white">{selectedUserProfile?.name}</div>
                    {selectedUserProfile?.professionDetail && (
                      <div className="text-sm text-red-500 mt-2 italic">{selectedUserProfile.professionType ? `${selectedUserProfile.professionType} - ` : ''}{selectedUserProfile.professionDetail}</div>
                    )}
                    {selectedUserProfile?.additionalDetails && selectedUserProfile.additionalDetails.length > 0 && (
                      <div className="mt-1">
                        {selectedUserProfile.additionalDetails.map((detail: string, idx: number) => (
                          <div key={idx} className="text-xs text-red-400 italic">{detail}</div>
                        ))}
                      </div>
                    )}

                    <div className="text-sm text-grey-300">
                      Joined: {selectedUserProfile?.createdAt ? new Date(selectedUserProfile.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>


                </div>
              </div>
            )}

            {selectedPostUsername && !selectedUserProfile && (
              <div className="p-3 bg-blue-50 border text-black border-blue-200 rounded text-sm">
                <strong>Posts by @{selectedPostUsername}</strong>
                {postSearchResults.length === 0 && <p className="text-gray-600 mt-1">No posts found</p>}
              </div>
            )}

            {selectedCommunitySearch && (
              <div className="p-4 rounded-xl border border-orange-200 bg-orange-50 text-black">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Posts from soc/{getCommunityName(selectedCommunitySearch)}</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedCommunitySearch?.purpose || 'Community feed search results'}</div>
                  </div>
                  <button
                    onClick={() => enterCommunity(selectedCommunitySearch)}
                    className="px-3 py-1.5 rounded-full bg-orange-600 text-white text-sm font-semibold"
                  >
                    Open Community
                  </button>
                </div>
                {postSearchResults.length === 0 && <p className="text-gray-600 mt-2 text-sm">No posts found</p>}
              </div>
            )}

            {viewingOwnPosts && (
              <button
                onClick={() => setMyPostsView(false)}
                className="mb-3 flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
              >
                ← Back
              </button>
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
                  className="rounded-lg p-4 bg-black relative overflow-visible" // allow kebab menu to overflow
                  ref={registerPostCardEl(String(post._id || post.id || ''))}
                >
                  {/* Floating Emoji Animations */}
                  {floatingEmojis.map((floatingEmoji) => {
                    if (floatingEmoji.postId !== post._id) return null;
                    return (
                      <div
                        key={floatingEmoji.id}
                        className="absolute pointer-events-none text-4xl font-bold"
                        style={{
                          animation: `floatUp 2s ease-in forwards`,
                          left: '50%',
                          bottom: '20px',
                          zIndex: 40,
                          transform: 'translateX(-50%)',
                        }}
                      >
                        {floatingEmoji.emoji}
                      </div>
                    );
                  })}

                  <style>{`
                    @keyframes floatUp {
                      0% {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                      }
                      100% {
                        opacity: 0;
                        transform: translateY(-120px) scale(1.5);
                      }
                    }
                  `}</style>

                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {/* <div className="font-semibold text-blue-500"><h1>{post.user?.name || 'Unknown'} ---------</h1></div> */}
                      <div className='flex items-center gap-2'>
                        <div
                          className={`relative w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border border-blue-500 flex-shrink-0 ${!isAnonymousPost && post.user?.profilePicture ? 'cursor-pointer hover:opacity-90' : ''
                            }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isAnonymousPost && post.user?.profilePicture) {
                              setZoomedProfilePicSrc(resolveMediaUrl(post.user.profilePicture));
                            }
                          }}
                          title={!isAnonymousPost && post.user?.profilePicture ? 'View profile picture' : undefined}
                        >
                          <img
                            src={
                              !isAnonymousPost && post.user?.profilePicture
                                ? resolveMediaUrl(post.user.profilePicture)
                                : defaultInfinityLogo
                            }
                            alt="avatar"
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = defaultInfinityLogo;
                            }}
                            loading="lazy"
                          />
                        </div>
                        <div className="flex flex-col">
                          {isAnonymousPost ? (
                            <span className='text-red-600 font-semibold'>⚠️ Anonymous</span>
                          ) : (
                            <h1
                              className='text-blue-500 cursor-pointer hover:underline leading-tight'
                              onClick={() => {
                                const uname = String(post.user?.username || '').trim();
                                const uid = String(post.user?._id || post.user?.id || '').trim();
                                openUserPosts(uname, uid || undefined);
                                try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { }
                              }}
                            >
                              @{post.user?.username || 'unknown'}
                            </h1>
                          )}
                          {post.createdAt && (
                            <span className="text-xs text-gray-400 leading-tight">{shortTimeAgo(post.createdAt)}</span>
                          )}
                          {getCommunityName(post.community) && (
                            <button
                              type="button"
                              onClick={() => openCommunityPostsSearch(post.community)}
                              className="w-fit text-[11px] leading-tight text-orange-400 hover:text-orange-300"
                            >
                              soc/{getCommunityName(post.community)}
                            </button>
                          )}
                        </div>
                        {/* <h2 className="text-sm text-gray-500 py-1" >{post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'No date'}</h2> */}
                        {showFollowButton && (
                          <button
                            onClick={() => toggleFollowUser(postUserId)}
                            disabled={loadingFollows[postUserId]}
                            className={`px-1.5 py-0.5 rounded-md text-xs leading-4 whitespace-nowrap text-white transition ${followedUsers.has(postUserId)
                              ? ' border border-red-700'
                              : ' border border-blue-700'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {loadingFollows[postUserId] ? '...' : (
                              followedUsers.has(postUserId) ? 'following' : 'Follow'
                            )}
                          </button>
                        )}
                      </div>
                      <p className="mt-0 text-white">{post.content}</p>
                    </div>
                    <div className="flex items-center gap-2 relative z-20" onClick={(e) => e.stopPropagation()}>
                      {post.songUrl && (
                        <button
                          onClick={() => togglePostMute(post._id || post.id)}
                          className="px-2 py-1 text-gray-500 hover:text-gray-700 z-20 relative"
                          title={!audioAutoplayEnabled || postMuted[post._id || post.id] ? 'Play / Unmute' : 'Mute'}
                        >
                          {!audioAutoplayEnabled || postMuted[post._id || post.id] ? '🔇' : '🔊'}
                        </button>
                      )}
                      <button onClick={() => setMenuOpen(menuOpen === post._id ? null : post._id)} className="px-2 py-1 text-gray-500 hover:text-gray-700 z-20 relative">⋮</button>
                      {menuOpen === post._id && (
                        <div className="absolute right-0 mt-1 w-36 bg-white border rounded shadow z-50">
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
                              {!isAnonymousPost && postUserId && (
                                <button
                                  onClick={async () => {
                                    try {
                                      if (blockedUsers.has(postUserId)) {
                                        await handleUnblockUser(postUserId);
                                      } else {
                                        await handleBlockUser(postUserId);
                                      }
                                    } finally {
                                      setMenuOpen(null);
                                    }
                                  }}
                                  className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-900"
                                >
                                  {blockedUsers.has(postUserId) ? 'Unblock User' : 'Block User'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {post.imageUrl && (
                    <div className="mt-2 shadow-lg rounded-none sm:rounded-lg overflow-hidden relative -mx-4 sm:mx-0">
                      {(() => {
                        const pid = String(post._id || post.id || '');
                        const baseUrl = resolveMediaUrl(post.imageUrl);
                        const retry = postMediaRetry[pid];
                        const src = retry
                          ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${retry}`
                          : baseUrl;
                        const isVideo = src.match(/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i);
                        const isLocked = post.isContentLocked;

                        return (
                          <div className={`${isLocked ? 'blur-3xl' : ''}`}>
                            {isVideo ? (
                              <AutoPlayOnScreenVideo
                                src={src}
                                className={`w-full h-auto max-h-[75vh] sm:max-h-[60vh] object-cover sm:object-contain ${!isLocked ? 'cursor-zoom-in' : ''}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!isLocked) setZoomedPostMedia({ src, kind: 'video' });
                                }}
                                onError={() => {
                                  if (!retry) setPostMediaRetry((prev) => ({ ...prev, [pid]: Date.now() }));
                                }}
                              />
                            ) : (
                              <img
                                src={src}
                                alt="Post"
                                className={`w-full h-auto max-h-[75vh] sm:max-h-[60vh] object-cover sm:object-contain ${!isLocked ? 'cursor-zoom-in' : ''}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!isLocked) setZoomedPostMedia({ src, kind: 'image' });
                                }}
                                onError={() => {
                                  if (!retry) setPostMediaRetry((prev) => ({ ...prev, [pid]: Date.now() }));
                                }}
                              />
                            )}
                          </div>
                        );
                      })()}

                      {/* Reels-style floating reactions on media (horizontal left) */}
                      <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 flex items-center gap-3 z-20 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
                        {(() => {
                          const userEmoji = post.userReactions?.[me?.id];
                          const hasReacted = !!userEmoji;

                          return (
                            <>
                              <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleEmojiReaction(post._id, '♡'); }}>
                                <button
                                  disabled={hasReacted && userEmoji !== '♡'}
                                  className={`text-2xl transition ${userEmoji === '♡' ? 'text-red-500' : 'text-white hover:text-gray-300'
                                    } ${hasReacted && userEmoji !== '♡' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  ♡
                                </button>
                                <span className="text-white text-sm font-semibold drop-shadow-md">
                                  {post.reactions?.['♡'] || 0}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleEmojiReaction(post._id, '☺'); }}>
                                <button
                                  disabled={hasReacted && userEmoji !== '☺'}
                                  className={`text-2xl transition ${userEmoji === '☺' ? 'text-yellow-400' : 'text-white hover:text-gray-300'
                                    } ${hasReacted && userEmoji !== '☺' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {"☺\uFE0E"}
                                </button>
                                <span className="text-white text-sm font-semibold drop-shadow-md">
                                  {post.reactions?.['☺'] || 0}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleEmojiReaction(post._id, '☹'); }}>
                                <button
                                  disabled={hasReacted && userEmoji !== '☹'}
                                  className={`text-xl transition ${userEmoji === '☹' ? 'text-blue-400' : 'text-white hover:text-gray-300'
                                    } ${hasReacted && userEmoji !== '☹' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {"☹\uFE0E"}
                                </button>
                                <span className="text-white text-sm font-semibold drop-shadow-md">
                                  {post.reactions?.['☹'] || 0}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleEmojiReaction(post._id, '>_<'); }}>
                                <button
                                  disabled={hasReacted && userEmoji !== '>_<'}
                                  className={`text-xl transition ${userEmoji === '>_<' ? 'text-red-500' : 'text-white hover:text-gray-300'
                                    } ${hasReacted && userEmoji !== '>_<' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  &gt;_&lt;
                                </button>
                                <span className="text-white text-sm font-semibold drop-shadow-md">
                                  {post.reactions?.['>_<'] || 0}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowComments(prev => ({ ...prev, [post._id]: !prev[post._id] }));
                        }}
                        className="absolute bottom-2 right-2 text-white text-2xl bg-green-500 bg-opacity-75 rounded-full p-1 border border-white z-10 shadow-xl cursor-pointer hover:bg-opacity-90"
                        title="View/Add comments"
                      >
                        💬
                      </button>

                    </div>
                  )}

                  {!post.imageUrl && (
                    <div className="mt-3 flex items-center gap-4 flex-nowrap overflow-x-auto bg-black px-2 sm:px-0">
                      {(() => {
                        const userEmoji = post.userReactions?.[me?.id];
                        const hasReacted = !!userEmoji;

                        return (
                          <>
                            <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={() => handleEmojiReaction(post._id, '♡')}>
                              <button
                                disabled={hasReacted && userEmoji !== '♡'}
                                className={`text-3xl transition ${userEmoji === '♡' ? 'text-red-500' : 'text-white hover:text-gray-300'
                                  } ${hasReacted && userEmoji !== '♡' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                ♡
                              </button>
                              <span className="text-white text-base font-semibold drop-shadow-md">
                                {post.reactions?.['♡'] || 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={() => handleEmojiReaction(post._id, '☺')}>
                              <button
                                disabled={hasReacted && userEmoji !== '☺'}
                                className={`text-3xl transition ${userEmoji === '☺' ? 'text-yellow-400' : 'text-white hover:text-gray-300'
                                  } ${hasReacted && userEmoji !== '☺' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {"☺\uFE0E"}
                              </button>
                              <span className="text-white text-base font-semibold drop-shadow-md">
                                {post.reactions?.['☺'] || 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={() => handleEmojiReaction(post._id, '☹')}>
                              <button
                                disabled={hasReacted && userEmoji !== '☹'}
                                className={`text-2xl transition ${userEmoji === '☹' ? 'text-blue-400' : 'text-white hover:text-gray-300'
                                  } ${hasReacted && userEmoji !== '☹' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {"☹\uFE0E"}
                              </button>
                              <span className="text-white text-base font-semibold drop-shadow-md">
                                {post.reactions?.['☹'] || 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={() => handleEmojiReaction(post._id, '>_<')}>
                              <button
                                disabled={hasReacted && userEmoji !== '>_<'}
                                className={`text-2xl transition ${userEmoji === '>_<' ? 'text-red-500' : 'text-white hover:text-gray-300'
                                  } ${hasReacted && userEmoji !== '>_<' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                &gt;_&lt;
                              </button>
                              <span className="text-white text-base font-semibold drop-shadow-md">
                                {post.reactions?.['>_<'] || 0}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {showComments[post._id] && (
                    <div className="mt-2 pt-4 border-t border-gray-200 bg-gray-50 p-4 -mx-4 sm:mx-0 sm:p-3 rounded-none sm:rounded-lg">
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
                                    {/* {comment.user?.name} */}
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
                          className="flex-1 px-4 py-2 border border-gray-300 rounded text-s text-black placeholder-gray-400 focus:outline-none focus:border-blue-500"
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
          {/* Chat Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-800/60 rounded-full p-1 mb-4">
            <button
              onClick={() => { if (isPrivateChatPage) history.pushState(null, '', `/message`); setMode('private'); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white"
            >
              👤 Private
            </button>
            <button
              onClick={() => { if (isPrivateChatPage) history.pushState(null, '', `/message`); setMode('communities'); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white"
            >
              🌐 Community
            </button>
            <button
              onClick={() => { if (isPrivateChatPage) history.pushState(null, '', `/message`); setMode('random'); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${mode === 'random' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
            >
              🕵️ Random
            </button>
          </div>
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
                    {currentRandomUser.professionDetail ? `${currentRandomUser.professionType ? currentRandomUser.professionType + ' - ' : ''}${currentRandomUser.professionDetail}` : 'No details provided yet'}
                  </p>
                  {currentRandomUser.additionalDetails && currentRandomUser.additionalDetails.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      {currentRandomUser.additionalDetails.map((detail: string, idx: number) => (
                        <p key={idx} className="text-xs text-gray-600 italic mt-1">{detail}</p>
                      ))}
                    </div>
                  )}
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



      {showMyProfileModal && (
        <div
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowMyProfileModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '440px',
              borderRadius: '24px 24px 0 0',
              background: 'linear-gradient(160deg,#0f0c29 0%,#1e1040 60%,#0f0c29 100%)',
              border: '1px solid rgba(139,92,246,0.25)',
              boxShadow: '0 -8px 60px rgba(109,40,217,0.25)',
              overflow: 'hidden',
              paddingBottom: '8px',
            }}
            className="sm:rounded-2xl"
          >
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', marginBottom: '4px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.15)' }} />
            </div>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 0' }}>
              <span style={{ color: '#c4b5fd', fontWeight: 700, fontSize: '16px', letterSpacing: '0.02em' }}>My Profile</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => window.location.href = '/set-detail'}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                >
                  Set Detail
                </button>
                {/* Close */}
                <button
                  onClick={() => setShowMyProfileModal(false)}
                  aria-label="Close"
                  type="button"
                  style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Divider */}
            <div style={{ margin: '12px 0 0', borderTop: '1px solid rgba(139,92,246,0.15)' }} />

            {myProfileLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#a78bfa', fontSize: '14px' }}>Loading…</div>
            ) : myProfileError ? (
              <div style={{ padding: '16px 20px', color: '#f87171', fontSize: '13px' }}>{myProfileError}</div>
            ) : (
              <div style={{ padding: '20px' }}>

                {/* Avatar left + info right */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                  {/* Left: Avatar */}
                  <div
                    style={{ position: 'relative', flexShrink: 0, cursor: myProfile?.profilePicture ? 'pointer' : 'default' }}
                    onClick={() => { if (myProfile?.profilePicture) setZoomedProfilePicSrc(resolveMediaUrl(myProfile.profilePicture)); }}
                    title={myProfile?.profilePicture ? 'View profile picture' : undefined}
                  >
                    {/* Gradient ring */}
                    <div style={{ width: '82px', height: '82px', borderRadius: '50%', padding: '3px', background: 'linear-gradient(135deg,#7c3aed,#db2777,#f59e0b)', flexShrink: 0 }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#1e1040', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                        <span style={{ color: '#c4b5fd', fontWeight: 700, fontSize: '28px' }}>
                          {(myProfile?.username || 'U').charAt(0).toUpperCase()}
                        </span>
                        {myProfile?.profilePicture && (
                          <img
                            src={resolveMediaUrl(myProfile.profilePicture)}
                            alt={myProfile?.username || 'me'}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            loading="lazy"
                          />
                        )}
                      </div>
                    </div>
                    {/* Camera button */}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); myProfilePicInputRef.current?.click(); }}
                      style={{ position: 'absolute', bottom: 0, right: 0, width: '26px', height: '26px', borderRadius: '50%', border: '2px solid #0f0c29', background: 'linear-gradient(135deg,#7c3aed,#db2777)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '13px' }}
                      title="Change profile picture"
                      disabled={isUploadingMyProfilePic}
                    >📷</button>
                    <input ref={myProfilePicInputRef} type="file" accept="image/*" className="hidden" onChange={handleMyProfilePictureChange} />
                  </div>

                  {/* Right: All info stacked */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {/* Username */}
                    <div style={{ color: '#c4b5fd', fontWeight: 700, fontSize: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      @{myProfile?.username}
                    </div>
                    {/* Full Name */}
                    <div style={{ color: '#e5e7eb', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {myProfile?.name}
                    </div>
                    {/* Joined */}
                    <div style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>
                      Joined {myProfile?.createdAt ? new Date(myProfile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}
                    </div>

                    {/* Profession / bio details */}
                    {(myProfile?.professionType || me?.professionType || myProfile?.professionDetail || me?.professionDetail || (myProfile?.additionalDetails?.length > 0) || (me?.additionalDetails?.length > 0)) && (
                      <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px' }}>
                        {(myProfile?.professionType || me?.professionType) && (
                          <div style={{ color: '#a78bfa', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                            {myProfile?.professionType || me?.professionType}
                          </div>
                        )}
                        {(myProfile?.professionDetail || me?.professionDetail) && (
                          <div style={{ color: '#d1d5db', fontSize: '12px', fontStyle: 'italic', wordBreak: 'break-word' }}>
                            {myProfile?.professionDetail || me?.professionDetail}
                          </div>
                        )}
                        {((myProfile?.additionalDetails && myProfile.additionalDetails.length > 0) ? myProfile.additionalDetails : (me?.additionalDetails && me.additionalDetails.length > 0 ? me.additionalDetails : [])).map((detail: string, idx: number) => (
                          <div key={idx} style={{ color: '#9ca3af', fontSize: '11px', fontStyle: 'italic', wordBreak: 'break-word', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            {detail}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload status */}
                {myProfilePicError && <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>{myProfilePicError}</div>}
                {isUploadingMyProfilePic && <div style={{ color: '#a78bfa', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>Uploading picture…</div>}

                {/* View My Posts */}
                <button
                  onClick={() => { setMyPostsView(!viewingOwnPosts); setShowMyProfileModal(false); }}
                  style={{ width: '100%', padding: '13px', borderRadius: '14px', border: '1px solid rgba(139,92,246,0.4)', background: viewingOwnPosts ? 'rgba(109,40,217,0.35)' : 'rgba(139,92,246,0.12)', color: '#c4b5fd', fontWeight: 600, fontSize: '14px', cursor: 'pointer', letterSpacing: '0.01em', transition: 'all 0.2s', marginTop: '10px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(109,40,217,0.35)'}
                  onMouseLeave={e => e.currentTarget.style.background = viewingOwnPosts ? 'rgba(109,40,217,0.35)' : 'rgba(139,92,246,0.12)'}
                >
                  {viewingOwnPosts ? '✓ Viewing My Posts' : '📋 View My Posts'}
                </button>

              </div>
            )}
          </div>
        </div>
      )}

      {zoomedPostMedia && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-4 max-[450px]:p-0"
          onClick={() => setZoomedPostMedia(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-[95vw] max-h-[95vh] w-full max-[450px]:max-w-[100vw] max-[450px]:max-h-[100vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoomedPostMedia(null)}
              className="absolute top-3 right-3 min-[451px]:-top-3 min-[451px]:-right-3 w-10 h-10 rounded-full bg-white text-black shadow flex items-center justify-center text-xl hover:bg-gray-100"
              aria-label="Close"
              type="button"
            >
              ×
            </button>
            {zoomedPostMedia.kind === 'video' ? (
              <video
                src={zoomedPostMedia.src}
                controls
                autoPlay
                className="max-w-[95vw] max-h-[95vh] w-full h-full object-contain rounded-lg shadow-2xl max-[450px]:max-w-none max-[450px]:max-h-none max-[450px]:w-screen max-[450px]:h-screen max-[450px]:rounded-none"
                onError={() => setZoomedPostMedia(null)}
              />
            ) : (
              <img
                src={zoomedPostMedia.src}
                alt="Post media"
                className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl mx-auto max-[450px]:max-w-none max-[450px]:max-h-none max-[450px]:w-screen max-[450px]:h-screen max-[450px]:rounded-none"
                onError={() => setZoomedPostMedia(null)}
              />
            )}
          </div>
        </div>
      )}

      {zoomedProfilePicSrc && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomedProfilePicSrc('')}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-[92vw] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoomedProfilePicSrc('')}
              className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-white text-black shadow flex items-center justify-center text-xl hover:bg-gray-100"
              aria-label="Close"
            >
              ×
            </button>
            <img
              src={zoomedProfilePicSrc}
              alt="Profile"
              className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
              onError={() => setZoomedProfilePicSrc('')}
            />
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-2xl lg:max-w-4xl bg-white dark:bg-neutral-800 border-t border-gray-200 dark:border-neutral-700 px-4 pt-1 pb-0 flex items-center justify-around z-[100] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] dark:shadow-none rounded-t-xl">
        <div className="relative flex flex-col items-center">
          <button
            onClick={handleEnterNightMode}
            disabled={enteringNightMode || !timeInfo?.isInEntryWindow}
            className="absolute bottom-full mb-2 text-2xl hover:scale-110 transition-transform cursor-pointer disabled:opacity-50 animate-pulse bg-white/80 backdrop-blur rounded-full p-2 shadow-lg flex items-center justify-center z-[110]"
            title={
              timeInfo?.isInEntryWindow
                ? 'Enter Study Mode'
                : timeInfo?.message
                  ? timeInfo.message
                  : 'Study mode not available now'
            }
            aria-label="Enter Study Mode"
          >
            📚
          </button>
          <button
            onClick={() => {
              if (isPrivateChatPage) history.pushState(null, '', `/message`);
              setMode('posts');
              setPostSearchOpen(false);
              setPostSearchQuery('');
              setPostSearchResults([]);
            }}
            className={`flex flex-col items-center justify-center p-1 text-2xl transition hover:scale-110 ${mode === 'posts' ? '' : 'opacity-50 grayscale'}`}
            title="Home"
          >
            🏠
            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Home</span>
          </button>
        </div>

        <button
          onClick={() => {
            if (isPrivateChatPage) history.pushState(null, '', `/message`);
            setMode('posts');
            setPostSearchOpen(true);
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { }
          }}
          className={`flex flex-col items-center justify-center p-1 text-2xl transition hover:scale-110 ${(mode === 'posts' && postSearchOpen) ? '' : 'opacity-50 grayscale'}`}
          title="Search"
        >
          🔍
          <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Search</span>
        </button>

        <button
          onClick={() => {
            if (isPrivateChatPage) history.pushState(null, '', `/message`);
            if (!['private', 'random'].includes(mode)) {
              setMode('private');
            }
          }}
          className={`flex flex-col items-center justify-center p-1 text-2xl transition hover:scale-110 ${['private', 'random'].includes(mode) ? '' : 'opacity-50 grayscale'}`}
          title="Chat"
        >
          💬
          <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Chat</span>
        </button>

        <button
          onClick={() => {
            if (isPrivateChatPage) history.pushState(null, '', `/message`);
            setMode('status');
          }}
          className={`flex flex-col items-center justify-center p-1 transition hover:scale-110 ${mode === 'status' ? '' : 'opacity-50 grayscale'}`}
          title="Today's Learning"
        >
          <ActiveIcon size={28} />
          <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
            {myStreak > 0 ? `🔥${myStreak}` : 'Learn'}
          </span>
        </button>

        <div className="flex flex-col items-center">
          <button
            onClick={() => openMyProfileModal()}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition overflow-hidden border-2 hover:scale-110 ${showMyProfileModal ? 'border-blue-600' : 'border-gray-300 opacity-80 hover:opacity-100'
              }`}
            title="My Profile"
          >
            {(() => {
              const picUrl = myProfile?.profilePicture || me?.profilePicture;
              return picUrl ? (
                <img
                  src={resolveMediaUrl(picUrl)}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span className="font-bold text-sm bg-gray-200 text-gray-700 w-full h-full flex items-center justify-center">
                  {(me?.username || me?.name || 'U').charAt(0).toUpperCase()}
                </span>
              );
            })()}
          </button>
          <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Profile</span>
        </div>
      </div>
    </div>
  );
}
