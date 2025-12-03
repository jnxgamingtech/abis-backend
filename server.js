require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/abisdb';

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// connect to mongo
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// routes
app.use('/api/documents', require('./routes/documents'));
app.post('/api/recognize-image', require('./routes/recognize'));
app.use('/api/blotter', require('./routes/blotter'));
app.use('/api/reports', require('./routes/reports'));

app.get('/', (req, res) => res.json({ message: 'ABIS backend running' }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
