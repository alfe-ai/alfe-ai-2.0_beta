const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve WebVM build assets
app.use('/', express.static(path.join(__dirname, 'webvm-source', 'build')));

// Serve disk images
app.use('/disk-images', express.static(path.join(__dirname, 'disk-images')));

const keyPath = process.env.HTTPS_KEY_PATH;
const certPath = process.env.HTTPS_CERT_PATH;

if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  https.createServer(options, app).listen(PORT, () => {
    console.log(`VMRunner running at https://localhost:${PORT}`);
  });
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`VMRunner running at http://localhost:${PORT}`);
  });
}
