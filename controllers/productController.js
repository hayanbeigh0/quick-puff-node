const Product = require('../models/productModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const {
  uploadImage,
  getImageUrl,
  deleteImage,
  extractPublicIdFromUrl,
} = require('../utils/cloudfs');
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

// Controller function to handle product creation
const createProduct = catchAsync(async (req, res, next) => {
  // Proceed with product creation after file upload
  console.log(req.body);
  const publicId = await uploadImage(req.file, 'products');
  const assetInfo = getImageUrl(publicId);

  // Create the product with the image URL
  const product = await Product.create({
    name: req.body.name,
    image: assetInfo, // Store the image URL in the image property
    description: req.body.description,
    price: req.body.price,
    oldPrice: req.body.oldPrice,
    stock: req.body.stock,
  });

  res.status(201).json({
    status: 'success',
    data: {
      product,
    },
  });
});

// Controller function to handle product update
const updateProduct = catchAsync(async (req, res, next) => {
  const { id } = req.body;
  console.log(req.file);

  // Find the product by ID
  const product = await Product.findById(id);
  if (!product) return next(new AppError('Product not found', 404));

  let assetInfo = product.image; // Keep the existing image URL

  // If a new file is provided, upload it and update the image URL
  if (req.file) {
    // Delete the old image from Cloudinary if it exists
    if (product.image) {
      const publicId = extractPublicIdFromUrl(product.image);
      await deleteImage(publicId);
    }

    // Upload the new image
    const publicId = await uploadImage(req.file, 'products');
    assetInfo = getImageUrl(publicId);
  }

  // Update the product
  const updatedProduct = await Product.findByIdAndUpdate(
    id,
    {
      name: req.body.name || product.name,
      image: assetInfo,
      description: req.body.description || product.description,
      price: req.body.price || product.price,
      oldPrice: req.body.oldPrice || product.oldPrice,
      stock: req.body.stock || product.stock,
    },
    {
      new: true, // Return the updated document
      runValidators: true, // Run validators on the update
    },
  );

  res.status(200).json({
    status: 'success',
    data: {
      product: updatedProduct,
    },
  });
});

const deleteProduct = catchAsync(async (req, res, next) => {
  const { productId } = req.params;

  // Find the product by ID
  const product = await Product.findById(productId);
  if (!product) return next(new AppError('Product not found', 404));

  // Delete the image from Cloudinary if it exists
  if (product.image) {
    const publicId = extractPublicIdFromUrl(product.image);
    await deleteImage(publicId);
  }

  // Delete the product from the database
  await Product.findByIdAndDelete(productId);

  res.status(204).json({
    status: 'success',
    message: 'Product deleted successfully',
  });
});

const getProducts = factory.getAll(Product);

// Export middleware and controller functions
module.exports = {
  uploadMiddleware: handleFileUpload, // Expose the middleware
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
};
