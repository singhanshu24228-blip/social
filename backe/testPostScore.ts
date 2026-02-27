import { calculateScore } from './src/utils/yourVoiceAI.js';

async function testPostScore() {
  console.log('Testing Post Scoring Algorithm...\n');

  // Test case 1: New post with reactions
  const post1 = {
    _id: 'test1',
    user: 'user1',
    content: 'Test post 1',
    likes: [],
    reactions: { '😍': 2, '😂': 1, '😠': 0, '😢': 0 },
    userReactions: {},
    comments: [],
    createdAt: new Date(), // Just created
  };

  const score1 = calculateScore(post1);
  console.log('Post 1 (new, 2 love, 1 laugh):', score1);

  // Test case 2: Old post with reactions
  const post2 = {
    _id: 'test2',
    user: 'user2',
    content: 'Test post 2',
    likes: [],
    reactions: { '😍': 2, '😂': 1, '😠': 0, '😢': 0 },
    userReactions: {},
    comments: [],
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day old
  };

  const score2 = calculateScore(post2);
  console.log('Post 2 (1 day old, 2 love, 1 laugh):', score2);

  // Test case 3: Post with no reactions
  const post3 = {
    _id: 'test3',
    user: 'user3',
    content: 'Test post 3',
    likes: [],
    reactions: {},
    userReactions: {},
    comments: [],
    createdAt: new Date(),
  };

  const score3 = calculateScore(post3);
  console.log('Post 3 (new, no reactions):', score3);

  // Test case 4: Post with only sad reactions
  const post4 = {
    _id: 'test4',
    user: 'user4',
    content: 'Test post 4',
    likes: [],
    reactions: { '😢': 3 },
    userReactions: {},
    comments: [],
    createdAt: new Date(),
  };

  const score4 = calculateScore(post4);
  console.log('Post 4 (new, 3 sad):', score4);

  console.log('\nExpected: Post 1 > Post 2 > Post 4 > Post 3');
  console.log('Actual order:', [score1, score2, score3, score4].sort((a, b) => b - a));
}

testPostScore();
