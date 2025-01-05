const mongoose = require('mongoose');

const removeBrandCategoryCollection = async () => {
  try {
    await mongoose.connection.dropCollection('brandcategories');
    console.log('Successfully removed brandcategories collection');
  } catch (error) {
    console.error('Error removing collection:', error);
  }
};

// Run if directly executed
if (require.main === module) {
  mongoose.connect(process.env.DATABASE_URL)
    .then(removeBrandCategoryCollection)
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
} 