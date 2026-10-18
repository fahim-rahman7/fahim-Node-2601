import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { Message } from '../models/message.model.js';
import { Group } from '../models/group.model.js';
import { GroupMessage } from '../models/groupMessage.model.js';

// Online users keep track: userId -> socketId
const onlineUsers = new Map();

export const initSocket = (io) => {
  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = 
        socket.handshake.auth?.token || 
        socket.handshake.headers?.authorization?.split(' ')[1] || 
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      console.log('Socket JWT Error:', err.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id || socket.user._id;
    const roomId = userId.toString();

    // Store user in online map & join their own personal room
    onlineUsers.set(roomId, socket.id);
    socket.join(roomId);

    console.log('[SOCKET] User connected:', roomId);
    console.log('[SOCKET] Personal room:', roomId);
    console.log('[SOCKET] Socket rooms:', [...socket.rooms]);
    // ==========================================
    // 1. PRIVATE CHAT EVENTS
    // ==========================================
    socket.on('send_message', async (data) => {
        try {
          const { recipientId, message } = data;
          console.log(`[SOCKET] User ${userId} sending message to ${recipientId}: "${message}"`);
  
          if (!recipientId || !message || !message.trim()) {
            return socket.emit('error_message', { message: 'Recipient and message content are required!' });
          }
  
          // Check Friendship Validation
          const sender = await User.findById(userId);
          const isFriend = sender.friends.some((id) => id.toString() === recipientId.toString());
  
          if (!isFriend) {
            console.log(`[SOCKET ERROR] Friendship check failed between ${userId} and ${recipientId}`);
            return socket.emit('error_message', { message: 'You can only message users in your friend list!' });
          }
  
          // Save Message to Database
          const newMessage = await Message.create({
            sender: userId,
            recipient: recipientId,
            message: message.trim(),
          });
  
          // Populate sender & recipient info for frontend rendering
          const populatedMsg = await Message.findById(newMessage._id)
            .populate('sender', 'name email profilePicture')
            .populate('recipient', 'name email profilePicture');
  
          console.log(`[SOCKET] Message saved to DB. Emitting to room: ${recipientId.toString()}`);
  
          // Emit message to recipient if online (to their personal room)
          io.to(recipientId.toString()).emit('receive_message', populatedMsg);
  
          // Acknowledge the sender with sent message
          socket.emit('message_sent', populatedMsg);
        } catch (error) {
          console.error('Socket send_message error:', error.message);
          socket.emit('error_message', { message: 'Failed to send message.' });
        }
      });

    // ==========================================
    // 2. GROUP CHAT EVENTS
    // ==========================================

    // Join Group Room
    socket.on('join_group', async (groupId) => {
      try {
        const group = await Group.findById(groupId);
        if (group && group.members.some((id) => id.toString() === userId.toString())) {
          socket.join(groupId);
          console.log(`User ${userId} joined group room: ${groupId}`);
        }
      } catch (err) {
        console.error('Join group error:', err.message);
      }
    });

    // Send Group Message
    socket.on('send_group_message', async (data) => {
      try {
        const { groupId, message } = data;

        if (!groupId || !message || !message.trim()) {
          return socket.emit('error_message', { message: 'Group ID and message content are required!' });
        }

        // Check if user is a member of the group
        const group = await Group.findById(groupId);
        if (!group || !group.members.some((id) => id.toString() === userId.toString())) {
          return socket.emit('error_message', { message: 'You are not a member of this group!' });
        }

        // Save Group Message to DB
        const newGroupMsg = await GroupMessage.create({
          group: groupId,
          sender: userId,
          message: message.trim(),
        });

        const populatedMsg = await GroupMessage.findById(newGroupMsg._id)
          .populate('sender', 'name email profilePicture');

        // Broadcast message to all members in the group room (including sender)
        io.to(groupId).emit('receive_group_message', populatedMsg);
      } catch (error) {
        console.error('Group message error:', error.message);
        socket.emit('error_message', { message: 'Failed to send group message.' });
      }
    });

    // ==========================================
    // 3. DISCONNECT EVENT
    // ==========================================
    socket.on('disconnect', () => {
      onlineUsers.delete(userId.toString());
      console.log(`User disconnected: ${userId}`);
    });
  });
};