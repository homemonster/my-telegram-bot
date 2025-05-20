require('dotenv').config(); // загружаем переменные из .env
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

// Конфигурация
const config = {
    token: process.env.BOT_TOKEN, 
    db: {
        host: process.env.DB_HOST,                  
        user: process.env.DB_USER,                 
        password: process.env.DB_PASSWORD,          
        database: process.env.DB_NAME,              
        port: parseInt(process.env.DB_PORT) || 3306,
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
                    await registrationModule.handleFirstName(chatId, text);
                    return true;
                
                case 'last_name':
                    await registrationModule.handleLastName(chatId, text);
                    return true;
                
                case 'age':
                    await registrationModule.handleAge(chatId, text);
                    return true;
                
                case 'department':
                    await registrationModule.handleDepartment(chatId, text);
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
        const buttons = [
            [{ text: "2025-07-19", callback_data: "steps_date_2025-07-19" }],
            [{ text: "2025-07-20", callback_data: "steps_date_2025-07-20" }],
            [{ text: "2025-07-21", callback_data: "steps_date_2025-07-21" }],
            [{ text: "❌ Отмена", callback_data: "steps_cancel" }]
        ];

        await bot.sendMessage(chatId, "📅 Выберите дату для добавления данных:", {
            reply_markup: { inline_keyboard: buttons }
        });
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
    
        // Проверяем наличие шага и что он относится к модулю шагов
        if (!userState[chatId] || !['steps_count', 'meters_count'].includes(userState[chatId].step)) {
            return false;
        }
    
        try {
            switch (userState[chatId].step) {
                case 'steps_count':
                    await stepsModule.handleSteps(chatId, text);
                    return true;
                
                case 'meters_count':
                    await stepsModule.handleMeters(chatId, text);
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
    let conn; // Объявляем conn здесь, чтобы она была доступна в finally

    try {
        if (data.startsWith('steps_date_')) {
            const date = data.replace('steps_date_', '');
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            userState[chatId] = { date, step: 'steps_count' };
            await bot.sendMessage(chatId, `Выбрана дата: ${date}\nСколько шагов вы прошли?`);
        }
        else if (data === 'steps_cancel') {
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            delete userState[chatId];
        }
        else if (data === 'forget_me') {
            conn = await pool.getConnection();
            await conn.query("DELETE FROM users WHERE chat_id = ?", [chatId]);
            await conn.query("DELETE FROM steps WHERE chat_id = ?", [chatId]);
            
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
            conn = await pool.getConnection();
            const [rows] = await conn.query(
                "SELECT steps, meters FROM steps WHERE chat_id = ? AND DATE(date) = ?",
                [chatId, date]
            );

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
    } finally {
        if (conn) await conn.release(); // Освобождаем соединение, если оно было создано
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