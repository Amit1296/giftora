#!/bin/bash
set -e

DOMAIN="gift-ora.online"

# Configure Nginx
cat > /etc/nginx/sites-available/giftora << NGINX
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
NGINX

ln -sf /etc/nginx/sites-available/giftora /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
systemctl enable nginx

# Open firewall
ufw allow 22/tcp 2>/dev/null || true
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
echo "y" | ufw enable 2>/dev/null || true

echo "NGINX_READY"

# Get SSL certificate
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN --redirect 2>&1 || echo "SSL needs DNS propagation"

echo "SETUP_COMPLETE"
