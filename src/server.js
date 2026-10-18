import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocket } from './sockets/chatSocket.js';
import dotenv from 'dotenv';
import './config/redis.js';
import dns from 'node:dns/promises';

dotenv.config();

const PORT = process.env.PORT || 8000;
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // Production-e apnar frontend URL diye diben
    methods: ['GET', 'POST'],
  },
});

// Attach socket handlers
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