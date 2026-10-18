import express from 'express';
import { getChatHistory } from '../controllers/chat.controller.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/history/:friendId', protect, getChatHistory);

export default router;