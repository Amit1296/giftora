#!/bin/bash
set -e

export $(grep -E '^DATABASE_URL=' /opt/giftora/.env | xargs)
export NODE_PATH=/opt/giftora/node_modules
cd /tmp/migrate-data
node /tmp/migrate-data/import_runtime.js