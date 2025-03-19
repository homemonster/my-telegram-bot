#!/bin/bash
cd /root/project/my-telegram-bot

# Принудительный сброс изменений
git fetch origin
git reset --hard origin/main
git pull origin main
pm2 restart 0