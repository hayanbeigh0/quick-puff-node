const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config({ path: '../config.env' });
// Replace placeholders with your actual connection string
const uri = process.env.DATABASE.replace(
    '<PASSWORD>',
    process.env.DATABASE_PASSWORD
);

(async function () {
    const client = new MongoClient(uri);

    try {
        // Connect to the MongoDB database
        await client.connect();
        console.log('Connected to the database.');

        const db = client.db('quick-puff'); // Replace with your actual database name
        const products = db.collection('products');

        // Update all relevant fields in a single query
        const result = await products.find().forEach((product) => {
            const updates = {};

            if (typeof product.productCategory === 'string') {
                updates.productCategory = ObjectId(product.productCategory);
            }

            if (typeof product.brand === 'string') {
                updates.brand = ObjectId(product.brand);
            }

            if (typeof product.flavor === 'string') {
                updates.flavor = ObjectId(product.flavor);
            }

            if (Array.isArray(product.flavorOptions)) {
                updates.flavorOptions = product.flavorOptions.map((flavor) =>
                    typeof flavor === 'string' ? ObjectId(flavor) : flavor
                );
            }

            // Perform update if there are fields to modify
            if (Object.keys(updates).length > 0) {
                products.updateOne({ _id: product._id }, { $set: updates })
                    .then(() => console.log(`Updated product: ${product._id}`))
                    .catch((err) => console.error(`Error updating product: ${product._id}`, err));
            }
        });

        console.log('All relevant products updated successfully!');
    } catch (err) {
        console.error('Error updating products:', err);
    } finally {
        await client.close();
        console.log('Database connection closed.');
    }
})();
