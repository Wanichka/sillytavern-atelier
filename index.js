import {
    KEY, DEFAULT, FONTS, LAYOUTS, VERSION,
    normalizeSettings, normalizeName, isSafeFont, newThemeId,
    readStore, emptyStore, characterKey, themeIdFor, settingsFor,
    backgroundUrl, backgroundNames, variables,
} from './core.js';

const ctx = () => SillyTavern.getContext();

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
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

const btn = (text, fn, cls) => {
    const button = el('button', 'wa-btn' + (cls ? ' ' + cls : ''), text);
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

    let store = readStore(c.extensionSettings[KEY]);
    let currentKey = characterKey(c);
    let editingId = themeIdFor(store, currentKey);
    let open = false;
    let tab = 'colors';
    let album = null;
    let albumError = '';
    let busy = false;
    let localFonts = null;

    // Несохранённые правки по каждой теме отдельно.
    const drafts = new Map();
    const hostListeners = new AbortController();

    const persist = () => {
        ctx().extensionSettings[KEY] = store;
        ctx().saveSettingsDebounced();
    };

    const themeList = () => Object.entries(store.themes)
        .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ru'));

    // Правки идут в черновик, пока не нажата «Сохранить тему».
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
    header.append(el('strong', '', 'Оформление · Atelier'), hostControls, btn('×', () => toggle(false), 'wa-icon'));

    const body = el('div', 'wa-body');
    const column = el('div', 'wa-column');
    const previewPane = el('div', 'wa-preview-pane');

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

    const skinToggle = el('input');
    skinToggle.type = 'checkbox';
    skinToggle.id = 'wa-skin';
    skinToggle.checked = store.skin;
    skinToggle.onchange = () => {
        store.skin = skinToggle.checked;
        persist();
        apply();
    };
    const skinLabel = el('label', 'wa-check');
    skinLabel.htmlFor = 'wa-skin';
    skinLabel.append(skinToggle, document.createTextNode('Базовый вид Таверны'));

    const picker = el('select');
    picker.classList.add('wa-picker');
    picker.setAttribute('aria-label', 'Редактируемая тема');
    picker.onchange = () => {
        editingId = picker.value || null;
        render();
        apply();
    };

    const themeRow = el('div', 'wa-theme-row');
    const bindRow = el('div', 'wa-theme-row');
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

    const preview = el('section', 'wa-scope');
    preview.id = 'wa-preview';
    previewPane.append(el('h4', 'wa-subtitle', 'Предпросмотр'), preview);

    column.append(enableLabel, skinLabel, themeRow, bindRow, nav, content, status, foot);
    body.append(column, previewPane);
    panel.append(header, body);

    const launcher = btn('✦', () => toggle(), 'wa-launcher-btn');
    launcher.id = 'wa-launcher';
    launcher.title = 'Atelier · оформление чата';
    launcher.setAttribute('aria-label', launcher.title);

    const live = el('style');
    live.id = 'wa-live-style';
    document.head.append(live);

    const skin = el('link');
    skin.id = 'wa-skin-style';
    skin.rel = 'stylesheet';
    skin.href = new URL('./skin.css', import.meta.url).href;
    document.head.append(skin);
    document.body.append(panel, launcher);

    // ---- поля ------------------------------------------------------------

    function set(key, value) {
        const current = draft();
        if (!current) return;
        current[key] = value;
        renderPreview();
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

    // Квадратик цвета, поле hex и, где нужно, непрозрачность — как в Moonlit.
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
        input.onchange = () => {
            set(key, input.value);
            renderContent();
        };
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
        ['messages', 'Сообщения'],
        ['avatars', 'Портреты'],
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
        const found = list.find(x => 'char:' + x.avatar === currentKey);
        return found?.name || null;
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

    // Управление темой живёт рядом с её названием, иконками.
    function renderThemeRow() {
        themeRow.replaceChildren(picker, iconBtn('fa-plus', 'Новая тема', createTheme));
        bindRow.replaceChildren();
        if (!editingId) return;

        const theme = store.themes[editingId];
        themeRow.append(
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
        );

        const assigned = currentKey && store.assignments[currentKey] === editingId;
        const pin = iconBtn(
            'fa-thumbtack',
            currentKey
                ? (assigned ? 'Открепить от этого персонажа' : 'Закрепить за этим персонажем')
                : 'В групповом чате закрепить нельзя',
            () => {
                if (assigned) delete store.assignments[currentKey];
                else store.assignments[currentKey] = editingId;
                persist();
                render();
                apply();
            },
        );
        pin.disabled = !currentKey;
        pin.setAttribute('aria-pressed', String(!!assigned));

        const star = iconBtn('fa-star', 'Тема по умолчанию', () => {
            store.defaultThemeId = editingId;
            persist();
            render();
            apply();
        });
        star.setAttribute('aria-pressed', String(store.defaultThemeId === editingId));

        bindRow.append(pin, star, exportBtn(), importControl());
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
            renderNoThemes();
            renderPreview();
            return;
        }

        if (tab === 'colors') renderColors();
        if (tab === 'background') renderAlbum();
        if (tab === 'text') renderText();
        if (tab === 'messages') renderMessages();
        if (tab === 'avatars') renderAvatars();

        renderPreview();
        status.textContent = dirty() ? 'Есть несохранённые изменения' : 'Все изменения сохранены';
    }

    function renderNoThemes() {
        content.append(
            el('p', 'wa-help', 'Тем пока нет. Создай первую — назови как хочешь, потом назначишь любому персонажу.'),
            btn('Новая тема', createTheme, 'wa-primary'),
        );
        status.textContent = '';
    }

    function createTheme() {
        const name = prompt('Название темы', 'Новая тема');
        if (name === null) return;
        const id = newThemeId();
        store.themes[id] = { name: normalizeName(name), ...normalizeSettings(null) };
        if (!store.defaultThemeId) store.defaultThemeId = id;
        editingId = id;
        persist();
        tab = 'colors';
        render();
        apply();
        status.textContent = 'Тема создана';
    }

    // ---- цвета -----------------------------------------------------------

    function renderColors() {
        content.append(el('h5', 'wa-subtitle', 'Текст'));
        content.append(
            colorRow('Основной текст', 'text'),
            colorRow('Реплики', 'quote'),
            colorRow('Курсив', 'italic'),
            colorRow('Подчёркивание', 'underline'),
            colorRow('Акцент и имена', 'accent'),
        );
        content.append(el('h5', 'wa-subtitle', 'Подложки'));
        content.append(
            colorRow('Сообщения персонажа', 'assistant', 'assistantOpacity'),
            colorRow('Мои сообщения', 'user', 'userOpacity'),
            colorRow('Панели', 'panel', 'panelOpacity'),
            colorRow('Границы', 'border'),
        );
    }

    // ---- текст -----------------------------------------------------------

    function renderText() {
        // Одно поле: можно выбрать из списка, можно вписать своё.
        const input = el('input');
        input.type = 'text';
        input.value = draft().font;
        input.setAttribute('list', 'wa-fonts');
        input.spellcheck = false;

        const options = [...new Set([...FONTS, ...(localFonts || [])])].filter(isSafeFont);
        const datalist = el('datalist');
        datalist.id = 'wa-fonts';
        for (const value of options) {
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
            content.append(btn('Добавить шрифты с компьютера', loadLocalFonts));
            content.append(el('p', 'wa-help', 'Выбери из списка или впиши название вручную — применится сразу. Кнопка добавляет в список все шрифты системы: Chrome спросит разрешение, в Firefox и на планшете так нельзя.'));
        } else {
            content.append(el('p', 'wa-help', `Выбери из списка или впиши вручную. Из системы подтянуто шрифтов: ${localFonts.length}.`));
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

    // ---- сообщения -------------------------------------------------------

    function renderMessages() {
        content.append(select('Макет сообщений', 'layout', LAYOUTS));

        if (draft().layout === 'sides') {
            const check = el('input');
            check.type = 'checkbox';
            check.checked = draft().reverse;
            check.onchange = () => set('reverse', check.checked);
            content.append(field('Поменять стороны местами', check));
        }

        content.append(
            range('Ширина чата', 'width', 500, 1800),
            range('Скругление сообщений', 'radius', 0, 40),
            range('Поля внутри сообщения', 'padding', 8, 40),
        );
    }

    // ---- портреты --------------------------------------------------------

    function renderAvatars() {
        content.append(
            range('Ширина портрета', 'avatarWidth', 48, 240),
            range('Скругление портрета', 'avatarRadius', 0, 120),
            select('Как показывать', 'avatarFit', [
                ['full', 'Целиком, без обрезки'],
                ['crop', 'Заполнить область с обрезкой'],
            ]),
        );

        if (draft().avatarFit === 'crop') {
            content.append(
                range('Пропорция области (ширина к высоте)', 'avatarRatio', 0.4, 2, .05),
                range('Что видно по вертикали', 'focus', 0, 100),
                el('p', 'wa-help', '0 — верх картинки, 100 — низ.'),
            );
        } else {
            content.append(el('p', 'wa-help', 'Картинка показывается целиком, поэтому пропорция и точка обзора не нужны.'));
        }
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
        content.append(top);
        content.append(el('p', 'wa-help', 'Без своего фона тема берёт фон темы по умолчанию, а если и его нет — оставляет фон Таверны.'));

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

    // Свой фон → фон темы по умолчанию → фон Таверны без вмешательства.
    function resolvedBackground(settings) {
        const candidates = [settings.background];
        const fallback = store.defaultThemeId && store.themes[store.defaultThemeId]?.background;
        if (fallback) candidates.push(fallback);
        for (const name of candidates) {
            if (name && (album === null || album.includes(name))) return name;
        }
        return '';
    }

    // ---- предпросмотр ----------------------------------------------------

    function previewMessage(isUser, char) {
        const message = el('article', 'mes');
        message.setAttribute('is_user', String(isUser));

        const wrapper = el('div', 'mesAvatarWrapper');
        const avatar = el('div', 'avatar');
        const src = isUser
            ? document.querySelector('#chat .mes[is_user="true"] .avatar img')?.getAttribute('src')
            : char?.avatar ? '/thumbnail?type=avatar&file=' + encodeURIComponent(char.avatar) : '';
        const name = isUser ? ctx().name1 || 'Пользователь' : char?.name || 'Персонаж';

        if (src) {
            const pic = el('img');
            pic.src = src;
            pic.alt = name;
            avatar.append(pic);
        } else {
            avatar.textContent = isUser ? 'Я' : '✦';
        }
        wrapper.append(avatar);

        const block = el('div', 'mes_block');
        const heading = el('div', 'ch_name');
        heading.append(el('span', 'name_text', name));
        block.append(heading);

        const text = el('div', 'mes_text');
        if (isUser) {
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

        message.append(wrapper, block);
        return message;
    }

    function renderPreview() {
        const settings = editingId ? normalizeSettings(draft()) : settingsFor(store, currentKey);
        preview.style.cssText = variables(settings);
        preview.dataset.waLayout = settings.layout;
        preview.dataset.waReverse = String(settings.reverse);
        preview.dataset.waFit = settings.avatarFit;

        const bg = resolvedBackground(settings);
        const dim = '#000000' + Math.round(settings.dim * 2.55).toString(16).padStart(2, '0');
        preview.style.backgroundImage = bg
            ? `linear-gradient(${dim},${dim}),url("${backgroundUrl(bg)}")`
            : '';
        preview.style.backgroundSize = settings.fit;

        const list = ctx().characters || [];
        const char = list.find(x => 'char:' + x.avatar === currentKey) || list[ctx().characterId];
        preview.replaceChildren(previewMessage(true, char), previewMessage(false, char));
    }

    // ---- применение к странице ------------------------------------------

    // Пока открыта тема с несохранёнными правками, страница показывает их же.
    function activeSettings() {
        if (editingId && drafts.has(editingId)) return normalizeSettings(drafts.get(editingId));
        if (editingId) return normalizeSettings(store.themes[editingId]);
        return settingsFor(store, currentKey);
    }

    function apply() {
        const chat = document.getElementById('chat');
        document.body.classList.toggle('wa-enabled', store.enabled);
        document.body.classList.toggle('wa-skin', store.enabled && store.skin);
        chat?.classList.toggle('wa-scope', store.enabled);

        if (!store.enabled) {
            live.textContent = '';
            return;
        }

        const settings = activeSettings();
        const bg = resolvedBackground(settings);
        if (chat) {
            chat.dataset.waLayout = settings.layout;
            chat.dataset.waReverse = String(settings.reverse);
            chat.dataset.waFit = settings.avatarFit;
        }

        const smartTheme = [
            `--SmartThemeBodyColor:${settings.text};`,
            `--SmartThemeEmColor:${settings.italic};`,
            `--SmartThemeQuoteColor:${settings.quote};`,
            `--SmartThemeUnderlineColor:${settings.underline};`,
            `--SmartThemeBorderColor:${settings.border};`,
            `--SmartThemeBlurTintColor:var(--wa-panel);`,
            `--SmartThemeUserMesBlurTintColor:var(--wa-user);`,
            `--SmartThemeBotMesBlurTintColor:var(--wa-assistant);`,
            `--SmartThemeChatTintColor:transparent;`,
        ].join('');

        const backgroundRule = bg
            ? `background-image:linear-gradient(rgba(0,0,0,${settings.dim / 100}),rgba(0,0,0,${settings.dim / 100})),url("${backgroundUrl(bg)}")!important;`
            + `background-size:${settings.fit}!important;`
            + `filter:blur(${settings.blur}px)!important;`
            : '';

        live.textContent =
            `body.wa-enabled{${variables(settings)}${smartTheme}}`
            + `body.wa-enabled #sheld{max-width:${settings.width}px;}`
            + (backgroundRule ? `body.wa-enabled #bg1,body.wa-enabled #bg_custom{${backgroundRule}}` : '');
    }

    // ---- открытие и место под панель ------------------------------------

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

    // ---- Roleplay Tools --------------------------------------------------

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

    // ---- события Таверны -------------------------------------------------

    c.eventSource.on(c.eventTypes.CHAT_CHANGED, () => {
        currentKey = characterKey(ctx());
        const applied = themeIdFor(store, currentKey);
        // Если правки не начаты, показываем тему нового персонажа.
        if (!dirty()) editingId = applied;
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
