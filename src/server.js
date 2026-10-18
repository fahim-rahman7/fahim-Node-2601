import dotenv from 'dotenv';
dotenv.config(); // এটি সবার উপরে থাকতে হবে
import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocket } from './sockets/chatSocket.js';
import './config/redis.js';
import dns from 'node:dns/promises';



const PORT = process.env.PORT || 8000;
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173', // Production-e apnar frontend URL diye diben
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
app.set('io', io);
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