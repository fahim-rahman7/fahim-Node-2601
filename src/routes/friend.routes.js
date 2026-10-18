import express from 'express';
import { 
  sendFriendRequest, 
  acceptFriendRequest, 
  rejectFriendRequest, 
  getIncomingRequests, 
  getFriendList, 
  getFriendSuggestions 
} from '../controllers/friend.controller.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/send/:recipientId', protect, sendFriendRequest);       // Request pathanor jonno
router.post('/accept/:requestId', protect, acceptFriendRequest);   // Request accept korar jonno
router.post('/reject/:requestId', protect, rejectFriendRequest);   // Request reject korar jonno
router.get('/requests', protect, getIncomingRequests);             // Incoming requests dekhar jonno
router.get('/list', protect, getFriendList);                       // Friend list dekhar jonno
router.get('/suggestions', protect, getFriendSuggestions);         // Suggestion list dekhar jonno

export default router;