#!/bin/bash
set -e

# Giftora Deployment Script for Webyne VPS
# Usage: bash deploy.sh yourdomain.com

DOMAIN=${1:-"gift-ora.online"}
APP_DIR="/opt/giftora"
DB_NAME="giftora"
DB_USER="giftora"

echo "=== Giftora Deployment for $DOMAIN ==="

# Update system
echo "[1/10] Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 24
echo "[2/10] Installing Node.js 24..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt install -y nodejs
fi
echo "Node version: $(node -v)"

# Install PM2
echo "[3/10] Installing PM2..."
npm install -g pm2 2>/dev/null || true

# Install PostgreSQL
echo "[4/10] Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt install -y postgresql postgresql-client
fi

# Create database user and database
echo "[5/10] Setting up PostgreSQL database..."
DB_PASS=$(openssl rand -hex 16)
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\" | grep -q 1" || \
    su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" | grep -q 1" || \
    su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\""

# Clone/update app
echo "[6/10] Setting up application..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin master
else
    cd /opt
    git clone https://github.com/Amit1296/giftora.git
    cd giftora
fi
npm install --omit=dev

# Create .env file
echo "[7/10] Configuring environment..."
if [ ! -f .env ]; then
    cat > .env << EOF
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
ADMIN_USER=admin
ADMIN_PASS=$(openssl rand -hex 12)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
MAIL_ENABLED=false
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=
MAIL_APP_PASSWORD=
MAIL_TO=
EOF
    echo "Created .env file. Please edit it with your secrets."
fi

# Start/Restart with PM2
echo "[8/10] Starting application with PM2..."
pm2 delete giftora 2>/dev/null || true
pm2 start server.js --name giftora
pm2 startup 2>/dev/null || true
pm2 save

# Install Nginx
echo "[9/10] Configuring Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi

cat > /etc/nginx/sites-available/giftora << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # 301 any non-canonical host (e.g. www) to the bare domain
    if (\$host != $DOMAIN) {
        return 301 https://$DOMAIN\$request_uri;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Static files caching
    location ~* \.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2)$ {
        proxy_pass http://127.0.0.1:8080;
        proxy_cache_valid 200 1d;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

ln -sf /etc/nginx/sites-available/giftora /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
systemctl enable nginx

# Install Certbot for SSL
echo "[10/10] Setting up SSL..."
if [ "$DOMAIN" != "localhost" ]; then
    apt install -y certbot python3-certbot-nginx
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" || true
fi

# Configure firewall
echo "Configuring firewall..."
apt install -y ufw 2>/dev/null || true
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Show status
echo ""
echo "=== Deployment Complete ==="
echo "Domain: http://$DOMAIN"
echo "App URL: http://$DOMAIN"
echo "Admin: http://$DOMAIN/admin.html"
echo ""
echo "Database: $DB_NAME"
echo "DB User: $DB_USER"
echo "DB Pass: $DB_PASS"
echo ""
echo "IMPORTANT: Edit .env file to add your secrets:"
echo "  nano $APP_DIR/.env"
echo ""
echo "Then restart: pm2 restart giftora"
echo ""
echo "Useful commands:"
echo "  pm2 logs giftora     - View logs"
echo "  pm2 monit            - Monitor"
echo "  pm2 restart giftora  - Restart app"
