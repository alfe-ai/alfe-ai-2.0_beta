#!/bin/sh
# Simple placeholder image description script
file="$1"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "(Invalid image path)"
  exit 1
fi
# Determine bytes and extension
size=$(wc -c < "$file" 2>/dev/null)
name=$(basename "$file")
ext=${name##*.}
# Output simple description
printf 'Uploaded image "%s" (%d bytes, extension .%s)' "$name" "$size" "$ext"
