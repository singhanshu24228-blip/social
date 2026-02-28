import React, { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { addComment, resolveMediaUrl } from '../services/api';
import { forceRefreshImage, validateImageUrl } from '../utils/imageCache';

interface PostProps {
  post: {
    _id: string;
    user: {
      _id: string;
      username: string;
      name: string;
    };
    anonymous?: boolean;
    content: string;
    imageUrl?: string;
    songUrl?: string;
    likes: string[];
    reactions: { [key: string]: number };
    userReactions: { [key: string]: string };
    comments: {
      _id?: string;
      user: {
        _id: string;
        username: string;
        name: string;
      };
      content: string;
      createdAt: string;
    }[];
    createdAt: string;
  };
  hideInteractions?: boolean;
  hideAudioControls?: boolean;
  onCommentAdded?: (updatedPost: any) => void;
}

const Post: React.FC<PostProps> = ({ post, hideInteractions = false, hideAudioControls = true, onCommentAdded }) => {
  const [imageLoaded, setImageLoaded] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState(post.imageUrl ? resolveMediaUrl(post.imageUrl) : '');
  const [isRetrying, setIsRetrying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [localComments, setLocalComments] = useState(post.comments);
  const [error, setError] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.5 } // Play when 50% of the post is visible
    );

    const currentElement = audioRef.current?.parentElement;
    if (currentElement) {
      observer.observe(currentElement);
    }

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      if (isVisible) {
        audioRef.current.play().catch(() => {
          // Handle play promise rejection (e.g., user hasn't interacted with page)
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isVisible]);

  useEffect(() => {
    setLocalComments(post.comments);
  }, [post.comments]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    setIsSubmittingComment(true);
    setError('');

    try {
      const response = await addComment(post._id, commentText);
      setLocalComments(response.data.comments);
      setCommentText('');
      if (onCommentAdded) {
        onCommentAdded(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add comment');
      console.error('Error adding comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleRetryImage = async () => {
    if (!post.imageUrl) return;
    
    setIsRetrying(true);
    setImageError(false);
    setImageLoaded(false);
    
    try {
      const currentUrl = resolveMediaUrl(post.imageUrl);
      
      // Force refresh by adding cache-busting parameter and clearing cache
      const refreshedUrl = await forceRefreshImage(currentUrl);
      setImageUrl(refreshedUrl);
      
      // Validate the refreshed image
      const isValid = await validateImageUrl(refreshedUrl);
      if (isValid) {
        setImageError(false);
      } else {
        setImageError(true);
      }
    } catch (err) {
      console.error('[Post] Failed to retry image:', err);
      setImageError(true);
    } finally {
      setIsRetrying(false);
    }
  };

  const audioSrc = post.songUrl ? resolveMediaUrl(post.songUrl) : '';

  useEffect(() => {
    if (post.songUrl) {
      console.log('[Post] audioSrc for post', post._id, audioSrc);
    }
  }, [post.songUrl, audioSrc, post._id]);

  useEffect(() => {
    const anonVal = (post as any).anonymous;
    console.log('[Post] Post data:', { id: post._id, anonymous: anonVal, anonymousType: typeof anonVal, userName: post.user?.name });
  }, [post._id, post]);

  // const isAnonymous = (post as any).anonymous === true || (post as any).anonymous === 'true';
const isAnonymous = ( post as any).anonymous === true || ( post as any).anonymous === 'true'
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4 relative min-h-[200px]">
      <div className="flex items-center mb-2">
        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mr-3">
          <span className="text-gray-600 font-semibold text-xl">
            {isAnonymous ? '🚨' : (post.user?.name || 'U').charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="font-semibold text-black">{isAnonymous ? '⚠️' : post.user?.name}</p>
          {!isAnonymous && <p className="text-gray-500 text-sm">@{post.user?.username}</p>}
        </div>
      </div>

      <p className="mb-3 text-black">{post.content}</p>

      {post.imageUrl && (
        <div className="relative mb-3">
          {(() => {
            // Better video detection that handles full URLs with query parameters
            const urlPath = post.imageUrl.split('?')[0].toLowerCase();
            return /\.(mp4|mov|avi|webm|ogv)$/i.test(urlPath);
          })() ? (
            <video
              src={post.imageUrl.startsWith('http') ? post.imageUrl : `${getUploadBaseURL()}${post.imageUrl}`}
              controls
              className="w-full rounded-lg"
              onError={() => {
                console.error('[Post] Video load error:', post._id);
                setImageError(true);
              }}
            />
          ) : (
            <>
              {!imageLoaded && !imageError && (
                <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-gray-500">Loading image...</span>
                </div>
              )}
              {imageError && (
                <div className="w-full h-48 bg-red-100 rounded-lg flex flex-col items-center justify-center gap-2">
                  <span className="text-red-600">Image failed to load (possibly corrupted)</span>
                  <button
                    onClick={handleRetryImage}
                    disabled={isRetrying}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                  >
                    {isRetrying ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              )}
              <img
                src={imageUrl}
                alt="Post image"
                className={`w-full rounded-lg ${imageError ? 'hidden' : ''}`}
                onLoad={() => {
                  setImageLoaded(true);
                  setImageError(false);
                }}
                onError={() => {
                  console.error('[Post] Image load error for:', post._id, imageUrl);
                  setImageError(true);
                  setImageLoaded(false);
                }}
                loading="lazy"
              />
            </>
          )}
          {!imageError && (
            <button
              onClick={() => setShowComments(!showComments)}
              className="absolute bottom-2 right-2 text-white text-2xl bg-black bg-opacity-75 rounded-full p-1 border border-white z-10 hover:shadow-xl cursor-pointer"
              title="Toggle comments"
            >
              💬
            </button>
          )}
        </div>
      )}

      {/* Comment button for posts without images */}
      {!post.imageUrl && !hideInteractions && (
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => {
              console.log('Comment button clicked, showComments:', showComments);
              setShowComments(!showComments);
            }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
            title="Toggle comments"
          >
            💬 Comments ({localComments.length})
          </button>
        </div>
      )}

      {post.songUrl && (
        <audio
          ref={audioRef}
          src={audioSrc}
          controls={!hideInteractions && !hideAudioControls}
          className="absolute top-4 right-4 w-64 z-40"
          preload="metadata"
          onCanPlay={() => console.log('[Post] audio can play', post._id, audioRef.current?.src)}
          onPlay={() => console.log('[Post] audio play started', post._id)}
          onError={(e) => console.error('[Post] audio error', post._id, e)}
        />
      )}

      {!hideInteractions && (
        <div className="flex items-center justify-between text-gray-500 text-sm">
          <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
          {/* <div className="flex items-center space-x-4">
            <span>{post.likes.length} likes</span>
            <span>{post.comments.length} comments</span>
          </div> */}
        </div>
      )}

      {/* Show mute button for posts with audio */}
      {post.songUrl && (
        <button
          onClick={toggleMute}
          className="absolute bottom-4 right-4 bg-red-500 text-white p-3 rounded-full hover:bg-red-600 transition-all shadow-lg z-50"
          title={isMuted ? 'Unmute' : 'Mute'}
          style={{ fontSize: '20px' }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      )}

      {/* Comments Section */}
      {showComments && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="mb-4">
            <h3 className="font-semibold text-black mb-3">Comments ({localComments.length})</h3>
            
            {/* Display existing comments */}
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {localComments.length === 0 ? (
                <p className="text-gray-400 text-sm">No comments yet. Be the first to comment!</p>
              ) : (
                localComments.map((comment, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-600 font-semibold text-sm">
                          {(comment.user?.name || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-black">
                          {comment.user?.name}
                          <span className="text-gray-500 font-normal ml-1">@{comment.user?.username}</span>
                        </p>
                        <p className="text-gray-700 text-sm break-words">{comment.content}</p>
                        <p className="text-gray-400 text-xs mt-1">
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment input form */}
            <div className="border-t pt-3">
              {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-black placeholder-gray-400"
                  disabled={isSubmittingComment}
                />
                <button
                  onClick={handleAddComment}
                  disabled={isSubmittingComment || !commentText.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmittingComment ? '...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Post;
