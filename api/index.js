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
    });const express = require('express');
    const mongoose = require('mongoose');
    const cors = require('cors');
    const path = require('path');
    require('dotenv').config();
    
    const app = express();
    
    // Fix Mongoose deprecation warning
    mongoose.set('strictQuery', false);
    
    // CORS configuration for Vercel
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [
          'https://leave-productivity-analyzer.vercel.app',
          'https://leave-productivity-analyzer-git-main-nitya-nivdunges-projects.vercel.app',
          'https://leave-productivity-analyzer-*.vercel.app'
        ]
      : 'http://localhost:3000';
    
    app.use(cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    
    // Handle preflight requests
    app.options('*', cors());
    
    app.use(express.json());
    
    // Add request logging middleware for debugging
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });
    
    // Import your existing routes - FIX THE PATH HERE
    // Assuming apiRoutes.js is in the same directory (api folder)
    const apiRoutes = require('./apiRoutes'); // Changed from './routes/apiRoutes'
    app.use('/api', apiRoutes);
    
    // MongoDB connection with fallback
    const connectDB = async () => {
      try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
          console.warn(' MONGODB_URI not set. Using in-memory data (data will be lost on restart).');
          return; // Skip connection for now
        }
        
        console.log(' Attempting MongoDB connection...');
        await mongoose.connect(mongoURI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });
        console.log(' MongoDB connected successfully');
      } catch (error) {
        console.error(' MongoDB connection failed:', error.message);
        console.log(' For production, set MONGODB_URI in environment variables.');
      }
    };
    
    // Connect to DB (non-blocking)
    connectDB();
    
    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('Server Error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
    
    // 404 handler for undefined routes
    app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method 
      });
    });
    
    // Export as Vercel serverless function
    module.exports = (req, res) => {
      console.log(` Incoming request: ${req.method} ${req.url}`);
      return app(req, res);
    };
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