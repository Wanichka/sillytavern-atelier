export const KEY = 'wani_atelier';

export const DEFAULT = Object.freeze({
    accent: '#a9c0c4',
    text: '#e6dfd3',
    quote: '#cd956c',
    italic: '#a9c0c4',
    underline: '#d7cbbb',
    panel: '#111b20',
    user: '#172227',
    assistant: '#10191c',
    border: '#35464d',
    background: '',
    fit: 'cover',
    dim: 20,
    blur: 0,
    font: 'Georgia, serif',
    fontSize: 17,
    line: 1.65,
    gap: 14,
    radius: 14,
    padding: 20,
    avatarWidth: 140,
    avatarRadius: 12,
    avatarFit: 'contain',
    focus: 50,
    layout: 'opposite',
    reverse: false,
    width: 1100,
});

export const FONTS = [
    'Georgia, serif',
    'system-ui, sans-serif',
    '"Times New Roman", serif',
    '"Courier New", monospace',
];

const enums = {
    font: FONTS,
    fit: ['cover', 'contain'],
    avatarFit: ['contain', 'cover'],
    layout: ['ripple', 'opposite', 'compact', 'cover'],
};

const ranges = {
    dim: [0, 85],
    blur: [0, 12],
    fontSize: [12, 28],
    line: [1.2, 2.2],
    gap: [0, 36],
    radius: [0, 40],
    padding: [8, 40],
    avatarWidth: [48, 240],
    avatarRadius: [0, 120],
    focus: [0, 100],
    width: [500, 1800],
};

// Only keys present in DEFAULT survive. Anything else in the input is dropped,
// so an imported file cannot smuggle extra properties or CSS into a theme.
export function normalize(data = {}) {
    const theme = { ...DEFAULT };
    if (!data || typeof data !== 'object') return theme;

    for (const key of Object.keys(theme)) {
        const value = data[key];

        if (key === 'background') {
            if (typeof value === 'string' && value.length < 500 && !/[\x00-\x1f]/.test(value)) {
                theme[key] = value;
            }
        } else if (key === 'reverse') {
            theme[key] = value === true;
        } else if (enums[key]) {
            if (enums[key].includes(value)) theme[key] = value;
        } else if (ranges[key]) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                theme[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], value));
            }
        } else if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
            theme[key] = value;
        }
    }

    return theme;
}

// Themes are keyed by avatar file name, not by display name: two cards can
// share a name. Group chats fall back to the general theme.
export function targetKey(ctx) {
    if (ctx.groupId != null) return 'global';
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    return avatar ? 'char:' + avatar : 'global';
}

export function readStore(value) {
    const store = {
        version: 1,
        enabled: false,
        global: normalize(),
        themes: {},
        presets: {},
    };

    if (!value || value.version !== 1) return store;

    store.enabled = value.enabled === true;
    store.global = normalize(value.global);

    for (const [key, theme] of Object.entries(value.themes || {})) {
        if (key.startsWith('char:')) store.themes[key] = normalize(theme);
    }

    for (const [key, theme] of Object.entries(value.presets || {})) {
        if (key.startsWith('preset:')) store.presets[key] = normalize(theme);
    }

    return store;
}

export function themeFor(store, key) {
    return normalize(key === 'global' ? store.global : store.themes[key] || store.global);
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

// These three are unitless in CSS; everything else numeric is a pixel value.
const UNITLESS = ['line', 'dim', 'focus'];

export function variables(theme) {
    return Object.entries(theme)
        .filter(([key]) => key !== 'background')
        .map(([key, value]) => {
            const unit = typeof value === 'number' && !UNITLESS.includes(key) ? 'px' : '';
            return `--wa-${key}:${value}${unit};`;
        })
        .join('');
}
