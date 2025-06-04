# Alfe AI / 2.30 Beta  

### Alfe AI: Software Development and Image Design Platform  

The first version of the Alfe AI Cloud Platform https://alfe.sh <!-- has been released --> (beta-2.30).  
This initial cloud release includes the image design component of the Alfe AI Platform.  
The software development component is coming soon, and is available now as a Pre-release on GitHub.  

![image](https://github.com/user-attachments/assets/b7d308f8-e2a6-4098-b707-8f8704a74049)  

Alfe AI beta-2.30+ (Image Design): https://github.com/alfe-ai/alfe-ai-2.0_beta  
Alfe AI beta-0.4x+ (Software Development): https://github.com/alfe-ai/Sterling  

## Deploying

```
wget https://raw.githubusercontent.com/alfe-ai/alfe-ai-Aurelix/refs/heads/Aurora/Aurelix/dev/main-rel2/deploy_aurelix.sh && chmod +x deploy_aurelix.sh && ./deploy_aurelix.sh
```

#### 2.0 Beta (Aurora/Aurelix)

![image](https://github.com/user-attachments/assets/ec47be87-5577-45b2-a3af-17475860df46)

### Environment variables

Set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to the SSL key and certificate files
to enable HTTPS across the included servers. If the files are missing the
services fall back to HTTP.

You can quickly obtain free certificates from Let's Encrypt by running the
`setup_certbot.sh` script. It installs Certbot and generates the key and
certificate files for the domain you specify.
