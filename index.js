import {
    KEY, FONTS, VERSION,
    normalizeSettings, normalizeName, isSafeFont, newThemeId,
    readStore, characterKey, themeIdFor, settingsFor,
    backgroundUrl, backgroundNames, themeVariables,
} from './core.js';

const ctx = () => SillyTavern.getContext();

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
};

const btn = (text, fn, cls) => {
    const button = el('button', 'wa-btn' + (cls ? ' ' + cls : ''), text);
    button.type = 'button';
    button.onclick = fn;
    return button;
};

const iconBtn = (icon, title, fn, cls) => {
    const button = el('button', 'wa-btn wa-icon-btn' + (cls ? ' ' + cls : ''));
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.append(el('i', 'fa-solid ' + icon));
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

    let store = readStore(c.extensionSettings[KEY]);
    let currentKey = characterKey(c);
    let editingId = themeIdFor(store, currentKey);
    let open = false;
    let tab = 'colors';
    let album = null;
    let albumError = '';
    let busy = false;
    let localFonts = null;

    const drafts = new Map();
    const hostListeners = new AbortController();

    const persist = () => {
        ctx().extensionSettings[KEY] = store;
        ctx().saveSettingsDebounced();
    };

    const themeList = () => Object.entries(store.themes)
        .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ru'));

    function draft() {
        if (!editingId) return null;
        if (!drafts.has(editingId)) {
            drafts.set(editingId, normalizeSettings(store.themes[editingId]));
        }
        return drafts.get(editingId);
    }

    function dirty() {
        if (!editingId || !drafts.has(editingId)) return false;
        return JSON.stringify(drafts.get(editingId))
            !== JSON.stringify(normalizeSettings(store.themes[editingId]));
    }

    // ---- каркас ----------------------------------------------------------

    const panel = el('section');
    panel.id = 'wa-editor';
    panel.hidden = true;

    const header = el('header', 'wa-header');
    const hostControls = el('span', 'wa-host-controls');
    header.append(el('strong', '', 'Оформление · Atelier'), hostControls,
        iconBtn('fa-xmark', 'Закрыть', () => toggle(false), 'wa-close'));

    const body = el('div', 'wa-body');

    const enable = el('input');
    enable.type = 'checkbox';
    enable.id = 'wa-enable';
    enable.checked = store.enabled;
    enable.onchange = () => {
        store.enabled = enable.checked;
        persist();
        apply();
    };
    const enableLabel = el('label', 'wa-check');
    enableLabel.htmlFor = 'wa-enable';
    enableLabel.append(enable, document.createTextNode('Применять оформление Atelier'));

    const picker = el('select');
    picker.classList.add('wa-picker');
    picker.setAttribute('aria-label', 'Редактируемая тема');
    picker.onchange = () => {
        editingId = picker.value || null;
        render();
        apply();
    };

    const icons = el('div', 'wa-icons');
    const nav = el('nav', 'wa-tabs');
    nav.setAttribute('aria-label', 'Разделы оформления');
    const content = el('div', 'wa-content');
    const status = el('div', 'wa-status');
    status.setAttribute('aria-live', 'polite');

    const foot = el('footer', 'wa-footer');
    const save = btn('Сохранить тему', () => {
        if (!editingId) return;
        store.themes[editingId] = {
            name: store.themes[editingId].name,
            ...normalizeSettings(draft()),
        };
        drafts.delete(editingId);
        persist();
        render();
        apply();
        status.textContent = 'Тема сохранена';
    }, 'wa-primary');
    foot.append(save, btn('Отменить', () => {
        if (editingId) drafts.delete(editingId);
        render();
        apply();
    }));

    body.append(enableLabel, picker, icons, nav, content, status, foot);
    panel.append(header, body);

    const launcher = btn('✦', () => toggle(), 'wa-launcher-btn');
    launcher.id = 'wa-launcher';
    launcher.title = 'Atelier · оформление чата';
    launcher.setAttribute('aria-label', launcher.title);

    const live = el('style');
    live.id = 'wa-live-style';
    document.head.append(live);
    document.body.append(panel, launcher);

    // ---- поля ------------------------------------------------------------

    function set(key, value) {
        const current = draft();
        if (!current) return;
        current[key] = value;
        apply();
        status.textContent = 'Есть несохранённые изменения';
    }

    function field(label, control, extra) {
        const wrapper = el('label', 'wa-field');
        const caption = el('span', '', label);
        if (extra !== undefined) caption.append(el('output', '', String(extra)));
        wrapper.append(caption, control);
        return wrapper;
    }

    function colorRow(label, key, opacityKey) {
        const row = el('div', 'wa-color');
        row.append(el('span', 'wa-color-label', label));

        const swatch = el('input', 'wa-swatch');
        swatch.type = 'color';
        swatch.value = draft()[key];

        const hex = el('input', 'wa-hex');
        hex.type = 'text';
        hex.value = draft()[key];
        hex.spellcheck = false;

        swatch.oninput = () => {
            hex.value = swatch.value;
            set(key, swatch.value);
        };
        hex.onchange = () => {
            const value = hex.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(value)) {
                swatch.value = value;
                set(key, value);
            } else {
                hex.value = draft()[key];
                status.textContent = 'Цвет пишется как #rrggbb';
            }
        };

        const line = el('div', 'wa-color-line');
        line.append(swatch, hex);

        if (opacityKey) {
            const opacity = el('input', 'wa-opacity');
            opacity.type = 'range';
            opacity.min = 0;
            opacity.max = 100;
            opacity.value = draft()[opacityKey];
            const out = el('output', '', String(opacity.value));
            opacity.oninput = () => {
                out.textContent = opacity.value;
                set(opacityKey, Number(opacity.value));
            };
            line.append(opacity, out);
        }

        row.append(line);
        return row;
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

        const wrapper = field(label, input, input.value);
        const out = wrapper.querySelector('output');
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
    ];

    for (const [id, label] of sections) {
        const button = btn(label, () => {
            tab = id;
            renderContent();
        });
        button.dataset.tab = id;
        nav.append(button);
    }

    function characterName() {
        const list = ctx().characters || [];
        return list.find(x => 'char:' + x.avatar === currentKey)?.name || null;
    }

    function render() {
        picker.replaceChildren();
        const list = themeList();
        if (!list.length) {
            const option = el('option', '', '— тем пока нет —');
            option.value = '';
            picker.append(option);
        }
        for (const [id, theme] of list) {
            const option = el('option', '', theme.name
                + (id === store.defaultThemeId ? ' · по умолчанию' : ''));
            option.value = id;
            picker.append(option);
        }
        if (editingId && !store.themes[editingId]) editingId = null;
        picker.value = editingId || '';

        renderThemeRow();
        renderContent();
    }

    // Все кнопки одним рядом: управление темой, привязка, обмен.
    function renderThemeRow() {
        icons.replaceChildren(iconBtn('fa-plus', 'Новая тема', createTheme));
        if (!editingId) return;

        const theme = store.themes[editingId];

        icons.append(
            iconBtn('fa-pencil', 'Переименовать', () => {
                const name = prompt('Название темы', theme.name);
                if (name === null) return;
                theme.name = normalizeName(name, theme.name);
                persist();
                render();
            }),
            iconBtn('fa-clone', 'Дублировать', () => {
                const id = newThemeId();
                store.themes[id] = {
                    ...normalizeSettings(drafts.get(editingId) || theme),
                    name: normalizeName(theme.name + ' (копия)'),
                };
                editingId = id;
                persist();
                render();
                apply();
            }),
            iconBtn('fa-trash-can', 'Удалить тему', () => {
                if (!confirm(`Удалить тему «${theme.name}»?`)) return;
                delete store.themes[editingId];
                drafts.delete(editingId);
                for (const [key, id] of Object.entries(store.assignments)) {
                    if (id === editingId) delete store.assignments[key];
                }
                if (store.defaultThemeId === editingId) store.defaultThemeId = null;
                editingId = themeIdFor(store, currentKey) || themeList()[0]?.[0] || null;
                persist();
                render();
                apply();
            }, 'wa-danger'),
            el('span', 'wa-sep'),
        );

        const assigned = currentKey && store.assignments[currentKey] === editingId;
        const pin = iconBtn('fa-thumbtack',
            currentKey
                ? (assigned ? `Открепить от: ${characterName() || 'этот персонаж'}` : `Закрепить за: ${characterName() || 'этот персонаж'}`)
                : 'В групповом чате закрепить нельзя',
            () => {
                if (assigned) delete store.assignments[currentKey];
                else store.assignments[currentKey] = editingId;
                persist();
                render();
                apply();
            });
        pin.disabled = !currentKey;
        pin.setAttribute('aria-pressed', String(!!assigned));

        const star = iconBtn('fa-star', 'Тема по умолчанию', () => {
            store.defaultThemeId = editingId;
            persist();
            render();
            apply();
        });
        star.setAttribute('aria-pressed', String(store.defaultThemeId === editingId));

        icons.append(pin, star, el('span', 'wa-sep'), exportBtn(), importControl());
    }

    function createTheme() {
        const name = prompt('Название темы', 'Новая тема');
        if (name === null) return;
        const id = newThemeId();
        store.themes[id] = { name: normalizeName(name), ...normalizeSettings(null) };
        if (!store.defaultThemeId) store.defaultThemeId = id;
        editingId = id;
        persist();
        render();
        apply();
        status.textContent = 'Тема создана';
    }

    function exportBtn() {
        return iconBtn('fa-file-export', 'Экспорт темы в файл', () => {
            const theme = store.themes[editingId];
            const payload = {
                format: 'wani-atelier',
                version: VERSION,
                theme: { name: theme.name, ...normalizeSettings(drafts.get(editingId) || theme) },
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = el('a');
            link.href = url;
            link.download = 'atelier-' + theme.name.replace(/[^\wа-яё-]+/gi, '-').toLowerCase() + '.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    function importControl() {
        const input = el('input');
        input.type = 'file';
        input.accept = '.json';
        input.id = 'wa-import';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            try {
                if (file.size > 1000000) throw Error('Файл слишком большой');
                const data = JSON.parse(await file.text());
                if (data.format !== 'wani-atelier' || !data.theme) throw Error('Это не тема Atelier');
                const id = newThemeId();
                store.themes[id] = {
                    name: normalizeName(data.theme.name, 'Импортированная тема'),
                    ...normalizeSettings(data.theme),
                };
                editingId = id;
                persist();
                render();
                apply();
                status.textContent = 'Тема импортирована';
            } catch (e) {
                status.textContent = e.message;
            }
        };
        const label = el('label', 'wa-btn wa-icon-btn');
        label.htmlFor = 'wa-import';
        label.title = 'Импорт темы из файла';
        label.append(el('i', 'fa-solid fa-file-import'), input);
        return label;
    }

    function renderContent() {
        nav.querySelectorAll('button').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
        });
        content.replaceChildren();

        if (!editingId) {
            content.append(
                el('p', 'wa-help', 'Тем пока нет. Создай первую — назови как хочешь, потом закрепишь за персонажем.'),
                btn('Новая тема', createTheme, 'wa-primary'),
            );
            status.textContent = '';
            return;
        }

        if (tab === 'colors') renderColors();
        if (tab === 'background') renderAlbum();
        if (tab === 'text') renderText();

        status.textContent = dirty() ? 'Есть несохранённые изменения' : 'Все изменения сохранены';
    }

    function renderColors() {
        content.append(el('h5', 'wa-subtitle', 'Текст'));
        content.append(
            colorRow('Основной текст', 'text'),
            colorRow('Реплики', 'quote'),
            colorRow('Курсив', 'italic'),
            colorRow('Подчёркивание', 'underline'),
            colorRow('Акцент', 'accent'),
            colorRow('Тень текста', 'shadow'),
        );
        content.append(el('h5', 'wa-subtitle', 'Подложки'));
        content.append(
            colorRow('Сообщения персонажа', 'assistant', 'assistantOpacity'),
            colorRow('Мои сообщения', 'user', 'userOpacity'),
            colorRow('Панели', 'panel', 'panelOpacity'),
            colorRow('Фон чата', 'chat', 'chatOpacity'),
            colorRow('Границы', 'border'),
        );
    }

    function renderText() {
        const input = el('input');
        input.type = 'text';
        input.value = draft().font;
        input.setAttribute('list', 'wa-fonts');
        input.spellcheck = false;

        const datalist = el('datalist');
        datalist.id = 'wa-fonts';
        for (const value of [...new Set([...FONTS, ...(localFonts || [])])].filter(isSafeFont)) {
            const option = el('option');
            option.value = value;
            datalist.append(option);
        }

        input.onchange = () => {
            const value = input.value.trim();
            if (!isSafeFont(value)) {
                input.value = draft().font;
                status.textContent = 'Такое название шрифта использовать нельзя';
                return;
            }
            set('font', value);
        };

        content.append(field('Шрифт сообщений', input), datalist);

        if (localFonts === null) {
            content.append(
                btn('Добавить шрифты с компьютера', loadLocalFonts),
                el('p', 'wa-help', 'Выбери из списка или впиши название вручную. Кнопка добавляет в список шрифты системы — работает в Chrome, спросит разрешение.'),
            );
        } else {
            content.append(el('p', 'wa-help', `Из системы подтянуто шрифтов: ${localFonts.length}.`));
        }

        content.append(
            range('Размер текста', 'fontSize', 12, 28),
            range('Межстрочный интервал', 'line', 1.2, 2.2, .05),
            range('Между абзацами', 'gap', 0, 36),
        );
    }

    async function loadLocalFonts() {
        if (typeof window.queryLocalFonts !== 'function') {
            localFonts = [];
            status.textContent = 'Этот браузер не умеет читать список системных шрифтов';
            renderContent();
            return;
        }
        try {
            const found = await window.queryLocalFonts();
            localFonts = [...new Set(found.map(f => f.family))].filter(isSafeFont).sort();
            status.textContent = `Найдено шрифтов: ${localFonts.length}`;
        } catch (e) {
            localFonts = [];
            status.textContent = 'Доступ к шрифтам не получен: ' + e.message;
        }
        renderContent();
    }

    // ---- фон -------------------------------------------------------------

    function renderAlbum() {
        const top = el('div', 'wa-actions');
        top.append(
            btn('Обновить альбом', () => loadAlbum()),
            btn('Без своего фона', () => {
                set('background', '');
                renderContent();
            }),
        );
        content.append(top, el('p', 'wa-help', 'Без своего фона тема берёт фон темы по умолчанию, а если и его нет — оставляет фон Таверны.'));

        const upload = el('input');
        upload.type = 'file';
        upload.accept = 'image/*';
        upload.disabled = busy;
        upload.id = 'wa-bg-upload';
        const uploadLabel = el('label', 'wa-btn');
        uploadLabel.htmlFor = 'wa-bg-upload';
        uploadLabel.textContent = busy ? 'Загрузка…' : 'Загрузить в альбом Таверны';
        content.append(uploadLabel, upload);

        upload.onchange = async () => {
            const file = upload.files[0];
            if (!file) return;
            const owner = editingId;
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
                if (!drafts.has(owner)) drafts.set(owner, normalizeSettings(store.themes[owner]));
                drafts.get(owner).background = name;
                busy = false;
                await loadAlbum();
                status.textContent = 'Фон загружен. Сохрани тему, чтобы закрепить.';
            } catch (e) {
                status.textContent = e.message;
            } finally {
                busy = false;
                if (tab === 'background') renderContent();
            }
        };

        if (album === null) {
            content.append(el('p', 'wa-help', albumError || 'Загрузка альбома…'));
            if (!busy && !albumError) void loadAlbum();
        } else {
            const grid = el('div', 'wa-album');
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
            content.append(grid);
        }

        if (draft().background && album && !album.includes(draft().background)) {
            content.append(el('p', 'wa-warning', 'Фон недоступен — будет использован запасной.'));
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

    function resolvedBackground(settings) {
        const candidates = [settings.background];
        const fallback = store.defaultThemeId && store.themes[store.defaultThemeId]?.background;
        if (fallback) candidates.push(fallback);
        for (const name of candidates) {
            if (name && (album === null || album.includes(name))) return name;
        }
        return '';
    }

    // ---- применение ------------------------------------------------------

    function activeSettings() {
        if (editingId && drafts.has(editingId)) return normalizeSettings(drafts.get(editingId));
        if (editingId) return normalizeSettings(store.themes[editingId]);
        return settingsFor(store, currentKey);
    }

    // Разметку сообщений Atelier не трогает: расположение портретов, ширина
    // чата и общий вид остаются за темой оформления. Здесь только цвета,
    // фон и типографика.
    function apply() {
        document.body.classList.toggle('wa-enabled', store.enabled);

        if (!store.enabled) {
            live.textContent = '';
            return;
        }

        const s = activeSettings();
        const bg = resolvedBackground(s);

        const rules = [
            `body.wa-enabled{${themeVariables(s)}}`,
            `body.wa-enabled #chat .mes_text{`
            + `font-family:${s.font};`
            + `font-size:${s.fontSize}px;`
            + `line-height:${s.line};`
            + `}`,
            `body.wa-enabled #chat .mes_text p{margin-bottom:${s.gap}px;}`,
            `body.wa-enabled #chat .mes_text p:last-child{margin-bottom:0;}`,
        ];

        if (bg) {
            rules.push(
                `body.wa-enabled #bg1,body.wa-enabled #bg_custom{`
                + `background-image:linear-gradient(rgba(0,0,0,${s.dim / 100}),rgba(0,0,0,${s.dim / 100})),url("${backgroundUrl(bg)}")!important;`
                + `background-size:${s.fit}!important;`
                + `filter:blur(${s.blur}px)!important;`
                + `}`,
            );
        }

        live.textContent = rules.join('');
    }

    // ---- открытие --------------------------------------------------------

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
        if (value === false && dirty()
            && !confirm('Закрыть редактор? Несохранённые правки останутся до перезагрузки.')) return;
        open = value ?? !open;
        panel.hidden = !open;
        reserve();
        if (open) render();
    }

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
            onMount() { panel.hidden = false; reserve(); },
            onShow() { render(); },
            onRelease() { panel.hidden = !open; reserve(); },
        });
    }

    window.addEventListener('wani-roleplay-tools:ready', connect, { signal: hostListeners.signal });

    c.eventSource.on(c.eventTypes.CHAT_CHANGED, () => {
        currentKey = characterKey(ctx());
        if (!dirty()) editingId = themeIdFor(store, currentKey);
        apply();
        render();
    });

    // ---- перетаскивание кнопки -------------------------------------------

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
