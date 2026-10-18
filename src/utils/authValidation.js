// src/utils/authValidation.js

// ==========================================
// 1. EMAIL VALIDATION
// ==========================================

const EMAIL_REGEX =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

export const normalizeEmail = (email) => {
  return typeof email === 'string'
    ? email.trim().toLowerCase()
    : '';
};

export const validateEmail = (rawEmail) => {
  if (
    typeof rawEmail !== 'string' ||
    !rawEmail.trim()
  ) {
    return 'Email is required!';
  }

  const email = normalizeEmail(rawEmail);

  if (email.length > 254) {
    return 'Email must not exceed 254 characters!';
  }

  if (
    !EMAIL_REGEX.test(email) ||
    email.includes('..')
  ) {
    return 'Please enter a valid email address!';
  }

  const [localPart, domain] = email.split('@');

  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    !domain
  ) {
    return 'Please enter a valid email address!';
  }

  return null;
};

// ==========================================
// 2. NAME VALIDATION
// ==========================================

export const normalizeName = (name) => {
  return typeof name === 'string'
    ? name.trim().replace(/\s+/g, ' ')
    : '';
};

export const validateName = (rawName) => {
  if (
    typeof rawName !== 'string' ||
    !rawName.trim()
  ) {
    return 'Name is required!';
  }

  const name = normalizeName(rawName);

  if (name.length < 2) {
    return 'Name must contain at least 2 characters!';
  }

  if (name.length > 80) {
    return 'Name must not exceed 80 characters!';
  }

  // Supports English, Bangla, and other Unicode letters
  if (!/\p{L}/u.test(name)) {
    return 'Name must contain at least one letter!';
  }

  if (/[\u0000-\u001F\u007F]/.test(name)) {
    return 'Name contains invalid characters!';
  }

  return null;
};

// ==========================================
// 3. NEW PASSWORD VALIDATION
// ==========================================

export const validateNewPassword = (password) => {
  if (
    typeof password !== 'string' ||
    !password.length
  ) {
    return 'Password is required!';
  }

  if (password.trim().length === 0) {
    return 'Password cannot contain only spaces!';
  }

  // Preserves your current backend minimum: 5 characters
  if (password.length < 5) {
    return 'Password must be at least 5 characters long!';
  }

  if (password.length > 128) {
    return 'Password must not exceed 128 characters!';
  }

  return null;
};

// ==========================================
// 4. LOGIN PASSWORD VALIDATION
// ==========================================

export const validateLoginPassword = (password) => {
  if (
    typeof password !== 'string' ||
    !password.length
  ) {
    return 'Password is required!';
  }

  if (password.length > 128) {
    return 'Invalid email or password!';
  }

  return null;
};

// ==========================================
// 5. MONGODB DUPLICATE KEY ERROR
// ==========================================

export const getDuplicateKeyError = (error) => {
  return error?.code === 11000;
};