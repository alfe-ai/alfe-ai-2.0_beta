const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve WebVM build assets
app.use('/', express.static(path.join(__dirname, 'webvm-source', 'build')));

// Serve disk images
app.use('/disk-images', express.static(path.join(__dirname, 'disk-images')));

app.listen(PORT, () => console.log(`VMRunner running at http://localhost:${PORT}`));
