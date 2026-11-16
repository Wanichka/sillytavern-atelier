import { COMMON_FONTS, fontValue } from './fonts.js';
import { isSafeCssValue } from './core.js';

const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
};

export function createFontPicker({ name, label, value = '', library, signal, onChange, isUsed, t }) {
    const mono = name === '--monoFontFamily';
    let revision = 0;
    const root = node('section', 'wa-font-picker');
    root.setAttribute('aria-label', label);
    root.append(node('h5', 'wa-subtitle', label));
    const search = node('input');
    search.type = 'search';
    search.placeholder = t('searchFont');
    search.setAttribute('aria-label', t('searchFontLabel', { label }));
    const select = node('select');
    select.setAttribute('aria-label', t('selectFontLabel', { label }));
    const manual = node('input');
    manual.type = 'text';
    manual.value = value;
    manual.placeholder = mono ? '"Consolas", monospace' : '"Georgia", serif';
    manual.setAttribute('aria-label', t('manualFontLabel', { label }));
    manual.spellcheck = false;
    const preview = node('p', 'wa-font-preview', t('fontPreview'));
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
        const current = node('option', '', value ? (uploaded?.label || value) : t('fromTavern'));
        current.value = value; select.append(current);
        const groups = [
            [t('uploadedFonts'), [...library.uploaded.values()].map(x => [x.label, x.id])],
            [t('computerFonts'), library.local.map(x => [x, x])],
            [t('commonFonts'), COMMON_FONTS.map(x => [x, x])],
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
            message.textContent = t('invalidFontName');
            return;
        }
        message.textContent = ''; commit(next);
    };
    const local = button(t('computerFonts'), async () => {
        local.disabled = true;
        try {
            await library.loadLocal();
            message.textContent = library.local.length ? t('fontCount', { count: library.local.length }) : t('noFontsReturned');
        } catch (e) {
            message.textContent = e.name === 'NotAllowedError' ? t('fontAccessDenied') : e.message;
        } finally { local.disabled = false; }
    });
    if (!library.env.isSecureContext || typeof library.env.queryLocalFonts !== 'function') {
        local.disabled = true;
        message.textContent = t('localFontsUnavailable');
    }
    const file = node('input');
    file.type = 'file'; file.accept = '.ttf,.otf,.woff,.woff2'; file.hidden = true;
    const upload = button(t('uploadFont'), () => file.click());
    file.onchange = async () => {
        const chosen = file.files[0];
        if (!chosen) return;
        const startedAt = revision;
        upload.disabled = true;
        message.textContent = t('uploadingFont');
        try {
            const id = await library.upload(chosen);
            if (revision === startedAt) commit(fontValue(id, mono));
            message.textContent = t('fontUploaded');
        } catch (e) { message.textContent = e.message; }
        finally { file.value = ''; upload.disabled = false; }
    };
    button(t('reset'), () => { message.textContent = ''; commit(''); });
    const remove = button(t('deleteFont'), async () => {
        const id = selectedUpload();
        if (!id) return;
        if (isUsed(id)) {
            message.textContent = t('fontInUse');
            return;
        }
        if (!confirm(t('confirmDeleteFont'))) return;
        try { await library.remove(id); commit(''); }
        catch { message.textContent = t('cannotDeleteFont'); }
    });
    root.append(search, select, manual, preview, actions, file, message);
    library.addEventListener('change', refresh, { signal });
    setPreview(); refresh();
    return root;
}
