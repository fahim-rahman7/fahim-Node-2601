import { User } from '../models/user.model.js';
import cloudinary, { deleteFromCloudinary } from '../config/cloudinary.js';

// Get Profile
export const getUserProfile = async (req, res) => {
  try {
    const user = req.user;

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully!',
      data: user,
    });
  } catch (error) {
    console.error('Get Profile Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// Update Profile
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, address, bio, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found!' });
    }

    // Update text fields if provided
    if (name) user.name = name;
    if (address !== undefined) user.address = address;
    if (bio !== undefined) user.bio = bio;
    if (phone !== undefined) user.phone = phone;

    // Handle Image Upload if file exists
    if (req.file) {
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
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      data: user,
    });
  } catch (error) {
    console.error('Update Profile Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// Get Friend Profile by ID (Only if they are friends or self)
export const getUserProfileById = async (req, res) => {
    try {
      const currentUserId = req.user._id;
      const { userId } = req.params;
  
      // 1. If user is checking their own profile
      if (currentUserId.toString() === userId) {
        return res.status(200).json({
          success: true,
          message: 'Profile retrieved successfully!',
          data: req.user,
        });
      }
  
      // 2. Check if the target user is in the current user's friend list
      const currentUser = await User.findById(currentUserId);
      const isFriend = currentUser.friends.some(
        (friendId) => friendId.toString() === userId
      );
  
      if (!isFriend) {
        return res.status(403).json({
          success: false,
          message: 'Access denied! You can only view profiles of your friends.',
        });
      }
  
      // 3. Fetch target user's profile (excluding password)
      const targetUser = await User.findById(userId).select('-password');
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found!' });
      }
  
      res.status(200).json({
        success: true,
        message: 'Friend profile retrieved successfully!',
        data: targetUser,
      });
    } catch (error) {
      console.error('Get User Profile By ID Error:', error.message);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  };