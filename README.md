# Alfe AI: Aurora / Aurelix: Version 2

This repository contains various utilities used by the Alfe project. A new helper script is provided to run a local instance of AUTOMATIC1111's Stable Diffusion Web UI.

## Running Stable Diffusion Web UI

Run `sd_webui.sh` to clone the Web UI repository (if missing) and start the server on port 7860 with API access enabled:

```bash
./sd_webui.sh
```

Place your checkpoint in `stable-diffusion-webui/models/Stable-diffusion/` before launching if it's not already present.
