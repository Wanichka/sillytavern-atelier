import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    VERSION, readStore, emptyStore, importTheme, normalizeTheme, normalizeName,
    newThemeId, themeIdFor, themeFor, characterKey, backgroundNames,
    cssVariables, groupVars, labelFor, parseColor, formatColor,
    varsFromCss, isSafeCssValue, isSafeVarName,
} from '../core.js';

const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url)));
const stTheme = fixture('st-theme.json');
const moonlit = fixture('moonlit-preset.json');

test('импорт штатной темы Таверны берёт цвета и шрифт из custom_css', () => {
    const theme = importTheme(stTheme);
    assert.equal(theme.name, 'Olve and gold');
    assert.equal(theme.vars['--SmartThemeBodyColor'], 'rgba(238, 229, 216, 1)');
    assert.equal(theme.vars['--SmartThemeQuoteColor'], 'rgba(199, 138, 97, 1)');
    assert.equal(theme.vars['--SmartThemeBotMesBlurTintColor'], 'rgba(32, 37, 33, 0.31)');
    // шрифт спрятан в custom_css, в блоке :root
    assert.equal(theme.vars['--mainFontFamily'], 'Georgia, "Times New Roman", serif');
    assert.equal(theme.vars['--monoFontFamily'], '"Courier New", monospace');
    // поведение и раскладка в тему не попадают
    assert.equal('--chat_width' in theme.vars, false);
    assert.equal(Object.keys(theme.vars).some(k => k.includes('bogus')), false);
});

test('импорт пресета Moonlit берёт значения и отбрасывает галки', () => {
    const theme = importTheme(moonlit);
    assert.equal(theme.name, 'Olve and gold');
    assert.equal(theme.vars['--customThemeColor'], 'rgba(185, 145, 75, 1)');
    assert.equal(theme.vars['--sheldBackgroundColor'], 'rgba(7, 9, 7, 0.93)');
    assert.equal(theme.vars['--messageTextFontSize'], '17px');
    // логические переключатели Moonlit — не переменные
    assert.equal('--hideAvatarBorder' in theme.vars, false);
    assert.equal('--forceFixedMenuHeight' in theme.vars, false);
    assert.equal('--rawCustomCss' in theme.vars, false);
    // внутренняя кухня темы оформления в список не входит
    for (const skipped of ['--messageLineHeight', '--messageTextLetterSpacing',
        '--charNameFontSize', '--userNameFontSize', '--custom-ChatAvatar',
        '--customlastInContext', '--customCSS-ChatGradientBlur',
        '--custom-EchoAvatarWidth', '--customRippleAvatarWidth', '--VN-sheld-height',
        '--favoriteSymbol', '--mobileQRsBarHeight']) {
        assert.equal(skipped in theme.vars, false, skipped + ' не должен попадать в тему');
    }
});

test('два файла одной темы дополняют друг друга', () => {
    const merged = normalizeTheme({
        name: 'Olve and gold',
        vars: { ...importTheme(moonlit).vars, ...importTheme(stTheme).vars },
    });
    const { smart, other } = groupVars(merged);
    assert.equal(smart.length, 10, 'цвета Таверны');
    assert.equal(other.length, 14, 'настройки темы оформления');
    assert.equal(Object.keys(merged.vars).length, 24);
    // у каждого значения есть понятная подпись, безымянных строк нет
    for (const name of [...smart, ...other]) {
        assert.notEqual(labelFor(name), name, 'без подписи: ' + name);
    }
    assert.equal(labelFor('--SmartThemeQuoteColor'), 'Реплики');
    assert.equal(labelFor('--sheldBackgroundColor'), 'Фон окна чата');
});

test('в CSS уходит ровно то, что в снимке', () => {
    const css = cssVariables(normalizeTheme({
        vars: { '--mainFontFamily': 'Georgia, serif', '--messageTextFontSize': '17px' },
    }));
    assert.equal(css, '--mainFontFamily:Georgia, serif;--messageTextFontSize:17px;');
});

