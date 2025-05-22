#!/bin/bash
# Simple placeholder script to return a basic image description
# Usage: imagedesc.sh <image_path>

file="$1"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "(Could not read image)"
  exit 0
fi

size=$(stat -c%s "$file" 2>/dev/null)
ext=${file##*.}
base=$(basename "$file")
echo "Image '$base' (${size} bytes, .$ext)"
