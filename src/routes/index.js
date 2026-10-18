import express from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import friendRoutes from './friend.routes.js';
import chatRoutes from './chat.routes.js';
import groupRoutes from './group.routes.js';

const router = express.Router();

// Mount all routes here
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/friends', friendRoutes);
router.use('/chat', chatRoutes);
router.use('/groups', groupRoutes);

export default router;