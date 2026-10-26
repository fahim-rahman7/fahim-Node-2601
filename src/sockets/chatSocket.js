import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { Message } from '../models/message.model.js';
import { Group } from '../models/group.model.js';
import { GroupMessage } from '../models/groupMessage.model.js';

export const onlineUsers = new Map();

const notifyFriendsAboutPresence = async (io, userId, isOnline) => {
  try {
    const normalizedUserId = String(userId);

    const user = await User.findById(normalizedUserId).select('friends');

    if (!user) {
      return;
    }

    const currentlyOnline = onlineUsers.has(normalizedUserId);

    if (currentlyOnline !== isOnline) {
      return;
    }

    const payload = {
      userId: normalizedUserId,
      isOnline,
    };

    for (const friendId of user.friends || []) {
      io.to(String(friendId)).emit('friend_online_status', payload);
    }

    console.log(
      `[PRESENCE] User ${normalizedUserId} is ${
        isOnline ? 'online' : 'offline'
      }. Friends notified.`
    );
  } catch (error) {
    console.error(
      '[PRESENCE] Failed to notify friends:',
      error.message
    );
  }
};

export const initSocket = (io) => {

  io.use(async (socket, next) => {
    try {
      const authorization = socket.handshake.headers?.authorization;

      const token =
        socket.handshake.auth?.token ||
        (authorization?.startsWith('Bearer ')
          ? authorization.split(' ')[1]
          : null) ||
        socket.handshake.query?.token;

      if (!token) {
        return next(
          new Error('Authentication error: Token required')
        );
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET
      );

      socket.user = decoded;

      next();
    } catch (error) {
      console.error('[SOCKET] JWT Error:', error.message);

      next(
        new Error('Authentication error: Invalid token')
      );
    }
  });


  io.on('connection', (socket) => {
    const rawUserId =
      socket.user?.id ||
      socket.user?._id ||
      socket.user?.userId;

    if (!rawUserId) {
      console.error(
        '[SOCKET] Connected user has no valid ID.'
      );

      socket.disconnect(true);
      return;
    }

    const userId = String(rawUserId);

    // Check if this user already has another active connection.
    let userSockets = onlineUsers.get(userId);

    const wasOffline = !userSockets || userSockets.size === 0;

    if (!userSockets) {
      userSockets = new Set();
      onlineUsers.set(userId, userSockets);
    }

    // Save this connection's socket ID.
    userSockets.add(socket.id);

    socket.join(userId);

    console.log('[SOCKET] User connected:', userId);
    console.log('[SOCKET] Socket ID:', socket.id);
    console.log(
      '[SOCKET] Active connections for user:',
      userSockets.size
    );

    // Notify friends only when the user transitions
    // from offline to online.
    if (wasOffline) {
      void notifyFriendsAboutPresence(io, userId, true);
    }

    // Send the connecting user their currently online friends.
    const sendOnlineFriends = async () => {
      try {
        const currentUser = await User.findById(userId)
          .select('friends');

        if (!currentUser) {
          socket.emit('online_friends', []);
          return;
        }

        const friendIds = (currentUser?.friends || []).map(
          (friendId) => String(friendId)
        );
        
        const allOnlineIds = [...onlineUsers.keys()];
        
        const onlineFriendIds = friendIds.filter(
          (friendId) => onlineUsers.has(friendId)
        );
        
        console.log('[PRESENCE DEBUG] Current user:', userId);
        console.log('[PRESENCE DEBUG] Friend IDs:', friendIds);
        console.log('[PRESENCE DEBUG] Online user IDs:', allOnlineIds);
        console.log('[PRESENCE DEBUG] Online friend IDs:', onlineFriendIds);
        
        socket.emit('online_friends', onlineFriendIds);
      } catch (error) {
        console.error(
          '[PRESENCE] Failed to get online friends:',
          error.message
        );

        socket.emit('online_friends', []);
      }
    };

    void sendOnlineFriends();


    // Send Private Message
    socket.on('send_message', async (data) => {
      try {
        const { recipientId, message } = data || {};

        console.log(
          `[SOCKET] User ${userId} sending message to ${recipientId}`
        );

        if (
          !recipientId ||
          typeof message !== 'string' ||
          !message.trim()
        ) {
          return socket.emit('error_message', {
            message:
              'Recipient and message content are required!',
          });
        }

        // Check whether sender and recipient are friends.
        const sender = await User.findById(userId)
          .select('friends');

        if (!sender) {
          return socket.emit('error_message', {
            message: 'Sender account not found.',
          });
        }

        const isFriend = (sender.friends || []).some(
          (friendId) =>
            String(friendId) === String(recipientId)
        );

        if (!isFriend) {
          console.log(
            `[SOCKET] Friendship check failed between ${userId} and ${recipientId}`
          );

          return socket.emit('error_message', {
            message:
              'You can only message users in your friend list!',
          });
        }

        // Save message to database.
        const newMessage = await Message.create({
          sender: userId,
          recipient: recipientId,
          message: message.trim(),
        });

        // Populate sender and recipient details.
        const populatedMsg = await Message.findById(
          newMessage._id
        )
          .populate('sender', 'name email profilePicture')
          .populate('recipient', 'name email profilePicture');

        console.log(
          `[SOCKET] Message saved. Recipient room: ${String(recipientId)}`
        );

        // All active sockets belonging to the recipient
        // will receive the message through their personal room.
        io.to(String(recipientId)).emit(
          'receive_message',
          populatedMsg
        );

        // Acknowledge the sender.
        socket.emit('message_sent', populatedMsg);
      } catch (error) {
        console.error(
          '[SOCKET] send_message error:',
          error.message
        );

        socket.emit('error_message', {
          message: 'Failed to send message.',
        });
      }
    });

    // Join Group Room
    socket.on('join_group', async (groupId) => {
      try {
        if (!groupId) {
          return;
        }

        const group = await Group.findById(groupId);

        if (!group) {
          return;
        }

        const isMember = (group.members || []).some(
          (memberId) => String(memberId) === userId
        );

        if (!isMember) {
          console.log(
            `[SOCKET] User ${userId} is not a member of group ${groupId}`
          );

          return;
        }

        const groupRoomId = String(groupId);

        socket.join(groupRoomId);

        console.log(
          `[SOCKET] User ${userId} joined group room: ${groupRoomId}`
        );
      } catch (error) {
        console.error(
          '[SOCKET] Join group error:',
          error.message
        );
      }
    });


    // Send Group Message
    socket.on('send_group_message', async (data) => {
      try {
        const { groupId, message } = data || {};

        if (
          !groupId ||
          typeof message !== 'string' ||
          !message.trim()
        ) {
          return socket.emit('error_message', {
            message:
              'Group ID and message content are required!',
          });
        }

        // Verify group membership.
        const group = await Group.findById(groupId);

        if (!group) {
          return socket.emit('error_message', {
            message: 'Group not found.',
          });
        }

        const isMember = (group.members || []).some(
          (memberId) => String(memberId) === userId
        );

        if (!isMember) {
          return socket.emit('error_message', {
            message: 'You are not a member of this group!',
          });
        }

        // Save group message.
        const newGroupMsg = await GroupMessage.create({
          group: groupId,
          sender: userId,
          message: message.trim(),
        });

        // Populate sender details.
        const populatedMsg = await GroupMessage.findById(
          newGroupMsg._id
        ).populate(
          'sender',
          'name email profilePicture'
        );

        // Broadcast to sockets that have joined this group room.
        io.to(String(groupId)).emit(
          'receive_group_message',
          populatedMsg
        );
      } catch (error) {
        console.error(
          '[SOCKET] Group message error:',
          error.message
        );

        socket.emit('error_message', {
          message: 'Failed to send message.',
        });
      }
    });

    socket.on('disconnect', (reason) => {
      const currentSockets = onlineUsers.get(userId);

      if (!currentSockets) {
        return;
      }

      // Remove only this socket connection.
      currentSockets.delete(socket.id);

      console.log('[SOCKET] User disconnected:', userId);
      console.log('[SOCKET] Disconnect reason:', reason);
      console.log(
        '[SOCKET] Remaining connections:',
        currentSockets.size
      );

      // A user is offline only after their final socket disconnects.
      if (currentSockets.size === 0) {
        onlineUsers.delete(userId);

        void notifyFriendsAboutPresence(io, userId, false);
      }
    });
  });
};