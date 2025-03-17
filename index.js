const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise'); // Используем mysql2 с поддержкой промисов
const initAIHelper = require('./aihelper');
// проверка git

const token = "7764735519:AAG51JzX6eVvX81uL1LxQ-V0a1NsNKohlMA";
const bot = new TelegramBot(token, {polling: true}); 



// после оплаты API :) раскоментим
//const aiHelper = initAIHelper(bot);
//aiHelper.setupGroupHandler(); // Активируем обработчик группы


// Создание пула соединений с базой данных
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: "user",
    port: 3306,
    database: "mydatabase",
    password: "user",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Объект для хранения состояния пользователя
let userState = {};

// Команда старта
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const conn = await pool.getConnection();
        const [rows] = await conn.query("SELECT * FROM users WHERE chat_id = ?", [chatId]);
        conn.release();

        if (rows.length > 0) {
            // Если пользователь уже существует, предлагаем кнопку "Забыть меня"
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Удалить данные", callback_data: "forget_me" }]
                    ]
                }
            };
            const sentMessage = await bot.sendMessage(chatId, `Привет, ${rows[0].first_name}! Вы уже зарегистрированы. Удалить данные?`, options);
            userState[chatId] = { buttonMessageId: sentMessage.message_id }; // Сохраняем ID сообщения с кнопкой
        } else {
            // Если пользователя нет, начинаем регистрацию
            bot.sendMessage(chatId, "Здравствуйте! Давайте познакомимся. Как Ваше имя?");
            userState[chatId] = { step: 'first_name' };
        }
    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "Произошла ошибка при проверке данных.");
    }
});

// Обработка инлайн-кнопок
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'forget_me') {
        try {
            const conn = await pool.getConnection();
            await conn.query("DELETE FROM users WHERE chat_id = ?", [chatId]);
            conn.release();
            // Убираем кнопку "Забыть меня" после нажатия
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
            bot.sendMessage(chatId, "Ваши данные удалены. Нажмите /start для повторной авторизации.");
            delete userState[chatId]; // Удаляем состояние пользователя
        } catch (err) {
            console.error(err);
            bot.sendMessage(chatId, "Произошла ошибка при удалении данных.");
        }
    }
});

// Обработка сообщений (только для регистрации)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Если есть состояние пользователя и сохранённое сообщение с кнопкой, удаляем кнопку
    if (userState[chatId]?.buttonMessageId) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: userState[chatId].buttonMessageId });
        delete userState[chatId].buttonMessageId; // Удаляем ID сообщения с кнопкой
    }

    // Игнорируем команды (начинающиеся с /)
    if (text.startsWith('/')) {
        return;
    }

    // Если состояние пользователя не установлено, выходим
    if (!userState[chatId]) {
        return;
    }

    switch (userState[chatId].step) {
        case 'first_name':
            userState[chatId].first_name = text;
            userState[chatId].step = 'last_name';
            bot.sendMessage(chatId, "Какая у Вас фамилия?");
            break;

        case 'last_name':
            userState[chatId].last_name = text;
            userState[chatId].step = 'age';
            bot.sendMessage(chatId, "Сколько Вам лет?");
            break;

        case 'age':
            if (isNaN(text)) {
                bot.sendMessage(chatId, "Пожалуйста, введите число.");
                return;
            }
            userState[chatId].age = text;
            userState[chatId].step = 'department';
            bot.sendMessage(chatId, "В каком подразделении Вы работаете?");
            break;

        case 'department':
            userState[chatId].department = text;
            try {
                const conn = await pool.getConnection();
                await conn.query(
                    "INSERT INTO users (chat_id, first_name, last_name, age, department) VALUES (?, ?, ?, ?, ?) " +
                    "ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), age = VALUES(age), department = VALUES(department)",
                    [chatId, userState[chatId].first_name, userState[chatId].last_name, userState[chatId].age, userState[chatId].department]
                );
                conn.release();
                bot.sendMessage(chatId, `Спасибо, ${userState[chatId].first_name}! Ваши данные сохранены.`);
            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, "Произошла ошибка при сохранении данных.");
            }
            delete userState[chatId];
            break;
    }
});

// Приветствие пользователя по имени
bot.onText(/\/hello/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const conn = await pool.getConnection();
        const [rows] = await conn.query("SELECT first_name FROM users WHERE chat_id = ?", [chatId]);
        conn.release(); // Возвращаем соединение в пул
        if (rows.length > 0) {
            bot.sendMessage(chatId, `Здравствуйте, ${rows[0].first_name}!`);
        } else {
            bot.sendMessage(chatId, "Я Вас не знаю. Нажмите /start для авторизации.");
        }
    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "Произошла ошибка при получении данных.");
    }
});
