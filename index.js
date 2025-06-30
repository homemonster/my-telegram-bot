require('dotenv').config();
const { departmentStructure, departments } = require('./dep_struct');
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
    console.log(`[VALIDATION] Проверка ввода: "${text}"`);
    const rules = {
        minLength: 2,
        allowedChars: /^[а-яА-ЯёЁ\s-]+$/,
    };
    if (text.length < rules.minLength) {
        console.log(`[VALIDATION ERROR] Слишком короткий ввод: ${text.length} символов`);
        return { valid: false, message: "❌ Минимум 2 символа." };
    }
    if (!rules.allowedChars.test(text)) {
        console.log(`[VALIDATION ERROR] Недопустимые символы в: "${text}"`);
        return { valid: false, message: "❌ Только кириллица, пробелы и дефисы." };
    }
    return { valid: true };
}

// ==================== МОДУЛЬ РЕГИСТРАЦИИ ====================
const registrationModule = {
    start: async (chatId, user) => {
        console.log(`[REGISTRATION START] chatId: ${chatId}, user exists: ${!!user}`);
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
            console.log(`[REGISTRATION] Пользователь уже зарегистрирован, предложено удаление данных`);
        } else {
            await bot.sendMessage(chatId, "Здравствуйте! Давайте познакомимся. Как Ваша фамилия?");
            userState[chatId] = { step: 'last_name' };
            console.log(`[REGISTRATION] Начата регистрация нового пользователя`);
        }
    },
    handleMessage: async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();
        if (!userState[chatId]?.step) {
            console.log(`[REGISTRATION ERROR] Нет шага регистрации для chatId: ${chatId}`);
            return false;
        }
        console.log(`[REGISTRATION STEP] chatId: ${chatId}, step: ${userState[chatId].step}, input: "${text}"`);
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
                    console.log(`[REGISTRATION ERROR] Неизвестный шаг регистрации: ${userState[chatId].step}`);
                    return false;
            }
        } catch (err) {
            console.error('[REGISTRATION ERROR] Ошибка регистрации:', err);
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
            console.log(`[CALLBACK ERROR] Нет состояния для чата ${chatId}`);
            return;
        }
        console.log(`[CALLBACK] chatId: ${chatId}, data: ${data}, step: ${user.step}`);
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
                console.log(`[REGISTRATION CONFIRM] Пользователь подтвердил данные`, user);
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
                console.log(`[REGISTRATION COMPLETE] Пользователь ${chatId} успешно зарегистрирован`);
                delete userState[chatId];
                return;
            }
            if (data === 'confirm_no') {
                console.log(`[REGISTRATION CANCEL] Пользователь отменил регистрацию`);
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
                console.log(`[REGISTRATION STEP] Установлен статус: ${status}`);
                const ageButtons = [
                    [{ text: "1-17 лет", callback_data: "age_1-17" }],
                    [{ text: "18-33 года", callback_data: "age_18-33" }],
                    [{ text: "34-44 года", callback_data: "age_34-44" }],
                    [{ text: "45-54 года", callback_data: "age_45-54" }],
                    [{ text: "55+ лет", callback_data: "age_55+" }]
                ].filter(btn => status === 'family' || btn[0].callback_data !== "age_1-17");
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
                console.log(`[REGISTRATION STEP] Установлен возраст: ${user.age}`);
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
                console.log(`[REGISTRATION STEP] Установлен пол: ${user.sex}`);
                if (user.status === 'worker') {
                    user.step = 'select_department';
                    console.log(`[REGISTRATION STEP] Начало выбора подразделения для работника`);
                    await registrationModule.handleSelectDepartment(chatId);
                } else {
                    user.step = 'fio_worker';
                    console.log(`[REGISTRATION STEP] Запрос ФИО работника для члена семьи`);
                    await bot.sendMessage(chatId, "Введите ФИО (полностью) члена семьи, работающего в ЦБ РФ:");
                }
                return;
            }
            if (data.startsWith('department_')) {
                const depId = data.replace('department_', '');
                console.log(`[DEPARTMENT SELECT] Выбрано подразделение: ${depId}`);
                if (!departmentStructure[depId]) {
                    console.error('[DEPARTMENT ERROR] Департамент не найден:', depId);
                    await bot.sendMessage(chatId, "⚠️ Ошибка: департамент не найден");
                    return;
                }
                user.selectedDepartment = depId;
                user.step = 'select_management';
                console.log(`[REGISTRATION STEP] Выбор управления для департамента: ${depId}`);
                const managementEntries = Object.entries(departmentStructure[depId].management);
                if (managementEntries.length === 0) {
                    console.error('[MANAGEMENT ERROR] Нет доступных управлений для департамента:', depId);
                    await bot.sendMessage(chatId, "⚠️ Нет доступных подразделений. Обратитесь к администратору.");
                    return;
                }
                const managementButtons = managementEntries.map(([key, value]) => ({
                    text: value.name,
                    callback_data: `management_${key}`
                }));
                // Группируем кнопки парами
                const groupedButtons2 = [];
                for (let i = 0; i < managementButtons.length; i += 2) {
                    const pair = [managementButtons[i]];
                    if (i + 1 < managementButtons.length) {
                        pair.push(managementButtons[i + 1]);
                    }
                    groupedButtons2.push(pair);
                }
                await bot.sendMessage(
                    chatId,
                    "Выберите подразделение:",
                    {
                        reply_markup: {
                            inline_keyboard: groupedButtons2,
                            resize_keyboard: true
                        }
                    }
                );
                return;
            }
            if (data.startsWith('management_')) {
                const fullManId = data.replace('management_', '');
                const depId = user.selectedDepartment;
                console.log(`[MANAGEMENT SELECT] Выбрано управление: ${fullManId} в департаменте: ${depId}`);
                if (!departmentStructure[depId] || !departmentStructure[depId].management) {
                    console.error('[MANAGEMENT ERROR] Не найдена структура для департамента/ТУ:', depId);
                    await bot.sendMessage(chatId, "⚠️ Ошибка при выборе подразделения. Попробуйте снова.");
                    return;
                }
                user.selectedManagement = fullManId;
                const currentManagement = departmentStructure[depId].management[fullManId];
                // Унифицированная обработка подразделений без отделов
                if (!currentManagement.hasDepartments) {
                    user.department = `${departmentStructure[depId].name} - ${currentManagement.name}`;
                    console.log(`[DEPARTMENT SET] Подразделение без отделов: ${user.department}`);
                    if (user.status === 'worker') {
                        await registrationModule.showConfirmation(chatId);
                    } else {
                        user.step = 'town';
                        await bot.sendMessage(chatId, "Из какого Вы города?");
                    }
                    return;
                }
                if (!departments[fullManId] || !departments[fullManId].departments) {
                    console.error('[DEPARTMENT ERROR] Не найдены отделы для управления:', fullManId);
                    await bot.sendMessage(chatId, "⚠️ Ошибка при выборе подразделения. Попробуйте снова. /start");
                    return;
                }
                user.step = 'select_department_final';
                console.log(`[REGISTRATION STEP] Выбор финального отдела для управления: ${fullManId}`);
                const departmentButtons = Object.entries(departments[fullManId].departments)
                    .map(([key, value]) => {
                        return [{ text: value, callback_data: `final_department_${key}` }];
                    });
                await bot.sendMessage(
                    chatId,
                    "Выберите подразделение:",
                    {
                        reply_markup: {
                            inline_keyboard: departmentButtons,
                            resize_keyboard: true
                        }
                    }
                );
                return;
            }
            if (data.startsWith('final_department_')) {
                const fullDepId = data.replace('final_department_', '');
                const selectedMan = user.selectedManagement;
                console.log(`[FINAL DEPARTMENT SELECT] Выбран отдел: ${fullDepId} в управлении: ${selectedMan}`);
                if (!departments[selectedMan] || !departments[selectedMan].departments[fullDepId]) {
                    console.error('[FINAL DEPARTMENT ERROR] Отдел не найден:', fullDepId);
                    await bot.sendMessage(chatId, "⚠️ Ошибка: отдел не найден");
                    return;
                }
                const selectedDep = departments[selectedMan].departments[fullDepId];
                const depPart = departmentStructure[user.selectedDepartment]?.name || '';
                const managementPart = departments[selectedMan]?.name || '';
                user.department = `${depPart} - ${managementPart} - ${selectedDep}`;
                console.log(`[DEPARTMENT SET] Полный путь подразделения: ${user.department}`);
                if (user.status === 'worker') {
                    await registrationModule.showConfirmation(chatId);
                } else {
                    user.step = 'town';
                    await bot.sendMessage(chatId, "Из какого Вы города?");
                }
                return;
            }
        } catch (err) {
            console.error('[CALLBACK ERROR] Ошибка обработки callback:', err);
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
            if (!user) {
                console.error('[CONFIRMATION ERROR] Нет данных пользователя для подтверждения');
                await bot.sendMessage(chatId, "⚠️ Ошибка: данные не найдены. Начните регистрацию заново.");
                return;
            }
            user.town = user.status === 'worker' ? null : user.town;
            console.log(`[CONFIRMATION] Подготовка данных для подтверждения`, user);
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
            console.log(`[CONFIRMATION] Данные отправлены пользователю для подтверждения`);
        } catch (err) {
            console.error('[CONFIRMATION ERROR] Ошибка при подтверждении:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при обработке данных.");
            delete userState[chatId];
        }
    },
    handleSelectDepartment: async (chatId) => {
        try {
            console.log(`[DEPARTMENT SELECT] Начало выбора подразделения для chatId: ${chatId}`);
            // Создаем массив кнопок
            const buttons = Object.entries(departmentStructure).map(([key, value]) => ({
                text: value.name, 
                callback_data: `department_${key}`
            }));
            // Группируем кнопки парами без undefined
            const groupedButtons = [];
            for (let i = 0; i < buttons.length; i += 2) {
                groupedButtons.push(buttons.slice(i, i + 2));
            }
            await bot.sendMessage(
                chatId,
                "Выберите подразделение:",
                {
                    reply_markup: {
                        inline_keyboard: groupedButtons,
                        resize_keyboard: true
                    }
                }
            );
            console.log(`[DEPARTMENT SELECT] Отправлены варианты подразделений`);
        } catch (err) {
            console.error('[DEPARTMENT SELECT ERROR] Ошибка выбора подразделения:', err);
            await bot.sendMessage(chatId, "⚠️ Ошибка при выборе подразделения.");
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
        console.log(`[REGISTRATION STEP] Установлена фамилия: ${lastName}`);
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
        console.log(`[REGISTRATION STEP] Установлено имя: ${firstName}`);
        await bot.sendMessage(chatId, "Какое у Вас отчество? (Если нет, напишите \"нет\")");
    },
    handleMiddleName: async (chatId, middleName, msg) => {
        if (middleName.toLowerCase() === "нет") {
            userState[chatId] = {
                ...userState[chatId],
                middle_name: null,
                step: 'status'
            };
            console.log(`[REGISTRATION STEP] Отчество не указано`);
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
        console.log(`[REGISTRATION STEP] Установлено отчество: ${middleName}`);
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
        console.log(`[REGISTRATION STEP] Установлено ФИО работника: ${fioWorker}`);
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
            if (!user) {
                console.error('[TOWN ERROR] Нет данных пользователя');
                await bot.sendMessage(chatId, "⚠️ Ошибка: данные не найдены. Начните регистрацию заново.");
                return;
            }
            user.town = town;
            console.log(`[REGISTRATION STEP] Установлен город: ${town}`);
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
            console.log(`[CONFIRMATION] Данные отправлены пользователю для подтверждения`);
        } catch (err) {
            console.error('[TOWN ERROR] Ошибка при обработке города:', err);
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
            buttons.push([{ text: "Всего", callback_data: "report_total" }]);
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
        // Берем steps из userState
        const { steps } = userState[chatId];
        if (meters > steps * 0.001 || meters < steps * 0.0005) {
            await bot.sendMessage(chatId, "Количество км не соответствует количеству шагов, уточните.");
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
            await bot.sendMessage(chatId, `✅ Данные за ${date} сохранены! Если Вы ввели ошибочные показатели, то можете отредактировать их повторным вводом /add.`);
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
            
        if (data === 'report_total') {
            conn = await pool.getConnection();
            const [rows] = await conn.query("SELECT SUM(steps) AS total_steps, SUM(meters) AS total_meters FROM steps WHERE chat_id = ?", [chatId]);
            conn.release();
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            if (rows[0].total_steps && rows[0].total_meters) {
                await bot.sendMessage(chatId, `📊 Общий отчёт за всё время:\nШагов: ${rows[0].total_steps}\nКилометров: ${rows[0].total_meters}`);
            } else {
                await bot.sendMessage(chatId, "Данные не найдены.");
            }
            return;
        }
        if (data === 'report_cancel') {
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            return;
        }
        if (data.startsWith('report_')) {
            const date = data.replace('report_', '');
            conn = await pool.getConnection();
            const [rows] = await conn.query("SELECT steps, meters FROM steps WHERE chat_id = ? AND DATE(date) = ?", [chatId, date]);
            conn.release();
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            if (rows.length > 0) {
                await bot.sendMessage(chatId, `📊 Отчёт за ${date}:\nШаги: ${rows[0].steps}\nКилометры: ${rows[0].meters}`);
            } else {
                await bot.sendMessage(chatId, `Данные за ${date} не найдены.`);
            }
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