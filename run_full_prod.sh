#!/usr/bin/env bash

SCREEN_NAME="auroraFULL"

# Start a detached screen session and run the full stack
screen -S "$SCREEN_NAME" -dm bash -c "./run_full.sh"

