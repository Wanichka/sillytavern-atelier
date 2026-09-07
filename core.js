/* =========================================================================
   Wani Atelier — модель данных.

   Тема — это НАЗВАНИЕ + СНИМОК CSS-ПЕРЕМЕННЫХ + ФОН.
   Своего списка настроек у Atelier нет: он берёт то, что ты уже настроила
   в Таверне и в теме оформления, и переключает это под персонажа.

   Понимает три формата импорта:
     • штатная тема Таверны   (есть main_text_color)
     • пресет Moonlit Echoes  (есть moonlitEchoesPreset)
     • своя тема Atelier      (format: wani-atelier)
   ========================================================================= */

export const KEY = 'wani_atelier';
export const VERSION = 3;

// Поля штатной темы Таверны → её же CSS-переменные.
export const ST_COLORS = {
    main_text_color: ['--SmartThemeBodyColor', 'Основной текст'],
    quote_text_color: ['--SmartThemeQuoteColor', 'Реплики'],
    italics_text_color: ['--SmartThemeEmColor', 'Курсив'],
    underline_text_color: ['--SmartThemeUnderlineColor', 'Подчёркивание'],
    shadow_color: ['--SmartThemeShadowColor', 'Тень текста'],
    border_color: ['--SmartThemeBorderColor', 'Границы'],
    blur_tint_color: ['--SmartThemeBlurTintColor', 'Панели'],
    chat_tint_color: ['--SmartThemeChatTintColor', 'Слой под чатом'],
    user_mes_blur_tint_color: ['--SmartThemeUserMesBlurTintColor', 'Мои сообщения'],
    bot_mes_blur_tint_color: ['--SmartThemeBotMesBlurTintColor', 'Сообщения персонажа'],
};

// Белый список: в тему попадают только эти переменные. Всё остальное из
// пресета — внутренняя кухня темы оформления (мобильные отступы, размеры
// портретов для её собственных макетов, анимации), под персонажа это не
// переключают, а место в редакторе занимает.
export const LABELS = {
    '--mainFontFamily': 'Шрифт',
    '--monoFontFamily': 'Моношрифт',
    '--customThemeColor': 'Акцент',
    '--customThemeColor2': 'Второй акцент',
    '--customTopBarColor': 'Верхняя панель',
    '--Drawer-iconColor': 'Иконки меню',
    '--customBgColor1': 'Фон меню',
    '--customBgColor2': 'Фон меню, второй',
    '--sheldBackgroundColor': 'Фон окна чата',
    '--sheldBlurStrength': 'Размытие окна чата',
    '--customScrollbarColor': 'Полоса прокрутки',
    '--messageTextFontSize': 'Размер текста',
    '--mesParagraphSpacingTop': 'Отступ абзаца сверху',
    '--mesParagraphSpacingBottom': 'Отступ абзаца снизу',
};

export const ALLOWED = new Set([
    ...Object.keys(LABELS),
    ...Object.values(ST_COLORS).map(([name]) => name),
]);

// Значение уезжает прямо в CSS, поэтому режем всё, чем можно закрыть
// объявление и дописать своё: точку с запятой, скобки блока, комментарии.
export function isSafeCssValue(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= 400
        && !/[;{}<>\\]/.test(value)
        && !value.includes('/*')
        && !/@import|javascript:/i.test(value);
}

export function isSafeVarName(name) {
    return typeof name === 'string'
        && /^--[A-Za-z][\w-]{0,60}$/.test(name);
}

// ---- цвета ---------------------------------------------------------------

// Понимает rgba(...), rgb(...) и #rrggbb. Возвращает hex и прозрачность 0–100.
export function parseColor(value) {
    if (typeof value !== 'string') return null;

    const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) return { hex: '#' + hex[1].toLowerCase(), alpha: 100 };

    const rgb = value.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
    if (!rgb) return null;

    const parts = [rgb[1], rgb[2], rgb[3]].map(n => Math.max(0, Math.min(255, Math.round(+n))));
    if (parts.some(n => !Number.isFinite(n))) return null;

    const alpha = rgb[4] === undefined ? 1 : +rgb[4];
    return {
        hex: '#' + parts.map(n => n.toString(16).padStart(2, '0')).join(''),
        alpha: Math.max(0, Math.min(100, Math.round(alpha * 100))),
    };
}

export function formatColor(hex, alpha) {
    const value = parseInt(hex.slice(1), 16);
    const parts = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return `rgba(${parts.join(', ')}, ${Math.round(alpha) / 100})`;
}

