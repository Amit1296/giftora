#!/bin/bash
set -e

DOMAIN="gift-ora.online"
VPS_IP="103.178.160.159"

echo "=== Setting up Nginx + SSL for $DOMAIN ==="

echo "[1/4] Installing Nginx & Certbot..."
ssh root@$VPS_IP "apt install -y nginx certbot python3-certbot-nginx"

echo "[2/4] Creating Nginx config..."
ssh root@$VPS_IP "cat > /etc/nginx/sites-available/giftora << 'EOF'
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

    location ~* \.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2)$ {
        proxy_pass http://127.0.0.1:8080;
        expires 1d;
        add_header Cache-Control 'public, immutable';
    }
}
EOF"

echo "[3/4] Enabling site..."
ssh root@$VPS_IP "ln -sf /etc/nginx/sites-available/giftora /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx"

echo "[4/4] Getting SSL certificate..."
ssh root@$VPS_IP "certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN"

ssh root@$VPS_IP "ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable"

echo ""
echo "=== DONE! ==="
echo "https://$DOMAIN is now live with SSL!"
