#!/usr/bin/env bash

clear
SCREEN_NAME="auroraFULL"

# If a screen session with this name is already running, kill it
if screen -list 2>/dev/null | grep -q "${SCREEN_NAME}"; then
  echo "Stopping existing screen session: $SCREEN_NAME"
  screen -S "$SCREEN_NAME" -X quit
  # give screen some time to exit
  sleep 1
fi

git pull
git log -n 6

echo ""

# Start a detached screen session and run the full stack
screen -S "$SCREEN_NAME" -dm bash -c "./run_full.sh"

# Display information about the new screen session
echo "Screen session started: $SCREEN_NAME"
screen -ls | grep "$SCREEN_NAME"
