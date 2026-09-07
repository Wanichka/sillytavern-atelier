import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { FontLibrary, MAX_FONT_BYTES, fontValue, uniqueFamilies, validateFontFile } from '../fonts.js';

const file = { name: 'My Font.woff2', size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
function setup(records = []) {
    const disk = new Map(records.map(r => [r.id, r]));
    const faces = new Set();
    const storage = {
        all: async () => [...disk.values()],
        put: async r => { disk.set(r.id, structuredClone(r)); },
        remove: async id => { disk.delete(id); },
    };
    const env = { crypto: webcrypto, document: { fonts: faces }, isSecureContext: true,
        FontFace: class {
            constructor(family, bytes) { this.family = family; this.bytes = bytes; }
            async load() { if (this.bytes.byteLength === 1) throw Error('Invalid data'); return this; }
        },
    };
    return { library: new FontLibrary(storage, env), disk, faces, storage, env };
}

test('quoted families, generic values and mono fallback remain valid', () => {
    assert.equal(fontValue('Times New Roman'), '"Times New Roman", serif');
    assert.equal(fontValue('Consolas', true), '"Consolas", monospace');
    assert.equal(fontValue('system-ui'), 'system-ui');
    for (const name of ['', undefined, 'x; color:red', 'x"', 'x\\', '<style>', 'x, Arial', '@import']) assert.equal(fontValue(name), null);
});
test('local families are deduplicated without accepting CSS injection', () => {
    assert.deepEqual(uniqueFamilies([{family:' Arial '},{family:'Arial'},{family:'Consolas'},{family:'x;red'},{family:''}]), ['Arial','Consolas']);
});
test('upload validation rejects wrong extensions, empty files and oversized files', () => {
    for (const ext of ['ttf','OTF','woff','woff2']) assert.doesNotThrow(() => validateFontFile({name:'font.'+ext,size:10}));
    for (const f of [{name:'font.zip',size:1},{name:'font.ttf',size:0},{name:'font.woff',size:MAX_FONT_BYTES+1}]) assert.throws(() => validateFontFile(f));
});
test('uploaded font bytes are persisted before being activated and survive a new library instance', async () => {
    const {library,disk,storage,env,faces} = setup();
    const id = await library.upload(file);
    assert.match(id,/^Atelier_[a-f0-9]{32}$/);
    assert.equal(disk.get(id).label,'My Font');
    assert.equal(faces.size,1);
    faces.clear();
    const reloaded = new FontLibrary(storage,env);
    await reloaded.restore();
    assert.equal(reloaded.uploaded.size,1);
    assert.equal(faces.size,1);
    assert.equal([...faces][0].family,id);
});
test('corrupt font does not create a saved entry or active face', async () => {
    const {library,disk,faces}=setup();
    await assert.rejects(library.upload({...file,arrayBuffer:async()=>new ArrayBuffer(1)}),/не смог прочитать/);
    assert.equal(disk.size,0); assert.equal(faces.size,0);
});
test('storage failure leaves current document and library unchanged', async () => {
    const {library,storage,faces}=setup();
    storage.put=async()=>{throw Error('Quota exceeded');};
    await assert.rejects(library.upload(file),/Не удалось сохранить/);
    assert.equal(library.uploaded.size,0); assert.equal(faces.size,0);
});
test('one broken saved font does not prevent restoration of another', async () => {
    const good={id:'Atelier_'+'a'.repeat(32),data:new ArrayBuffer(4),label:'Good'};
    const broken={id:'Atelier_'+'b'.repeat(32),data:new ArrayBuffer(1),label:'Broken'};
    const {library}=setup([broken,good]);await library.restore();
    assert.equal(library.uploaded.size,1); assert.match(library.warning,/1/);
});
test('storage read failure is visible and nonfatal', async () => {
    const {library,storage}=setup();storage.all=async()=>{throw Error('Denied');};
    await library.restore();assert.match(library.warning,/недоступны/);
});
test('local access happens only on an explicit method call, and permission refusal preserves the list', async () => {
    const {library,env}=setup();let calls=0;
    env.queryLocalFonts=async()=>{calls++;return [{family:'Georgia'},{family:'Georgia'}];};
    await library.restore();assert.equal(calls,0);
    await library.loadLocal();assert.equal(calls,1);assert.deepEqual(library.local,['Georgia']);
    env.queryLocalFonts=async()=>{throw new DOMException('Denied','NotAllowedError');};
    await assert.rejects(library.loadLocal(),{name:'NotAllowedError'});
    assert.deepEqual(library.local,['Georgia']);
});
test('unsupported or insecure local access leaves file upload usable', async () => {
    const {library,env}=setup();env.isSecureContext=false;
    await assert.rejects(library.loadLocal(),/недоступен/);
    await library.upload(file);assert.equal(library.uploaded.size,1);
});
test('deleting a font commits storage removal before dropping its active face', async () => {
    const {library,storage,disk,faces}=setup();const id=await library.upload(file);
    const remove=storage.remove;storage.remove=async()=>{throw Error('Denied');};
    await assert.rejects(library.remove(id));assert.equal(faces.size,1);assert.equal(disk.size,1);
    storage.remove=remove;await library.remove(id);assert.equal(faces.size,0);assert.equal(disk.size,0);
});
