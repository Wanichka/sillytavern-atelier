/* =========================================================================
   Wani Atelier — модель данных.

   Тема — именованный набор: цвета, фон, шрифт. Назначается персонажу и
   переключается вместе с ним. Расположение сообщений, ширина чата и общий
   вид Таверны остаются за темой оформления (например, Moonlit Echoes) —
   Atelier их не трогает.
   ========================================================================= */

export const KEY = 'wani_atelier';
export const VERSION = 2;

export const DEFAULT = Object.freeze({
    // текст
    text: '#e6dfd3',
    quote: '#cd956c',
    italic: '#a9c0c4',
    underline: '#d7cbbb',
    accent: '#a9c0c4',
    shadow: '#000000',
    // подложки и их непрозрачность (0–100)
    assistant: '#10191c',
    assistantOpacity: 100,
    user: '#172227',
    userOpacity: 100,
    panel: '#111b20',
    panelOpacity: 100,
    chat: '#000000',
    chatOpacity: 0,
    border: '#35464d',
    // фон
    background: '',
    fit: 'cover',
    dim: 20,
    blur: 0,
    // шрифт
    font: 'Georgia, serif',
    fontSize: 17,
    line: 1.65,
    gap: 14,
});

export const FONTS = [
    'Georgia, serif',
    '"Noto Sans", sans-serif',
    'system-ui, sans-serif',
    '"Times New Roman", serif',
    'Garamond, serif',
    '"Palatino Linotype", serif',
    'Verdana, sans-serif',
    'Tahoma, sans-serif',
    '"Trebuchet MS", sans-serif',
    '"Courier New", monospace',
    '"Noto Sans Mono", monospace',
];

// Название шрифта попадает прямо в CSS, поэтому пропускаем только буквы,
// цифры, пробелы, запятые, дефисы и кавычки.
export function isSafeFont(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= 120
        && /^[\w\s,'"-]+$/u.test(value);
}

const enums = { fit: ['cover', 'contain'] };

const ranges = {
    assistantOpacity: [0, 100],
    userOpacity: [0, 100],
    panelOpacity: [0, 100],
    chatOpacity: [0, 100],
    dim: [0, 85],
    blur: [0, 12],
    fontSize: [12, 28],
    line: [1.2, 2.2],
    gap: [0, 36],
};

export function normalizeSettings(data = {}) {
    const settings = { ...DEFAULT };
    if (!data || typeof data !== 'object') return settings;

    for (const key of Object.keys(settings)) {
        const value = data[key];

        if (key === 'background') {
            if (typeof value === 'string' && value.length < 500 && !/[\x00-\x1f]/.test(value)) {
                settings[key] = value;
            }
        } else if (key === 'font') {
            if (isSafeFont(value)) settings[key] = value;
        } else if (enums[key]) {
            if (enums[key].includes(value)) settings[key] = value;
        } else if (ranges[key]) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                settings[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], value));
            }
        } else if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
            settings[key] = value;
        }
    }

    return settings;
}

export function normalizeName(value, fallback = 'Без названия') {
    if (typeof value !== 'string') return fallback;
    const name = value.replace(/[\x00-\x1f]/g, '').trim().slice(0, 60);
    return name || fallback;
}

let counter = 0;
export function newThemeId() {
    counter += 1;
    return 'theme:' + Date.now().toString(36) + '-' + counter.toString(36);
}

export function emptyStore() {
    return { version: VERSION, enabled: false, defaultThemeId: null, themes: {}, assignments: {} };
}

// Персонаж определяется файлом аватарки: имена карточек повторяются.
export function characterKey(ctx) {
    if (ctx.groupId != null) return null;
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    return avatar ? 'char:' + avatar : null;
}

// Старый формат хранил безымянные наборы под 'global' и 'char:…'.
function migrateV1(value, store) {
    if (value.global && typeof value.global === 'object') {
        const id = newThemeId();
        store.themes[id] = { name: 'Общая', ...normalizeSettings(value.global) };
        store.defaultThemeId = id;
    }

    let index = 0;
    for (const [key, settings] of Object.entries(value.themes || {})) {
        if (!key.startsWith('char:')) continue;
        index += 1;
        const id = newThemeId();
        store.themes[id] = { name: 'Перенесённая тема ' + index, ...normalizeSettings(settings) };
        store.assignments[key] = id;
    }

    for (const [key, settings] of Object.entries(value.presets || {})) {
        if (!key.startsWith('preset:')) continue;
        const id = newThemeId();
        store.themes[id] = { name: normalizeName(key.slice(7)), ...normalizeSettings(settings) };
    }
}

export function readStore(value) {
    const store = emptyStore();
    if (!value || typeof value !== 'object') return store;

    store.enabled = value.enabled === true;

    if (value.version === 1) {
        migrateV1(value, store);
        return store;
    }
    if (value.version !== VERSION) return store;

    for (const [id, theme] of Object.entries(value.themes || {})) {
        if (!id.startsWith('theme:') || !theme || typeof theme !== 'object') continue;
        store.themes[id] = { name: normalizeName(theme.name), ...normalizeSettings(theme) };
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

export function settingsFor(store, charKey) {
    const id = themeIdFor(store, charKey);
    return normalizeSettings(id ? store.themes[id] : null);
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

export function rgba(hex, opacity) {
    const value = parseInt(hex.slice(1), 16);
    const parts = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return `rgba(${parts.join(',')},${Math.round(opacity) / 100})`;
}

// Цвета уезжают в штатные переменные Таверны: их же читает тема оформления,
// поэтому панели и сообщения перекрашиваются её собственными правилами.
export function themeVariables(s) {
    return [
        `--SmartThemeBodyColor:${s.text};`,
        `--SmartThemeQuoteColor:${s.quote};`,
        `--SmartThemeEmColor:${s.italic};`,
        `--SmartThemeUnderlineColor:${s.underline};`,
        `--SmartThemeShadowColor:${s.shadow};`,
        `--SmartThemeBorderColor:${s.border};`,
        `--SmartThemeBlurTintColor:${rgba(s.panel, s.panelOpacity)};`,
        `--SmartThemeUserMesBlurTintColor:${rgba(s.user, s.userOpacity)};`,
        `--SmartThemeBotMesBlurTintColor:${rgba(s.assistant, s.assistantOpacity)};`,
        `--SmartThemeChatTintColor:${rgba(s.chat, s.chatOpacity)};`,
        `--wa-accent:${s.accent};`,
    ].join('');
}
