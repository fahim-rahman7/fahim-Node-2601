import jwt from 'jsonwebtoken';

// Generate Access Token
export const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '150m' }
  );
};

// Generate Refresh Token
export const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

// Generate 6-digit OTP
export const generate6DigitOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};