// update-prices.js

const axios = require('axios');

const PRINTIFY_API_BASE = 'https://api.printify.com/v1';
const STORE_ID = '18663958';
const PRODUCT_ID = '6845ab1e4b7ca2acc50b19fb';
const NEW_PRICE = 19.44;
const PRICE_CENTS = Math.round(NEW_PRICE * 100); // Printify expects integer prices in cents
const API_TOKEN = process.env.PRINTIFY_API_TOKEN;  // set this in your shell

if (!API_TOKEN) {
  console.error('Error: Please set the PRINTIFY_API_TOKEN environment variable.');
  process.exit(1);
}

async function updateProductVariantsPrice() {
  try {
    // 1. Fetch current product data
    const { data: product } = await axios.get(
      `${PRINTIFY_API_BASE}/shops/${STORE_ID}/products/${PRODUCT_ID}.json`, 
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );

    // 2. Build updated variants array
    const updatedVariants = product.variants.map(variant => ({
      id: variant.id,
      price: PRICE_CENTS
    }));

    // 3. Send update request
    const payload = { variants: updatedVariants };
    const { data: updated } = await axios.put(
      `${PRINTIFY_API_BASE}/shops/${STORE_ID}/products/${PRODUCT_ID}.json`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Successfully updated variant prices:', updated);
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('Failed to update prices:', msg);
    process.exit(1);
  }
}

updateProductVariantsPrice();
