import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';

import { User } from '../models/user.model.js';
import { redisClient } from '../config/redis.js';

import {
  sendEmail,
  generateOtpEmailTemplate,
  generateResetLinkEmailTemplate,
} from '../utils/sendEmail.js';

import {
  generateAccessToken,
  generateRefreshToken,
  generate6DigitOTP,
} from '../utils/token.utils.js';

import {
  normalizeEmail,
  validateEmail,
  normalizeName,
  validateName,
  validateNewPassword,
  validateLoginPassword,
  getDuplicateKeyError,
} from '../utils/authValidation.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ==========================================
// COMMON RESPONSE HELPER
// ==========================================

const validationError = (res, message) => {
  return res.status(400).json({
    success: false,
    message,
  });
};

// ==========================================
// 1. GOOGLE LOGIN / REGISTER
// ==========================================

export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body || {};

    if (
      typeof idToken !== 'string' ||
      !idToken.trim()
    ) {
      return validationError(
        res,
        'Google ID token is required!'
      );
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error('GOOGLE_CLIENT_ID is missing');

      return res.status(500).json({
        success: false,
        message: 'Google authentication is not configured.',
      });
    }

    // Verify Google ID token
    let payload;

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({
        success: false,
        message:
          'Invalid Google token or authentication failed!',
      });
    }

    if (
      !payload ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      return res.status(401).json({
        success: false,
        message: 'Google email verification failed!',
      });
    }

    const email = normalizeEmail(payload.email);
    const emailError = validateEmail(email);

    if (emailError) {
      return validationError(res, emailError);
    }

    let user = await User.findOne({ email });

    // Register user automatically if not found
    if (!user) {
      const name = normalizeName(
        payload.name || 'Google User'
      );

      const randomPassword = randomBytes(32).toString('hex');
      const hashedPassword = await argon2.hash(randomPassword);

      user = await User.create({
        name,
        email,
        password: hashedPassword,
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in Redis for 7 days
    await redisClient.set(
      `refresh_token:${user._id}`,
      refreshToken,
      'EX',
      604800
    );

    // Store refresh token in HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: 'Google login successful!',
      accessToken,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Google Auth Error:', error.message);

    if (getDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Google authentication failed. Please try again.',
    });
  }
};

// ==========================================
// 2. REGISTER USER & SEND OTP
// ==========================================

export const registerUser = async (req, res) => {
  let pendingEmail = '';

  try {
    const {
      name: rawName,
      email: rawEmail,
      password,
    } = req.body || {};

    // Validate name
    const nameError = validateName(rawName);

    if (nameError) {
      return validationError(res, nameError);
    }

    // Validate email
    const emailError = validateEmail(rawEmail);

    if (emailError) {
      return validationError(res, emailError);
    }

    // Validate password
    const passwordError = validateNewPassword(password);

    if (passwordError) {
      return validationError(res, passwordError);
    }

    const name = normalizeName(rawName);
    const email = normalizeEmail(rawEmail);

    // Check existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          'User already registered with this email!',
      });
    }

    // Generate OTP and hash password
    const otp = generate6DigitOTP();
    const hashedPassword = await argon2.hash(password);

    const tempUserData = JSON.stringify({
      name,
      email,
      password: hashedPassword,
    });

    pendingEmail = email;

    // Save OTP and temporary user for 5 minutes
    await redisClient.set(
      `otp:${email}`,
      otp,
      'EX',
      300
    );

    await redisClient.set(
      `temp_user:${email}`,
      tempUserData,
      'EX',
      300
    );

    // Send OTP email
    const htmlContent = generateOtpEmailTemplate(
      name,
      otp
    );

    await sendEmail({
      to: email,
      subject: 'Your Account Verification OTP',
      htmlContent,
    });

    return res.status(200).json({
      success: true,
      message:
        'OTP successfully sent to your email. Please check your inbox.',
    });
  } catch (error) {
    console.error('Register Error:', error.message);

    // Clean temporary credentials if registration fails
    if (pendingEmail) {
      try {
        await redisClient.del(
          `otp:${pendingEmail}`,
          `temp_user:${pendingEmail}`
        );
      } catch (cleanupError) {
        console.error(
          'Registration cleanup error:',
          cleanupError.message
        );
      }
    }

    if (getDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message:
          'User already registered with this email!',
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Unable to complete registration. Please try again.',
    });
  }
};