test('опасные значения и имена не проходят', () => {
    assert.equal(isSafeCssValue('rgba(1, 2, 3, 0.5)'), true);
    assert.equal(isSafeCssValue('calc(var(--x) + 1rem)'), true);
    assert.equal(isSafeCssValue('red; } body { display: none'), false);
    assert.equal(isSafeCssValue('red /* хитрость */'), false);
    assert.equal(isSafeVarName('--customThemeColor'), true);
    assert.equal(isSafeVarName('color'), false);
    assert.equal(isSafeVarName('--a;b'), false);

    const theme = normalizeTheme({
        vars: {
            '--customThemeColor': 'red',              // разрешено
            'customThemeColor': 'red',                // не переменная
            '--customTopBarColor': 'red;}x{',         // опасное значение
            '--VN-sheld-height': '40dvh',             // не в белом списке
        },
    });
    assert.deepEqual(Object.keys(theme.vars), ['--customThemeColor']);
});

test('custom_css отдаёт только объявления переменных', () => {
    const vars = varsFromCss('/* шапка */\n:root {\n  --mainFontFamily: Georgia !important;\n}\nbody { display: none; }');
    assert.deepEqual(vars, { '--mainFontFamily': 'Georgia' });
});

test('цвета читаются в обоих написаниях', () => {
    assert.deepEqual(parseColor('rgba(19, 28, 32, 0.31)'), { hex: '#131c20', alpha: 31 });
    assert.deepEqual(parseColor('rgb(255,255,255)'), { hex: '#ffffff', alpha: 100 });
    assert.deepEqual(parseColor('#0A1519'), { hex: '#0a1519', alpha: 100 });
    assert.equal(parseColor('calc(1px)'), null);
    assert.equal(formatColor('#131c20', 31), 'rgba(19, 28, 32, 0.31)');
});

test('одна тема на нескольких персонажах, откат к теме по умолчанию', () => {
    const id = newThemeId();
    const store = readStore({
        version: VERSION,
        defaultThemeId: id,
        themes: { [id]: { name: 'Морская', vars: { '--SmartThemeBodyColor': '#112233' } } },
        assignments: { 'char:law.png': id },
    });
    assert.equal(themeFor(store, 'char:law.png').vars['--SmartThemeBodyColor'], '#112233');
    assert.equal(themeFor(store, 'char:kid.png').vars['--SmartThemeBodyColor'], '#112233');
    assert.equal(themeFor(emptyStore(), 'char:kid.png'), null);
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

test('темы из прошлых версий переезжают в переменные', () => {
    const store = readStore({
        version: 2,
        enabled: true,
        themes: {
            'theme:old': {
                name: 'Морская', text: '#e6dfd3', quote: '#cd956c',
                user: '#172227', userOpacity: 31, font: 'Georgia, serif',
                background: 'sea.png', dim: 20,
            },
        },
        defaultThemeId: 'theme:old',
        assignments: { 'char:law.png': 'theme:old' },
    });
    const theme = themeFor(store, 'char:law.png');
    assert.equal(theme.name, 'Морская');
    assert.equal(theme.vars['--SmartThemeBodyColor'], '#e6dfd3');
    assert.equal(theme.vars['--SmartThemeUserMesBlurTintColor'], 'rgba(23, 34, 39, 0.31)');
    assert.equal(theme.vars['--mainFontFamily'], 'Georgia, serif');
    assert.equal(theme.background, 'sea.png');
    assert.equal(theme.dim, 20);
});

test('неизвестный формат отклоняется понятно', () => {
    assert.throws(() => importTheme({ foo: 1 }), /Не узнаю формат/);
    assert.throws(() => importTheme(null), /не похож на тему/);
    assert.throws(() => importTheme({ moonlitEchoesPreset: true, settings: { a: false } }), /нет значений/);
});

test('прочее: имена, персонаж, альбом', () => {
    assert.equal(normalizeName('  Морская\u0007  '), 'Морская');
    assert.equal(normalizeName(''), 'Без названия');
    assert.equal(characterKey({ characters: [{ avatar: 'law.png' }], characterId: 0 }), 'char:law.png');
    assert.equal(characterKey({ groupId: 5 }), null);
    assert.deepEqual(backgroundNames({ images: [{ filename: 'b.png' }, 'c.png'] }), ['b.png', 'c.png']);
    assert.throws(() => backgroundNames({}));
});
