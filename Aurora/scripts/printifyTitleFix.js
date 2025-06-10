#!/usr/bin/env node
import axios from 'axios';

const token = process.env.PRINTIFY_API_TOKEN || process.env.PRINTIFY_TOKEN;
const shopId = process.env.PRINTIFY_SHOP_ID;

if (!token) {
  console.error('Missing PRINTIFY_API_TOKEN');
  process.exit(1);
}
if (!shopId) {
  console.error('Missing PRINTIFY_SHOP_ID');
  process.exit(1);
}

const productId = process.argv[2];
if (!productId) {
  console.error('Usage: printifyTitleFix.js <productId>');
  process.exit(1);
}

async function main() {
  try {
    const url = `https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Title:', data.title || '');
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();
