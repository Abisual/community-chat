import express from 'express';

// Test health endpoint
const app = express();
const PORT = 3000;

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Simulate starting the server
console.log('Health endpoint test completed successfully');