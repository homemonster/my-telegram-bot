// aihelper.js
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// Конфигурация DEEPSEEK API (значения должны быть заданы в переменных окружения)
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'your_api_key_here';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'; // Пример URL, уточните у документации DEEPSEEK

// ID группы "ПОМОЩНИК AI" (должен быть получен динамически или задан вручную)
const AI_HELPER_CHAT_ID = -123456789; // Замените на реальный ID группы

/**
 * Инициализация модуля AI Helper
 * @param {TelegramBot} bot - Экземпляр Telegram бота
 */
function initAIHelper(bot) {
    /**
     * Отправка запроса к DEEPSEEK API
     * @param {string} message - Текст сообщения пользователя
     * @returns {Promise<string>} Ответ от AI
     */
    async function queryDeepSeek(message) {
        try {
            const response = await axios.post(
                DEEPSEEK_API_URL,
                {
                    model: "deepseek-chat", // Уточните модель в документации
                    messages: [{ role: "user", content: message }],
                    temperature: 0.7,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('DEEPSEEK API Error:', error.response?.data || error.message);
            return "⚠️ Произошла ошибка при обработке запроса.";
        }
    }

    /**
     * Обработчик сообщений в группе AI-помощника
     */
    function setupGroupHandler() {
        bot.on('message', async (msg) => {
            // Проверяем, что сообщение из нужной группы и не от самого бота
            if (
                msg.chat.id === AI_HELPER_CHAT_ID &&
                !msg.from.is_bot &&
                msg.text &&
                !msg.text.startsWith('/')
            ) {
                try {
                    // Отправляем "печатание" для индикации работы
                    await bot.sendChatAction(msg.chat.id, 'typing');

                    // Получаем ответ от DEEPSEEK
                    const aiResponse = await queryDeepSeek(msg.text);
                    
                    // Отправляем ответ в группу
                    await bot.sendMessage(msg.chat.id, aiResponse, {
                        reply_to_message_id: msg.message_id // Ответить на исходное сообщение
                    });
                } catch (error) {
                    console.error('Group handler error:', error);
                    bot.sendMessage(msg.chat.id, "❌ Ошибка при обработке запроса.");
                }
            }
        });
    }

    return {
        setupGroupHandler
    };
}

module.exports = initAIHelper;