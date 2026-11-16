import { russian } from './i18n.js';
import { isSafeCssValue } from './core.js';

export const FONT_KEYS = ['--mainFontFamily', '--monoFontFamily'];
export const MAX_FONT_BYTES = 10 * 1024 * 1024;
export const COMMON_FONTS = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia',
    'Times New Roman', 'Palatino Linotype', 'Segoe UI', 'Calibri', 'Cambria',
    'Consolas', 'Courier New', 'Lucida Console', 'system-ui', 'serif', 'sans-serif', 'monospace'];
const GENERIC = new Set(['system-ui', 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy']);

export function fontValue(family, mono = false) {
    if (typeof family !== 'string' || !family.trim()) return null;
    family = family.trim();
    // Do not turn a font name into a CSS declaration or a fallback list.
    if (/["'\\,;{}<>\n\r]/.test(family)) return null;
    const value = GENERIC.has(family) ? family : `"${family}", ${mono ? 'monospace' : 'serif'}`;
    return isSafeCssValue(value) ? value : null;
}

export function uniqueFamilies(fonts) {
    const names = new Map();
    for (const font of fonts) {
        const family = font.family?.trim();
        if (fontValue(family)) names.set(family.toLocaleLowerCase(), family);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function validateFontFile(file, t = russian) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw Error(t('fontFormat'));
    if (!file.size || file.size > MAX_FONT_BYTES) throw Error(t('fontSize'));
}

// Font binaries are separate from SillyTavern settings and chat metadata.
export function createFontStorage(indexedDB = window.indexedDB, t = russian) {
    let opening;
    function open() {
        if (!indexedDB) return Promise.reject(Error(t('fontStorageBlocked')));
        return opening ||= new Promise((resolve, reject) => {
            const request = indexedDB.open('wani-atelier-fonts', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('fonts', { keyPath: 'id' });
            request.onerror = () => { opening = null; reject(request.error); };
            request.onblocked = () => { opening = null; reject(Error(t('fontStorageBusy'))); };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); opening = null; };
                resolve(db);
            };
        });
    }
    async function transaction(mode, operation) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fonts', mode);
            const request = operation(tx.objectStore('fonts'));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error || request.error || Error(t('cannotSaveFont')));
            tx.onerror = () => {}; // onabort reports the transaction failure.
        });
    }
    return { all: () => transaction('readonly', store => store.getAll()),
        put: record => transaction('readwrite', store => store.put(record)),
        remove: id => transaction('readwrite', store => store.delete(id)) };
}

export class FontLibrary extends EventTarget {
    constructor(storage, env = window, t = russian) {
        super();
        this.storage = storage;
        this.t = t;
        this.env = env;
        this.uploaded = new Map();
        this.local = [];
        this.restoreIssue = null;
    }
    get warning() {
        if (!this.restoreIssue) return '';
        return this.t(this.restoreIssue.key, this.restoreIssue.values);
    }
    notify() { this.dispatchEvent(new Event('change')); }
    async restore() {
        try {
            let failed = 0;
            for (const record of await this.storage.all()) {
                try {
                    if (!/^Atelier_[a-f0-9]{32}$/.test(record.id)) throw Error('Invalid font ID');
                    const face = new this.env.FontFace(record.id, record.data);
                    await face.load();
                    this.env.document.fonts.add(face);
                    this.uploaded.set(record.id, { ...record, face });
                } catch { failed++; }
            }
            this.restoreIssue = failed ? { key: 'fontRestoreFailed', values: { count: failed } } : null;
        } catch { this.restoreIssue = { key: 'savedFontsUnavailable' }; }
        this.notify();
    }
    async loadLocal() {
        if (!this.env.isSecureContext || typeof this.env.queryLocalFonts !== 'function') {
            throw Error(this.t('localFontsUnsupported'));
        }
        // Invoke directly from the user's click, before any other async work.
        const fonts = await this.env.queryLocalFonts();
        this.local = uniqueFamilies(fonts);
        this.notify();
    }
    async upload(file) {
        validateFontFile(file, this.t);
        const data = await file.arrayBuffer();
        const bytes = this.env.crypto.getRandomValues(new Uint8Array(16));
        const id = 'Atelier_' + [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
        const label = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').slice(0, 100);
        const face = new this.env.FontFace(id, data);
        try { await face.load(); } catch { throw Error(this.t('cannotReadFont')); }
        const record = { id, label, fileName: file.name, data };
        // Only apply the font after its bytes have actually been committed.
        try { await this.storage.put(record); }
        catch { throw Error(this.t('fontSaveFailed')); }
        this.env.document.fonts.add(face);
        this.uploaded.set(id, { ...record, face });
        this.notify();
        return id;
    }
    async remove(id) {
        const record = this.uploaded.get(id);
        if (!record) return;
        await this.storage.remove(id);
        this.env.document.fonts.delete(record.face);
        this.uploaded.delete(id);
        this.notify();
    }
}
