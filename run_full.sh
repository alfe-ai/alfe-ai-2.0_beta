#!/bin/bash

clear
git pull
git log -n 3
echo "------"
bash -c "cd TaskQueue && ./run_full.sh"
git pull
git log -n 3
