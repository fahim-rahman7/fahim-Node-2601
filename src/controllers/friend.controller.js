import { User } from '../models/user.model.js';
import { FriendRequest } from '../models/friendRequest.model.js';

// 1. Send Friend Request
export const sendFriendRequest = async (req, res) => {
    try {
      const senderId = req.user._id;
      const { recipientId } = req.params;
  

    // FRIEND REQUEST DEBUG
    console.log('========== FRIEND REQUEST DEBUG ==========');
    console.log('Sender ID:', senderId.toString());
    console.log('Recipient ID:', recipientId.toString());

    const io = req.app.get('io');

    console.log(
      'Connected socket rooms:',
      [...(io?.sockets.adapter.rooms.keys() || [])]
    );

    console.log('==========================================');

      if (senderId.toString() === recipientId.toString()) {
        return res.status(400).json({ success: false, message: "You cannot send a friend request to yourself!" });
      }
  
      const existingRequest = await FriendRequest.findOne({
        $or: [
          { sender: senderId, recipient: recipientId },
          { sender: recipientId, recipient: senderId },
        ],
      });
  
      if (existingRequest) {
        return res.status(400).json({ success: false, message: "A friend request already exists between you two!" });
      }
  
      const newRequest = await FriendRequest.create({ sender: senderId, recipient: recipientId });
  
      // 👈 রিসিভারের রুমে রিয়েল-টাইম ইভেন্ট পাঠানো যাতে পেজ রিলোড ছাড়াই নোটিফিকেশন বা কাউন্ট বাড়ে
      const recipientRoom = recipientId.toString();
      console.log('[FRIEND REQUEST] Socket.IO available:', Boolean(io));
      console.log('[FRIEND REQUEST] Recipient room:', recipientRoom);

      if (io) {
        const connectedSockets =
        io.sockets.adapter.rooms.get(recipientRoom);
        console.log(
          '[FRIEND REQUEST] Sockets in recipient room:',
          connectedSockets?.size || 0
        );

        const populatedReq = await FriendRequest.findById(newRequest._id)
          .populate('sender', 'name email profilePicture');
        
        io.to(recipientRoom).emit('new_friend_request', populatedReq);
      }
  
      res.status(201).json({ success: true, message: "Friend request sent successfully!", data: newRequest });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
// Accept Friend Request
export const acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    // 1. Find the friend request
    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest || friendRequest.status !== 'pending') {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed!',
      });
    }

    // 2. Only the recipient can accept the request
    if (friendRequest.recipient.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized action!',
      });
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
    const acceptorUser = await User.findById(recipientId)
      .select('name email profilePicture');

    // 6. Delete the accepted request from the database
    await FriendRequest.findByIdAndDelete(requestId);

    // 7. Notify the original sender AFTER database updates
    const io = req.app.get('io');

    if (io) {
      const senderRoom = senderId;
      const connectedSockets =
        io.sockets.adapter.rooms.get(senderRoom);

      console.log('[FRIEND ACCEPTED] Sender ID:', senderId);
      console.log(
        '[FRIEND ACCEPTED] Sockets in sender room:',
        connectedSockets?.size || 0
      );

      io.to(senderRoom).emit('friend_request_accepted', {
        message: `${acceptorUser.name} accepted your friend request!`,
        friend: acceptorUser,
      });

      console.log(
        '[FRIEND ACCEPTED] Event emitted to:',
        senderRoom
      );
    }

    // 8. Send API response
    return res.status(200).json({
      success: true,
      message: 'Friend request accepted successfully!',
    });
  } catch (error) {
    console.error(
      'Accept Friend Request Error:',
      error.message
    );

    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};
  
  // 3. Reject Friend Request
  export const rejectFriendRequest = async (req, res) => {
    try {
      const userId = req.user._id;
      const { requestId } = req.params;
  
      const friendRequest = await FriendRequest.findById(requestId);
      if (!friendRequest) {
        return res.status(404).json({ success: false, message: 'Friend request not found!' });
      }
  
      const senderId = friendRequest.sender;
      await FriendRequest.findByIdAndDelete(requestId);
  
      // Real-time Socket Event Emit
      const io = req.app.get('io');
      if (io) {
        io.to(senderId.toString()).emit('friend_request_rejected', { requestId });
      }
  
      res.status(200).json({ success: true, message: 'Friend request rejected successfully!' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  // 4. Cancel Sent Friend Request
  export const cancelFriendRequest = async (req, res) => {
    try {
      const userId = req.user._id;
      const { requestId } = req.params;
  
      const friendRequest = await FriendRequest.findById(requestId);
      if (!friendRequest) {
        return res.status(404).json({ success: false, message: 'Friend request not found!' });
      }
  
      const recipientId = friendRequest.recipient;
      await FriendRequest.findByIdAndDelete(requestId);
  
      // Real-time Socket Event Emit
      const io = req.app.get('io');
      if (io) {
        io.to(recipientId.toString()).emit('friend_request_canceled', { requestId });
      }
  
      res.status(200).json({ success: true, message: 'Friend request canceled successfully!' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

// 5. Get Incoming Friend Requests (Ke ke request pathiyeche)
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

// 6. Get Sent Friend Requests (Ami kake kake pathiyechi - Notun Add kora hoyeche)
export const getSentRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await FriendRequest.find({
      sender: userId,
      status: 'pending',
    }).populate('recipient', 'name email profilePicture bio address');

    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    console.error('Get Sent Requests Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 7. Get Friend List
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

// 8. Get Friend Suggestions (Fix kora hoyeche jate nijer ID kono vabei show na kore)
export const getFriendSuggestions = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const currentUser = await User.findById(currentUserId);

    // Find all active requests sent or received
    const pendingRequests = await FriendRequest.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
      status: 'pending',
    });

    // Collect IDs to exclude: current user, existing friends, and users with pending requests
    const excludeIds = [
      currentUserId,
      ...(currentUser.friends || []),
      ...pendingRequests.map(req => 
        req.sender.toString() === currentUserId.toString() ? req.recipient : req.sender
      ),
    ];

    const suggestions = await User.find({
      _id: { $nin: excludeIds }, // Nijer ID ekhane automatic বাদ পড়ে যাবে
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