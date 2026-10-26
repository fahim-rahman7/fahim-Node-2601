import { User } from '../models/user.model.js';
import cloudinary, { deleteFromCloudinary } from '../config/cloudinary.js';
import { AppError } from '../utils/appError.js';


export const getUserProfile = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      throw new AppError('User not found!', 404);
    }

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully!',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};


export const updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { name, address, bio, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found!', 404);
    }

    // Update text fields if provided
    if (name) user.name = name;
    if (address !== undefined) user.address = address;
    if (bio !== undefined) user.bio = bio;
    if (phone !== undefined) user.phone = phone;

    // Handle Image Upload if file exists
    if (req.file) {
      try {
        // 1. Delete previous image from Cloudinary if exists
        if (user.profilePicture && user.profilePicture.publicId) {
          await deleteFromCloudinary(user.profilePicture.publicId);
        }

        // 2. Upload new image using Stream
        const uploadPromise = new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'user_profiles' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });

        const cloudinaryResult = await uploadPromise;

        // 3. Update profilePicture field in user document
        user.profilePicture = {
          url: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
        };
      } catch (uploadError) {
        throw new AppError('Image upload failed! Please try again.', 500);
      }
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};


export const getUserProfileById = async (req, res, next) => {
  try {
    const currentUserId = req.user?._id;
    const { userId } = req.params;

    if (!userId) {
      throw new AppError('Target User ID is required!', 400);
    }

    // 1. If user is checking their own profile
    if (currentUserId.toString() === userId) {
      return res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully!',
        data: req.user,
      });
    }

    // 2. Check if the target user exists first
    const targetUser = await User.findById(userId).select('-password');
    if (!targetUser) {
      throw new AppError('User not found!', 404);
    }

    // 3. Check if the target user is in the current user's friend list
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      throw new AppError('Current user no longer exists!', 404);
    }

    const isFriend = currentUser.friends?.some(
      (friendId) => friendId.toString() === userId
    );

    if (!isFriend) {
      throw new AppError(
        'Access denied! You can only view profiles of your friends.',
        403
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Friend profile retrieved successfully!',
      data: targetUser,
    });
  } catch (error) {
    next(error);
  }
};