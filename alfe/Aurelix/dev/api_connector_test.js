/**
 * Manual test for the endpoints in api_connector.js.
 */
const axios = require('axios');

(async () => {
  const baseURL = 'http://localhost:3444/api';

  try {
    console.log('=== Testing createChat endpoint ===');
    const createChatResponse = await axios.post(`${baseURL}/createChat`, {
      repoName: 'alfe-dev_test_repo'
    });
    console.log('Response from /createChat:', createChatResponse.data);

    console.log('=== Testing createGenericChat endpoint ===');
    const createGenericChatResponse = await axios.post(`${baseURL}/createGenericChat`, {
      message: 'Hello from test script!'
    });
    console.log('Response from /createGenericChat:', createGenericChatResponse.data);

  } catch (error) {
    console.error('Error during API tests:', error.message);
  }

  console.log('=== Test run completed. ===');
})();
