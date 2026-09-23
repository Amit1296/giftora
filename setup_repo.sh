#!/bin/bash
set -e

cd /opt
rm -rf giftora
git clone https://github.com/Amit1296/giftora.git
cd giftora
npm install --omit=dev
echo REPO_READY
