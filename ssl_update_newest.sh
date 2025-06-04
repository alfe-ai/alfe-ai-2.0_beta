# See which key the symlink uses
sudo readlink -f /etc/letsencrypt/live/mvp2.alfe.sh/privkey.pem

# Apply group and permissions to the real file
CERT=$(sudo readlink -f /etc/letsencrypt/archive/mvp2.alfe.sh/privkey1.pem)
sudo chgrp ssl-cert "$CERT"
sudo chmod 640 "$CERT"
