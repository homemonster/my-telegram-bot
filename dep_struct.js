// Структура подразделений
const departmentStructure = {
    'dep_1': {
        name: 'ЦА',
        management: {
            'man_1': { name: 'Руководство', hasDepartments: false },
            'man_2': { name: 'АД', hasDepartments: false },
            'man_3': { name: 'Аппарат БР', hasDepartments: false },
            'man_4': { name: 'ГИБР', hasDepartments: false },
            'man_5': { name: 'ДББР', hasDepartments: false },
            'man_6': { name: 'ДБУиО', hasDepartments: false },
            'man_7': { name: 'ДВА', hasDepartments: false },
            'man_8': { name: 'ДДиПДФО', hasDepartments: false },
            'man_9': { name: 'ДДКП', hasDepartments: false },
            'man_10': { name: 'ДДПП', hasDepartments: false },
            'man_11': { name: 'ДЗБР', hasDepartments: false },
            'man_12': { name: 'ДИБ', hasDepartments: false },
            'man_13': { name: 'ДИП', hasDepartments: false },
            'man_14': { name: 'ДИТ', hasDepartments: false },
            'man_15': { name: 'ДИФП', hasDepartments: false },
            'man_16': { name: 'ДИФР', hasDepartments: false },
            'man_17': { name: 'ДКО', hasDepartments: false },
            'man_18': { name: 'ДКП', hasDepartments: false },
            'man_19': { name: 'ДНБР', hasDepartments: false },
            'man_20': { name: 'ДНДО', hasDepartments: false },
            'man_21': { name: 'ДНК', hasDepartments: false },
            'man_22': { name: 'ДНПС', hasDepartments: false },
            'man_23': { name: 'ДНСЗКО', hasDepartments: false },
            'man_24': { name: 'ДОМР', hasDepartments: false },
            'man_25': { name: 'ДОФР', hasDepartments: false },
            'man_26': { name: 'ДПУ', hasDepartments: false },
            'man_27': { name: 'ДРБУ', hasDepartments: false },
            'man_28': { name: 'ДС', hasDepartments: false },
            'man_29': { name: 'ДСМО', hasDepartments: false },
            'man_30': { name: 'ДСО', hasDepartments: false },
            'man_31': { name: 'ДСР', hasDepartments: false },
            'man_32': { name: 'ДСРФР', hasDepartments: false },
            'man_33': { name: 'ДФО', hasDepartments: false },
            'man_34': { name: 'ДФС', hasDepartments: false },
            'man_35': { name: 'ДФТ', hasDepartments: false },
            'man_36': { name: 'ОД', hasDepartments: false },
            'man_37': { name: 'САР', hasDepartments: false },
            'man_38': { name: 'СЗППиОДФУ', hasDepartments: false },
            'man_39': { name: 'СТБН', hasDepartments: false },
            'man_40': { name: 'СФМиВК', hasDepartments: false },
            'man_41': { name: 'УБР', hasDepartments: false },
            'man_42': { name: 'ФД', hasDepartments: false },
            'man_43': { name: 'ЮД', hasDepartments: false }
        }
    },
    'dep_2': {
        name: 'ТУ',
        management: {
            'man_44': { name: 'ВВГУ', hasDepartments: true },
            'man_45': { name: 'ГУ по ЦФО', hasDepartments: true },
            'man_46': { name: 'ДГУ', hasDepartments: true },
            'man_47': { name: 'СГУ', hasDepartments: true },
            'man_48': { name: 'СЗГУ', hasDepartments: true },
            'man_49': { name: 'УГУ', hasDepartments: true },
            'man_50': { name: 'ЮГУ', hasDepartments: true }
        }
    },
    'dep_3': {
        name: 'Подразделения',
        management: {
            'man_51': { name: 'АП', hasDepartments: false },
            'man_52': { name: 'КОП', hasDepartments: false },
            'man_53': { name: 'ММЦ', hasDepartments: false },
            'man_54': { name: 'МЦБР', hasDepartments: false },
            'man_54': { name: 'ОП', hasDepartments: false },
            'man_55': { name: 'СОДО', hasDepartments: false },
            'man_56': { name: 'ХЭУ', hasDepartments: false },
            'man_57': { name: 'ЦСП', hasDepartments: false }
        }
    }
};

