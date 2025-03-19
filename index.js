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
    host: "127.0.0.1",
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
                        [{ text: "Забыть меня", callback_data: "forget_me" }]
                    ]
                }
            };
            bot.sendMessage(chatId, `Привет, ${rows[0].first_name}! Ты уже зарегистрирован. Хочешь удалить свои данные?`, options);
        } else {
            // Если пользователя нет, начинаем регистрацию
            bot.sendMessage(chatId, "Привет! Давай познакомимся. Как тебя зовут?");
            userState[chatId] = {step: 'first_name'};
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
            bot.sendMessage(chatId, "Твои данные удалены. Нажми /start для повторной авторизации.");
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

    // Игнорируем сообщения, если состояние пользователя не установлено
    if (!userState[chatId]) {
        return;
    }

    // Игнорируем команды (начинающиеся с /)
    if (text.startsWith('/')) {
        return;
    }

    switch (userState[chatId].step) {
        case 'first_name':
            userState[chatId].first_name = text;
            userState[chatId].step = 'last_name';
            bot.sendMessage(chatId, "Какая у тебя фамилия?");
            break;

        case 'last_name':
            userState[chatId].last_name = text;
            userState[chatId].step = 'age';
            bot.sendMessage(chatId, "Сколько тебе лет?");
            break;

        case 'age':
            if (isNaN(text)) {
                bot.sendMessage(chatId, "Пожалуйста, введите число.");
                return;
            }
            userState[chatId].age = text;
            userState[chatId].step = 'department';
            bot.sendMessage(chatId, "В каком подразделении ты работаешь?");
            break;

        case 'department':
            userState[chatId].department = text;
            try {
                const conn = await pool.getConnection();
                // Используем INSERT ... ON DUPLICATE KEY UPDATE для обновления данных, если пользователь уже существует
                await conn.query(
                    "INSERT INTO users (chat_id, first_name, last_name, age, department) VALUES (?, ?, ?, ?, ?) " +
                    "ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), age = VALUES(age), department = VALUES(department)",
                    [chatId, userState[chatId].first_name, userState[chatId].last_name, userState[chatId].age, userState[chatId].department]
                );
                conn.release(); // Возвращаем соединение в пул
                bot.sendMessage(chatId, `Спасибо, ${userState[chatId].first_name}! Твои данные сохранены.`);
            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, "Произошла ошибка при сохранении данных.");
            }
            delete userState[chatId]; // Удаляем состояние пользователя
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
            bot.sendMessage(chatId, `Привет, ${rows[0].first_name}!`);
        } else {
            bot.sendMessage(chatId, "Я тебя не знаю. Нажми /start для авторизации.");
        }
    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "Произошла ошибка при получении данных.");
    }
});
