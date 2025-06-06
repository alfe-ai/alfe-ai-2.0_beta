# See which key the symlink uses
sudo readlink -f /etc/letsencrypt/live/mvp2.alfe.sh/privkey.pem

# Apply group and permissions to the real file
CERT=$(sudo readlink -f /etc/letsencrypt/archive/mvp2.alfe.sh/privkey1.pem)
sudo chgrp ssl-cert "$CERT"
sudo chmod 640 "$CERT"

admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod +x /etc/letsencrypt/
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod +x /etc/letsencrypt/archive/
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod +x /etc/letsencrypt/archive/mvp2.alfe.sh/
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod 644 /etc/letsencrypt/archive/mvp2.alfe.sh/privkey1.pem
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ ls /etc/letsencrypt/archive/mvp2.alfe.sh/privkey1.pem

admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod +x /etc/letsencrypt/live
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod +x /etc/letsencrypt/live/mvp2.alfe.sh
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod +x /etc/letsencrypt/live/mvp2.alfe.sh/privkey.pem
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ cat .env
cat: .env: No such file or directory
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ 
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ chmod +x /etc/letsencrypt/live/mvp2.alfe.sh/fullchain.pem
chmod: changing permissions of '/etc/letsencrypt/live/mvp2.alfe.sh/fullchain.pem': Operation not permitted
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ sudo chmod +x /etc/letsencrypt/live/mvp2.alfe.sh/fullchain.pem
admin@ip-172-26-6-245:~/alfe-ai-Aurelix$ 
