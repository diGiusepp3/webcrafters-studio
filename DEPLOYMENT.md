# Webcrafters Studio - Deployment Guide

## 🚀 Deployment naar studio.webcrafters.be

### Vereisten op je server

- **Node.js** 18+ (voor frontend build)
- **Python** 3.10+ (voor backend)
- **Apache2** met mod_proxy, mod_rewrite, mod_headers
- **PHP** (optioneel, voor PHP project previews)

---

## 📁 Directory Structuur

```
/home/webcrafters/subdomains/studio/
├── frontend/
│   └── build/          # React production build
├── backend/
│   ├── server.py       # FastAPI entry point
│   ├── api/            # API routes
│   ├── services/       # Business logic
│   ├── models/         # Database models
│   └── requirements.txt
├── previews/           # Generated project previews
└── data/
    └── webcrafters.db  # SQLite database
```

---

## 🔧 Backend Setup

### 1. Clone of kopieer de code

```bash
cd /home/webcrafters/subdomains/studio
# Kopieer backend folder naar server
```

### 2. Python virtual environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment variables (.env)

Maak `/home/webcrafters/subdomains/studio/backend/.env`:

```env
# OpenAI API Key (VERPLICHT)
OPENAI_API_KEY=sk-...

# JWT Secret (genereer random string)
SECRET_KEY=jouw-geheime-jwt-key-minimaal-32-karakters

# Database
DATABASE_URL=sqlite:///./data/webcrafters.db

# Preview root directory
PREVIEW_ROOT=/home/webcrafters/subdomains/studio/previews

# CORS Origins
CORS_ORIGINS=https://studio.webcrafters.be,http://localhost:3000
```

### 4. Database setup

```bash
mkdir -p data
# Database wordt automatisch aangemaakt bij eerste start
```

### 5. Start backend met systemd

Maak `/etc/systemd/system/webcrafters-studio.service`:

```ini
[Unit]
Description=Webcrafters Studio Backend
After=network.target

[Service]
Type=simple
User=webcrafters
Group=webcrafters
WorkingDirectory=/home/webcrafters/subdomains/studio/backend
Environment="PATH=/home/webcrafters/subdomains/studio/backend/venv/bin"
ExecStart=/home/webcrafters/subdomains/studio/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable webcrafters-studio
sudo systemctl start webcrafters-studio
```

---

## 🎨 Frontend Setup

### 1. Build lokaal of op server

```bash
cd frontend

# Maak production .env
echo "REACT_APP_BACKEND_URL=https://studio.webcrafters.be" > .env.production

# Install dependencies
yarn install

# Build
yarn build
```

### 2. Kopieer build naar server

```bash
# Lokaal
scp -r build/* user@server:/home/webcrafters/subdomains/studio/frontend/build/

# Of op server direct builden
```

---

## 🌐 Apache Configuratie

Je huidige vhost is bijna correct. Hier de volledige versie:

### `/etc/apache2/sites-available/studio.webcrafters.be-le-ssl.conf`

```apache
<VirtualHost *:443>
    ServerName studio.webcrafters.be

    SSLEngine on
    Include /etc/letsencrypt/options-ssl-apache.conf
    SSLCertificateFile /etc/letsencrypt/live/studio.webcrafters.be/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/studio.webcrafters.be/privkey.pem

    ProxyPreserveHost On
    ProxyRequests Off

    # =============================
    # API → FastAPI Backend
    # =============================
    <Location /api>
        ProxyPass http://127.0.0.1:8001/api
        ProxyPassReverse http://127.0.0.1:8001/api
        
        # CORS headers (optioneel - backend handelt dit ook af)
        Header always set Access-Control-Allow-Origin "https://studio.webcrafters.be"
        Header always set Access-Control-Allow-Credentials "true"
        Header always set Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Accept"
    </Location>

    # Handle OPTIONS preflight
    RewriteEngine On
    RewriteCond %{REQUEST_METHOD} OPTIONS
    RewriteRule ^/api(.*)$ $1 [R=204,L]

    # =============================
    # PREVIEW → Static files + PHP
    # =============================
    Alias /preview /home/webcrafters/subdomains/studio/previews
    
    <Directory /home/webcrafters/subdomains/studio/previews>
        AllowOverride All
        Require all granted
        Options Indexes FollowSymLinks
        
        # Enable PHP for preview projects
        <FilesMatch \.php$>
            SetHandler application/x-httpd-php
        </FilesMatch>
        
        # Default to index.html
        DirectoryIndex index.html index.php
    </Directory>

    # =============================
    # FRONTEND → React SPA
    # =============================
    DocumentRoot /home/webcrafters/subdomains/studio/frontend/build
    
    <Directory /home/webcrafters/subdomains/studio/frontend/build>
        AllowOverride All
        Require all granted
        
        # React SPA routing
        RewriteEngine On
        RewriteBase /
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/api
        RewriteCond %{REQUEST_URI} !^/preview
        RewriteRule ^ index.html [L]
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/studio-error.log
    CustomLog ${APACHE_LOG_DIR}/studio-access.log combined
</VirtualHost>
```

