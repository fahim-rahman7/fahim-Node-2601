import { Message } from '../models/message.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/appError.js';

// Get Chat Messages between Current User and Friend
export const getChatHistory = async (req, res, next) => {
  try {
    const currentUserId = req.user?._id;
    const { friendId } = req.params;

    if (!friendId) {
      throw new AppError('Friend ID is required!', 400);
    }

    // Check if current user exists
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      throw new AppError('User no longer exists!', 404);
    }

    // Check if they are friends
    const isFriend = currentUser.friends?.some(
      (id) => id.toString() === friendId.toString()
    );

    if (!isFriend) {
      throw new AppError(
        'Access denied! You can only view chat history with your friends.',
        403
      );
    }

    // Fetch conversation between current user and friend
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, recipient: friendId },
        { sender: friendId, recipient: currentUserId },
      ],
    })
      .sort({ createdAt: 1 }) // Oldest first
      .populate('sender', 'name profilePicture')
      .populate('recipient', 'name profilePicture');

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error); // Central error handler-er kache error pathiye dilo (CastError ba database error hole o ekhane catch hobe)
  }
};