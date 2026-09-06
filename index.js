import {
    KEY,
    DEFAULT,
    FONTS,
    normalize,
    readStore,
    targetKey,
    themeFor,
    backgroundUrl,
    backgroundNames,
    variables,
} from './core.js';

const ctx = () => SillyTavern.getContext();

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
};

const btn = (text, fn) => {
    const button = el('button', 'menu_button', text);
    button.type = 'button';
    button.onclick = fn;
    return button;
};

function start() {
    if (document.getElementById('wa-editor')) return;

    const c = ctx();
    if (!c.extensionSettings || !c.saveSettingsDebounced) {
        throw Error('Atelier: требуется API контекста SillyTavern');
    }

    // ---- состояние -------------------------------------------------------

    let state = readStore(c.extensionSettings[KEY]);
    let current = targetKey(c);
    let editing = current;
    let open = false;
    let tab = 'colors';
    let album = null;
    let albumError = '';
    let busy = false;

    const drafts = new Map();
    const hostListeners = new AbortController();

    const persist = () => {
        ctx().extensionSettings[KEY] = state;
        ctx().saveSettingsDebounced();
    };

    const draft = () => {
        if (!drafts.has(editing)) drafts.set(editing, themeFor(state, editing));
        return drafts.get(editing);
    };

    const dirty = () => JSON.stringify(draft()) !== JSON.stringify(themeFor(state, editing));

    // ---- разметка редактора ---------------------------------------------

    const panel = el('section');
    panel.id = 'wa-editor';
    panel.hidden = true;

    const header = el('header', 'wa-header');
    const heading = el('strong', '', 'Оформление · Atelier');
    const hostControls = el('span', 'wa-host-controls');
    header.append(heading, hostControls, btn('×', () => toggle(false)));

    const body = el('div', 'wa-body');

    const nav = el('nav', 'wa-tabs');
    nav.setAttribute('aria-label', 'Разделы оформления');

    const target = el('select');
    target.setAttribute('aria-label', 'Редактируемая тема');

    const enable = el('input');
    enable.type = 'checkbox';
    enable.checked = state.enabled;
    const enableLabel = el('label', 'wa-check');
    enableLabel.append(enable, document.createTextNode('Применять оформление Atelier'));
    enable.onchange = () => {
        state.enabled = enable.checked;
        persist();
        apply();
    };

    const content = el('div', 'wa-content');
    const preview = el('section', 'wa-preview');

    const status = el('div', 'wa-status');
    status.setAttribute('aria-live', 'polite');

    const foot = el('footer', 'wa-footer');
    const save = btn('Сохранить тему', () => {
        if (editing === 'global') state.global = normalize(draft());
        else state.themes[editing] = normalize(draft());
        persist();
        apply();
        status.textContent = 'Тема сохранена';
    });
    save.classList.add('wa-primary');
    foot.append(save, btn('Отменить', () => {
        drafts.delete(editing);
        render();
    }));

    body.append(enableLabel, target, nav, content, el('h4', '', 'Предпросмотр'), preview, status, foot);
    panel.append(header, body);

    const launcher = btn('✦', () => toggle());
    launcher.id = 'wa-launcher';
    launcher.title = 'Atelier · оформление чата';
    launcher.setAttribute('aria-label', launcher.title);

    const live = el('style');
    live.id = 'wa-live-style';
    document.head.append(live);
    document.body.append(panel, launcher);

    // ---- выбор редактируемой темы ---------------------------------------

    function targetLabel(key) {
        if (key === 'global') return 'Общая тема';
        return ctx().characters.find(x => 'char:' + x.avatar === key)?.name || key.slice(5);
    }

    function targets() {
        target.replaceChildren();
        const keys = [...new Set(['global', current, ...drafts.keys()])];
        for (const key of keys) {
            const option = el('option', '', targetLabel(key) + (key === 'global' ? '' : ' · персональная'));
            option.value = key;
            target.append(option);
        }
        target.value = editing;
    }

    target.onchange = () => {
        editing = target.value;
        render();
    };

    // ---- поля формы ------------------------------------------------------

    function set(key, value) {
        draft()[key] = value;
        renderPreview();
        status.textContent = 'Черновик · изменения видны в примере';
    }

    function field(label, input) {
        const wrapper = el('label', 'wa-field');
        wrapper.append(el('span', '', label), input);
        return wrapper;
    }

    function select(label, key, options) {
        const input = el('select');
        for (const [value, name] of options) {
            const option = el('option', '', name);
            option.value = value;
            input.append(option);
        }
        input.value = draft()[key];
        input.onchange = () => set(key, input.value);
        return field(label, input);
    }

    function range(label, key, min, max, step = 1) {
        const input = el('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = draft()[key];

        const wrapper = field(label, input);
        const out = el('output', '', String(input.value));
        wrapper.firstChild.append(out);

        input.oninput = () => {
            out.textContent = input.value;
            set(key, Number(input.value));
        };
        return wrapper;
    }

    // ---- вкладки ---------------------------------------------------------

    const sections = [
        ['colors', 'Цвета'],
        ['background', 'Фон'],
        ['text', 'Текст'],
        ['messages', 'Сообщения'],
        ['avatars', 'Аватарки'],
        ['themes', 'Темы'],
    ];

    for (const [id, label] of sections) {
        const button = btn(label, () => {
            tab = id;
            renderContent();
        });
        button.dataset.tab = id;
        nav.append(button);
    }

    const COLOR_LABELS = {
        accent: 'Акцент',
        text: 'Основной текст',
        quote: 'Реплики',
        italic: 'Курсив',
        underline: 'Подчёркивание',
        panel: 'Панели',
        user: 'Сообщения пользователя',
        assistant: 'Сообщения ИИ',
        border: 'Границы',
    };

    function render() {
        targets();
        renderContent();
    }

    function renderContent() {
        nav.querySelectorAll('button').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
        });
        content.replaceChildren();

        if (tab === 'colors') {
            const grid = el('div', 'wa-color-grid');
            for (const [key, label] of Object.entries(COLOR_LABELS)) {
                const input = el('input');
                input.type = 'color';
                input.value = draft()[key];
                input.oninput = () => set(key, input.value);
                grid.append(field(label, input));
            }
            content.append(grid);
        }

        if (tab === 'text') {
            content.append(
                select('Шрифт сообщений', 'font', FONTS.map(x => [x, x.split(',')[0]])),
                range('Размер текста', 'fontSize', 12, 28),
                range('Межстрочный интервал', 'line', 1.2, 2.2, .05),
                range('Между абзацами', 'gap', 0, 36),
            );
        }

        if (tab === 'messages') {
            content.append(
                select('Макет сообщений', 'layout', [
                    ['ripple', 'Портрет слева · Ripple'],
                    ['opposite', 'Портреты с разных сторон'],
                    ['compact', 'Компактные аватарки'],
                    ['cover', 'Портрет над текстом'],
                ]),
                range('Ширина чата', 'width', 500, 1800),
                range('Скругление сообщений', 'radius', 0, 40),
                range('Внутренние отступы', 'padding', 8, 40),
            );

            const check = el('input');
            check.type = 'checkbox';
            check.checked = draft().reverse;
            check.onchange = () => set('reverse', check.checked);
            content.append(field('Поменять стороны портретов', check));
        }

        if (tab === 'avatars') {
            content.append(
                range('Ширина портрета', 'avatarWidth', 48, 240),
                range('Скругление портрета', 'avatarRadius', 0, 120),
                select('Отображение изображения', 'avatarFit', [
                    ['contain', 'Показать целиком'],
                    ['cover', 'Заполнить с кадрированием'],
                ]),
                range('Вертикальная точка фокуса', 'focus', 0, 100),
            );
        }

        if (tab === 'background') renderAlbum();
        if (tab === 'themes') renderThemes();

        renderPreview();
        status.textContent = dirty() ? 'Есть несохранённый черновик' : 'Все изменения сохранены';
    }

    // ---- вкладка «Фон» ---------------------------------------------------

    function renderAlbum() {
        content.append(
            btn('Обновить альбом', () => loadAlbum()),
            btn('Без персонального фона', () => {
                set('background', '');
                renderContent();
            }),
        );

        const upload = el('input');
        upload.type = 'file';
        upload.accept = 'image/*';
        upload.disabled = busy;
        content.append(field('Загрузить в альбом Таверны', upload));

        upload.onchange = async () => {
            const file = upload.files[0];
            if (!file) return;

            // Черновик может смениться, пока идёт загрузка: пишем фон тому,
            // кого редактировали в момент выбора файла.
            const owner = editing;
            busy = true;
            renderContent();

            try {
                const form = new FormData();
                form.append('avatar', file);
                const res = await fetch('/api/backgrounds/upload', {
                    method: 'POST',
                    headers: ctx().getRequestHeaders({ omitContentType: true }),
                    body: form,
                });
                if (!res.ok) throw Error('Ошибка загрузки ' + res.status);

                const name = await res.text();
                const theme = drafts.get(owner) || themeFor(state, owner);
                theme.background = name;
                drafts.set(owner, theme);

                busy = false;
                await loadAlbum();
                status.textContent = 'Фон загружен. Сохрани тему, чтобы применить.';
            } catch (e) {
                status.textContent = e.message;
            } finally {
                busy = false;
                if (tab === 'background') renderContent();
            }
        };

        const grid = el('div', 'wa-album');

        if (album === null) {
            content.append(el('p', '', albumError || 'Загрузка альбома…'));
            if (!busy && !albumError) void loadAlbum();
        } else {
            for (const name of album) {
                const button = btn('', () => {
                    set('background', name);
                    renderContent();
                });
                button.title = name;
                button.setAttribute('aria-label', name);
                button.setAttribute('aria-pressed', String(draft().background === name));

                const img = el('img');
                img.loading = 'lazy';
                img.src = '/thumbnail?type=bg&file=' + encodeURIComponent(name);
                img.alt = name;
                img.onerror = () => { img.remove(); };

                button.append(img, el('span', '', name));
                grid.append(button);
            }
        }
        content.append(grid);

        if (draft().background && album && !album.includes(draft().background)) {
            content.append(el('p', 'wa-warning', 'Фон недоступен. Будет использован общий фон.'));
        }

        content.append(
            select('Масштаб', 'fit', [
                ['cover', 'Заполнить экран'],
                ['contain', 'Показать целиком'],
            ]),
            range('Затемнение', 'dim', 0, 85),
            range('Размытие', 'blur', 0, 12),
        );
    }

    async function loadAlbum() {
        if (busy && album !== null) return;
        busy = true;
        albumError = '';
        try {
            const res = await fetch('/api/backgrounds/all', {
                method: 'POST',
                headers: ctx().getRequestHeaders(),
                body: '{}',
            });
            if (!res.ok) throw Error('Альбом недоступен: ' + res.status);
            album = backgroundNames(await res.json());
        } catch (e) {
            albumError = e.message;
            status.textContent = albumError;
        } finally {
            busy = false;
            if (tab === 'background') renderContent();
            apply();
        }
    }

    // ---- вкладка «Темы» --------------------------------------------------

    function renderThemes() {
        content.append(
            el('p', '', 'Тема: ' + targetLabel(editing)),
            btn('Скопировать общую в черновик', () => {
                drafts.set(editing, normalize(state.global));
                render();
            }),
        );

        if (editing !== 'global') {
            content.append(btn('Вернуть общую тему', () => {
                if (!confirm('Удалить персональное оформление и использовать общую тему?')) return;
                delete state.themes[editing];
                drafts.delete(editing);
                persist();
                apply();
                render();
            }));
        }

        content.append(btn('Сохранить как пресет', () => {
            const name = prompt('Название пресета');
            if (!name?.trim()) return;
            const key = 'preset:' + name.trim().slice(0, 80);
            if (state.presets[key] && !confirm('Заменить существующий пресет?')) return;
            state.presets[key] = normalize(draft());
            persist();
            renderContent();
        }));

        for (const [key, theme] of Object.entries(state.presets)) {
            const row = el('div', 'wa-preset');
            row.append(
                btn(key.slice(7), () => {
                    drafts.set(editing, normalize(theme));
                    render();
                }),
                btn('×', () => {
                    if (!confirm('Удалить пресет?')) return;
                    delete state.presets[key];
                    persist();
                    renderContent();
                }),
            );
            content.append(row);
        }

        content.append(btn('Экспорт темы', () => {
            const payload = {
                format: 'wani-atelier',
                version: 1,
                name: targetLabel(editing),
                theme: draft(),
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = el('a');
            link.href = url;
            link.download = 'atelier-theme.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }));

        const input = el('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const owner = editing;
            try {
                if (file.size > 1000000) throw Error('Файл слишком большой');
                const data = JSON.parse(await file.text());
                if (data.format !== 'wani-atelier' || data.version !== 1 || !data.theme) {
                    throw Error('Это не тема Atelier v1');
                }
                drafts.set(owner, normalize(data.theme));
                render();
                status.textContent = 'Импортировано в черновик';
            } catch (e) {
                status.textContent = e.message;
            }
        };

        content.append(
            field('Импорт темы', input),
            el('p', 'wa-help', 'Экспорт содержит настройки и имя файла фона. Изображения не включены.'),
        );
    }

    // ---- предпросмотр ----------------------------------------------------

    function resolvedBackground(theme) {
        if (!theme.background) return '';
        if (album === null || album.includes(theme.background)) return theme.background;
        const fallback = state.global.background;
        return fallback && album.includes(fallback) ? fallback : '';
    }

    function renderPreview() {
        const theme = normalize(draft());
        preview.style.cssText = variables(theme);
        preview.dataset.layout = theme.layout;
        preview.dataset.reverse = String(theme.reverse);

        const bg = resolvedBackground(theme);
        const dim = '#000000' + Math.round(theme.dim * 2.55).toString(16).padStart(2, '0');
        preview.style.backgroundImage = bg
            ? `linear-gradient(${dim},${dim}),url("${backgroundUrl(bg)}")`
            : '';
        preview.style.backgroundSize = theme.fit;
        preview.replaceChildren();

        const char = ctx().characters.find(x => 'char:' + x.avatar === editing)
            || ctx().characters[ctx().characterId];

        for (const user of [true, false]) {
            const message = el('article', 'wa-message');
            message.dataset.user = String(user);

            const avatarBox = el('div', 'wa-avatar');
            const pic = el('img');
            const src = user
                ? document.querySelector('#chat .mes[is_user="true"] .avatar img')?.getAttribute('src')
                : char?.avatar ? '/thumbnail?type=avatar&file=' + encodeURIComponent(char.avatar) : '';

            if (src) {
                pic.src = src;
                pic.alt = user ? ctx().name1 || 'Пользователь' : char?.name || 'Персонаж';
                avatarBox.append(pic);
            } else {
                avatarBox.textContent = user ? 'Я' : '✦';
            }

            const block = el('div', 'wa-message-body');
            block.append(el('div', 'wa-name', user ? ctx().name1 || 'Пользователь' : char?.name || 'Персонаж'));

            const text = el('div', 'wa-prose');
            if (user) {
                const p = el('p');
                p.append(el('q', '', 'Если выйдем утром, успеем добраться до бухты?'));
                text.append(p);
            } else {
                const p1 = el('p', '', 'Он развернул карту и придвинул её к краю стола. За открытым окном слышались голоса с причала; ветер шевелил бумагу.');
                const p2 = el('p');
                p2.append(el('q', '', 'Успеем. Только возьми куртку — у воды холодно.'), ' Он отметил тропинку карандашом и поднял взгляд.');
                const p3 = el('p');
                p3.append(el('em', '', 'Всё необходимое уже было собрано.'), ' Осталось дождаться утра.');
                text.append(p1, p2, p3);
            }

            block.append(text);
            message.append(avatarBox, block);
            preview.append(message);
        }
    }

    // ---- применение к настоящей странице ---------------------------------

    function apply() {
        document.body.classList.toggle('wa-enabled', state.enabled);
        if (!state.enabled) {
            live.textContent = '';
            return;
        }

        const theme = themeFor(state, current);
        const bg = resolvedBackground(theme);
        document.body.dataset.waLayout = theme.layout;
        document.body.dataset.waReverse = String(theme.reverse);

        const smartTheme = [
            `--SmartThemeBodyColor:${theme.text};`,
            `--SmartThemeEmColor:${theme.italic};`,
            `--SmartThemeQuoteColor:${theme.quote};`,
            `--SmartThemeUnderlineColor:${theme.underline};`,
            `--SmartThemeBlurTintColor:${theme.panel};`,
            `--SmartThemeBorderColor:${theme.border};`,
            `--SmartThemeUserMesBlurTintColor:${theme.user};`,
            `--SmartThemeBotMesBlurTintColor:${theme.assistant};`,
        ].join('');

        const backgroundRule = bg
            ? `background-image:linear-gradient(rgba(0,0,0,${theme.dim / 100}),rgba(0,0,0,${theme.dim / 100})),url("${backgroundUrl(bg)}")!important;`
            + `background-size:${theme.fit}!important;`
            + `filter:blur(${theme.blur}px)!important;`
            : '';

        live.textContent =
            `body.wa-enabled{${variables(theme)}${smartTheme}}`
            + `body.wa-enabled #sheld{max-width:${theme.width}px;}`
            + `body.wa-enabled #bg1,body.wa-enabled #bg_custom{${backgroundRule}}`;
    }

    // ---- открытие, закрытие, место под панель ----------------------------

    function reserve() {
        document.body.classList.toggle('wa-editor-open', open && panel.dataset.rptDocked !== 'true');
        document.body.style.setProperty('--wa-editor-space', (panel.getBoundingClientRect().width + 30) + 'px');
    }

    new ResizeObserver(reserve).observe(panel);

    function toggle(value) {
        if (panel.dataset.rptDocked === 'true') {
            window.WaniRoleplayTools?.open('atelier');
            return;
        }
        if (value === false && dirty() && !confirm('Закрыть редактор? Черновик останется до перезагрузки.')) return;
        open = value ?? !open;
        panel.hidden = !open;
        reserve();
        if (open) render();
    }

    // ---- интеграция с Roleplay Tools -------------------------------------

    function connect() {
        const host = window.WaniRoleplayTools;
        if (host?.version !== 1) return;
        host.register({
            id: 'atelier',
            title: 'Atelier · Оформление',
            defaultPage: { id: 'appearance', name: 'Оформление' },
            element: panel,
            launcher,
            controls: hostControls,
            display: 'flex',
            minHeight: 300,
            onMount() {
                panel.hidden = false;
                reserve();
            },
            onShow() {
                render();
            },
            onRelease() {
                panel.hidden = !open;
                reserve();
            },
        });
    }

    window.addEventListener('wani-roleplay-tools:ready', connect, { signal: hostListeners.signal });

    // ---- события Таверны -------------------------------------------------

    c.eventSource.on(c.eventTypes.CHAT_CHANGED, () => {
        current = targetKey(ctx());
        editing = current;
        apply();
        render();
    });

    if (c.eventTypes.CHARACTER_RENAMED) {
        c.eventSource.on(c.eventTypes.CHARACTER_RENAMED, (oldName, newName) => {
            for (const table of [state.themes]) {
                if (Object.hasOwn(table, 'char:' + oldName)) {
                    table['char:' + newName] = table['char:' + oldName];
                    delete table['char:' + oldName];
                }
            }
            if (drafts.has('char:' + oldName)) {
                drafts.set('char:' + newName, drafts.get('char:' + oldName));
                drafts.delete('char:' + oldName);
            }
            if (editing === 'char:' + oldName) editing = 'char:' + newName;
            current = targetKey(ctx());
            persist();
            apply();
            render();
        });
    }

    // ---- перетаскивание круглой кнопки -----------------------------------
    // Pointer events distinguish a drag from a click; the launcher stays round and movable.

    let drag = null;
    let moved = false;

    launcher.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, left: launcher.offsetLeft, top: launcher.offsetTop };
        moved = false;
        launcher.setPointerCapture(e.pointerId);
    });

    launcher.addEventListener('pointermove', e => {
        if (!drag) return;
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 5) moved = true;
        if (moved) {
            launcher.style.left = Math.max(0, Math.min(innerWidth - 44, drag.left + e.clientX - drag.x)) + 'px';
            launcher.style.top = Math.max(0, Math.min(innerHeight - 44, drag.top + e.clientY - drag.y)) + 'px';
            launcher.style.bottom = 'auto';
        }
    });

    launcher.addEventListener('pointerup', () => drag = null);
    launcher.addEventListener('pointercancel', () => drag = null);

    launcher.addEventListener('click', e => {
        if (moved) {
            e.stopImmediatePropagation();
            e.preventDefault();
            moved = false;
        }
    }, true);

    // ---- запуск ----------------------------------------------------------

    render();
    apply();
    connect();
    void loadAlbum();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
