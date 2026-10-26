import { User } from '../models/user.model.js';
import { FriendRequest } from '../models/friendRequest.model.js';
import { AppError } from '../utils/appError.js';


export const sendFriendRequest = async (req, res, next) => {
  try {
    const senderId = req.user?._id;
    const { recipientId } = req.params;

    if (!recipientId) {
      throw new AppError('Recipient ID is required!', 400);
    }

    if (senderId.toString() === recipientId.toString()) {
      throw new AppError('You cannot send a friend request to yourself!', 400);
    }

    // Check if recipient exists
    const recipientUser = await User.findById(recipientId);
    if (!recipientUser) {
      throw new AppError('Recipient user not found!', 404);
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: senderId, recipient: recipientId },
        { sender: recipientId, recipient: senderId },
      ],
    });

    if (existingRequest) {
      throw new AppError('A friend request already exists between you two!', 400);
    }

    const newRequest = await FriendRequest.create({
      sender: senderId,
      recipient: recipientId,
    });

    // Real-time Socket Event Emit
    const io = req.app.get('io');
    if (io) {
      const recipientRoom = recipientId.toString();
      const populatedReq = await FriendRequest.findById(newRequest._id).populate(
        'sender',
        'name email profilePicture'
      );

      io.to(recipientRoom).emit('new_friend_request', populatedReq);
    }

    return res.status(201).json({
      success: true,
      message: 'Friend request sent successfully!',
      data: newRequest,
    });
  } catch (error) {
    next(error);
  }
};

export const acceptFriendRequest = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { requestId } = req.params;

    if (!requestId) {
      throw new AppError('Request ID is required!', 400);
    }

    // 1. Find the friend request
    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest || friendRequest.status !== 'pending') {
      throw new AppError('Friend request not found or already processed!', 404);
    }

    // 2. Only the recipient can accept the request
    if (friendRequest.recipient.toString() !== userId.toString()) {
      throw new AppError('Unauthorized action!', 403);
    }

    const senderId = friendRequest.sender.toString();
    const recipientId = userId.toString();

    // 3. Update the request status
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // 4. Add both users to each other's friend lists
    await User.findByIdAndUpdate(senderId, {
      $addToSet: { friends: recipientId },
    });

    await User.findByIdAndUpdate(recipientId, {
      $addToSet: { friends: senderId },
    });

    // 5. Get the user who accepted the request
    const acceptorUser = await User.findById(recipientId).select(
      'name email profilePicture'
    );

    // 6. Delete the accepted request from the database
    await FriendRequest.findByIdAndDelete(requestId);

    // 7. Notify the original sender AFTER database updates
    const io = req.app.get('io');
    if (io) {
      const senderRoom = senderId;
      io.to(senderRoom).emit('friend_request_accepted', {
        message: `${acceptorUser.name} accepted your friend request!`,
        friend: acceptorUser,
      });
    }

    // 8. Send API response
    return res.status(200).json({
      success: true,
      message: 'Friend request accepted successfully!',
    });
  } catch (error) {
    next(error);
  }
};

export const rejectFriendRequest = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { requestId } = req.params;

    if (!requestId) {
      throw new AppError('Request ID is required!', 400);
    }

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      throw new AppError('Friend request not found!', 404);
    }

    // Ensure only the recipient can reject
    if (friendRequest.recipient.toString() !== userId.toString()) {
      throw new AppError('Unauthorized action!', 403);
    }

    const senderId = friendRequest.sender;
    await FriendRequest.findByIdAndDelete(requestId);

    // Real-time Socket Event Emit
    const io = req.app.get('io');
    if (io) {
      io.to(senderId.toString()).emit('friend_request_rejected', { requestId });
    }

    return res.status(200).json({
      success: true,
      message: 'Friend request rejected successfully!',
    });
  } catch (error) {
    next(error);
  }
};

export const cancelFriendRequest = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { requestId } = req.params;

    if (!requestId) {
      throw new AppError('Request ID is required!', 400);
    }

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      throw new AppError('Friend request not found!', 404);
    }

    // Ensure only the sender can cancel their own sent request
    if (friendRequest.sender.toString() !== userId.toString()) {
      throw new AppError('Unauthorized action!', 403);
    }

    const recipientId = friendRequest.recipient;
    await FriendRequest.findByIdAndDelete(requestId);

    // Real-time Socket Event Emit
    const io = req.app.get('io');
    if (io) {
      io.to(recipientId.toString()).emit('friend_request_canceled', { requestId });
    }

    return res.status(200).json({
      success: true,
      message: 'Friend request canceled successfully!',
    });
  } catch (error) {
    next(error);
  }
};

export const getIncomingRequests = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    const requests = await FriendRequest.find({
      recipient: userId,
      status: 'pending',
    }).populate('sender', 'name email profilePicture bio address');

    return res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

export const getSentRequests = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    const requests = await FriendRequest.find({
      sender: userId,
      status: 'pending',
    }).populate('recipient', 'name email profilePicture bio address');

    return res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

export const getFriendList = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user._id).populate(
      'friends',
      'name email profilePicture bio address'
    );

    if (!currentUser) {
      throw new AppError('User no longer exists!', 404);
    }

    return res.status(200).json({
      success: true,
      data: currentUser.friends,
    });
  } catch (error) {
    next(error);
  }
};

export const getFriendSuggestions = async (req, res, next) => {
  try {
    const currentUserId = req.user?._id;
    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
      throw new AppError('User no longer exists!', 404);
    }

    // Find all active requests sent or received
    const pendingRequests = await FriendRequest.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
      status: 'pending',
    });

    // Collect IDs to exclude: current user, existing friends, and users with pending requests
    const excludeIds = [
      currentUserId,
      ...(currentUser.friends || []),
      ...pendingRequests.map((req) =>
        req.sender.toString() === currentUserId.toString()
          ? req.recipient
          : req.sender
      ),
    ];

    const suggestions = await User.find({
      _id: { $nin: excludeIds },
    }).select('name email profilePicture bio address');

    return res.status(200).json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    next(error);
  }
};

export const getOnlineFriends = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user._id).populate(
      'friends',
      'name email profilePicture bio address'
    );

    if (!currentUser) {
      throw new AppError('User no longer exists!', 404);
    }

    const onlineUsersMap = req.app.get('onlineUsers') || new Map();

    const onlineFriends = currentUser.friends.filter((friend) =>
      onlineUsersMap.has(friend._id.toString())
    );

    return res.status(200).json({
      success: true,
      data: onlineFriends,
    });
  } catch (error) {
    next(error);
  }
};