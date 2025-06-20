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
const bot = new TelegramBot(config.token, { polling: true });
const pool = mysql.createPool(config.db);
const userState = {};

// ==================== ФУНКЦИЯ ПРОВЕРКИ ВВОДА ====================
function validateUserInput(text) {
    const rules = {
        minLength: 2,
        allowedChars: /^[а-яА-ЯёЁ\s]+$/,
        forbiddenSymbols: /[.,!?:;"'`~@#$%^&*()\-+=\[\]{}|\\/<>\d]/
    };
    if (text.length < rules.minLength) {
        return { valid: false, message: "❌ Минимум 2 символа." };
    }
    if (!rules.allowedChars.test(text)) {
        return { valid: false, message: "❌ Только кириллица (русский язык)." };
    }
    if (rules.forbiddenSymbols.test(text)) {
        return { valid: false, message: "❌ Недопустимые символы (точки, цифры, знаки и т.д.)." };
    }
    return { valid: true };
}

// Структура подразделений
const departmentStructure = {
    'dep_1': {
        name: 'ЦА',
        management: {
            'man_1': { name: 'ДБРА', hasDepartments: false },
            'man_2': { name: 'ДДПДФО', hasDepartments: false },
            'man_t': { name: 'ДДПП', hasDepartments: false }
        }
    },
    'dep_2': {
        name: 'ТУ',
        management: {
            'man_3': { name: 'ГУ по ЦФО', hasDepartments: true },
            'man_4': { name: 'УГУ', hasDepartments: true },
            'man_7': { name: 'ЮГУ', hasDepartments: true }
        }
    },
    'dep_3': {
        name: 'Подразделения',
        management: {
            'man_5': { name: 'КОП', hasDepartments: false },
            'man_6': { name: 'Автопредприятие', hasDepartments: false },
            'man_t': { name: 'ММЦ', hasDepartments: false }
        }
    }
};

// Структура отделов
const departments = {
    'man_3': {
        name: 'ГУ по ЦФО',
        departments: {
            'dep_1': 'Аппарат',
            'dep_2': 'Отделение 1',
            'dep_3': 'Отделение 2',
            'dep_4': 'Отделение 3'
        }
    },
    'man_4': {
        name: 'УГУ',
        departments: {
            'dep_5': 'Аппарат',
            'dep_6': 'Отделение 4',
            'dep_7': 'Отделение 5',
            'dep_8': 'Отделение 6'
        }
    },
    'man_7': {
        name: 'ЮГУ',
        departments: {
            'dep_9': 'Аппарат',
            'dep_10': 'Отдел 7',
            'dep_11': 'Отдел 8',
            'dep_12': 'Отдел 9'
        }
    }
};

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
                    return await registrationModule.handleLastName(chatId, text, msg);
                case 'first_name':
                    return await registrationModule.handleFirstName(chatId, text, msg);
                case 'middle_name':
                    return await registrationModule.handleMiddleName(chatId, text, msg);
                case 'fio_worker':
                    return await registrationModule.handleFIOWorker(chatId, text, msg);
                case 'town':
                    return await registrationModule.handleTown(chatId, text, msg);
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
                { chat_id: chatId, message_id: callbackQuery.message.message_id }
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
                    `✅ Добро пожаловать, ${user.first_name}! Регистрация завершена, теперь Вы можете вносить результаты.`
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
                    user.step = 'select_department';
                    await registrationModule.handleSelectDepartment(chatId);
                } else {
                    user.step = 'fio_worker';
                    await bot.sendMessage(chatId, "Введите ФИО (полностью) члена семьи, работающего в ЦБ РФ:");
                }
                return;
            }

            if (data.startsWith('department_')) {
                const depId = data.replace('department_', '');
                
                if (!departmentStructure[depId]) {
                    console.error('Департамент не найден:', depId);
                    await bot.sendMessage(chatId, "⚠️ Ошибка: департамент не найден");
                    return;
                }
                
                user.selectedDepartment = depId;
                user.step = 'select_management';

                const managementButtons = Object.entries(departmentStructure[depId].management).map(([key, value]) => ({
                    text: value.name,
                    callback_data: `management_${key}`
                }));

                await bot.sendMessage(
                    chatId,
                    "Выберите управление:",
                    {
                        reply_markup: {
                            inline_keyboard: [managementButtons]
                        }
                    }
                );
                return;
            }

            if (data.startsWith('management_')) {
                const fullManId = data.replace('management_', '');
                const depId = user.selectedDepartment;

                if (!departmentStructure[depId] || !departmentStructure[depId].management) {
                    console.error('Не найдена структура для департамента:', depId);
                    await bot.sendMessage(chatId, "⚠️ Ошибка при выборе управления. Попробуйте снова.");
                    return;
                }

                user.selectedManagement = fullManId;

                if (fullManId === 'man_t') {
                    user.department = `${departmentStructure[depId].name} - ${departmentStructure[depId].management[fullManId].name}`;
                    // Для работника пропускаем город, для члена семьи - запрашиваем
                    if (user.status === 'worker') {
                        await registrationModule.showConfirmation(chatId);
                    } else {
                        user.step = 'town';
                        await bot.sendMessage(chatId, "Из какого Вы города?");
                    }
                    return;
                }

                if (!departments[fullManId] || !departments[fullManId].departments) {
                    console.error('Не найдены отделы для управления:', fullManId);
                    await bot.sendMessage(chatId, "⚠️ Ошибка при выборе отдела. Попробуйте снова.");
                    return;
                }

                user.step = 'select_department_final';

                const departmentButtons = Object.entries(departments[fullManId].departments).map(([key, value]) => ({
                    text: value,
                    callback_data: `final_department_${key}`
                }));

                await bot.sendMessage(
                    chatId,
                    "Выберите отдел:",
                    {
                        reply_markup: {
                            inline_keyboard: [departmentButtons]
                        }
                    }
                );
                return;
            }

            if (data.startsWith('final_department_')) {
                const fullDepId = data.replace('final_department_', '');
                const selectedMan = user.selectedManagement;
                const selectedDep = departments[selectedMan].departments[fullDepId];

                const depPart = departmentStructure[user.selectedDepartment]?.name || '';
                const managementPart = departments[selectedMan]?.name || '';

                user.department = `${depPart} - ${managementPart} - ${selectedDep}`;
                // Для работника пропускаем город, для члена семьи - запрашиваем
                if (user.status === 'worker') {
                    await registrationModule.showConfirmation(chatId);
                } else {
                    user.step = 'town';
                    await bot.sendMessage(chatId, "Из какого Вы города?");
                }
                return;
            }

        } catch (err) {
            console.error('Ошибка обработки callback:', err);
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: 'Ошибка обработки запроса',
                show_alert: false
            });
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных.");
            delete userState[chatId];
        }
    },

    showConfirmation: async (chatId) => {
        try {
            const user = userState[chatId];
            user.town = user.status === 'worker' ? null : user.town;

            const userDataMessage = `
Ваши данные:
Фамилия: ${user.last_name}
Имя: ${user.first_name}
Отчество: ${user.middle_name || 'не указано'}
Статус: ${user.status === 'worker' ? 'Работник' : 'Член семьи'}
Возраст: ${user.age}
Пол: ${user.sex}
${user.status === 'worker' ? `Подразделение: ${user.department}` : `ФИО работника: ${user.FIO_worker}`}
${user.status === 'family' ? `Город: ${user.town || 'не указан'}` : ''}
Все верно?
`;
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
            user.step = 'confirmation';
        } catch (err) {
            console.error(err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных.");
            delete userState[chatId];
        }
    },

    handleSelectDepartment: async (chatId) => {
        try {
            const buttons = Object.entries(departmentStructure).map(([key, value]) => ({
                text: value.name,
                callback_data: `department_${key}`
            }));
            await bot.sendMessage(
                chatId,
                "Выберите департамент:",
                {
                    reply_markup: {
                        inline_keyboard: [buttons]
                    }
                }
            );
        } catch (err) {
            console.error('Ошибка выбора департамента:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при выборе департамента.");
        }
    },

    handleLastName: async (chatId, lastName, msg) => {
        const validation = validateUserInput(lastName);
        if (!validation.valid) {
            await bot.sendMessage(chatId, validation.message + "\nПопробуйте снова:");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            return;
        }
        userState[chatId] = { ...userState[chatId], last_name: lastName, step: 'first_name' };
        await bot.sendMessage(chatId, "Укажите Ваше имя:");
    },

    handleFirstName: async (chatId, firstName, msg) => {
        const validation = validateUserInput(firstName);
        if (!validation.valid) {
            await bot.sendMessage(chatId, validation.message + "\nПопробуйте снова:");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            return;
        }
        userState[chatId] = { ...userState[chatId], first_name: firstName, step: 'middle_name' };
        await bot.sendMessage(chatId, "Какое у Вас отчество? (Если нет, напишите \"нет\")");
    },

    handleMiddleName: async (chatId, middleName, msg) => {
        if (middleName.toLowerCase() === "нет") {
            userState[chatId] = {
                ...userState[chatId],
                middle_name: null,
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
            return;
        }

        const validation = validateUserInput(middleName);
        if (!validation.valid) {
            await bot.sendMessage(chatId, validation.message + "\nПопробуйте снова:");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            return;
        }

        userState[chatId] = {
            ...userState[chatId],
            middle_name: middleName,
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

    handleFIOWorker: async (chatId, fioWorker, msg) => {
        const validation = validateUserInput(fioWorker);
        if (!validation.valid) {
            await bot.sendMessage(chatId, validation.message + "\nПопробуйте снова:");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            return;
        }
        userState[chatId] = { ...userState[chatId], FIO_worker: fioWorker, step: 'town' };
        await bot.sendMessage(chatId, "Из какого Вы города?");
    },

    handleTown: async (chatId, town, msg) => {
        const validation = validateUserInput(town);
        if (!validation.valid) {
            await bot.sendMessage(chatId, validation.message + "\nПопробуйте снова:");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            return;
        }
        try {
            const user = userState[chatId];
            user.town = town;

            const userDataMessage = `
Ваши данные:
Фамилия: ${user.last_name}
Имя: ${user.first_name}
Отчество: ${user.middle_name || 'не указано'}
Статус: ${user.status === 'worker' ? 'Работник' : 'Член семьи'}
Возраст: ${user.age}
Пол: ${user.sex}
${user.status === 'worker' ? `Подразделение: ${user.department}` : `ФИО работника: ${user.FIO_worker}`}
Город: ${town}
Все верно?
`;
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
                await bot.sendMessage(chatId, "У Вас нет данных для отчёта.");
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
                    await stepsModule.handleSteps(chatId, text, msg);
                    return true;
                case 'meters_count':
                    await stepsModule.handleMeters(chatId, text, msg);
                    return true;
            }
        } catch (err) {
            console.error('Ошибка шагов:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных.");
            delete userState[chatId];
        }

        return false;
    },

    handleSteps: async (chatId, steps, msg) => {
        if (isNaN(steps)) {
            await bot.sendMessage(chatId, "Пожалуйста, введите число.");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            return;
        }
        userState[chatId] = { ...userState[chatId], steps: Number(steps), step: 'meters_count' };
        await bot.sendMessage(chatId, "Сколько километров Вы прошли?");
    },

    handleMeters: async (chatId, meters, msg) => {
        if (isNaN(meters)) {
            await bot.sendMessage(chatId, "Пожалуйста, введите число.");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            return;
        }

        try {
            const conn = await pool.getConnection();
            const { date, steps } = userState[chatId];
            const metersValue = Number(meters);

            await conn.query(
                "INSERT INTO steps (chat_id, date, steps, meters) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE steps = VALUES(steps), meters = VALUES(meters)",
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
            const [rows] = await conn.query("SELECT first_name FROM users WHERE chat_id = ?", [chatId]);
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
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const conn = await pool.getConnection();
        const [rows] = await conn.query("SELECT * FROM users WHERE chat_id = ?", [chatId]);
        conn.release();

        if (rows[0]) {
            const options = {
                reply_markup: {
                    inline_keyboard: [[{ text: "Удалить данные", callback_data: "forget_me" }]]
                }
            };
            const sentMessage = await bot.sendMessage(
                chatId,
                `Привет, ${rows[0].first_name}! Вы уже зарегистрированы. Удалить данные?`,
                options
            );
            userState[chatId] = { buttonMessageId: sentMessage.message_id };
        } else {
            await bot.sendMessage(chatId, "Здравствуйте! Давайте познакомимся. Как Ваша фамилия?");
            userState[chatId] = { step: 'last_name' };
        }
    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, "⚠️ Ошибка при запуске бота.");
    }
});

bot.onText(/\/add/, async (msg) => {
    await stepsModule.startAdd(msg.chat.id);
});

bot.onText(/\/report/, async (msg) => {
    await stepsModule.startReport(msg.chat.id);
});

bot.onText(/\/hello/, async (msg) => {
    await greetingModule.sendGreeting(msg.chat.id);
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;

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

    const processed =
        await registrationModule.handleMessage(msg) ||
        await stepsModule.handleMessage(msg);
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    let conn;

    try {
        if (
            data.startsWith('status_') ||
            data.startsWith('age_') ||
            data.startsWith('sex_') ||
            data.startsWith('department_') ||
            data.startsWith('management_') ||
            data.startsWith('final_department_') ||
            data === 'confirm_yes' ||
            data === 'confirm_no'
        ) {
            return await registrationModule.handleCallbackQuery(callbackQuery);
        }

        if (data === 'forget_me') {
            conn = await pool.getConnection();
            await conn.query("DELETE FROM users WHERE chat_id = ?", [chatId]);
            await conn.query("DELETE FROM steps WHERE chat_id = ?", [chatId]);
            conn.release();

            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                { chat_id: chatId, message_id: callbackQuery.message.message_id }
            );

            await bot.sendMessage(chatId, "✅ Данные удалены. Начните с /start");
            delete userState[chatId];
            return;
        }

        if (data.startsWith('steps_date_')) {
            const date = data.replace('steps_date_', '');
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            userState[chatId] = { date, step: 'steps_count' };
            await bot.sendMessage(chatId, `Выбрана дата: ${date}\nСколько шагов Вы прошли?`);
            return;
        }

        if (data === 'steps_cancel') {
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            delete userState[chatId];
            return;
        }

        if (data.startsWith('report_')) {
            const date = data.replace('report_', '');
            conn = await pool.getConnection();
            const [rows] = await conn.query("SELECT steps, meters FROM steps WHERE chat_id = ? AND DATE(date) = ?", [chatId, date]);
            conn.release();

            await bot.deleteMessage(chatId, callbackQuery.message.message_id);

            if (rows.length > 0) {
                await bot.sendMessage(chatId, `📊 Отчёт за ${date}:\nШаги: ${rows[0].steps}\nМетры: ${rows[0].meters}`);
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