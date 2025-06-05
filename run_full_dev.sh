#!/usr/bin/env bash

clear
SCREEN_NAME="auroraFULLDEV"

check_updates() {
  git fetch >/dev/null 2>&1
  LOCAL=$(git rev-parse @)
  REMOTE=$(git rev-parse @{u})
  [[ "$LOCAL" != "$REMOTE" ]]
}

while true; do
  if screen -list 2>/dev/null | grep -q "${SCREEN_NAME}"; then
    echo "Stopping existing screen session: $SCREEN_NAME"
    screen -S "$SCREEN_NAME" -X quit
    sleep 1
  fi

  git pull
  screen -S "$SCREEN_NAME" -dm bash -c "./run_full.sh"
  echo "Screen session started: $SCREEN_NAME"
  screen -ls | grep "$SCREEN_NAME"

  while true; do
    sleep 60
    if check_updates; then
      echo "Updates found. Restarting..."
      break
    fi
  done

done
