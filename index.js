require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

// Конфигурация
const config = {
    token: "7764735519:AAG51JzX6eVvX81uL1LxQ-V0a1NsNKohlMA",
    db: {
        host: process.env.DB_HOST,
        user: "user",
        port: 3306,
        database: "mydatabase",
        password: "user",
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    }
};

// Инициализация бота
const bot = new TelegramBot(config.token, {polling: true});
const pool = mysql.createPool(config.db);
const userState = {};

// ==================== Модули обработчиков ====================

// 1. Модуль регистрации пользователя
const registrationModule = {
    start: async (chatId, user) => {
        if (user) {
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Удалить данные", callback_data: "forget_me" }]
                    ]
                }
            };
            const sentMessage = await bot.sendMessage(
                chatId, 
                `Привет, ${user.first_name}! Вы уже зарегистрированы. Удалить данные?`, 
                options
            );
            userState[chatId] = { buttonMessageId: sentMessage.message_id };
        } else {
            await bot.sendMessage(chatId, "Здравствуйте! Давайте познакомимся. Как Ваше имя?");
            userState[chatId] = { step: 'first_name' };
        }
    },

    handleMessage: async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId]?.step) return false;

        try {
            switch (userState[chatId].step) {
                case 'first_name':
                    await this.handleFirstName(chatId, text);
                    return true;
                
                case 'last_name':
                    await this.handleLastName(chatId, text);
                    return true;
                
                case 'age':
                    await this.handleAge(chatId, text);
                    return true;
                
                case 'department':
                    await this.handleDepartment(chatId, text);
                    return true;
            }
        } catch (err) {
            console.error('Ошибка регистрации:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных. Попробуйте снова.");
            delete userState[chatId];
        }
        return false;
    },

    handleFirstName: async (chatId, name) => {
        userState[chatId] = { ...userState[chatId], first_name: name, step: 'last_name' };
        await bot.sendMessage(chatId, "Какая у Вас фамилия?");
    },

    handleLastName: async (chatId, lastName) => {
        userState[chatId] = { ...userState[chatId], last_name: lastName, step: 'age' };
        await bot.sendMessage(chatId, "Сколько Вам лет?");
    },

    handleAge: async (chatId, age) => {
        if (isNaN(age)) {
            await bot.sendMessage(chatId, "Пожалуйста, введите число.");
            return;
        }
        userState[chatId] = { ...userState[chatId], age: Number(age), step: 'department' };
        await bot.sendMessage(chatId, "В каком подразделении Вы работаете?");
    },

    handleDepartment: async (chatId, department) => {
        try {
            const conn = await pool.getConnection();
            await conn.query(
                "INSERT INTO users (chat_id, first_name, last_name, age, department) VALUES (?, ?, ?, ?, ?)",
                [chatId, userState[chatId].first_name, userState[chatId].last_name, userState[chatId].age, department]
            );
            conn.release();
            
            await bot.sendMessage(
                chatId, 
                `✅ Спасибо, ${userState[chatId].first_name}! Регистрация завершена.`
            );
        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при сохранении данных.");
        } finally {
            delete userState[chatId];
        }
    }
};

// 2. Модуль работы с шагами
const stepsModule = {
    startAdd: async (chatId) => {
        userState[chatId] = { step: 'steps_date' };
        await bot.sendMessage(chatId, "Введите дату в формате ГГГГ-ММ-ДД:");
    },

    startReport: async (chatId) => {
        try {
            const conn = await pool.getConnection();
            const [rows] = await conn.query(`
                SELECT DISTINCT DATE_FORMAT(date, '%Y-%m-%d') as formatted_date 
                FROM steps WHERE chat_id = ? ORDER BY date DESC
            `, [chatId]);
            conn.release();

            if (rows.length === 0) {
                await bot.sendMessage(chatId, "У вас нет данных для отчета.");
                return;
            }

            const buttons = rows.map(row => [{
                text: row.formatted_date,
                callback_data: `report_${row.formatted_date}`
            }]);
            buttons.push([{ text: "❌ Отмена", callback_data: "report_cancel" }]);

            await bot.sendMessage(chatId, "📅 Выберите дату для отчета:", {
                reply_markup: { inline_keyboard: buttons }
            });
        } catch (err) {
            console.error('Ошибка отчета:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при формировании отчета.");
        }
    },

    handleMessage: async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId]?.step?.startsWith('steps_')) return false;

        try {
            switch (userState[chatId].step) {
                case 'steps_date':
                    await this.handleDate(chatId, text);
                    return true;
                
                case 'steps_count':
                    await this.handleSteps(chatId, text);
                    return true;
                
                case 'meters_count':
                    await this.handleMeters(chatId, text);
                    return true;
            }
        } catch (err) {
            console.error('Ошибка шагов:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных.");
            delete userState[chatId];
        }
        return false;
    },

    handleDate: async (chatId, date) => {
        if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            await bot.sendMessage(chatId, "Неверный формат даты. Используйте ГГГГ-ММ-ДД");
            return;
        }
        userState[chatId] = { ...userState[chatId], date, step: 'steps_count' };
        await bot.sendMessage(chatId, "Сколько шагов вы прошли?");
    },

    handleSteps: async (chatId, steps) => {
        if (isNaN(steps)) {
            await bot.sendMessage(chatId, "Пожалуйста, введите число.");
            return;
        }
        userState[chatId] = { ...userState[chatId], steps: Number(steps), step: 'meters_count' };
        await bot.sendMessage(chatId, "Сколько метров вы прошли?");
    },

    handleMeters: async (chatId, meters) => {
        if (isNaN(meters)) {
            await bot.sendMessage(chatId, "Пожалуйста, введите число.");
            return;
        }

        try {
            const conn = await pool.getConnection();
            const { date, steps } = userState[chatId];
            const metersValue = Number(meters);

            await conn.query(
                "INSERT INTO steps (chat_id, date, steps, meters) VALUES (?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE steps = VALUES(steps), meters = VALUES(meters)",
                [chatId, date, steps, metersValue]
            );
            conn.release();

            await bot.sendMessage(chatId, `✅ Данные за ${date} сохранены!`);
        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при сохранении данных.");
        } finally {
            delete userState[chatId];
        }
    }
};

