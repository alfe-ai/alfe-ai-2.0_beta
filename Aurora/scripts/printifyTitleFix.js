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

    const currentTitle = data.title || '';
    console.log('Title:', currentTitle);

    const cleanedTitle = currentTitle.replace(/,?\s*\[\.\.\.\]\s*$/, '').trim();
    if (cleanedTitle !== currentTitle) {
      await axios.put(
        url,
        { title: cleanedTitle },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Updated Title:', cleanedTitle);
    } else {
      console.log('No trailing pattern detected; nothing to update.');
    }
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data || err.message;
    console.error(
      `Failed to update product ${productId} (status: ${status ?? 'unknown'}):`,
      msg
    );
    process.exit(1);
  }
}

main();
