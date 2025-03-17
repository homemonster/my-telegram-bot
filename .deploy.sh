#!/bin/bash
set -e

PROJECT_DIR="/root/project/my-telegram-bot"
PM2_NAME="telegram-bot"  # Используйте имя вашего процесса PM2

cd $PROJECT_DIR

# Получаем текущий коммит
BEFORE_COMMIT=$(git rev-parse HEAD)

# Принудительно обновляем репозиторий
git fetch origin
git reset --hard origin/main

# Получаем новый коммит
AFTER_COMMIT=$(git rev-parse HEAD)

# Проверяем изменения
if [ "$BEFORE_COMMIT" != "$AFTER_COMMIT" ]; then
    echo "Обнаружены изменения, перезапускаем приложение..."
    npm install --omit=dev
    pm2 restart $PM2_NAME
else
    echo "Изменений нет, перезапуск не требуется"
fi

echo "Деплой завершен"