// ---- разбор импортируемых файлов ----------------------------------------

// Из custom_css штатной темы забираем только объявления переменных:
// именно там у Moonlit лежит шрифт.
export function varsFromCss(css) {
    const vars = {};
    if (typeof css !== 'string') return vars;
    for (const [, name, value] of css.matchAll(/(--[A-Za-z][\w-]*)\s*:\s*([^;{}]+)/g)) {
        const clean = value.replace(/!important/i, '').trim();
        if (ALLOWED.has(name) && isSafeCssValue(clean)) vars[name] = clean;
    }
    return vars;
}

function fromSillyTavernTheme(data) {
    const vars = {};
    for (const [field, [name]] of Object.entries(ST_COLORS)) {
        if (isSafeCssValue(data[field])) vars[name] = data[field].trim();
    }
    Object.assign(vars, varsFromCss(data.custom_css));
    return { name: data.name, vars };
}

function fromMoonlitPreset(data) {
    const vars = {};
    for (const [key, value] of Object.entries(data.settings || {})) {
        // Галки — это переключатели самого Moonlit, они общие для всех тем.
        if (typeof value !== 'string' || key === 'rawCustomCss') continue;
        const name = '--' + key;
        if (ALLOWED.has(name) && isSafeCssValue(value)) vars[name] = value.trim();
    }
    return { name: data.presetName, vars };
}

export function importTheme(data) {
    if (!data || typeof data !== 'object') throw Error('Файл не похож на тему');

    if (data.format === 'wani-atelier' && data.theme) {
        return normalizeTheme(data.theme);
    }
    if (data.moonlitEchoesPreset) {
        const { name, vars } = fromMoonlitPreset(data);
        if (!Object.keys(vars).length) throw Error('В пресете Moonlit нет значений для темы');
        return normalizeTheme({ name, vars });
    }
    if (typeof data.main_text_color === 'string') {
        const { name, vars } = fromSillyTavernTheme(data);
        if (!Object.keys(vars).length) throw Error('В теме Таверны нет цветов');
        return normalizeTheme({ name, vars });
    }
    throw Error('Не узнаю формат: нужна тема Таверны, пресет Moonlit или тема Atelier');
}

// ---- тема ----------------------------------------------------------------

export const BACKGROUND = Object.freeze({ background: '', fit: 'cover', dim: 0, blur: 0 });

const ranges = { dim: [0, 85], blur: [0, 12] };

export function normalizeName(value, fallback = 'Без названия') {
    if (typeof value !== 'string') return fallback;
    const name = value.replace(/[\x00-\x1f]/g, '').trim().slice(0, 60);
    return name || fallback;
}

export function normalizeTheme(data = {}) {
    const theme = { name: normalizeName(data?.name), vars: {}, ...BACKGROUND };
    if (!data || typeof data !== 'object') return theme;

    for (const [name, value] of Object.entries(data.vars || {})) {
        if (ALLOWED.has(name) && isSafeCssValue(value)) theme.vars[name] = String(value).trim();
    }

    if (typeof data.background === 'string' && data.background.length < 500
        && !/[\x00-\x1f]/.test(data.background)) {
        theme.background = data.background;
    }
    if (data.fit === 'contain' || data.fit === 'cover') theme.fit = data.fit;
    for (const key of ['dim', 'blur']) {
        if (typeof data[key] === 'number' && Number.isFinite(data[key])) {
            theme[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], data[key]));
        }
    }
    return theme;
}

let counter = 0;
export function newThemeId() {
    counter += 1;
    return 'theme:' + Date.now().toString(36) + '-' + counter.toString(36);
}

export function emptyStore() {
    return { version: VERSION, enabled: false, defaultThemeId: null, themes: {}, assignments: {} };
}

export function characterKey(ctx) {
    if (ctx.groupId != null) return null;
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    return avatar ? 'char:' + avatar : null;
}

// Прошлые версии хранили свой список настроек. Переносим то, что имеет
// прямое соответствие переменной, остальное отбрасываем.
const OLD_KEYS = {
    text: '--SmartThemeBodyColor',
    quote: '--SmartThemeQuoteColor',
    italic: '--SmartThemeEmColor',
    underline: '--SmartThemeUnderlineColor',
    shadow: '--SmartThemeShadowColor',
    border: '--SmartThemeBorderColor',
};
const OLD_TINTS = {
    panel: ['--SmartThemeBlurTintColor', 'panelOpacity'],
    user: ['--SmartThemeUserMesBlurTintColor', 'userOpacity'],
    assistant: ['--SmartThemeBotMesBlurTintColor', 'assistantOpacity'],
    chat: ['--SmartThemeChatTintColor', 'chatOpacity'],
};

