// Roleplay Tools. Optional presentation host; never reads or writes RP data.
// API v1: adapters register existing DOM elements. No DOM clones or polling.
const STORAGE_KEY = 'wani_roleplay_tools_layout_v1';
const READY = 'wani-roleplay-tools:ready';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id)
    && !['__proto__', 'prototype', 'constructor'].includes(id);
const LANGS = ['en', 'ru'];
const I18N = {
    en: {
        page: 'Page',
        pages: 'Pages',
        settings_title: 'Pages and layout',
        hide_panel: 'Hide panel',
        save_failed: 'Roleplay Tools could not save its layout in this browser.',
        resize_left: 'Window size (left corner). Double-click to reset',
        resize_right: 'Window size (right corner). Double-click to reset',
        grip_bottom: 'Block and window height. Double-click for automatic height',
        grip_divider: 'Change block heights. Up/down arrows change by 5%',
        block_expand: 'Expand to full page',
        block_restore: 'Show all blocks',
        block_collapse: 'Collapse block',
        block_uncollapse: 'Uncollapse block',
        empty_docked: 'No blocks are placed on this page yet.',
        empty_standalone: 'Separate windows mode is on.',
        empty_action: 'Open layout settings',
        done: 'Done',
        toggle_dock: 'Dock extensions into one panel',
        toggle_pin: 'Context is visible on every page',
        language: 'Language',
        position: 'Window position',
        side_left: 'Left',
        side_right: 'Right',
        side_free: 'Free',
        reset_size: 'Default window size',
        add_page: 'Add page',
        page_name: 'Page name',
        page_move: 'Move page left',
        page_remove: 'Delete page, move its blocks to a neighbour',
        blocks: 'Connected blocks',
        no_modules: 'Install the versions of Wani\'s extensions that support Roleplay Tools.',
        move_up: 'Up',
        move_down: 'Down',
        hint_footer: 'One block takes one slot. Moving and deleting pages only changes placement; extension content is kept.',
    },
    ru: {
        page: 'Страница',
        pages: 'Страницы',
        settings_title: 'Страницы и размещение',
        hide_panel: 'Свернуть панель',
        save_failed: 'Не удалось сохранить расположение Roleplay Tools в браузере.',
        resize_left: 'Размер окна (левый угол). Двойной щелчок — сброс',
        resize_right: 'Размер окна (правый угол). Двойной щелчок — сброс',
        grip_bottom: 'Высота блока и окна. Двойной щелчок — автоматическая высота',
        grip_divider: 'Изменить высоту блоков. Стрелки вверх/вниз — на 5%',
        block_expand: 'Развернуть блок',
        block_restore: 'Вернуть все блоки',
        block_collapse: 'Свернуть блок',
        block_uncollapse: 'Раскрыть блок',
        empty_docked: 'На этой странице пока нет подключённых блоков.',
        empty_standalone: 'Включён режим отдельных окон.',
        empty_action: 'Настроить размещение',
        done: 'Готово',
        toggle_dock: 'Собирать расширения в общую панель',
        toggle_pin: 'Context виден на всех страницах',
        language: 'Язык',
        position: 'Положение окна',
        side_left: 'Слева',
        side_right: 'Справа',
        side_free: 'Свободное',
        reset_size: 'Стандартный размер окна',
        add_page: 'Добавить страницу',
        page_name: 'Название страницы',
        page_move: 'Передвинуть страницу влево',
        page_remove: 'Удалить страницу, перенести блоки на соседнюю',
        blocks: 'Подключённые блоки',
        no_modules: 'Установи версии расширений Wani с поддержкой Roleplay Tools.',
        move_up: 'Выше',
        move_down: 'Ниже',
        hint_footer: 'Один блок занимает одно место. Перенос и удаление страниц меняют только расположение; содержимое расширений сохраняется.',
    },
};
// Mirrors layout.lang so t() also works while the layout is still being read.
let language = 'en';
const t = key => I18N[language]?.[key] ?? I18N.en[key] ?? key;
const defaults = () => ({
    version: 1, enabled: true, open: true, side: 'right', lang: 'en',
    geometry: { width: 390, height: 680, x: 18, y: 70 },
    active: 'live', pinContext: true,
    pages: [{ id: 'live', name: 'Live' }],
    modules: {
        thoughts: { page: 'live', order: 0, weight: 35, collapsed: false },
        relations: { page: 'live', order: 1, weight: 65, collapsed: false },
        context: { page: 'live', order: 2, weight: 15, collapsed: false },
    },
});

