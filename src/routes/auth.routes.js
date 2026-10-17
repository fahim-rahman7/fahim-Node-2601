import express from 'express';
import { 
  registerUser, 
  verifyOtpAndRegister, 
  loginUser, 
  handleRefreshToken, 
  logoutUser,
  forgotPassword, 
  resetPassword,
  googleLogin 
} from '../controllers/auth.controller.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/verify-otp', verifyOtpAndRegister);
router.post('/login', loginUser);
router.post('/google-login', googleLogin);
router.post('/refresh-token', handleRefreshToken);
router.post('/logout', protect, logoutUser); // Protected route for secure logout
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

export default router;