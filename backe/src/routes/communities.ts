import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createCommunity,
  listCommunities,
  listMyCommunities,
  searchCommunities,
  joinCommunity,
  getCommunityDetails,
  updateCommunity,
  removeCommunityMember,
  deleteCommunity,
} from '../controllers/communityController.js';

const router = express.Router();

router.get('/', requireAuth, listCommunities);
router.get('/mine', requireAuth, listMyCommunities);
router.post('/', requireAuth, createCommunity);
router.get('/search', requireAuth, searchCommunities);
router.get('/:communityId', requireAuth, getCommunityDetails);
router.post('/:communityId/join', requireAuth, joinCommunity);
router.put('/:communityId', requireAuth, updateCommunity);
router.delete('/:communityId/members/:memberId', requireAuth, removeCommunityMember);
router.delete('/:communityId', requireAuth, deleteCommunity);

export default router;
