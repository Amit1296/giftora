#!/bin/bash
# Auto-retry certbot until DNS propagates fully
for i in $(seq 1 60); do
    echo "Attempt $i: $(date)"
    certbot --nginx -d gift-ora.online -d www.gift-ora.online --non-interactive --agree-tos --email admin@gift-ora.online --redirect > /tmp/certbot.log 2>&1
    if grep -q "successfully received certificate" /tmp/certbot.log; then
        echo "CERTBOT_SUCCESS"
        cat /tmp/certbot.log
        exit 0
    fi
    echo "Failed, waiting 5 min before retry..."
    sleep 300
done
echo "GAVE_UP_AFTER_5H"