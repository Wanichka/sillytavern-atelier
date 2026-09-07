import { COMMON_FONTS, fontValue } from './fonts.js';
import { isSafeCssValue } from './core.js';

const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
};

export function createFontPicker({ name, label, value = '', library, signal, onChange, isUsed }) {
    const mono = name === '--monoFontFamily';
    let revision = 0;
    const root = node('section', 'wa-font-picker');
    root.setAttribute('aria-label', label);
    root.append(node('h5', 'wa-subtitle', label));
    const search = node('input');
    search.type = 'search';
    search.placeholder = 'Найти шрифт…';
    search.setAttribute('aria-label', `Поиск: ${label}`);
    const select = node('select');
    select.setAttribute('aria-label', `Выбрать: ${label}`);
    const manual = node('input');
    manual.type = 'text';
    manual.value = value;
    manual.placeholder = mono ? '"Consolas", monospace' : '"Georgia", serif';
    manual.setAttribute('aria-label', `Название вручную: ${label}`);
    manual.spellcheck = false;
    const preview = node('p', 'wa-font-preview', 'Съешь ещё этих мягких французских булок.\nThe quick brown fox — 0123456789');
    const message = node('p', 'wa-help');
    message.setAttribute('aria-live', 'polite');
    const actions = node('div', 'wa-actions');
    const button = (text, action) => {
        const b = node('button', 'wa-btn', text);
        b.type = 'button'; b.onclick = action;
        actions.append(b); return b;
    };
    function setPreview() { preview.style.fontFamily = value || (mono ? 'monospace' : 'inherit'); }
    function commit(next) {
        if (!root.isConnected || signal.aborted) return;
        revision++;
        value = next;
        manual.value = value;
        onChange(value || null);
        setPreview();
        refresh();
    }
    function refresh() {
        const query = search.value.trim().toLocaleLowerCase();
        select.replaceChildren();
        const uploaded = library.uploaded.get(selectedUpload());
        const current = node('option', '', value ? (uploaded?.label || value) : 'Из темы Таверны');
        current.value = value; select.append(current);
        const groups = [
            ['Загруженные', [...library.uploaded.values()].map(x => [x.label, x.id])],
            ['С компьютера', library.local.map(x => [x, x])],
            ['Стандартные варианты', COMMON_FONTS.map(x => [x, x])],
        ];
        for (const [title, fonts] of groups) {
            const group = node('optgroup'); group.label = title;
            for (const [label, family] of fonts) {
                if (!label.toLocaleLowerCase().includes(query)) continue;
                const css = fontValue(family, mono);
                if (!css) continue;
                const option = node('option', '', label); option.value = css;
                group.append(option);
            }
            if (group.childElementCount) select.append(group);
        }
        select.value = value;
        remove.hidden = !selectedUpload();
        if (library.warning && !message.textContent) message.textContent = library.warning;
    }
    function selectedUpload() {
        return [...library.uploaded.keys()].find(id => value === fontValue(id, mono));
    }
    search.oninput = refresh;
    select.onchange = () => { message.textContent = ''; commit(select.value); };
    manual.onchange = () => {
        const next = manual.value.trim();
        if (next && (!isSafeCssValue(next) || !CSS.supports('font-family', next))) {
            manual.value = value;
            message.textContent = 'Проверь название шрифта. Например: "Georgia", serif.';
            return;
        }
        message.textContent = ''; commit(next);
    };
    const local = button('С компьютера', async () => {
        local.disabled = true;
        try {
            await library.loadLocal();
            message.textContent = library.local.length ? `Найдено семейств: ${library.local.length}. Выбери шрифт в списке.` : 'Браузер не вернул доступных шрифтов.';
        } catch (e) {
            message.textContent = e.name === 'NotAllowedError' ? 'Доступ к шрифтам не разрешён. Можно загрузить файл или вписать название.' : e.message;
        } finally { local.disabled = false; }
    });
    if (!library.env.isSecureContext || typeof library.env.queryLocalFonts !== 'function') {
        local.disabled = true;
        message.textContent = 'Список шрифтов компьютера в этом браузере или по этому адресу недоступен. Можно загрузить файл или вписать название.';
    }
    const file = node('input');
    file.type = 'file'; file.accept = '.ttf,.otf,.woff,.woff2'; file.hidden = true;
    const upload = button('Загрузить шрифт', () => file.click());
    file.onchange = async () => {
        const chosen = file.files[0];
        if (!chosen) return;
        const startedAt = revision;
        upload.disabled = true;
        message.textContent = 'Загрузка шрифта…';
        try {
            const id = await library.upload(chosen);
            if (revision === startedAt) commit(fontValue(id, mono));
            message.textContent = 'Файл сохранён и доступен в списке. Сохрани тему, чтобы закрепить выбранный шрифт.';
        } catch (e) { message.textContent = e.message; }
        finally { file.value = ''; upload.disabled = false; }
    };
    button('Сбросить', () => { message.textContent = ''; commit(''); });
    const remove = button('Удалить файл', async () => {
        const id = selectedUpload();
        if (!id) return;
        if (isUsed(id)) {
            message.textContent = 'Шрифт используется в теме. Сначала выбери другой шрифт и сохрани эту тему.';
            return;
        }
        if (!confirm('Удалить загруженный файл шрифта из этого браузера?')) return;
        try { await library.remove(id); commit(''); }
        catch { message.textContent = 'Не удалось удалить файл шрифта.'; }
    });
    root.append(search, select, manual, preview, actions, file, message);
    library.addEventListener('change', refresh, { signal });
    setPreview(); refresh();
    return root;
}
