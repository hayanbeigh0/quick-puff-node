const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });
const mongoose = require('mongoose');
const Brand = require('../models/brandModel');
const BrandCategory = require('../models/brandCategoryModel');

const migrateBrandCategories = async () => {
    try {
        console.log('Starting brand categories migration...');

        // Get all brands with their brand categories
        const brands = await Brand.find().select('categories').lean();
        console.log(`Found ${brands.length} brands to migrate`);

        // Process each brand
        for (const brand of brands) {
            // Get all brand categories for this brand
            const brandCategories = await BrandCategory.find({
                _id: { $in: brand.categories }
            }).select('productCategories').lean();

            // Get all unique product categories from brand categories
            const productCategoryIds = [...new Set(
                brandCategories.reduce((acc, bc) => {
                    return acc.concat(bc.productCategories.map(pc => pc.toString()));
                }, [])
            )];

            // Update the brand with product categories
            await Brand.findByIdAndUpdate(brand._id, {
                categories: productCategoryIds
            });

            console.log(`Migrated brand ${brand._id} with ${productCategoryIds.length} product categories`);
        }

        console.log('Migration completed successfully');

    } catch (error) {
        console.error('Error during migration:', error);
        throw error;
    }
};

const DB = process.env.DATABASE.replace(
    '<PASSWORD>',
    process.env.DATABASE_PASSWORD,
);
// If running directly
if (require.main === module) {
    mongoose.connect(DB)
        .then(() => {
            console.log('Connected to database');
            return migrateBrandCategories();
        })
        .then(() => {
            console.log('Migration completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Error:', error);
            process.exit(1);
        });
}

module.exports = migrateBrandCategories; 