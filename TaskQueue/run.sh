#!/bin/bash

# Run the main queue script
npm start

# After the GitHub issues list is printed, show the latest commits
git log -n 3