// 3. Модуль приветствий
const greetingModule = {
    sendGreeting: async (chatId) => {
        try {
            const conn = await pool.getConnection();
            const [rows] = await conn.query(
                "SELECT first_name FROM users WHERE chat_id = ?", 
                [chatId]
            );
            conn.release();

            if (rows.length > 0) {
                await bot.sendMessage(chatId, `Здравствуйте, ${rows[0].first_name}!`);
            } else {
                await bot.sendMessage(chatId, "Я Вас не знаю. Начните с /start");
            }
        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при получении данных.");
        }
    }
};

// ==================== Обработчики команд ====================

// 1. Обработчик /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const conn = await pool.getConnection();
        const [rows] = await conn.query("SELECT * FROM users WHERE chat_id = ?", [chatId]);
        conn.release();

        await registrationModule.start(chatId, rows[0]);
    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, "⚠️ Ошибка при запуске бота.");
    }
});

// 2. Обработчик /add
bot.onText(/\/add/, async (msg) => {
    await stepsModule.startAdd(msg.chat.id);
});

// 3. Обработчик /report
bot.onText(/\/report/, async (msg) => {
    await stepsModule.startReport(msg.chat.id);
});

// 4. Обработчик /hello
bot.onText(/\/hello/, async (msg) => {
    await greetingModule.sendGreeting(msg.chat.id);
});

// ==================== Обработчики сообщений ====================

// 1. Главный обработчик сообщений
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    
    // Удаляем кнопки если они есть
    if (userState[chatId]?.buttonMessageId) {
        try {
            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                { chat_id: chatId, message_id: userState[chatId].buttonMessageId }
            );
            delete userState[chatId].buttonMessageId;
        } catch (err) {
            console.error('Ошибка удаления кнопок:', err);
        }
    }

    // Пробуем обработать сообщение в модулях
    const processed = 
        await registrationModule.handleMessage(msg) ||
        await stepsModule.handleMessage(msg);
});

// 2. Обработчик callback-запросов
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    try {
        if (data === 'forget_me') {
            const conn = await pool.getConnection();
            await conn.query("DELETE FROM users WHERE chat_id = ?", [chatId]);
            await conn.query("DELETE FROM steps WHERE chat_id = ?", [chatId]);
            conn.release();

            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                { 
                    chat_id: chatId, 
                    message_id: callbackQuery.message.message_id 
                }
            );
            await bot.sendMessage(chatId, "✅ Данные удалены. Начните с /start");
            delete userState[chatId];
        } 
        else if (data === 'report_cancel') {
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        }
        else if (data.startsWith('report_')) {
            const date = data.replace('report_', '');
            const conn = await pool.getConnection();
            const [rows] = await conn.query(
                "SELECT steps, meters FROM steps WHERE chat_id = ? AND DATE(date) = ?",
                [chatId, date]
            );
            conn.release();

            await bot.deleteMessage(chatId, callbackQuery.message.message_id);

            if (rows.length > 0) {
                await bot.sendMessage(
                    chatId,
                    `📊 Отчет за ${date}:\nШаги: ${rows[0].steps}\nМетры: ${rows[0].meters}`
                );
            } else {
                await bot.sendMessage(chatId, `Данные за ${date} не найдены.`);
            }
        }
    } catch (err) {
        console.error('Ошибка callback:', err);
        await bot.sendMessage(chatId, "⚠️ Ошибка обработки запроса.");
    }
});

// 3. Обработчик добавления в группу
bot.on('new_chat_members', (msg) => {
    if (msg.new_chat_members.some(m => m.username === bot.options.username)) {
        bot.sendMessage(
            msg.chat.id,
            'Спасибо за добавление! Используйте команды в личных сообщениях со мной.'
        );
    }
});

console.log('Бот запущен и готов к работе!');