import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { redisClient } from '../config/redis.js';
import { sendEmail, generateOtpEmailTemplate, generateResetPasswordEmailTemplate } from '../utils/sendEmail.js';
import { generateAccessToken, generateRefreshToken, generate6DigitOTP } from '../utils/token.utils.js';

// 1. Register User & Send OTP via Redis & Brevo
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required!' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already registered with this email!' });
    }

    const otp = generate6DigitOTP();
    const hashedPassword = await argon2.hash(password);
    const tempUserData = JSON.stringify({ name, email, password: hashedPassword });

    // Store OTP & Temp User data in Redis for 5 minutes (300 seconds)
    await redisClient.set(`otp:${email}`, otp, 'EX', 300);
    await redisClient.set(`temp_user:${email}`, tempUserData, 'EX', 300);

    const htmlContent = generateOtpEmailTemplate(name, otp);
    await sendEmail({
      to: email,
      subject: 'Your Account Verification OTP',
      htmlContent,
    });

    res.status(200).json({
      success: true,
      message: 'OTP successfully sent to your email. Please check your inbox.',
    });
  } catch (error) {
    console.error('Register Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 2. Verify OTP & Save User to MongoDB
export const verifyOtpAndRegister = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required!' });
    }

    const storedOtp = await redisClient.get(`otp:${email}`);
    const storedUserData = await redisClient.get(`temp_user:${email}`);

    if (!storedOtp || !storedUserData) {
      return res.status(400).json({ success: false, message: 'OTP expired or invalid! Please register again.' });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP! Please provide the correct OTP.' });
    }

    const { name, email: userEmail, password } = JSON.parse(storedUserData);

    const newUser = await User.create({
      name,
      email: userEmail,
      password,
    });

    // Clear Redis data after successful registration
    await redisClient.del(`otp:${email}`);
    await redisClient.del(`temp_user:${email}`);

    res.status(201).json({
      success: true,
      message: 'Account successfully verified and created!',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 3. Login User (Store Refresh Token in Redis)
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required!' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password!' });
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Invalid email or password!' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store Refresh Token in Redis with 7 days expiration (604800 seconds)
    await redisClient.set(`refresh_token:${user._id}`, refreshToken, 'EX', 604800);

    // Send Refresh Token in HttpOnly Cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      accessToken,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 4. Handle Refresh Token using Redis
export const handleRefreshToken = async (req, res) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token is required in cookie!' });
    }

    const token = cookies.refreshToken;

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired refresh token!' });
    }

    // Verify token exists in Redis
    const storedToken = await redisClient.get(`refresh_token:${decoded.id}`);
    if (!storedToken || storedToken !== token) {
      return res.status(403).json({ success: false, message: 'Invalid or revoked refresh token!' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(403).json({ success: false, message: 'User no longer exists!' });
    }

    const newAccessToken = generateAccessToken(user);

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error('Refresh Token Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 5. Logout User (Blacklist Access Token & Delete Refresh Token from Redis)
export const logoutUser = async (req, res) => {
  try {
    const userId = req.user?._id;
    
    // Get access token from Authorization header
    let accessToken;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      accessToken = req.headers.authorization.split(' ')[1];
    }

    // 1. Delete refresh token from Redis
    if (userId) {
      await redisClient.del(`refresh_token:${userId}`);
    }

    // 2. Blacklist the access token in Redis (expire in 15 minutes = 900 seconds)
    if (accessToken) {
      await redisClient.set(`blacklist:${accessToken}`, 'revoked', 'EX', 900);
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully!',
    });
  } catch (error) {
    console.error('Logout Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 6. Forgot Password - Send OTP via Redis
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required!' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this email!' });
    }

    const otp = generate6DigitOTP();
    await redisClient.set(`forgot_otp:${email}`, otp, 'EX', 300);

    const htmlContent = generateResetPasswordEmailTemplate(user.name, otp);
    await sendEmail({
      to: email,
      subject: 'Password Reset OTP',
      htmlContent,
    });

    res.status(200).json({
      success: true,
      message: 'Password reset OTP sent to your email. Please check your inbox.',
    });
  } catch (error) {
    console.error('Forgot Password Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 7. Reset Password - Verify OTP from Redis & Update Password
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required!' });
    }

    const storedOtp = await redisClient.get(`forgot_otp:${email}`);
    if (!storedOtp) {
      return res.status(400).json({ success: false, message: 'OTP expired or invalid! Please request again.' });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP! Please provide the correct OTP.' });
    }

    const hashedPassword = await argon2.hash(newPassword);
    const user = await User.findOneAndUpdate({ email }, { password: hashedPassword });

    if (user) {
      // Invalidate refresh token from Redis upon password reset
      await redisClient.del(`refresh_token:${user._id}`);
    }

    await redisClient.del(`forgot_otp:${email}`);

    res.status(200).json({
      success: true,
      message: 'Password successfully reset! You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset Password Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};