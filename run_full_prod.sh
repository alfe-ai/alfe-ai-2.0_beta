#!/usr/bin/env bash

SCREEN_NAME="auroraFULL"

# If a screen session with this name is already running, kill it
if screen -list 2>/dev/null | grep -q "${SCREEN_NAME}"; then
  echo "Stopping existing screen session: $SCREEN_NAME"
  screen -S "$SCREEN_NAME" -X quit
  # give screen some time to exit
  sleep 1
fi

# Start a detached screen session and run the full stack
screen -S "$SCREEN_NAME" -dm bash -c "./run_full.sh"
