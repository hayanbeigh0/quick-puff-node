const cloudinary = require('cloudinary').v2;

// Return "https" URLs by setting secure: true

/////////////////////////
// Uploads an image file
/////////////////////////
const uploadImage = async (file, folderName) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: folderName }, // Specify the folder where the image should be uploaded
      (error, result) => {
        if (error) {
          return reject(new Error('Image upload to Cloudinary failed'));
        }
        resolve(result.public_id);
      },
    );

    stream.end(file.buffer); // Use the buffer to upload the image
  });
};

/////////////////////////////////////
// Gets details of an uploaded image
/////////////////////////////////////
const getAssetInfo = async (publicId) => {
  // Return colors in the response
  const options = {
    colors: true,
  };

  try {
    // Get details about the asset
    const result = await cloudinary.api.resource(publicId, options);
    return result.colors;
  } catch (error) {
    console.error(error);
  }
};

//////////////////////////////////////////////////////////////
// Creates an HTML image tag with a transformation that
// results in a circular thumbnail crop of the image
// focused on the faces, applying an outline of the
// first color, and setting a background of the second color.
//////////////////////////////////////////////////////////////
const createImageTag = (publicId, ...colors) => {
  // Set the effect color and background color
  const [effectColor, backgroundColor] = colors;

  // Create an image tag with transformations applied to the src URL
  let imageTag = cloudinary.image(publicId, {
    transformation: [
      { width: 250, height: 250, gravity: 'faces', crop: 'thumb' },
      { radius: 'max' },
      { effect: 'outline:10', color: effectColor },
      { background: backgroundColor },
    ],
  });

  return imageTag;
};

const getImageUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, options);
};

// Function to delete an image from Cloudinary
const deleteImage = async (publicId) => {
  await cloudinary.uploader.destroy(publicId);
};

// Helper function to extract public ID from the image URL
const extractPublicIdFromUrl = (imageUrl) => {
  // This assumes Cloudinary URL structure
  const regex = /\/v[0-9]+\/(.*?)(?:\.[a-z]{3,4})?(?:\?.*)?$/;
  const match = imageUrl.match(regex);
  return match ? match[1] : null;
};

module.exports = {
  uploadImage,
  getAssetInfo,
  createImageTag,
  getImageUrl,
  deleteImage,
  extractPublicIdFromUrl,
};
