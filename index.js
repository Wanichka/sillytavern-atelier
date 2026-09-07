import { FONT_KEYS, FontLibrary, createFontStorage } from './fonts.js';
import { createFontPicker } from './font-picker.js';
import {
    KEY, VERSION, BACKGROUND,
    normalizeTheme, normalizeName, newThemeId, readStore, importTheme,
    characterKey, themeIdFor, themeFor,
    backgroundUrl, backgroundNames, cssVariables, groupVars, labelFor,
    parseColor, formatColor, isSafeCssValue,
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
    let tab = 'theme';
    let album = null;
    let albumError = '';
    let busy = false;

    const drafts = new Map();
    const fontLibrary = new FontLibrary(createFontStorage());
    let fontRows = new AbortController();
    let fontsExpanded = false;
    const hostListeners = new AbortController();
    // Панель закрыта — перерисовывать её при смене чата незачем.
    let pendingRender = false;

    const persist = () => {
        ctx().extensionSettings[KEY] = store;
        ctx().saveSettingsDebounced();
    };

    const themeList = () => Object.entries(store.themes)
        .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ru'));

    function draft() {
        if (!editingId) return null;
        if (!drafts.has(editingId)) drafts.set(editingId, normalizeTheme(store.themes[editingId]));
        return drafts.get(editingId);
    }

    function dirty() {
        if (!editingId || !drafts.has(editingId)) return false;
        return JSON.stringify(drafts.get(editingId))
            !== JSON.stringify(normalizeTheme(store.themes[editingId]));
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

    const picker = el('select', 'wa-picker');
    picker.setAttribute('aria-label', 'Редактируемая тема');
    picker.onchange = () => {
        editingId = picker.value || null;
        render();
        apply();
    };

    const icons = el('div', 'wa-icons');
    const nav = el('nav', 'wa-tabs');
    nav.setAttribute('aria-label', 'Разделы');
    const content = el('div', 'wa-content');
    const status = el('div', 'wa-status');
    status.setAttribute('aria-live', 'polite');

    body.append(enableLabel, picker, icons, nav, content, status);
    panel.append(header, body);

    const launcher = btn('✦', () => toggle(), 'wa-launcher-btn');
    launcher.id = 'wa-launcher';
    launcher.title = 'Atelier · оформление чата';
    launcher.setAttribute('aria-label', launcher.title);

    const live = el('style');
    live.id = 'wa-live-style';
    document.head.append(live);
    document.body.append(panel, launcher);

    // ---- мелкие помощники ------------------------------------------------

    let saveButton = null;

    function touched(message = 'Есть несохранённые изменения') {
        apply();
        saveButton?.classList.toggle('wa-dirty', dirty());
        status.textContent = message;
    }

    function saveTheme() {
        if (!editingId) return;
        store.themes[editingId] = normalizeTheme(draft());
        drafts.delete(editingId);
        persist();
        render();
        apply();
        status.textContent = 'Тема сохранена';
    }

    function field(label, control, extra) {
        const wrapper = el('label', 'wa-field');
        const caption = el('span', '', label);
        if (extra !== undefined) caption.append(el('output', '', String(extra)));
        wrapper.append(caption, control);
        return wrapper;
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
            draft()[key] = Number(input.value);
            touched();
        };
        return wrapper;
    }

    // ---- строка переменной ----------------------------------------------

    // Цвет показывается квадратиком с прозрачностью, всё остальное — полем.
    function varRow(name) {
        const value = draft().vars[name];
        const color = parseColor(value);

        const row = el('div', 'wa-color');
        const label = el('span', 'wa-color-label', labelFor(name));
        if (labelFor(name) !== name) label.title = name;
        row.append(label);

        const line = el('div', 'wa-color-line');

        if (!color) {
            const input = el('input');
            input.type = 'text';
            input.value = value;
            input.spellcheck = false;
            input.onchange = () => {
                const next = input.value.trim();
                if (!isSafeCssValue(next)) {
                    input.value = draft().vars[name];
                    status.textContent = 'Такое значение использовать нельзя';
                    return;
                }
                draft().vars[name] = next;
                touched();
            };
            line.append(input);
            row.append(line);
            return row;
        }

        const swatch = el('input', 'wa-swatch');
        swatch.type = 'color';
        swatch.value = color.hex;

        const hex = el('input', 'wa-hex');
        hex.type = 'text';
        hex.value = color.hex;
        hex.spellcheck = false;

        const alpha = el('input', 'wa-opacity');
        alpha.type = 'range';
        alpha.min = 0;
        alpha.max = 100;
        alpha.value = color.alpha;
        const out = el('output', '', String(color.alpha));

        const write = () => {
            draft().vars[name] = formatColor(swatch.value, Number(alpha.value));
            touched();
        };

        swatch.oninput = () => { hex.value = swatch.value; write(); };
        hex.onchange = () => {
            const next = hex.value.trim();
            if (!/^#[0-9a-f]{6}$/i.test(next)) {
                hex.value = swatch.value;
                status.textContent = 'Цвет пишется как #rrggbb';
                return;
            }
            swatch.value = next;
            write();
        };
        alpha.oninput = () => { out.textContent = alpha.value; write(); };

        line.append(swatch, hex, alpha, out);
        row.append(line);
        return row;
    }

    // ---- вкладки ---------------------------------------------------------

    for (const [id, label] of [['theme', 'Тема'], ['background', 'Фон']]) {
        const button = btn(label, () => { tab = id; renderContent(); });
        button.dataset.tab = id;
        nav.append(button);
    }

    function characterName() {
        return (ctx().characters || []).find(x => 'char:' + x.avatar === currentKey)?.name || null;
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

        renderIcons();
        renderContent();
    }

    function renderIcons() {
        icons.replaceChildren();
        saveButton = null;

        if (editingId) {
            saveButton = iconBtn('fa-floppy-disk', 'Сохранить тему', saveTheme, 'wa-save');
            saveButton.classList.toggle('wa-dirty', dirty());
            icons.append(
                saveButton,
                iconBtn('fa-rotate-left', 'Отменить несохранённые правки', () => {
                    drafts.delete(editingId);
                    render();
                    apply();
                }),
                el('span', 'wa-sep'),
            );
        }

        icons.append(importControl());
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
                store.themes[id] = normalizeTheme({
                    ...(drafts.get(editingId) || theme),
                    name: theme.name + ' (копия)',
                });
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
                ? (assigned ? `Открепить от: ${characterName() || 'персонаж'}` : `Закрепить за: ${characterName() || 'персонаж'}`)
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

        icons.append(pin, star, el('span', 'wa-sep'), exportBtn());
    }

    function exportBtn() {
        return iconBtn('fa-file-export', 'Выгрузить тему в файл', () => {
            const theme = normalizeTheme(drafts.get(editingId) || store.themes[editingId]);
            const blob = new Blob([JSON.stringify({ format: 'wani-atelier', version: VERSION, theme }, null, 2)],
                { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = el('a');
            link.href = url;
            link.download = 'atelier-' + theme.name.replace(/[^\wа-яё-]+/gi, '-').toLowerCase() + '.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    // Один файл покрывает половину картинки: цвета текста лежат в теме
    // Таверны, а обвязка — в пресете Moonlit. Поэтому импорт умеет
    // дополнять уже открытую тему, а не только создавать новую.
    function importControl() {
        const input = el('input');
        input.type = 'file';
        input.accept = '.json';
        input.id = 'wa-import';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            try {
                if (file.size > 2000000) throw Error('Файл слишком большой');
                const incoming = importTheme(JSON.parse(await file.text()));
                const count = Object.keys(incoming.vars).length;
                const open = editingId && store.themes[editingId];

                if (open && confirm(
                    `В файле «${incoming.name}»: ${count} значений.\n\n`
                    + `ОК — добавить их в тему «${store.themes[editingId].name}».\n`
                    + 'Отмена — создать отдельную тему.')) {
                    const target = draft();
                    Object.assign(target.vars, incoming.vars);
                    if (incoming.background) target.background = incoming.background;
                    apply();
                    renderContent();
                    status.textContent = `Добавлено значений: ${count}. Проверь и сохрани тему.`;
                } else {
                    const id = newThemeId();
                    store.themes[id] = incoming;
                    if (!store.defaultThemeId) store.defaultThemeId = id;
                    editingId = id;
                    persist();
                    render();
                    apply();
                    status.textContent = `Тема «${incoming.name}» создана, значений: ${count}`;
                }
            } catch (e) {
                status.textContent = e.message;
            } finally {
                input.value = '';
            }
        };
        const label = el('label', 'wa-btn wa-icon-btn');
        label.htmlFor = 'wa-import';
        label.title = 'Загрузить тему из файла (Таверна, Moonlit или Atelier)';
        label.append(el('i', 'fa-solid fa-file-import'), input);
        return label;
    }

    function renderContent() {
        fontRows.abort();
        fontRows = new AbortController();
        nav.querySelectorAll('button').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
        });
        content.replaceChildren();

        if (!editingId) {
            content.append(el('p', 'wa-help',
                'Тем пока нет. Настрой оформление как обычно — в Таверне и в теме оформления, '
                + 'выгрузи файл темы и загрузи его сюда. Дальше останется закрепить тему за персонажем.'));
            status.textContent = '';
            return;
        }

        if (tab === 'theme') renderTheme();
        if (tab === 'background') renderAlbum();

        status.textContent = dirty() ? 'Есть несохранённые изменения' : 'Все изменения сохранены';
    }

    // Половину темы можно выбросить целиком: например, оставить цвета
    // Таверны, а настройки темы оформления отдать ей самой.
    function groupHeading(title, names) {
        const heading = el('div', 'wa-group');
        heading.append(el('h5', 'wa-subtitle', title));
        heading.append(iconBtn('fa-trash-can', `Убрать все значения: ${title.toLowerCase()}`, () => {
            if (!confirm(`Убрать из темы все значения (${names.length}) — ${title.toLowerCase()}?`)) return;
            for (const name of names) delete draft().vars[name];
            apply();
            renderContent();
            status.textContent = `Убрано значений: ${names.length}. Проверь и сохрани тему.`;
        }, 'wa-danger'));
        return heading;
    }

    function renderTheme() {
        const { smart, other: allOther } = groupVars(draft());
        const other = allOther.filter(name => !FONT_KEYS.includes(name));
        const fontsSection = el('details', 'wa-fonts-section');
        fontsSection.open = fontsExpanded;
        fontsSection.append(el('summary', '', 'Шрифты'));
        fontsSection.addEventListener('toggle', () => {
            if (fontsSection.isConnected) fontsExpanded = fontsSection.open;
        });
        content.append(fontsSection);
        for (const name of FONT_KEYS) {
            fontsSection.append(createFontPicker({
                name, label: labelFor(name), value: draft().vars[name], library: fontLibrary,
                signal: fontRows.signal,
                onChange(value) {
                    if (value) draft().vars[name] = value;
                    else delete draft().vars[name];
                    touched();
                },
                isUsed(id) {
                    return [...Object.values(store.themes), ...drafts.values()].some(theme =>
                        FONT_KEYS.some(key => !(theme === draft() && key === name)
                            && theme.vars?.[key]?.includes(id)));
                },
            }));
        }
        fontsSection.append(el('p', 'wa-help', 'Стандартные варианты используют доступные браузеру шрифты. '
            + 'Загруженные файлы хранятся в этом браузере для этого адреса Таверны; '
            + 'в экспорт темы они не входят. Сохраняй исходные файлы отдельно.'));

        if (!smart.length && !other.length) {
            content.append(el('p', 'wa-help', 'Других настроек оформления пока нет. Можно загрузить файл темы кнопкой импорта.'));
            return;
        }

        if (smart.length) {
            content.append(groupHeading('Из темы Таверны', smart));
            for (const name of smart) content.append(varRow(name));
        }
        if (other.length) {
            content.append(groupHeading('Из темы оформления', other));
            for (const name of other) content.append(varRow(name));
        }
    }

    // ---- фон -------------------------------------------------------------

    function renderAlbum() {
        const top = el('div', 'wa-actions');
        top.append(
            btn('Обновить альбом', () => loadAlbum()),
            btn('Без своего фона', () => {
                draft().background = '';
                touched();
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
                if (!drafts.has(owner)) drafts.set(owner, normalizeTheme(store.themes[owner]));
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
                    draft().background = name;
                    touched();
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

        const fit = el('select');
        for (const [value, name] of [['cover', 'Заполнить экран'], ['contain', 'Показать целиком']]) {
            const option = el('option', '', name);
            option.value = value;
            fit.append(option);
        }
        fit.value = draft().fit;
        fit.onchange = () => { draft().fit = fit.value; touched(); };

        content.append(field('Масштаб', fit), range('Затемнение', 'dim', 0, 85), range('Размытие', 'blur', 0, 12));
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

    function resolvedBackground(theme) {
        const fallback = store.defaultThemeId && store.themes[store.defaultThemeId]?.background;
        for (const name of [theme.background, fallback]) {
            if (name && (album === null || album.includes(name))) return name;
        }
        return '';
    }

    // ---- применение ------------------------------------------------------

    // На страницу идёт тема персонажа. Тема из редактора показывается только
    // пока панель открыта — чтобы правки было видно сразу.
    function activeTheme() {
        if (!panel.hidden && editingId && store.themes[editingId]) {
            return normalizeTheme(drafts.get(editingId) || store.themes[editingId]);
        }
        return themeFor(store, currentKey);
    }

    // Atelier подставляет переменные и фон. Всю разметку — расположение
    // портретов, ширину чата, вид панелей — делает тема оформления.
    function apply() {
        document.body.classList.toggle('wa-enabled', store.enabled);

        const theme = store.enabled ? activeTheme() : null;
        if (!theme) {
            live.textContent = '';
            return;
        }

        const rules = [`body.wa-enabled{${cssVariables(theme)}}`];
        const bg = resolvedBackground(theme);

        if (bg) {
            rules.push(
                'body.wa-enabled #bg1,body.wa-enabled #bg_custom{'
                + `background-image:linear-gradient(rgba(0,0,0,${theme.dim / 100}),rgba(0,0,0,${theme.dim / 100})),url("${backgroundUrl(bg)}")!important;`
                + `background-size:${theme.fit}!important;`
                + `filter:blur(${theme.blur}px)!important;`
                + '}',
            );
        }

        const next = rules.join('');
        if (live.textContent !== next) live.textContent = next;
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
        if (open) { pendingRender = false; render(); }
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
            onShow() { pendingRender = false; render(); },
            onRelease() { panel.hidden = !open; reserve(); },
        });
    }

    window.addEventListener('wani-roleplay-tools:ready', connect, { signal: hostListeners.signal });

    // При смене чата обязательна только подстановка стилей: она дешёвая.
    // Перерисовка панели со всеми строками и, если открыта вкладка «Фон», с
    // сеткой миниатюр — нет. Откладываем её до того, как панель покажут.
    c.eventSource.on(c.eventTypes.CHAT_CHANGED, () => {
        currentKey = characterKey(ctx());
        editingId = themeIdFor(store, currentKey);
        apply();
        if (panel.hidden) pendingRender = true;
        else render();
    });

    void fontLibrary.restore();

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