function readLayout() {
    language = 'en';
    const initial = defaults();
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!data || data.version !== 1) return initial;
        language = LANGS.includes(data.lang) ? data.lang : 'en';
        initial.lang = language;
        const ids = new Set();
        const pages = (Array.isArray(data.pages) ? data.pages : []).filter(page => {
            if (!page || !validId(page.id) || ids.has(page.id)) return false;
            ids.add(page.id);
            return true;
        }).map(page => ({ id: page.id, name: String(page.name || t('page')).slice(0, 40) }));
        if (!pages.length) return initial;
        initial.pages = pages;
        initial.active = ids.has(data.active) ? data.active : pages[0].id;
        initial.enabled = data.enabled !== false;
        initial.open = data.open !== false;
        initial.pinContext = data.pinContext !== false;
        initial.side = ['left', 'right', 'free'].includes(data.side) ? data.side : 'right';
        for (const key of ['width', 'height', 'x', 'y']) {
            initial.geometry[key] = number(data.geometry?.[key], initial.geometry[key]);
        }
        const modules = data.modules && typeof data.modules === 'object' ? data.modules : {};
        for (const [id, entry] of Object.entries(modules)) {
            if (!validId(id) || !entry || typeof entry !== 'object') continue;
            initial.modules[id] = {
                page: ids.has(entry.page) ? entry.page : pages[0].id,
                order: number(entry.order, 0),
                weight: clamp(number(entry.weight, 50), 1, 1000),
                collapsed: entry.collapsed === true,
                ...(Number.isFinite(entry.height) ? { height: clamp(entry.height, 80, 4000) } : {}),
            };
        }
        // Defaults may refer to a page removed by the user.
        for (const entry of Object.values(initial.modules)) {
            if (!ids.has(entry.page)) entry.page = pages[0].id;
        }
    } catch (error) {
        console.warn('[Roleplay Tools] Cannot load layout:', error);
    }
    return initial;
}

