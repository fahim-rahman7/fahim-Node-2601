import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { redisClient } from '../config/redis.js'; // <- Redis import kora holo

export const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token is missing!',
      });
    }

    // 1. Check if token is blacklisted in Redis (Logged out)
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token has been revoked (logged out)!',
      });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // 3. Check if user still exists in database
    const currentUser = await User.findById(decoded.id).select('-password');
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.',
      });
    }

    req.user = currentUser;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized, token failed or expired!',
    });
  }
};