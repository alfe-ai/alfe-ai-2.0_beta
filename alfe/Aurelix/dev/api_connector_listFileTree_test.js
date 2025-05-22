/**
 * Test for the "/listFileTree/:repoName/:chatNumber" GET route.
 */
const axios = require('axios');

(async () => {
  const baseURL = 'http://localhost:3444/api';

  const repoName = 'alfe-dev_test_repo';
  const chatNumber = 1;

  try {
    console.log('[DEBUG] Testing listFileTree endpoint...');
    const response = await axios.get(`${baseURL}/listFileTree/${repoName}/${chatNumber}`);
    console.log('[DEBUG] Response data:', response.data);
  } catch (error) {
    console.error('[ERROR] Could not retrieve file tree:', error.message);
  }

  console.log('[DEBUG] Test completed.');
})();
