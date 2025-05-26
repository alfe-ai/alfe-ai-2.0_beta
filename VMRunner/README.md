# VMRunner

This subdirectory contains a minimal Node.js project that can serve the [WebVM](https://github.com/leaningtech/webvm) client for running a Debian environment in the browser.

## Setup

1. Ensure Node.js and npm are installed.
2. Install dependencies (requires network access):
   ```bash
   npm install
   ```
   This installs Express for serving static files.
3. Clone the WebVM repository and build the client:
   ```bash
   git clone https://github.com/leaningtech/webvm.git webvm-source
   cd webvm-source
   npm install
   npm run build
   ```
4. Download or build a disk image and place it in `disk-images/`.

## Running

Start the server with:
```bash
npm start
```
Then open `http://localhost:3000` in your browser.

## Note

The repository does not include the WebVM source or disk images. Those need to be fetched separately when you have internet access.
