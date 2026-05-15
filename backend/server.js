const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
require('./cron');

const app = express();
const server = http.createServer(app);

// CORS configuration for different environments
const corsOrigin = process.env.NODE_ENV === 'production'
  ? process.env.FRONTEND_URL
  : 'http://localhost:5173';

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Make io accessible inside routes
app.set('io', io);

// Routes (we'll add these one by one)
app.use('/api/auth', require('./routes/auth'));
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
app.use('/api', adminRoutes);
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/timetable', require('./routes/timetable'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
