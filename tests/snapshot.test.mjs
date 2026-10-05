import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotVars, ALLOWED } from '../core.js';

test('снимок с экрана берёт только белый список и безопасные значения', () => {
    const page = {
        '--SmartThemeBodyColor': ' rgba(220, 220, 210, 1)',
        '--customThemeColor': '#cd956c',
        '--mainFontFamily': '"Georgia", serif',
        '--sheldBackgroundColor': 'red;} body{display:none',
        '--somethingElse': '#fff',
        '--customTopBarColor': '',
    };
    const vars = snapshotVars(name => page[name]);
    assert.deepEqual(vars, {
        '--SmartThemeBodyColor': 'rgba(220, 220, 210, 1)',
        '--customThemeColor': '#cd956c',
        '--mainFontFamily': '"Georgia", serif',
    });
    assert.ok(Object.keys(vars).every(name => ALLOWED.has(name)));
});

test('пустая страница даёт пустой снимок', () => {
    assert.deepEqual(snapshotVars(() => undefined), {});
});
