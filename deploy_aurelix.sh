#!/bin/bash

sudo apt update
sudo apt install git nodejs npm
rm -rf alfe-ai-Aurelix
git clone https://github.com/alfe-ai/alfe-ai-Aurelix.git
cd alfe-ai-Aurelix
#git checkout Aurora/Aurelix/dev/main-rel2
cp ../.env Aurora/.env
./run_full.sh
