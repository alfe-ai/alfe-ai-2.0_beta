#!/bin/bash

git pull
bash -c "cd TaskQueue && ./run_full.sh"
git pull