// ==========================================
// 3. VERIFY OTP & CREATE USER
// ==========================================

export const verifyOtpAndRegister = async (req, res) => {
  try {
    const {
      email: rawEmail,
      otp: rawOtp,
    } = req.body || {};

    // Validate email
    const emailError = validateEmail(rawEmail);

    if (emailError) {
      return validationError(res, emailError);
    }

    const email = normalizeEmail(rawEmail);

    // OTP must be exactly 6 digits
    if (
      typeof rawOtp !== 'string' ||
      !/^\d{6}$/.test(rawOtp)
    ) {
      return validationError(
        res,
        'OTP must be exactly 6 digits!'
      );
    }

    // Read OTP and temporary user data
    const storedOtp = await redisClient.get(
      `otp:${email}`
    );

    const storedUserData = await redisClient.get(
      `temp_user:${email}`
    );

    if (!storedOtp || !storedUserData) {
      return res.status(400).json({
        success: false,
        message:
          'OTP expired or invalid! Please register again.',
      });
    }

    if (storedOtp !== rawOtp) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid OTP! Please provide the correct OTP.',
      });
    }

    // Parse temporary user data
    let tempUser;

    try {
      tempUser = JSON.parse(storedUserData);
    } catch {
      return res.status(400).json({
        success: false,
        message:
          'Registration data is invalid. Please register again.',
      });
    }

    if (
      tempUser.email !== email ||
      !tempUser.name ||
      !tempUser.password
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Registration data is invalid. Please register again.',
      });
    }

    // Check duplicate user again
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      await redisClient.del(
        `otp:${email}`,
        `temp_user:${email}`
      );

      return res.status(409).json({
        success: false,
        message:
          'User already registered with this email!',
      });
    }

    // Password is already hashed in registerUser
    const newUser = await User.create({
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.password,
    });

    // Remove OTP and temporary data
    await redisClient.del(
      `otp:${email}`,
      `temp_user:${email}`
    );

    return res.status(201).json({
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

    if (getDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message:
          'User already registered with this email!',
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Unable to verify OTP. Please try again.',
    });
  }
};

// ==========================================
// 4. LOGIN USER
// ==========================================

