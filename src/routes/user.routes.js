import express from 'express';
import { getUserProfile, updateUserProfile } from '../controllers/user.controller.js';
import { protect } from '../middlewares/authMiddleware.js';
import { uploadSingleImage } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// GET /api/v1/users/profile
router.get('/profile', protect, getUserProfile);

// PATCH /api/v1/users/profile
router.patch('/profile', protect, uploadSingleImage, updateUserProfile);

export default router;