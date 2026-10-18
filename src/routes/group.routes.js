import express from 'express';
import { 
  initGroupPayment, 
  paymentSuccess, 
  paymentFail, 
  paymentCancel, 
  getUserGroups, 
  getGroupMessages,
  addMemberToGroup 
} from '../controllers/group.controller.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/init-payment', protect, initGroupPayment);
router.post('/payment/success/:tran_id', paymentSuccess);
router.post('/payment/fail/:tran_id', paymentFail);
router.post('/payment/cancel', paymentCancel);

router.get('/my-groups', protect, getUserGroups);
router.get('/:groupId/messages', protect, getGroupMessages);

// Free route for adding new members by Admin
router.post('/:groupId/add-member', protect, addMemberToGroup);

export default router;