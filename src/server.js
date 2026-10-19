import 'dotenv/config';

import http from 'http';
import dns from 'node:dns/promises';
import { Server } from 'socket.io';

import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocket, onlineUsers } from './sockets/chatSocket.js';
import './config/redis.js';

const PORT = process.env.PORT || 8000;

// DNS configuration
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make Socket.IO and online users available in Express controllers
app.set('io', io);
app.set('onlineUsers', onlineUsers);

// Attach Socket.IO event handlers
initSocket(io);

const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();