export const loginUser = async (req, res) => {
  try {
    const {
      email: rawEmail,
      password,
    } = req.body || {};

    // Validate email
    const emailError = validateEmail(rawEmail);

    if (emailError) {
      return validationError(res, emailError);
    }

    // Validate password
    const passwordError = validateLoginPassword(password);

    if (passwordError) {
      return validationError(res, passwordError);
    }

    const email = normalizeEmail(rawEmail);

    const user = await User.findOne({ email }).select(
      '+password'
    );

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password!',
      });
    }

    let isPasswordValid = false;

    try {
      isPasswordValid = await argon2.verify(
        user.password,
        password
      );
    } catch {
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password!',
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await redisClient.set(
      `refresh_token:${user._id}`,
      refreshToken,
      'EX',
      604800
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
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

    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ==========================================
// 5. REFRESH ACCESS TOKEN
// ==========================================

export const handleRefreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;

    if (typeof token !== 'string' || !token) {
      return res.status(401).json({
        success: false,
        message:
          'Refresh token is required in cookie!',
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET
      );
    } catch {
      return res.status(403).json({
        success: false,
        message:
          'Invalid or expired refresh token!',
      });
    }

    if (!decoded?.id) {
      return res.status(403).json({
        success: false,
        message: 'Invalid refresh token payload!',
      });
    }

    // Verify refresh token in Redis
    const storedToken = await redisClient.get(
      `refresh_token:${decoded.id}`
    );

    if (!storedToken || storedToken !== token) {
      return res.status(403).json({
        success: false,
        message:
          'Invalid or revoked refresh token!',
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(403).json({
        success: false,
        message: 'User no longer exists!',
      });
    }

    const newAccessToken = generateAccessToken(user);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error('Refresh Token Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ==========================================
// 6. LOGOUT USER
// ==========================================

export const logoutUser = async (req, res) => {
  try {
    const userId = req.user?._id;
    const authorization = req.headers.authorization;

    const accessToken =
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
        ? authorization.split(' ')[1]
        : null;

    // Delete refresh token from Redis
    if (userId) {
      await redisClient.del(
        `refresh_token:${userId}`
      );
    }

    // Blacklist the access token until it expires
    if (accessToken) {
      const decoded = jwt.decode(accessToken);

      const remainingSeconds = decoded?.exp
        ? Math.max(
            1,
            decoded.exp -
              Math.floor(Date.now() / 1000)
          )
        : 900;

      await redisClient.set(
        `blacklist:${accessToken}`,
        'revoked',
        'EX',
        remainingSeconds
      );
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully!',
    });
  } catch (error) {
    console.error('Logout Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ==========================================
// 7. FORGOT PASSWORD
// ==========================================

export const forgotPassword = async (req, res) => {
  try {
    const { email: rawEmail } = req.body || {};

    // Validate email
    const emailError = validateEmail(rawEmail);

    if (emailError) {
      return validationError(res, emailError);
    }

    const email = normalizeEmail(rawEmail);
    const user = await User.findOne({ email });

    // Do not reveal whether the account exists
    const genericResponse = {
      success: true,
      message:
        'If an account exists for this email, a password reset link will be sent.',
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Generate secure reset token
    const resetToken = randomBytes(32).toString('hex');

    // Store token for 15 minutes
    await redisClient.set(
      `reset_token:${resetToken}`,
      user._id.toString(),
      'EX',
      900
    );

    const frontendUrl = (
      process.env.CLIENT_URL ||
      'http://localhost:5173'
    ).replace(/\/+$/, '');

    const resetLink =
      `${frontendUrl}/reset-password?token=${resetToken}`;

    const htmlContent = generateResetLinkEmailTemplate(
      user.name,
      resetLink
    );

    try {
      await sendEmail({
        to: email,
        subject: 'Password Reset Link',
        htmlContent,
      });
    } catch (emailError) {
      // Remove reset token if email delivery fails
      await redisClient.del(
        `reset_token:${resetToken}`
      );

      throw emailError;
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error('Forgot Password Error:', error.message);

    return res.status(500).json({
      success: false,
      message:
        'Unable to process password reset. Please try again.',
    });
  }
};

// ==========================================
// 8. RESET PASSWORD
// ==========================================

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params || {};

    const {
      newPassword,
      confirmPassword,
    } = req.body || {};

    // Validate reset token
    if (
      typeof token !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(token)
    ) {
      return validationError(
        res,
        'Invalid or expired password reset token!'
      );
    }

    // Validate new password
    const passwordError = validateNewPassword(
      newPassword
    );

    if (passwordError) {
      return validationError(res, passwordError);
    }

    // Validate confirmation
    if (
      typeof confirmPassword !== 'string' ||
      !confirmPassword.length
    ) {
      return validationError(
        res,
        'Confirm password is required!'
      );
    }

    if (newPassword !== confirmPassword) {
      return validationError(
        res,
        'New password and confirm password do not match!'
      );
    }

    // Find user ID associated with token
    const userId = await redisClient.get(
      `reset_token:${token}`
    );

    if (!userId) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid or expired password reset token!',
      });
    }

    const user = await User.findById(userId).select(
      '+password'
    );

    if (!user) {
      await redisClient.del(
        `reset_token:${token}`
      );

      return res.status(404).json({
        success: false,
        message: 'User no longer exists!',
      });
    }

    // Hash and update password
    const hashedPassword = await argon2.hash(
      newPassword
    );

    user.password = hashedPassword;
    await user.save();

    // Make reset token single-use
    await redisClient.del(
      `reset_token:${token}`
    );

    // Invalidate refresh-token session
    await redisClient.del(
      `refresh_token:${userId}`
    );

    return res.status(200).json({
      success: true,
      message:
        'Password successfully reset! You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset Password Error:', error.message);

    return res.status(500).json({
      success: false,
      message:
        'Unable to reset password. Please try again.',
    });
  }
};