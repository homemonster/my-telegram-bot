require('dotenv').config();
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

// Инициализация
const bot = new TelegramBot(config.token, {polling: true});
const pool = mysql.createPool(config.db);
const userState = {};

// ==================== МОДУЛЬ РЕГИСТРАЦИИ ====================
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
            await bot.sendMessage(chatId, "Здравствуйте! Давайте познакомимся. Как Ваша фамилия?");
            userState[chatId] = { step: 'last_name' };
        }
    },

    handleMessage: async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();
    
        if (!userState[chatId]?.step) return false;
    
        try {
            switch (userState[chatId].step) {
                case 'last_name':
                    await registrationModule.handleLastName(chatId, text);
                    return true;
                case 'first_name':
                    await registrationModule.handleFirstName(chatId, text);
                    return true;
                case 'middle_name':
                    await registrationModule.handleMiddleName(chatId, text);
                    return true;
                case 'department':
                    await registrationModule.handleDepartment(chatId, text);
                    return true;
                case 'sp_code':
                    await registrationModule.handleSPCode(chatId, text);
                    return true;
                case 'fio_worker':
                    await registrationModule.handleFIOWorker(chatId, text);
                    return true;
                case 'town':
                    await registrationModule.handleTown(chatId, text);
                    return true;
                default:
                    return false;
            }
        } catch (err) {
            console.error('Ошибка регистрации:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных. Попробуйте снова.");
            delete userState[chatId];
            return false;
        }
    },

    handleCallbackQuery: async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const user = userState[chatId];

        if (!user) {
            console.log('Нет состояния для чата', chatId);
            return;
        }

        try {
            // Удаляем кнопки после выбора
            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                { 
                    chat_id: chatId, 
                    message_id: callbackQuery.message.message_id 
                }
            );

            // Подтверждаем нажатие кнопки
            await bot.answerCallbackQuery(callbackQuery.id);

            // Обработка подтверждения регистрации
            if (data === 'confirm_yes') {
                const conn = await pool.getConnection();
                await conn.query(
                    `INSERT INTO users 
                    (chat_id, first_name, middle_name, last_name, age, department, status, sex, SP_code, FIO_worker, town) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        chatId, 
                        user.first_name, 
                        user.middle_name,
                        user.last_name, 
                        user.age, 
                        user.department,
                        user.status,
                        user.sex,
                        user.SP_code,
                        user.FIO_worker,
                        user.town
                    ]
                );
                conn.release();
                
                await bot.sendMessage(
                    chatId, 
                    `✅ Регистрация завершена! Добро пожаловать, ${user.first_name}!`
                );
                delete userState[chatId];
                return;
            }

            if (data === 'confirm_no') {
                await bot.sendMessage(
                    chatId, 
                    "❌ Ввод данных отменен. Нажмите /start для начала новой регистрации"
                );
                delete userState[chatId];
                return;
            }

            if (data.startsWith('status_')) {
                const status = data.split('_')[1];
                user.status = status;
                user.step = 'age';

                const ageButtons = [
                    [{ text: "18-33 года", callback_data: "age_18-33" }],
                    [{ text: "34-44 года", callback_data: "age_34-44" }],
                    [{ text: "45-54 года", callback_data: "age_45-54" }],
                    [{ text: "55+ лет", callback_data: "age_55+" }]
                ];

                if (status === 'family') {
                    ageButtons.unshift([{ text: "1-17 лет", callback_data: "age_1-17" }]);
                }

                await bot.sendMessage(
                    chatId,
                    "Выберите возрастную категорию:",
                    {
                        reply_markup: {
                            inline_keyboard: ageButtons
                        }
                    }
                );
                return;
            }

            if (data.startsWith('age_')) {
                user.age = data.split('_')[1];
                user.step = 'sex';
                await bot.sendMessage(
                    chatId,
                    "Укажите Ваш пол:",
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "Мужской", callback_data: "sex_male" }],
                                [{ text: "Женский", callback_data: "sex_female" }]
                            ]
                        }
                    }
                );
                return;
            }

            if (data.startsWith('sex_')) {
                user.sex = data.split('_')[1] === 'male' ? 'Мужской' : 'Женский';
                
                if (user.status === 'worker') {
                    user.step = 'department';
                    await bot.sendMessage(chatId, "В каком подразделении Вы работаете?");
                } else {
                    user.step = 'sp_code';
                    await bot.sendMessage(chatId, "Введите код СП (если есть):");
                }
                return;
            }

        } catch (err) {
            console.error('Ошибка обработки callback:', err);
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: 'Ошибка обработки запроса',
                show_alert: false
            });
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных. Попробуйте снова.");
            delete userState[chatId];
        }
    },

    handleLastName: async (chatId, lastName) => {
        userState[chatId] = { ...userState[chatId], last_name: lastName, step: 'first_name' };
        await bot.sendMessage(chatId, "Укажите Ваше имя:");
    },

    handleFirstName: async (chatId, firstName) => {
        userState[chatId] = { ...userState[chatId], first_name: firstName, step: 'middle_name' };
        await bot.sendMessage(chatId, "Какое у Вас отчество? (Если нет, напишите \"нет\")");
    },

    handleMiddleName: async (chatId, middleName) => {
        userState[chatId] = { 
            ...userState[chatId], 
            middle_name: middleName === "нет" ? null : middleName, 
            step: 'status'
        };
        
        await bot.sendMessage(
            chatId,
            "Выберите Ваш статус:",
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Работник", callback_data: "status_worker" }],
                        [{ text: "Член семьи", callback_data: "status_family" }]
                    ]
                }
            }
        );
    },

    handleDepartment: async (chatId, department) => {
        userState[chatId] = { ...userState[chatId], department, step: 'town' };
        await bot.sendMessage(chatId, "Из какого вы города?");
    },

    handleSPCode: async (chatId, spCode) => {
        userState[chatId] = { ...userState[chatId], SP_code: spCode || null, step: 'fio_worker' };
        await bot.sendMessage(chatId, "Укажите ФИО работника (если вы член семьи):");
    },

    handleFIOWorker: async (chatId, fioWorker) => {
        userState[chatId] = { ...userState[chatId], FIO_worker: fioWorker || null, step: 'town' };
        await bot.sendMessage(chatId, "Из какого вы города?");
    },

    handleTown: async (chatId, town) => {
        try {
            const user = userState[chatId];
            user.town = town;
            
            // Формируем сообщение с данными для подтверждения
            const userDataMessage = `
Ваши данные:
Фамилия: ${user.last_name}
Имя: ${user.first_name}
Отчество: ${user.middle_name || 'не указано'}
Статус: ${user.status === 'worker' ? 'Работник' : 'Член семьи'}
Возраст: ${user.age}
Пол: ${user.sex}
${user.status === 'worker' ? `Подразделение: ${user.department}` : `Код СП: ${user.SP_code || 'не указан'}\nФИО работника: ${user.FIO_worker || 'не указано'}`}
Город: ${town}

Все верно?
            `;

            // Отправляем сообщение с кнопками подтверждения
            await bot.sendMessage(
                chatId, 
                userDataMessage,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Да", callback_data: "confirm_yes" }],
                            [{ text: "Нет", callback_data: "confirm_no" }]
                        ]
                    }
                }
            );
            
            // Переходим на шаг подтверждения
            user.step = 'confirmation';
        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных.");
            delete userState[chatId];
        }
    }
};

// ==================== МОДУЛЬ ШАГОВ ====================
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

// ==================== МОДУЛЬ ПРИВЕТСТВИЙ ====================
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

// ==================== ОБРАБОТЧИКИ КОМАНД ====================

// Обработчик /start
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

// Обработчик /add
bot.onText(/\/add/, async (msg) => {
    await stepsModule.startAdd(msg.chat.id);
});

// Обработчик /report
bot.onText(/\/report/, async (msg) => {
    await stepsModule.startReport(msg.chat.id);
});

// Обработчик /hello
bot.onText(/\/hello/, async (msg) => {
    await greetingModule.sendGreeting(msg.chat.id);
});

// Обработчик сообщений
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

// Обработчик callback-запросов
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    let conn;

    try {
        console.log('Received callback:', data); // Логирование для отладки

        // Перенаправляем обработку в модуль регистрации
        if (data.startsWith('status_') || data.startsWith('age_') || data.startsWith('sex_') || 
            data === 'confirm_yes' || data === 'confirm_no') {
            return await registrationModule.handleCallbackQuery(callbackQuery);
        }

        // Обработка кнопки "Удалить данные"
        if (data === 'forget_me') {
            conn = await pool.getConnection();
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
            return;
        }

        // Обработка шагов
        if (data.startsWith('steps_date_')) {
            const date = data.replace('steps_date_', '');
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            userState[chatId] = { date, step: 'steps_count' };
            await bot.sendMessage(chatId, `Выбрана дата: ${date}\nСколько шагов вы прошли?`);
            return;
        }

        if (data === 'steps_cancel') {
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            delete userState[chatId];
            return;
        }

        // Обработка отчетов
        if (data.startsWith('report_')) {
            const date = data.replace('report_', '');
            conn = await pool.getConnection();
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
            return;
        }

        if (data === 'report_cancel') {
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            return;
        }

        await bot.answerCallbackQuery(callbackQuery.id);
    } catch (err) {
        console.error('Ошибка callback:', err);
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Ошибка обработки запроса',
            show_alert: false
        });
    } finally {
        if (conn) await conn.release();
    }
});

console.log('Бот запущен и готов к работе!');