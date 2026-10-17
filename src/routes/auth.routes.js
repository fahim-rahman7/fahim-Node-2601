import express from 'express';
import { 
  registerUser, 
  verifyOtpAndRegister, 
  loginUser, 
  handleRefreshToken, 
  logoutUser,
  forgotPassword, 
  resetPassword 
} from '../controllers/auth.controller.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/verify-otp', verifyOtpAndRegister);
router.post('/login', loginUser);
router.post('/refresh-token', handleRefreshToken);
router.post('/logout', protect, logoutUser); // Protected route for secure logout
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;