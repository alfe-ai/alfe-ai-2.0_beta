#!/bin/bash
# forward_port_443.sh - Forward port 443 to a higher user port using iptables
# Usage: sudo ./forward_port_443.sh <target_port>

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: sudo $0 <target_port>" >&2
  exit 1
fi

TARGET_PORT="$1"

# Forward incoming HTTPS traffic to the specified port
iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port "$TARGET_PORT"

echo "Forwarding HTTPS (443) -> $TARGET_PORT"
