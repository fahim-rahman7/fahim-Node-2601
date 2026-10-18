import { Message } from '../models/message.model.js';
import { User } from '../models/user.model.js';

// Get Chat Messages between Current User and Friend
export const getChatHistory = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { friendId } = req.params;

    // Check if they are friends
    const currentUser = await User.findById(currentUserId);
    const isFriend = currentUser.friends.some((id) => id.toString() === friendId.toString());

    if (!isFriend) {
      return res.status(403).json({
        success: false,
        message: 'Access denied! You can only view chat history with your friends.',
      });
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

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Get Chat History Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};