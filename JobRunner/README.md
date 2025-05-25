# JobRunner

This directory contains a small service for executing jobs remotely. It exposes a
simple HTTP API and can be deployed on multiple nodes for distributed job
processing.

## Usage

Install dependencies and start the server:

```bash
cd JobRunner
npm install
npm start
```

Configure `UPSCALE_SCRIPT_PATH` and `PRINTIFY_SCRIPT_PATH` environment variables
to point to your local scripts. The server listens on port `3001` by default.
