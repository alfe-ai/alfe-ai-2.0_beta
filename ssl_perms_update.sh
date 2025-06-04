# Create the group
sudo groupadd ssl-cert

# Change the private key’s group ownership and permissions
sudo chgrp ssl-cert /etc/letsencrypt/archive/mvp2.alfe.sh/privkey1.pem
sudo chmod 640 /etc/letsencrypt/archive/mvp2.alfe.sh/privkey1.pem

# (Optional) do the same via the live symlink
sudo chgrp ssl-cert /etc/letsencrypt/live/mvp2.alfe.sh/privkey.pem
sudo chmod 640 /etc/letsencrypt/live/mvp2.alfe.sh/privkey.pem

# Add your user to the group
sudo usermod -aG ssl-cert admin
