import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT, VERSION, readStore, emptyStore, normalizeSettings, normalizeName,
    newThemeId, themeIdFor, settingsFor, characterKey, backgroundNames,
    themeVariables, rgba, isSafeFont,
} from '../core.js';

test('одна тема на нескольких персонажах: правка доходит до всех', () => {
    const id = newThemeId();
    const store = readStore({
        version: VERSION,
        themes: { [id]: { name: 'Морская', text: '#112233' } },
        assignments: { 'char:law.png': id, 'char:kid.png': id },
    });
    assert.equal(settingsFor(store, 'char:law.png').text, '#112233');
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
    assert.equal(settingsFor(emptyStore(), 'char:unknown.png').text, DEFAULT.text);
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

test('перенос со старого формата сохраняет цвета и привязки', () => {
    const store = readStore({
        version: 1,
        enabled: true,
        global: { text: '#aaaaaa', layout: 'ripple' },
        themes: { 'char:law.png': { quote: '#bbbbbb' } },
        presets: { 'preset:Морская': { accent: '#cccccc' } },
    });
    assert.equal(store.version, VERSION);
    assert.equal(store.enabled, true);
    assert.equal(Object.keys(store.themes).length, 3);
    assert.equal(settingsFor(store, 'char:law.png').quote, '#bbbbbb');
    assert.equal(settingsFor(store, 'char:other.png').text, '#aaaaaa');
    assert.ok(Object.values(store.themes).some(t => t.name === 'Морская'));
});

test('настройки макетов из старых версий отбрасываются', () => {
    const settings = normalizeSettings({ text: '#aaaaaa', layout: 'ripple', avatarWidth: 200, width: 900 });
    assert.equal(settings.text, '#aaaaaa');
    assert.equal('layout' in settings, false);
    assert.equal('avatarWidth' in settings, false);
    assert.equal('width' in settings, false);
});

test('импорт отбрасывает опасные значения', () => {
    const settings = normalizeSettings({
        text: 'red; background: url(evil)',
        font: 'Georgia, serif; } body { display:none',
        fontSize: 999,
        userOpacity: -40,
        background: 'фон\u0007.png',
    });
    assert.equal(settings.text, DEFAULT.text);
    assert.equal(settings.font, DEFAULT.font);
    assert.equal(settings.fontSize, 28);
    assert.equal(settings.userOpacity, 0);
    assert.equal(settings.background, '');
    assert.ok(isSafeFont('Comic Sans MS, cursive'));
    assert.equal(isSafeFont('url(x)'), false);
});

test('названия чистятся, идентификаторы уникальны', () => {
    assert.equal(normalizeName('  Морская\u0007  '), 'Морская');
    assert.equal(normalizeName(''), 'Без названия');
    assert.equal(new Set(Array.from({ length: 50 }, newThemeId)).size, 50);
});

test('цвета уезжают в штатные переменные Таверны', () => {
    const css = themeVariables(normalizeSettings({ user: '#172227', userOpacity: 50, quote: '#cd956c' }));
    assert.ok(css.includes('--SmartThemeUserMesBlurTintColor:rgba(23,34,39,0.5);'), css);
    assert.ok(css.includes('--SmartThemeQuoteColor:#cd956c;'), css);
    assert.equal(rgba('#000000', 0), 'rgba(0,0,0,0)');
    assert.equal(characterKey({ characters: [{ avatar: 'law.png' }], characterId: 0 }), 'char:law.png');
    assert.equal(characterKey({ groupId: 5, characters: [], characterId: 0 }), null);
});

test('альбом фонов понимает оба формата ответа', () => {
    assert.deepEqual(backgroundNames(['a.png']), ['a.png']);
    assert.deepEqual(backgroundNames({ images: [{ filename: 'b.png' }, 'c.png', { x: 1 }] }), ['b.png', 'c.png']);
    assert.throws(() => backgroundNames({}));
});