export function themeFromOldSettings(name, settings) {
    const vars = {};
    if (settings && typeof settings === 'object') {
        for (const [key, varName] of Object.entries(OLD_KEYS)) {
            if (isSafeCssValue(settings[key])) vars[varName] = settings[key];
        }
        for (const [key, [varName, opacityKey]] of Object.entries(OLD_TINTS)) {
            const color = parseColor(settings[key]);
            if (color) {
                const alpha = typeof settings[opacityKey] === 'number' ? settings[opacityKey] : 100;
                vars[varName] = formatColor(color.hex, Math.max(0, Math.min(100, alpha)));
            }
        }
        if (isSafeCssValue(settings.font)) vars['--mainFontFamily'] = settings.font;
    }
    return normalizeTheme({ name, vars, ...(settings || {}) });
}

function migrateOld(value, store) {
    if (value.global && typeof value.global === 'object') {
        const id = newThemeId();
        store.themes[id] = themeFromOldSettings('Общая', value.global);
        store.defaultThemeId = id;
    }

    let index = 0;
    for (const [key, settings] of Object.entries(value.themes || {})) {
        const id = newThemeId();
        if (key.startsWith('char:')) {
            index += 1;
            store.themes[id] = themeFromOldSettings('Перенесённая тема ' + index, settings);
            store.assignments[key] = id;
        } else if (key.startsWith('theme:')) {
            store.themes[id] = themeFromOldSettings(settings?.name, settings);
            if (value.defaultThemeId === key) store.defaultThemeId = id;
            for (const [charKey, themeKey] of Object.entries(value.assignments || {})) {
                if (themeKey === key && charKey.startsWith('char:')) store.assignments[charKey] = id;
            }
        }
    }

    for (const [key, settings] of Object.entries(value.presets || {})) {
        if (!key.startsWith('preset:')) continue;
        store.themes[newThemeId()] = themeFromOldSettings(key.slice(7), settings);
    }
}

export function readStore(value) {
    const store = emptyStore();
    if (!value || typeof value !== 'object') return store;

    store.enabled = value.enabled === true;

    if (value.version === 1 || value.version === 2) {
        migrateOld(value, store);
        return store;
    }
    if (value.version !== VERSION) return store;

    for (const [id, theme] of Object.entries(value.themes || {})) {
        if (!id.startsWith('theme:') || !theme || typeof theme !== 'object') continue;
        store.themes[id] = normalizeTheme(theme);
    }
    if (typeof value.defaultThemeId === 'string' && store.themes[value.defaultThemeId]) {
        store.defaultThemeId = value.defaultThemeId;
    }
    for (const [key, id] of Object.entries(value.assignments || {})) {
        if (key.startsWith('char:') && store.themes[id]) store.assignments[key] = id;
    }
    return store;
}

export function themeIdFor(store, charKey) {
    const assigned = charKey && store.assignments[charKey];
    if (assigned && store.themes[assigned]) return assigned;
    return store.defaultThemeId && store.themes[store.defaultThemeId] ? store.defaultThemeId : null;
}

export function themeFor(store, charKey) {
    const id = themeIdFor(store, charKey);
    return id ? normalizeTheme(store.themes[id]) : null;
}

export function backgroundUrl(name) {
    return name ? '/backgrounds/' + encodeURIComponent(name) : '';
}

export function backgroundNames(data) {
    const list = Array.isArray(data) ? data : data?.images;
    if (!Array.isArray(list)) throw Error('Неизвестный формат альбома фонов');
    return list
        .map(item => (typeof item === 'string' ? item : item?.filename))
        .filter(name => typeof name === 'string');
}

export function cssVariables(theme) {
    return Object.entries(theme.vars)
        .map(([name, value]) => `${name}:${value};`)
        .join('');
}

// Переменные группируются только для показа в редакторе.
export function groupVars(theme) {
    const smart = [];
    const other = [];
    for (const name of Object.keys(theme.vars)) {
        (name.startsWith('--SmartTheme') ? smart : other).push(name);
    }
    const order = Object.values(ST_COLORS).map(([name]) => name);
    smart.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const rest = Object.keys(LABELS);
    other.sort((a, b) => rest.indexOf(a) - rest.indexOf(b));
    return { smart, other };
}

export function labelFor(name) {
    return LABELS[name] || Object.values(ST_COLORS).find(([v]) => v === name)?.[1] || name;
}
