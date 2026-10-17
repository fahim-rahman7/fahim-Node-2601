import multer from 'multer';

// Storage configuration in memory buffer
const storage = multer.memoryStorage();

// File filter for image validation
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

export const uploadSingleImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
}).single('profilePicture');