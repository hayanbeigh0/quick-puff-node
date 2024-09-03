const multer = require('multer');

// Configure Multer for handling file uploads
const storage = multer.memoryStorage(); // Store files in memory temporarily
const multerUpload = multer({ storage: storage }); // Initialize Multer with storage

// Middleware to handle file upload
const uploadMiddleware = multerUpload.single('image');

// Middleware function to handle file upload
const handleFileUpload = (req, res, next) => {
  console.log(req.body);
  uploadMiddleware(req, res, (err) => {
    if (err) return next(new AppError('File upload failed', 400));

    // Check if the file was provided
    // if (!req.file) return next(new AppError('Image is required!', 400));

    // Proceed to the next middleware or route handler
    next();
  });
};

module.exports = {
  handleFileUpload,
};
