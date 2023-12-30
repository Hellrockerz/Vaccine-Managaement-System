const express = require('express');
const mongoose = require('mongoose');
const http = require("http");
const socketIo = require("socket.io");
const app = express();
const port = 3000;
const server = http.createServer(app);
const io = socketIo(server);
module.exports = { io };
const MONGODB_URI = 'mongodb://localhost:27017/VMS';
const cors = require('cors');
app.use(cors({
  origin: 'https://d6ce-182-71-75-106.ngrok-free.app',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: false,
}));

mongoose.connect(MONGODB_URI);

const db = mongoose.connection;

db.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});
db.once('open', () => {
  console.log(`MongoDB connected at ${MONGODB_URI}`);
});

app.use(express.json());
app.use(express.static('public'))

const userRoutes = require('./routes/userRoutes');
const staticRoutes = require('./routes/staticRoutes')

app.use('/api', staticRoutes);
app.use('/api', userRoutes);

app.listen(port, () => {
  console.log(`Server is running on http://172.16.1.131:${port}`);
});
