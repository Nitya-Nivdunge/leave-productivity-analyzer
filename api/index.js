const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Fix Mongoose deprecation warning
mongoose.set('strictQuery', false);

// CORS configuration for Vercel
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-app-name.vercel.app'] 
    : 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Import your existing routes
const apiRoutes = require('./routes/apiRoutes');
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    mongoConnected: mongoose.connection.readyState === 1
  });
});

// MongoDB connection with fallback
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.warn(' MONGODB_URI not set. Using in-memory data (data will be lost on restart).');
      return; // Skip connection for now
    }
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' MongoDB connected successfully');
  } catch (error) {
    console.warn(' MongoDB connection failed. Using in-memory data.');
    console.log(' For production, set MONGODB_URI in environment variables.');
  }
};

// Connect to DB (non-blocking)
connectDB();

// Export as Vercel serverless function
module.exports = (req, res) => {
  return app(req, res);
};