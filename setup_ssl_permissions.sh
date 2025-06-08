#!/bin/bash
# setup_ssl_permissions.sh - Grant a user access to Let's Encrypt certificates
# Usage: sudo ./setup_ssl_permissions.sh <domain> [user]
# Default user is "admin".
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: sudo $0 <domain> [user]" >&2
  exit 1
fi

DOMAIN="$1"
USER="${2:-admin}"
KEY_LINK="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
CERT_LINK="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

if [ ! -e "$KEY_LINK" ] || [ ! -e "$CERT_LINK" ]; then
  echo "[ERROR] Certificate files for $DOMAIN not found. Run setup_certbot.sh first." >&2
  exit 1
fi

# Ensure ssl-cert group exists
if ! getent group ssl-cert >/dev/null; then
  sudo groupadd ssl-cert
fi

# Add user to ssl-cert group
sudo usermod -aG ssl-cert "$USER"

# Apply group and permissions to the real key file
REAL_KEY=$(sudo readlink -f "$KEY_LINK")
sudo chgrp ssl-cert "$REAL_KEY"
sudo chmod 640 "$REAL_KEY"

# Apply permissions to symlink and certificate
sudo chgrp ssl-cert "$KEY_LINK" "$CERT_LINK"
sudo chmod 640 "$KEY_LINK"
sudo chmod 644 "$CERT_LINK"

echo "[INFO] User '$USER' can now read $KEY_LINK and $CERT_LINK"