function start() {
    if (window.WaniRoleplayTools || document.getElementById('rpt-shell')) return;
    let layout = readLayout();
    let expanded = null;
    let settingsOpen = false;
    let destroyed = false;
    let saveWarning = false;
    const modules = new Map();
    const events = new AbortController();
    const on = (element, event, fn, options = {}) => element.addEventListener(event, fn, { ...options, signal: events.signal });
    const make = (tag, className, text) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    };
    const setLabel = (element, label) => {
        element.title = label;
        element.setAttribute('aria-label', label);
    };
    const button = (label, icon, action, className = 'rpt-icon') => {
        const element = make('button', className);
        element.type = 'button';
        setLabel(element, label);
        if (icon) {
            const glyph = make('i', `fa-solid fa-${icon}`);
            glyph.setAttribute('aria-hidden', 'true');
            element.append(glyph);
        } else element.textContent = label;
        if (action) element.addEventListener('click', action);
        return element;
    };
    // The chevron is drawn on the wrapper, so it follows the Tavern accent
    // colour instead of the browser's default select arrow.
    const wrapSelect = select => {
        const wrap = make('span', 'rpt-select-wrap');
        wrap.append(select);
        return wrap;
    };
    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); }
        catch (error) {
            console.warn('[Roleplay Tools] Cannot save layout:', error);
            if (!saveWarning) window.toastr?.warning(t('save_failed'));
            saveWarning = true;
        }
    }
    function call(record, method) {
        try {
            const result = record.descriptor[method]?.();
            if (result?.catch) result.catch(error => console.error(`[Roleplay Tools] ${record.id}.${method}`, error));
        } catch (error) { console.error(`[Roleplay Tools] ${record.id}.${method}`, error); }
    }

    const shell = make('section', '', undefined);
    shell.id = 'rpt-shell';
    shell.setAttribute('aria-label', 'Roleplay Tools');
    const header = make('header', 'rpt-header');
    const brand = make('span', 'rpt-brand', '✦ Roleplay Tools');
    const headerActions = make('div', 'rpt-header-actions');
    const settingsButton = button(t('settings_title'), 'sliders', () => setSettings(!settingsOpen));
    const closeButton = button(t('hide_panel'), 'xmark', () => { layout.open = false; save(); updateVisibility(); });
    headerActions.append(settingsButton, closeButton);
    header.append(brand, headerActions);
    const tabs = make('nav', 'rpt-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('pages'));
    const workspace = make('div', 'rpt-workspace');
    const footer = make('section', 'rpt-footer');
    footer.setAttribute('aria-label', 'Context');
    const settingsPanel = make('section', 'rpt-settings');
    settingsPanel.hidden = true;
    settingsPanel.setAttribute('aria-label', t('settings_title'));
    const resizeLeft = button(t('resize_left'), 'grip-lines', null, 'rpt-resize rpt-resize-left');
    const resizeRight = button(t('resize_right'), 'grip-lines', null, 'rpt-resize rpt-resize-right');
    shell.append(header, tabs, footer, workspace, settingsPanel, resizeLeft, resizeRight);
    const launcher = button('Roleplay Tools', 'layer-group', () => {
        layout.open = true;
        if (!layout.enabled) setSettings(true);
        save(); updateVisibility(); fitWindow();
    }, 'rpt-launcher');
    launcher.id = 'rpt-launcher';
    launcher.append(make('span', '', 'Roleplay Tools'));
    document.body.append(shell, launcher);

    function state(id) {
        if (!Object.hasOwn(layout.modules, id)) {
            const suggested = modules.get(id)?.descriptor.defaultPage;
            let page = layout.pages[0].id;
            if (suggested && validId(suggested.id)) {
                page = suggested.id;
                if (!layout.pages.some(item => item.id === page)) {
                    layout.pages.push({ id: page, name: String(suggested.name || t('page')).slice(0, 40) });
                }
            }
            layout.modules[id] = { page, order: modules.size, weight: 50, collapsed: false };
        }
        return layout.modules[id];
    }
    function isPinned(record) { return record.id === 'context' && layout.pinContext; }

    function mount(record) {
        if (record.mounted) return;
        const { element, launcher: originalLauncher } = record.descriptor;
        record.origin = { parent: element.parentNode, next: element.nextSibling, style: element.getAttribute('style') };
        record.launcherStyle = originalLauncher?.getAttribute('style');
        record.mounted = true;
        element.dataset.rptDocked = 'true';
        element.classList.add('rpt-module-root');
        // Standalone drag helpers write !important inline positions. Dock mode
        // owns geometry but keeps all DOM nodes and event handlers intact.
        for (const property of ['left', 'right', 'top', 'bottom', 'height', 'width', 'transform']) element.style.removeProperty(property);
        element.style.display = record.descriptor.display || 'flex';
        originalLauncher?.style.setProperty('display', 'none', 'important');
        record.descriptor.controls?.append(record.controls);
        record.tile.append(element);
        call(record, 'onMount');
    }
    function release(record) {
        if (!record.mounted) return;
        record.visible = false;
        const { element, launcher: originalLauncher } = record.descriptor;
        record.controls.remove();
        delete element.dataset.rptDocked;
        element.classList.remove('rpt-module-root');
        const { parent, next, style } = record.origin;
        const target = parent?.isConnected ? parent : document.body;
        target.insertBefore(element, next?.parentNode === target ? next : null);
        if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
        if (originalLauncher) {
            if (record.launcherStyle === null) originalLauncher.removeAttribute('style');
            else originalLauncher.setAttribute('style', record.launcherStyle);
        }
        record.tile.remove();
        record.mounted = false;
        call(record, 'onRelease');
    }

    function register(descriptor) {
        if (destroyed || !descriptor || !validId(descriptor.id)
            || !(descriptor.element instanceof HTMLElement)) return false;
        if (modules.has(descriptor.id)) return modules.get(descriptor.id).descriptor.element === descriptor.element;
        const record = { id: descriptor.id, descriptor, mounted: false, visible: false };
        record.tile = make('section', 'rpt-tile');
        record.tile.dataset.module = record.id;
        record.tile.setAttribute('aria-label', descriptor.title || record.id);
        record.controls = make('span', 'rpt-module-controls');
        record.maxButton = button(t('block_expand'), 'expand', () => {
            expanded = expanded === record.id ? null : record.id;
            state(record.id).collapsed = false;
            renderPages(); save();
        });
        record.collapseButton = button(t('block_collapse'), 'minus', () => {
            state(record.id).collapsed = !state(record.id).collapsed;
            expanded = null;
            renderPages(); save();
        });
        record.controls.append(record.maxButton, record.collapseButton);
        modules.set(record.id, record);
        state(record.id);
        save();
        if (layout.enabled) mount(record);
        renderPages();
        if (settingsOpen) renderSettings();
        return true;
    }

    function activate(id) {
        if (!layout.pages.some(page => page.id === id)) return;
        layout.active = id; expanded = null;
        setSettings(false); renderPages(); save();
    }
    function openModule(id) {
        const record = modules.get(id);
        if (!record?.mounted) return false;
        layout.open = true;
        state(id).collapsed = false;
        activate(state(id).page);
        fitWindow(); updateVisibility();
        return true;
    }

    function renderPages() {
        // Move the original tiles off the old page before replacing the page
        // containers. Tile scroll offsets and inputs survive this reparenting.
        const parking = document.createDocumentFragment();
        modules.forEach(record => { if (record.mounted) parking.append(record.tile); });
        tabs.replaceChildren(); workspace.replaceChildren(); footer.replaceChildren();
        for (const page of layout.pages) {
            const tab = button(page.name, null, () => activate(page.id), 'rpt-tab');
            tab.id = `rpt-tab-${page.id}`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(page.id === layout.active));
            tab.setAttribute('aria-controls', `rpt-page-${page.id}`);
            tab.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const index = layout.pages.indexOf(page);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? layout.pages.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + layout.pages.length) % layout.pages.length;
                activate(layout.pages[next].id);
                document.getElementById(`rpt-tab-${layout.active}`)?.focus();
            });
            tabs.append(tab);
            const body = make('div', 'rpt-page');
            body.id = `rpt-page-${page.id}`;
            body.setAttribute('role', 'tabpanel');
            body.setAttribute('aria-labelledby', tab.id);
            body.hidden = page.id !== layout.active;
            workspace.append(body);
            const entries = [...modules.values()].filter(record => record.mounted && !isPinned(record)
                && state(record.id).page === page.id).sort((a, b) => state(a.id).order - state(b.id).order);
            const visibleEntries = expanded && page.id === layout.active ? entries.filter(record => record.id === expanded) : entries;
            body.style.alignContent = visibleEntries.length && visibleEntries.every(record => state(record.id).collapsed) ? 'start' : 'stretch';
            const rows = [];
            let previous = null;
            for (const record of entries) {
                const entry = state(record.id);
                const visible = visibleEntries.includes(record);
                record.tile.hidden = !visible;
                record.tile.classList.toggle('rpt-collapsed', entry.collapsed);
                record.tile.classList.remove('rpt-pinned');
                record.controls.hidden = false;
                record.collapseButton.setAttribute('aria-expanded', String(!entry.collapsed));
                record.collapseButton.title = t(entry.collapsed ? 'block_uncollapse' : 'block_collapse');
                record.collapseButton.setAttribute('aria-label', record.collapseButton.title);
                record.collapseButton.firstElementChild.className = `fa-solid fa-${entry.collapsed ? 'plus' : 'minus'}`;
                record.maxButton.title = t(expanded === record.id ? 'block_restore' : 'block_expand');
                record.maxButton.setAttribute('aria-label', record.maxButton.title);
                record.maxButton.firstElementChild.className = `fa-solid fa-${expanded === record.id ? 'compress' : 'expand'}`;
                if (visible) {
                    if (previous) {
                        body.append(makeDivider(previous, record));
                        rows.push('12px');
                    }
                    rows.push(rowHeight(record));
                    previous = record;
                }
                body.append(record.tile);
            }
            if (previous && !state(previous.id).collapsed && !expanded) {
                body.append(makeBottomGrip(previous));
                rows.push('12px');
            }
            if (!expanded && visibleEntries.some(record => Number.isFinite(state(record.id).height))) rows.push('minmax(0, 1fr)');
            body.style.gridTemplateRows = rows.join(' ');
            if (!entries.length) {
                const empty = make('div', 'rpt-empty');
                empty.append(make('p', '', t(layout.enabled ? 'empty_docked' : 'empty_standalone')));
                empty.append(button(t('empty_action'), null, () => setSettings(true), 'rpt-action'));
                body.append(empty);
            }
        }
        const context = modules.get('context');
        if (context?.mounted && isPinned(context)) {
            context.tile.hidden = false;
            context.tile.classList.remove('rpt-collapsed');
            context.tile.classList.add('rpt-pinned');
            context.controls.hidden = true;
            footer.append(context.tile);
        }
        footer.hidden = !footer.childElementCount;
        updateVisibility();
    }

    function updateVisibility() {
        shell.hidden = !layout.open;
        launcher.hidden = layout.open;
        launcher.dataset.side = layout.side;
        tabs.hidden = settingsOpen;
        workspace.hidden = settingsOpen;
        settingsPanel.hidden = !settingsOpen;
        footer.hidden = settingsOpen || !footer.childElementCount;
        for (const record of modules.values()) {
            const visible = record.mounted && layout.open && !settingsOpen
                && (isPinned(record) || (state(record.id).page === layout.active
                    && !state(record.id).collapsed && (!expanded || expanded === record.id)));
            if (visible && !record.visible) call(record, 'onShow');
            record.visible = visible;
        }
    }

    function rowHeight(record) {
        const entry = state(record.id);
        if (entry.collapsed) return 'auto';
        const minimum = record.descriptor.minHeight || 155;
        if (!expanded && Number.isFinite(entry.height)) return `${Math.max(minimum, entry.height)}px`;
        return `minmax(${minimum}px, ${entry.weight}fr)`;
    }
    function updateRows(page) {
        const rows = [...page.children].filter(node => !node.hidden).map(node => {
            if (node.classList.contains('rpt-divider')) return '12px';
            const record = modules.get(node.dataset.module);
            return record ? rowHeight(record) : 'auto';
        });
        if (!expanded && [...page.querySelectorAll('.rpt-tile:not([hidden])')]
            .some(tile => Number.isFinite(state(tile.dataset.module).height))) rows.push('minmax(0, 1fr)');
        page.style.gridTemplateRows = rows.join(' ');
    }
    function freezeHeights(page) {
        for (const tile of page.querySelectorAll('.rpt-tile:not([hidden]):not(.rpt-collapsed)')) {
            state(tile.dataset.module).height = tile.getBoundingClientRect().height;
        }
    }
    function makeBottomGrip(record) {
        const divider = make('div', 'rpt-divider rpt-bottom-divider');
        const grip = button(t('grip_bottom'), 'grip-lines', null, 'rpt-bottom-grip');
        divider.append(grip);
        let dragging = null;
        const resize = height => {
            const page = record.tile.parentNode;
            const rect = shell.getBoundingClientRect();
            const chromeHeight = rect.height - page.clientHeight;
            state(record.id).height = clamp(height, record.descriptor.minHeight || 155, 4000);
            updateRows(page);
            // Fit the frame to the actual stack, not the grid's empty space or
            // its scrollHeight (both can still reflect the old frame height).
            // Keep the top edge anchored; overflow starts only at screen limits.
            const vp = viewport();
            if (vp.w > 600) {
                const css = getComputedStyle(page);
                const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
                const contentHeight = [...page.children].filter(node => !node.hidden)
                    .reduce((sum, node) => sum + node.getBoundingClientRect().height, padding);
                const maxHeight = Math.max(1, vp.y + vp.h - rect.top - 8);
                layout.geometry.height = clamp(chromeHeight + contentHeight, Math.min(300, maxHeight), maxHeight);
                layout.geometry.y = rect.top;
                fitWindow();
            }
        };
        grip.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            const page = record.tile.parentNode;
            freezeHeights(page);
            dragging = { y: event.clientY, height: state(record.id).height };
            grip.setPointerCapture(event.pointerId);
        });
        grip.addEventListener('pointermove', event => {
            if (!dragging) return;
            resize(dragging.height + event.clientY - dragging.y);
        });
        const finish = () => { if (dragging) { dragging = null; save(); } };
        grip.addEventListener('pointerup', finish);
        grip.addEventListener('pointercancel', finish);
        grip.addEventListener('lostpointercapture', finish);
        grip.addEventListener('keydown', event => {
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            freezeHeights(record.tile.parentNode);
            resize(state(record.id).height + (event.key === 'ArrowDown' ? 20 : -20));
            save();
        });
        grip.addEventListener('dblclick', () => {
            for (const item of modules.values()) {
                if (state(item.id).page === state(record.id).page) delete state(item.id).height;
            }
            renderPages(); save();
        });
        return divider;
    }

    function makeDivider(upper, lower) {
        const divider = make('div', 'rpt-divider');
        const disabled = state(upper.id).collapsed || state(lower.id).collapsed;
        if (disabled) { divider.classList.add('rpt-divider-disabled'); return divider; }
        const grip = button(t('grip_divider'), 'grip-lines', null, 'rpt-divider-grip');
        divider.append(grip);
        const setRatio = ratio => {
            const total = state(upper.id).weight + state(lower.id).weight;
            state(upper.id).weight = total * ratio;
            state(lower.id).weight = total * (1 - ratio);
            if (Number.isFinite(state(upper.id).height) || Number.isFinite(state(lower.id).height)) {
                const sum = upper.tile.getBoundingClientRect().height + lower.tile.getBoundingClientRect().height;
                const minimum = upper.descriptor.minHeight || 155;
                state(upper.id).height = clamp(sum * ratio, minimum, Math.max(minimum, sum - (lower.descriptor.minHeight || 155)));
                state(lower.id).height = sum - state(upper.id).height;
            }
        };
        let dragging = null;
        grip.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            const a = upper.tile.getBoundingClientRect(), b = lower.tile.getBoundingClientRect();
            dragging = { start: event.clientY, upper: a.height, sum: a.height + b.height };
            grip.setPointerCapture(event.pointerId);
        });
        grip.addEventListener('pointermove', event => {
            if (!dragging) return;
            const minUpper = upper.descriptor.minHeight || 155, minLower = lower.descriptor.minHeight || 155;
            const height = clamp(dragging.upper + event.clientY - dragging.start, minUpper, Math.max(minUpper, dragging.sum - minLower));
            setRatio(height / dragging.sum);
            updateRows(upper.tile.parentNode);
        });
        const finish = () => { if (dragging) { dragging = null; save(); } };
        grip.addEventListener('pointerup', finish);
        grip.addEventListener('pointercancel', finish);
        grip.addEventListener('lostpointercapture', finish);
        grip.addEventListener('keydown', event => {
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const total = state(upper.id).weight + state(lower.id).weight;
            const ratio = Number.isFinite(state(upper.id).height) || Number.isFinite(state(lower.id).height)
                ? upper.tile.getBoundingClientRect().height / (upper.tile.getBoundingClientRect().height + lower.tile.getBoundingClientRect().height)
                : state(upper.id).weight / total;
            setRatio(clamp(ratio + (event.key === 'ArrowDown' ? .05 : -.05), .1, .9));
            renderPages(); save();
            const page = document.getElementById(`rpt-page-${layout.active}`);
            const grips = [...page.querySelectorAll('.rpt-divider-grip')];
            grips.find(node => node.getAttribute('data-pair') === `${upper.id}:${lower.id}`)?.focus();
        });
        grip.setAttribute('data-pair', `${upper.id}:${lower.id}`);
        return divider;
    }

    // Header, launcher and corner grips are built once, so a language switch
    // has to relabel them by hand; everything else is rebuilt on render.
    function refreshChrome() {
        setLabel(settingsButton, t('settings_title'));
        setLabel(closeButton, t('hide_panel'));
        setLabel(resizeLeft, t('resize_left'));
        setLabel(resizeRight, t('resize_right'));
        tabs.setAttribute('aria-label', t('pages'));
        settingsPanel.setAttribute('aria-label', t('settings_title'));
    }
    function setSettings(open) {
        settingsOpen = open;
        settingsButton.setAttribute('aria-expanded', String(open));
        if (open) renderSettings();
        updateVisibility();
    }
    function renderSettings() {
        settingsPanel.replaceChildren();
        const top = make('div', 'rpt-settings-heading');
        top.append(make('span', 'rpt-brand', t('settings_title')), button(t('done'), null, () => setSettings(false), 'rpt-action'));
        settingsPanel.append(top);
        const toggle = (text, checked, change) => {
            const label = make('label', 'rpt-check');
            const input = make('input'); input.type = 'checkbox'; input.checked = checked;
            input.addEventListener('change', () => change(input.checked));
            label.append(input, make('span', '', text)); settingsPanel.append(label);
        };
        toggle(t('toggle_dock'), layout.enabled, enabled => {
            layout.enabled = enabled; expanded = null;
            for (const record of modules.values()) enabled ? mount(record) : release(record);
            renderPages(); save();
        });
        toggle(t('toggle_pin'), layout.pinContext, value => {
            layout.pinContext = value; expanded = null; renderPages(); renderSettings(); save();
        });
        const langLabel = make('label', 'rpt-field', t('language'));
        const langSelect = make('select');
        for (const [value, name] of [['en', 'English'], ['ru', 'Русский']]) {
            const option = make('option', '', name); option.value = value; langSelect.append(option);
        }
        langSelect.value = language;
        langSelect.addEventListener('change', () => {
            language = LANGS.includes(langSelect.value) ? langSelect.value : 'en';
            layout.lang = language;
            save(); refreshChrome(); renderPages(); renderSettings();
        });
        langLabel.append(wrapSelect(langSelect)); settingsPanel.append(langLabel);
        const positionLabel = make('label', 'rpt-field', t('position'));
        const position = make('select');
        for (const [value, name] of [['left', t('side_left')], ['right', t('side_right')], ['free', t('side_free')]]) {
            const option = make('option', '', name); option.value = value; position.append(option);
        }
        position.value = layout.side;
        position.addEventListener('change', () => { layout.side = position.value; fitWindow(); save(); });
        positionLabel.append(wrapSelect(position)); settingsPanel.append(positionLabel);
        settingsPanel.append(button(t('reset_size'), null, resetSize, 'rpt-action'));
        const pagesTitle = make('div', 'rpt-settings-heading');
        pagesTitle.append(make('span', 'rpt-label', t('pages')), button(t('add_page'), 'plus', () => {
            const id = `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            layout.pages.push({ id, name: `${t('page')} ${layout.pages.length + 1}` });
            renderPages(); renderSettings(); save();
            settingsPanel.querySelector(`[data-page-name="${id}"]`)?.focus();
        }));
        settingsPanel.append(pagesTitle);
        for (const page of layout.pages) {
            const row = make('div', 'rpt-page-editor');
            const name = make('input'); name.type = 'text'; name.maxLength = 40; name.value = page.name;
            name.dataset.pageName = page.id;
            name.setAttribute('aria-label', t('page_name'));
            name.addEventListener('change', () => { page.name = name.value.trim() || t('page'); renderPages(); renderSettings(); save(); });
            const index = layout.pages.indexOf(page);
            const move = button(t('page_move'), 'arrow-left', () => {
                [layout.pages[index - 1], layout.pages[index]] = [layout.pages[index], layout.pages[index - 1]];
                renderPages(); renderSettings(); save();
            });
            move.disabled = index === 0;
            const remove = button(t('page_remove'), 'trash', () => {
                const next = layout.pages.find(item => item.id !== page.id);
                for (const entry of Object.values(layout.modules)) if (entry.page === page.id) entry.page = next.id;
                layout.pages = layout.pages.filter(item => item.id !== page.id);
                if (layout.active === page.id) layout.active = next.id;
                expanded = null; renderPages(); renderSettings(); save();
            });
            remove.disabled = layout.pages.length === 1;
            row.append(name, move, remove); settingsPanel.append(row);
        }
        settingsPanel.append(make('div', 'rpt-label', t('blocks')));
        if (!modules.size) settingsPanel.append(make('p', 'rpt-hint', t('no_modules')));
        for (const record of modules.values()) {
            const box = make('div', 'rpt-module-editor');
            box.append(make('div', 'rpt-module-title', record.descriptor.title || record.id));
            const row = make('div', 'rpt-editor-row');
            const select = make('select');
            for (const page of layout.pages) {
                const option = make('option', '', page.name); option.value = page.id; select.append(option);
            }
            select.value = state(record.id).page;
            select.disabled = isPinned(record);
            select.setAttribute('aria-label', `${t('page')}: ${record.descriptor.title}`);
            select.addEventListener('change', () => { state(record.id).page = select.value; expanded = null; renderPages(); renderSettings(); save(); });
            row.append(wrapSelect(select));
            const peers = [...modules.values()].filter(item => !isPinned(item) && state(item.id).page === state(record.id).page)
                .sort((a, b) => state(a.id).order - state(b.id).order);
            const index = peers.indexOf(record);
            const arrows = make('div', 'rpt-module-controls');
            for (const [delta, icon, title] of [[-1, 'arrow-up', t('move_up')], [1, 'arrow-down', t('move_down')]]) {
                const move = button(title, icon, () => {
                    [peers[index], peers[index + delta]] = [peers[index + delta], peers[index]];
                    peers.forEach((item, order) => { state(item.id).order = order; });
                    renderPages(); renderSettings(); save();
                });
                move.disabled = isPinned(record) || index + delta < 0 || index + delta >= peers.length;
                arrows.append(move);
            }
            row.append(arrows); box.append(row); settingsPanel.append(box);
        }
        settingsPanel.append(make('p', 'rpt-hint', t('hint_footer')));
    }

    function viewport() {
        const visual = window.visualViewport;
        return { x: visual?.offsetLeft || 0, y: visual?.offsetTop || 0,
            w: visual?.width || innerWidth, h: visual?.height || innerHeight };
    }
    function fitWindow() {
        const vp = viewport();
        const mobile = vp.w <= 600;
        shell.classList.toggle('rpt-mobile', mobile);
        shell.dataset.side = layout.side;
        const margin = 8, topGap = Math.min(54, vp.h * .12);
        const availableWidth = Math.max(1, vp.w - margin * 2);
        const availableHeight = Math.max(1, vp.h - topGap - margin);
        const width = mobile ? availableWidth : clamp(layout.geometry.width, Math.min(320, availableWidth), availableWidth);
        const height = mobile ? availableHeight : clamp(layout.geometry.height, Math.min(300, availableHeight), availableHeight);
        let x = layout.side === 'left' ? vp.x + margin : layout.side === 'right' ? vp.x + vp.w - width - margin : layout.geometry.x;
        let y = layout.geometry.y;
        if (mobile) { x = vp.x + margin; y = vp.y + topGap; }
        x = clamp(x, vp.x + margin, vp.x + vp.w - width - margin);
        y = clamp(y, vp.y + topGap, vp.y + vp.h - height - margin);
        Object.assign(shell.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
        launcher.style.left = layout.side === 'left' ? `${vp.x + 12}px` : 'auto';
        launcher.style.right = layout.side === 'left' ? 'auto' : `${Math.max(12, innerWidth - vp.x - vp.w + 12)}px`;
        launcher.style.bottom = `${Math.max(12, innerHeight - vp.y - vp.h + 12)}px`;
    }
    function resetSize() {
        layout.geometry.width = 390; layout.geometry.height = 680;
        fitWindow(); save();
    }
    let gesture = null;
    const resizeStart = (event, edge) => {
        if (viewport().w <= 600 || event.button !== 0) return;
        event.preventDefault();
        const rect = shell.getBoundingClientRect();
        gesture = { kind: 'resize', edge, x: event.clientX, y: event.clientY, rect };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    on(resizeLeft, 'pointerdown', event => resizeStart(event, 'left'));
    on(resizeRight, 'pointerdown', event => resizeStart(event, 'right'));
    on(resizeLeft, 'dblclick', resetSize); on(resizeRight, 'dblclick', resetSize);
    on(header, 'pointerdown', event => {
        if (event.target.closest('button') || event.button !== 0 || viewport().w <= 600) return;
        event.preventDefault();
        gesture = { kind: 'move', x: event.clientX, y: event.clientY, rect: shell.getBoundingClientRect() };
        header.setPointerCapture(event.pointerId);
    });
    on(shell, 'pointermove', event => {
        if (!gesture) return;
        const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
        const rect = gesture.rect, vp = viewport();
        if (gesture.kind === 'move') {
            layout.side = 'free'; layout.geometry.x = rect.left + dx; layout.geometry.y = rect.top + dy;
        } else {
            const leftEdge = layout.side === 'right' || (layout.side === 'free' && gesture.edge === 'left');
            const maxWidth = leftEdge ? rect.right - vp.x - 8 : vp.x + vp.w - rect.left - 8;
            layout.geometry.width = clamp(rect.width + (leftEdge ? -dx : dx), Math.min(320, maxWidth), maxWidth);
            layout.geometry.height = clamp(rect.height + dy, Math.min(300, vp.h - 8), Math.max(1, vp.y + vp.h - rect.top - 8));
            layout.geometry.x = leftEdge ? rect.right - layout.geometry.width : rect.left;
            layout.geometry.y = rect.top;
        }
        fitWindow();
    });
    const finishGesture = () => {
        if (!gesture) return;
        gesture = null;
        const rect = shell.getBoundingClientRect();
        layout.geometry.x = rect.left; layout.geometry.y = rect.top;
        save();
    };
    on(shell, 'pointerup', finishGesture); on(shell, 'pointercancel', finishGesture);
    on(shell, 'lostpointercapture', finishGesture);
    on(window, 'resize', fitWindow);
    if (window.visualViewport) {
        on(window.visualViewport, 'resize', fitWindow);
        on(window.visualViewport, 'scroll', fitWindow);
    }
    on(shell, 'keydown', event => {
        if (event.key === 'Escape' && settingsOpen) { setSettings(false); settingsButton.focus(); }
    });

    const api = Object.freeze({
        version: 1, register, open: openModule,
        unregister(id) {
            const record = modules.get(id);
            if (!record) return;
            release(record); modules.delete(id); expanded = null; renderPages();
        },
        destroy() {
            destroyed = true; events.abort();
            modules.forEach(release); modules.clear();
            shell.remove(); launcher.remove();
            if (window.WaniRoleplayTools === api) delete window.WaniRoleplayTools;
        },
    });
    window.WaniRoleplayTools = api;
    renderPages(); fitWindow();
    window.dispatchEvent(new CustomEvent(READY));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

