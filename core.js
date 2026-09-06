/* =========================================================================
   Wani Atelier — модель данных.

   Тема — именованный набор настроек с собственным идентификатором.
   Персонажу назначается тема из списка; одна тема может стоять у многих.
   Тема по умолчанию применяется к тем, кому ничего не назначено.
   ========================================================================= */

export const KEY = 'wani_atelier';
export const VERSION = 2;

export const DEFAULT = Object.freeze({
    // цвета интерфейса и текста
    accent: '#a9c0c4',
    text: '#e6dfd3',
    quote: '#cd956c',
    italic: '#a9c0c4',
    underline: '#d7cbbb',
    border: '#35464d',
    // цвета подложек и их непрозрачность (0–100)
    panel: '#111b20',
    panelOpacity: 100,
    user: '#172227',
    userOpacity: 100,
    assistant: '#10191c',
    assistantOpacity: 100,
    // фон
    background: '',
    fit: 'cover',
    dim: 20,
    blur: 0,
    // текст
    font: 'Georgia, serif',
    fontSize: 17,
    line: 1.65,
    gap: 14,
    // геометрия
    radius: 14,
    padding: 20,
    width: 1100,
    // портреты
    layout: 'side',
    reverse: false,
    avatarWidth: 140,
    avatarRadius: 12,
    avatarFit: 'full',
    avatarRatio: 0.75,
    focus: 50,
});

// Готовые варианты. Свой шрифт можно вписать вручную — см. isSafeFont.
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

export const LAYOUTS = [
    ['side', 'Портреты с одной стороны'],
    ['sides', 'Портреты с разных сторон'],
];

// Название шрифта попадает прямо в CSS, поэтому пропускаем только буквы,
// цифры, пробелы, запятые, дефисы и кавычки.
export function isSafeFont(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= 120
        && /^[\w\s,'"-]+$/u.test(value);
}

const enums = {
    fit: ['cover', 'contain'],
    avatarFit: ['full', 'crop'],
    layout: LAYOUTS.map(([id]) => id),
};

const ranges = {
    panelOpacity: [0, 100],
    userOpacity: [0, 100],
    assistantOpacity: [0, 100],
    dim: [0, 85],
    blur: [0, 12],
    fontSize: [12, 28],
    line: [1.2, 2.2],
    gap: [0, 36],
    radius: [0, 40],
    padding: [8, 40],
    width: [500, 1800],
    avatarWidth: [48, 240],
    avatarRadius: [0, 120],
    avatarRatio: [0.4, 2],
    focus: [0, 100],
};

// Значения из старого формата, чтобы ничего не потерялось при переносе.
const LEGACY_LAYOUTS = { ripple: 'side', opposite: 'sides', compact: 'side', cover: 'side' };
const LEGACY_AVATAR_FIT = { contain: 'full', cover: 'crop' };

export function normalizeSettings(data = {}) {
    const settings = { ...DEFAULT };
    if (!data || typeof data !== 'object') return settings;

    for (const key of Object.keys(settings)) {
        let value = data[key];

        if (key === 'layout' && LEGACY_LAYOUTS[value]) value = LEGACY_LAYOUTS[value];
        if (key === 'avatarFit' && LEGACY_AVATAR_FIT[value]) value = LEGACY_AVATAR_FIT[value];

        if (key === 'background') {
            if (typeof value === 'string' && value.length < 500 && !/[\x00-\x1f]/.test(value)) {
                settings[key] = value;
            }
        } else if (key === 'font') {
            if (isSafeFont(value)) settings[key] = value;
        } else if (key === 'reverse') {
            settings[key] = value === true;
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
    // skin — базовый вид Таверны, общий для всех тем.
    return { version: VERSION, enabled: false, skin: true, defaultThemeId: null, themes: {}, assignments: {} };
}

// Персонаж определяется файлом аватарки: имена карточек повторяются.
export function characterKey(ctx) {
    if (ctx.groupId != null) return null;
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    return avatar ? 'char:' + avatar : null;
}

function readThemes(value, store) {
    for (const [id, theme] of Object.entries(value || {})) {
        if (!id.startsWith('theme:') || !theme || typeof theme !== 'object') continue;
        store.themes[id] = { name: normalizeName(theme.name), ...normalizeSettings(theme) };
        delete store.themes[id].name0;
    }
}

// Старый формат (версия 1) хранил безымянные наборы под 'global' и 'char:…'.
// Переносим их в именованные темы, сохраняя привязки.
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
    store.skin = value.skin !== false;

    if (value.version === 1) {
        migrateV1(value, store);
        return store;
    }
    if (value.version !== VERSION) return store;

    readThemes(value.themes, store);

    if (typeof value.defaultThemeId === 'string' && store.themes[value.defaultThemeId]) {
        store.defaultThemeId = value.defaultThemeId;
    }

    for (const [key, id] of Object.entries(value.assignments || {})) {
        if (key.startsWith('char:') && store.themes[id]) store.assignments[key] = id;
    }

    return store;
}

// Какая тема действует для персонажа: назначенная, иначе тема по умолчанию.
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

const UNITLESS = ['line', 'dim', 'focus', 'avatarRatio', 'panelOpacity', 'userOpacity', 'assistantOpacity'];
const TINTED = { panel: 'panelOpacity', user: 'userOpacity', assistant: 'assistantOpacity' };

function rgba(hex, opacity) {
    const value = parseInt(hex.slice(1), 16);
    const parts = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return `rgba(${parts.join(',')},${Math.round(opacity) / 100})`;
}

export function variables(settings) {
    return Object.entries(settings)
        .filter(([key]) => key !== 'background' && key !== 'name')
        .map(([key, value]) => {
            if (TINTED[key]) return `--wa-${key}:${rgba(value, settings[TINTED[key]])};`;
            const unit = typeof value === 'number' && !UNITLESS.includes(key) ? 'px' : '';
            return `--wa-${key}:${value}${unit};`;
        })
        .join('');
}