### Apache modules activeren

```bash
sudo a2enmod proxy proxy_http headers rewrite
sudo systemctl restart apache2
```

---

## 📂 Preview Directory

```bash
# Maak preview directory
sudo mkdir -p /home/webcrafters/subdomains/studio/previews
sudo chown -R webcrafters:webcrafters /home/webcrafters/subdomains/studio/previews
sudo chmod 755 /home/webcrafters/subdomains/studio/previews
```

---

## ✅ Verificatie

### 1. Backend check

```bash
# Check of backend draait
sudo systemctl status webcrafters-studio

# Test API
curl -s http://127.0.0.1:8001/api/ | jq
# Expected: {"message":"Code Generation API"}
```

### 2. Frontend check

```bash
# Check of build bestaat
ls -la /home/webcrafters/subdomains/studio/frontend/build/index.html
```

### 3. Full test

```bash
# Via Apache
curl -s https://studio.webcrafters.be/api/ | jq

# Bezoek https://studio.webcrafters.be in browser
```

---

## 🔄 Updates Deployen

### Backend update

```bash
cd /home/webcrafters/subdomains/studio/backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart webcrafters-studio
```

### Frontend update

```bash
cd /home/webcrafters/subdomains/studio/frontend
yarn install
yarn build
# Apache serveert automatisch nieuwe bestanden
```

---

## 🐛 Troubleshooting

### Backend start niet

```bash
# Check logs
sudo journalctl -u webcrafters-studio -n 100 --no-pager

# Manual test
cd /home/webcrafters/subdomains/studio/backend
source venv/bin/activate
python -c "from server import app; print('OK')"
```

### API 502 Bad Gateway

```bash
# Check of backend luistert op 8001
sudo netstat -tlnp | grep 8001

# Check Apache proxy
sudo apache2ctl -t
```

### CORS errors

1. Check of `CORS_ORIGINS` in backend `.env` correct is
2. Check Apache headers configuratie
3. Clear browser cache

### Preview werkt niet

```bash
# Check directory permissions
ls -la /home/webcrafters/subdomains/studio/previews/

# Check Apache alias
curl -s https://studio.webcrafters.be/preview/test/ -I
```

---

## 📊 Monitoring

### Logs bekijken

```bash
# Backend logs
sudo journalctl -u webcrafters-studio -f

# Apache logs
sudo tail -f /var/log/apache2/studio-error.log
sudo tail -f /var/log/apache2/studio-access.log
```

### Disk space voor previews

```bash
# Cleanup oude previews (>24 uur)
find /home/webcrafters/subdomains/studio/previews -type d -mtime +1 -exec rm -rf {} \; 2>/dev/null

# Of via API (implementeer cleanup endpoint)
```

---

## 🔐 Security Checklist

- [ ] HTTPS actief (Let's Encrypt)
- [ ] `OPENAI_API_KEY` niet in git
- [ ] `SECRET_KEY` is random en lang
- [ ] Firewall: alleen 80, 443 open
- [ ] Backend niet direct toegankelijk (alleen via proxy)
- [ ] Preview directory heeft juiste permissions

---

## 💡 Tips

1. **Backup database regelmatig**
   ```bash
   cp /home/webcrafters/subdomains/studio/data/webcrafters.db ~/backups/
   ```

2. **Automatische preview cleanup**
   Voeg toe aan crontab:
   ```bash
   0 * * * * find /home/webcrafters/subdomains/studio/previews -type d -mtime +1 -exec rm -rf {} \; 2>/dev/null
   ```

3. **Log rotation** is automatisch via Apache logrotate

---

## 📞 Support

Bij problemen:
1. Check logs (backend + Apache)
2. Verifieer .env configuratie
3. Test API endpoints individueel
