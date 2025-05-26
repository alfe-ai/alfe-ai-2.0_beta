#!/bin/bash
# Script to set up and run AUTOMATIC1111's Stable Diffusion web UI with API enabled
# at http://127.0.0.1:7860. Creates repo if missing and starts web UI.

set -e

# Where to clone the web UI repository
SD_DIR="stable-diffusion-webui"

if [ ! -d "$SD_DIR" ]; then
  echo "Cloning Stable Diffusion web UI repository..."
  git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git "$SD_DIR"
fi

cd "$SD_DIR"

mkdir -p models/Stable-diffusion
if [ ! -f models/Stable-diffusion/model.ckpt ]; then
  echo "\nPlace your Stable Diffusion checkpoint in 'models/Stable-diffusion/'." >&2
fi

# Launch the web UI with API enabled on port 7860
exec ./webui.sh --api --port 7860
