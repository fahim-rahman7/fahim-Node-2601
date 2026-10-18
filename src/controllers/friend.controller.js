import { User } from '../models/user.model.js';
import { FriendRequest } from '../models/friendRequest.model.js';

// 1. Send Friend Request
export const sendFriendRequest = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { recipientId } = req.params;

    if (senderId.toString() === recipientId) {
      return res.status(400).json({ success: false, message: 'Apni nije ke friend request pathate parben na!' });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ success: false, message: 'User not found!' });
    }

    // Check if already friends
    if (recipient.friends.includes(senderId)) {
      return res.status(400).json({ success: false, message: 'Tara already apnar friend list-e ache!' });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: senderId, recipient: recipientId },
        { sender: recipientId, recipient: senderId },
      ],
      status: 'pending',
    });

    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'Friend request already sent or pending!' });
    }

    await FriendRequest.create({
      sender: senderId,
      recipient: recipientId,
    });

    res.status(200).json({
      success: true,
      message: 'Friend request sent successfully!',
    });
  } catch (error) {
    console.error('Send Friend Request Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 2. Accept Friend Request
export const acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest || friendRequest.status !== 'pending') {
      return res.status(404).json({ success: false, message: 'Friend request not found or already processed!' });
    }

    // Ensure the current user is the recipient
    if (friendRequest.recipient.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized action!' });
    }

    // Update request status to accepted
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Add each other to friends array mutually
    await User.findByIdAndUpdate(friendRequest.sender, { $addToSet: { friends: friendRequest.recipient } });
    await User.findByIdAndUpdate(friendRequest.recipient, { $addToSet: { friends: friendRequest.sender } });

    // Optional: Delete the request document after acceptance
    await FriendRequest.findByIdAndDelete(requestId);

    res.status(200).json({
      success: true,
      message: 'Friend request accepted successfully!',
    });
  } catch (error) {
    console.error('Accept Friend Request Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 3. Reject Friend Request
export const rejectFriendRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest || friendRequest.status !== 'pending') {
      return res.status(404).json({ success: false, message: 'Friend request not found!' });
    }

    if (friendRequest.recipient.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized action!' });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    res.status(200).json({
      success: true,
      message: 'Friend request rejected!',
    });
  } catch (error) {
    console.error('Reject Friend Request Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 4. Get Incoming Friend Requests (Ke ke request pathiyeche)
export const getIncomingRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await FriendRequest.find({
      recipient: userId,
      status: 'pending',
    }).populate('sender', 'name email profilePicture bio address');

    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    console.error('Get Incoming Requests Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 5. Get Friend List
export const getFriendList = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).populate('friends', 'name email profilePicture bio address');

    res.status(200).json({
      success: true,
      data: currentUser.friends,
    });
  } catch (error) {
    console.error('Get Friend List Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 6. Get Friend Suggestions (Exclude friends and users with pending requests)
export const getFriendSuggestions = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const currentUser = await User.findById(currentUserId);

    // Find all active requests sent or received
    const pendingRequests = await FriendRequest.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
      status: 'pending',
    });

    // Collect IDs to exclude (current user, friends, and users with pending requests)
    const excludeIds = [
      currentUserId,
      ...currentUser.friends,
      ...pendingRequests.map(req => (req.sender.toString() === currentUserId.toString() ? req.recipient : req.sender)),
    ];

    const suggestions = await User.find({
      _id: { $nin: excludeIds },
    }).select('name email profilePicture bio address');

    res.status(200).json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    console.error('Get Suggestions Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};