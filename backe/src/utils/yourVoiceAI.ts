import axios from 'axios';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const YOURVOICE_API_KEY = process.env.YOURVOICE_API_KEY;
const YOURVOICE_API_BASE = 'https://api.yourvoice.ai';
const debugTts = process.env.NODE_ENV !== 'production' && process.env.DEBUG_TTS?.trim() === 'true';

/**
 * Calculate post score based on reactions and time decay
 * Higher scores indicate more engaging posts
 */
export interface PostWithScore {
  _id: any;
  user: any;
  content: string;
  imageUrl?: string;
  likes: any[];
  reactions?: { [key: string]: number };
  userReactions?: { [userId: string]: string };
  comments: any[];
  createdAt: Date;
  score?: number;
}

export const calculateScore = (post: PostWithScore): number => {
  // Helper to read reaction counts from different storage shapes (Map or plain object)
  const getReactionCount = (reactions: any, emoji: string): number => {
    if (!reactions) return 0;
    // Mongoose Map (Map<string, number>)
    if (typeof reactions.get === 'function') {
      return reactions.get(emoji) || 0;
    }
    // Plain object
    if (typeof reactions === 'object') {
      return (reactions[emoji] as number) || 0;
    }
    return 0;
  };

  // Get reaction counts - using actual emojis from frontend
  const love = getReactionCount(post.reactions, '😍');      // Love (3 points)
  const laugh = getReactionCount(post.reactions, '😂');     // Laugh (2 points)
  const angry = getReactionCount(post.reactions, '😠');     // Angry (1 point)
  const sad = getReactionCount(post.reactions, '😢');       // Sad (1 point)

  // Base score weighted by reaction type
  const baseScore = love * 3 + laugh * 2 + angry * 1 + sad * 1;

  // Calculate hours since post was created
  const hoursSincePost = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

  // Use day-based time decay so posts decay more slowly over days
  const daysSincePost = hoursSincePost / 24;
  // Time decay factor (newer posts get higher scores). Using days reduces
  // the penalty for posts that are a few hours/days old compared to hours-only decay.
  const timeFactor = 1 / (daysSincePost + 1);

  return baseScore * timeFactor;
};

export interface TextToSpeechOptions {
  text: string;
  gender: 'male' | 'female';
  language?: string;
  speed?: number;
}

/**
 * Convert text to speech using Google's Text-to-Speech endpoint
 * Google Translate API provides free TTS
 */
const generateGoogleTTS = async (text: string, _gender: 'male' | 'female'): Promise<string> => {
  try {
    if (debugTts) console.log('[TTS] Attempting Google Translate TTS...');
    // Use Google Translate's TTS endpoint (free, no key required)
    const lang = 'en';
    const encodedText = encodeURIComponent(text);

    // Fetch the actual audio data from Google TTS
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;
    if (debugTts) console.log('[TTS] Fetching from Google TTS URL:', url);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000,
    });

    if (response.status === 200 && response.data) {
      // Convert audio buffer to base64 data URI
      const base64Audio = Buffer.from(response.data).toString('base64');
      const dataUri = `data:audio/mp3;base64,${base64Audio}`;
      if (debugTts) console.log('[TTS] Google TTS succeeded, returning data URI');
      return dataUri;
    } else {
      throw new Error(`Google TTS returned status ${response.status}`);
    }
  } catch (err) {
    console.error('[TTS] Google TTS failed:', err);
    throw err;
  }
};

/**
 * Convert text to speech using YourVoice AI API or Google Fallback
 * Returns the audio URL or base64 encoded audio
 */
export const textToSpeech = async (options: TextToSpeechOptions): Promise<string | null> => {
  try {
    const { text, gender, language = 'en', speed = 1 } = options;

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    if (debugTts) {
      console.log('[TTS] Converting text to speech:', {
        textLength: text.length,
        gender,
        language,
        speed,
      });
    }

    // Try YourVoice API first
    try {
      if (debugTts) console.log('[TTS] Calling YourVoice API...');
      const response = await axios.post(
        `${YOURVOICE_API_BASE}/synthesize`,
        {
          text: text,
          voice: gender === 'male' ? 'male-1' : 'female-1',
          language: language,
          speed: speed,
          format: 'mp3',
        },
        {
          headers: {
            'Authorization': `Bearer ${YOURVOICE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (debugTts) console.log('[TTS] YourVoice API response status:', response.status);

      // Return audio URL from response
      if (response.data?.audio_url) {
        if (debugTts) console.log('[TTS] YourVoice returned audio_url');
        return response.data.audio_url;
      }

      // If base64 audio is returned, return it with data URI prefix
      if (response.data?.audio) {
        if (debugTts) console.log('[TTS] YourVoice returned base64 audio');
        return `data:audio/mp3;base64,${response.data.audio}`;
      }

      if (debugTts) console.log('[TTS] YourVoice response missing audio, trying fallback');
    } catch (yourVoiceError: any) {
      console.warn('[TTS] YourVoice API error:', {
        message: yourVoiceError?.message,
        status: yourVoiceError?.response?.status,
        data: yourVoiceError?.response?.data,
      });
      if (debugTts) console.log('[TTS] Falling back to Google TTS...');
    }

    // Fallback to Google Translate TTS
    const googleUrl = await generateGoogleTTS(text, gender);
    if (debugTts) console.log('[TTS] Using Google TTS URL');
    return googleUrl;
  } catch (error: any) {
    console.error('[TTS] Complete failure:', {
      message: error?.message,
      stack: error?.stack,
    });
    // Return null to indicate voice message failed - message will be sent as text
    return null;
  }
};
