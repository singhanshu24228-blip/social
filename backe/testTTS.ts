import { textToSpeech } from './src/utils/yourVoiceAI.js';

async function testTTS() {
  console.log('Testing Text-to-Speech functionality...\n');

  try {
    const result = await textToSpeech({
      text: 'Hello, this is a test message for text to speech conversion.',
      gender: 'male',
      language: 'en',
    });

    console.log('TTS Result:', result);

    if (result) {
      console.log('✅ TTS succeeded!');
      console.log('Voice URL:', result);
    } else {
      console.log('❌ TTS failed - returned null');
    }
  } catch (error) {
    console.error('❌ TTS threw an error:', error);
  }
}

testTTS();
