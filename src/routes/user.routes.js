import express from 'express';
import { getUserProfile } from '../controllers/user.controller.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/v1/users/profile (Protected Route)
router.get('/profile', protect, getUserProfile);

export default router;