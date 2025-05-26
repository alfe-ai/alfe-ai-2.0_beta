#!/bin/bash
# sd_webui.sh - Setup and launch AUTOMATIC1111's Stable Diffusion Web UI
# This script clones the web UI repo (if missing) and starts it with the
# API enabled on port 7860. A Python 3.10 interpreter is required.

set -euo pipefail

SD_DIR="stable-diffusion-webui"
PYTHON_BIN="python3.10"

# Verify Python 3.10 exists
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[ERROR] Python 3.10 is required but not found. Please install it and rerun." >&2
  exit 1
fi

# Clone repository if necessary
if [ ! -d "$SD_DIR" ]; then
  echo "[+] Cloning Stable Diffusion Web UI repository..."
  git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git "$SD_DIR"
fi

cd "$SD_DIR"

# Ensure model directory exists
mkdir -p models/Stable-diffusion
if [ ! -f models/Stable-diffusion/model.ckpt ]; then
  echo "[INFO] Place your Stable Diffusion checkpoint in 'models/Stable-diffusion/'." >&2
fi

# Launch Web UI using specified Python interpreter
exec ./webui.sh --api --port 7860 --python "$PYTHON_BIN"