// Структура отделов
const departments = {
    'man_44': {
        name: 'ВВГУ',
        departments: {
            'dep_1': 'Аппарат ВВГУ',
            'dep_2': 'Пензенской обл.',
            'dep_3': 'Кировской обл.',
            'dep_4': 'Самарской обл.',
            'dep_5': 'Саратовской обл.',
            'dep_6': 'Ульяновской обл.',
            'dep_7': 'по Респ. Марий Эл.',
            'dep_8': 'по Респ. Мордовия',
            'dep_9': 'по Респ. Татарстан',
            'dep_10': 'по Удмуртской Респ.',
            'dep_11': 'по Чувашской Респ.'
        }
    },
    'man_45': {
        name: 'ГУ по ЦФО',
        departments: {
            'dep_1': 'Аппарат ГУ по ЦФО',
            'dep_2': 'Белгородской обл.',
            'dep_3': 'Брянской обл.',
            'dep_4': 'Владимирской обл.',
            'dep_5': 'Воронежской обл.',
            'dep_6': 'Ивановской обл.',
            'dep_7': 'Калужской обл.',
            'dep_8': 'Костромской обл.',
            'dep_9': 'Курской обл.',
            'dep_10': 'Липецкой обл.',
            'dep_11': 'Орловской обл.',
            'dep_12': 'Рязанской обл.',
            'dep_13': 'Смоленской обл.',
            'dep_14': 'Тамбовской обл.',
            'dep_15': 'Тверской обл.',
            'dep_16': 'Тульской обл.',
            'dep_17': 'Ярославлской обл.'


        }
    },
    'man_46': {
        name: 'ДГУ',
        departments: {
            'dep_1': 'Аппарат ДГУ',
            'dep_2': 'Амурской обл.',
            'dep_3': 'Еврейскому АО',
            'dep_4': 'Камчаткский край',
            'dep_5': 'Магаданской обл.',
            'dep_6': 'по Респ. Саха',
            'dep_7': 'Сахалинской обл.',
            'dep_8': 'Хабаровский край',
            'dep_9': 'Чукоткскому АО'
        }
    },
    'man_47': {
        name: 'СГУ',
        departments: {
            'dep_1': 'Аппарат СГУ',
            'dep_2': 'Алтайский край',
            'dep_3': 'Забайкальский край',
            'dep_4': 'Иркутской обл.',
            'dep_5': 'Кемеровской обл.',
            'dep_6': 'Красноярский край',
            'dep_7': 'Омской обл.',
            'dep_8': 'по Респ. Алтай',
            'dep_9': 'по Респ. Бурятия',
            'dep_10': 'по Респ. Тыва',
            'dep_11': 'по Респ. Хакасия',
            'dep_12': 'Томской обл.'
        }
    },
    'man_48': {
        name: 'СЗГУ',
        departments: {
            'dep_1': 'Аппарат СЗГУ',
            'dep_2': 'Архангельской обл.',
            'dep_3': 'Калининградской обл.',
            'dep_4': 'Мурманской обл.',
            'dep_5': 'Новгородской обл.',
            'dep_6': 'Псковской обл.',
            'dep_7': 'по Респ. Карелия',
            'dep_8': 'по Респ. Коми'

        }   
    },
    'man_49': {
        name: 'УГУ',
        departments: {
            'dep_1': 'Аппарат УГУ',
            'dep_2': 'Курганской обл.',
            'dep_3': 'Оренбургской обл.',
            'dep_4': 'Пермский край',
            'dep_5': 'по Респ. Башкортостан',
            'dep_6': 'Тюменской обл.',
            'dep_7': 'Челябинской обл.'
        }
    },
    'man_50': {
        name: 'ЮГУ',
        departments: {
            'dep_1': 'Аппарат ЮГУ',
            'dep_2': 'Астраханской обл.',
            'dep_3': 'Волгоградской обл.',
            'dep_4': 'ДНР',
            'dep_5': 'Запорожской обл.',
            'dep_6': 'ЛНР',
            'dep_7': 'по Кабардино-Балкарской Респ.',
            'dep_8': 'по Карачаево-Черкесской Респ.',
            'dep_9': 'по Респ. Адыгея',
            'dep_10': 'по Респ. Дагестан',
            'dep_11': 'по Респ. Ингушетия',
            'dep_12': 'по Респ. Калмыкия',
            'dep_13': 'по Респ. Северная Осетия',
            'dep_14': 'по Чеченской Респ.',
            'dep_15': 'Респ. Крым',
            'dep_16': 'Ростовской обл.',
            'dep_17': 'Севастополь',
            'dep_18': 'Ставропольский край',
            'dep_19': 'Херсонской обл.'
        }
    }
};

module.exports = {
    departmentStructure,
    departments
};