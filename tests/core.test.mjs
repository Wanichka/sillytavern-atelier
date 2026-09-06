import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT, VERSION, readStore, emptyStore, normalizeSettings, normalizeName,
    newThemeId, themeIdFor, settingsFor, characterKey, backgroundNames, variables, isSafeFont,
} from '../core.js';

test('одна тема на нескольких персонажах: правка доходит до всех', () => {
    const id = newThemeId();
    const store = readStore({
        version: VERSION,
        themes: { [id]: { name: 'Морская', text: '#112233' } },
        assignments: { 'char:law.png': id, 'char:kid.png': id },
    });
    assert.equal(settingsFor(store, 'char:law.png').text, '#112233');
    assert.equal(settingsFor(store, 'char:kid.png').text, '#112233');
    store.themes[id].text = '#445566';
    assert.equal(settingsFor(store, 'char:kid.png').text, '#445566');
});

test('без назначения берётся тема по умолчанию, без неё — базовые значения', () => {
    const id = newThemeId();
    const store = readStore({
        version: VERSION,
        defaultThemeId: id,
        themes: { [id]: { name: 'Общая', text: '#010203' } },
    });
    assert.equal(settingsFor(store, 'char:unknown.png').text, '#010203');
    assert.equal(themeIdFor(store, 'char:unknown.png'), id);

    const bare = emptyStore();
    assert.equal(settingsFor(bare, 'char:unknown.png').text, DEFAULT.text);
    assert.equal(themeIdFor(bare, 'char:unknown.png'), null);
});

test('битые ссылки не ломают хранилище', () => {
    const store = readStore({
        version: VERSION,
        defaultThemeId: 'theme:нет',
        themes: { 'theme:a': { name: 'A' }, 'плохой ключ': { name: 'B' } },
        assignments: { 'char:x.png': 'theme:нет', 'не персонаж': 'theme:a' },
    });
    assert.deepEqual(Object.keys(store.themes), ['theme:a']);
    assert.equal(store.defaultThemeId, null);
    assert.deepEqual(store.assignments, {});
});

test('перенос со старого формата сохраняет темы и привязки', () => {
    const store = readStore({
        version: 1,
        enabled: true,
        global: { text: '#aaaaaa', layout: 'ripple' },
        themes: { 'char:law.png': { quote: '#bbbbbb', layout: 'opposite', avatarFit: 'cover' } },
        presets: { 'preset:Морская': { accent: '#cccccc' } },
    });
    assert.equal(store.version, VERSION);
    assert.equal(store.enabled, true);
    assert.equal(Object.keys(store.themes).length, 3);
    assert.equal(settingsFor(store, 'char:law.png').quote, '#bbbbbb');
    assert.equal(settingsFor(store, 'char:other.png').text, '#aaaaaa');
    // старые названия макетов переезжают на новые
    assert.equal(settingsFor(store, 'char:other.png').layout, 'side');
    assert.equal(settingsFor(store, 'char:law.png').layout, 'sides');
    assert.equal(settingsFor(store, 'char:law.png').avatarFit, 'crop');
    assert.ok(Object.values(store.themes).some(t => t.name === 'Морская'));
});

test('импорт отбрасывает опасные значения', () => {
    const settings = normalizeSettings({
        text: 'red; background: url(evil)',
        font: 'Georgia, serif; } body { display:none',
        fontSize: 999,
        userOpacity: -40,
        avatarRatio: 'нет',
        reverse: 'да',
        background: 'фон\u0007.png',
    });
    assert.equal(settings.text, DEFAULT.text);
    assert.equal(settings.font, DEFAULT.font);
    assert.equal(settings.fontSize, 28);
    assert.equal(settings.userOpacity, 0);
    assert.equal(settings.avatarRatio, DEFAULT.avatarRatio);
    assert.equal(settings.reverse, false);
    assert.equal(settings.background, '');
    assert.ok(isSafeFont('Comic Sans MS, cursive'));
    assert.equal(isSafeFont('url(x)'), false);
});

test('названия чистятся, идентификаторы уникальны', () => {
    assert.equal(normalizeName('  Морская\u0007  '), 'Морская');
    assert.equal(normalizeName(''), 'Без названия');
    assert.equal(normalizeName('я'.repeat(200)).length, 60);
    const ids = new Set(Array.from({ length: 50 }, newThemeId));
    assert.equal(ids.size, 50);
});

test('непрозрачность превращается в rgba, персонаж берётся по файлу аватарки', () => {
    const css = variables(normalizeSettings({ user: '#172227', userOpacity: 50 }));
    assert.ok(css.includes('--wa-user:rgba(23,34,39,0.5);'), css);
    assert.equal(characterKey({ characters: [{ avatar: 'law.png' }], characterId: 0 }), 'char:law.png');
    assert.equal(characterKey({ groupId: 5, characters: [], characterId: 0 }), null);
});

test('альбом фонов понимает оба формата ответа', () => {
    assert.deepEqual(backgroundNames(['a.png']), ['a.png']);
    assert.deepEqual(backgroundNames({ images: [{ filename: 'b.png' }, 'c.png', { x: 1 }] }), ['b.png', 'c.png']);
    assert.throws(() => backgroundNames({}));
});
