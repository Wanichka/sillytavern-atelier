import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,dirname,sep} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const seed = {
    wani_atelier: {
        version: 3, enabled: false, defaultThemeId: null,
        themes: {
            'theme:a': { name: 'Море', vars: { '--SmartThemeQuoteColor': '#a9c0c4' } },
            'theme:b': { name: 'Лес', vars: { '--SmartThemeQuoteColor': '#a9c0c4' } },
        },
        assignments: { 'char:a.png': 'theme:a', 'char:b.png': 'theme:b' },
    },
};
const html=`<html><head><meta charset="UTF-8"><link rel="stylesheet" href="/style.css"></head><body><div id="bg1"></div><div id="bg_custom"></div><div id="sheld"><div id="chat"><div class="mes" is_user="true"><div class="mesAvatarWrapper"><div class="avatar"><img src="/portrait.svg"></div></div><div class="mes_block"><div class="mes_text"><p>Короткий пост.</p></div></div></div></div><script>window.context={characters:[{name:'Ло',avatar:'a.png'},{name:'Ло',avatar:'b.png'}],characterId:0,groupId:null,name1:'Алиса',extensionSettings:JSON.parse(localStorage.getItem('test-settings')||${JSON.stringify(JSON.stringify(seed))}),saveSettingsDebounced(){localStorage.setItem('test-settings',JSON.stringify(this.extensionSettings));},getRequestHeaders(){return {'Content-Type':'application/json'};},eventTypes:{CHAT_CHANGED:'changed',CHARACTER_RENAMED:'renamed'},eventSource:{events:{},on(k,f){(this.events[k]??=[]).push(f)},emit(k,...args){this.events[k]?.forEach(f=>f(...args))}}};window.SillyTavern={getContext:()=>window.context};window.confirm=()=>true;</script><script type="module" src="/index.js"></script></body></html>`;
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}if(req.url==='/api/backgrounds/all'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({images:[{filename:'sea.jpg'},{filename:'forest.jpg'}]}))}if(req.url==='/api/backgrounds/upload')return res.end('sea.jpg');if(req.url.startsWith('/thumbnail')||req.url.startsWith('/backgrounds')||req.url==='/portrait.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200"><rect width="120" height="200" fill="#477789"/></svg>')}const p=resolve(root,'.'+req.url);if(!p.startsWith(root+sep)){res.statusCode=403;return res.end()}res.setHeader('Content-Type',p.endsWith('.css')?'text/css':'application/javascript');res.end(await readFile(p));}catch{res.statusCode=404;res.end()}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#wa-launcher').click();await page.locator('#wa-editor').waitFor({state:'visible'});assert.equal(await page.locator('#wa-editor select').first().inputValue(),'theme:a');await page.getByLabel('Применять оформление Atelier').check();
// Verify the locale in the menu and keep the unsaved theme draft during the switch.
await page.locator('#wa-editor input[type=color]').first().fill('#abcdef');
await page.getByLabel('Ещё', { exact: true }).click();
await page.getByLabel('Язык интерфейса').selectOption('en');
assert.equal(await page.getByLabel('Interface language').inputValue(), 'en');
assert.equal(await page.getByLabel('Theme to edit').locator('option:checked').textContent(), 'Море');
assert.equal(await page.getByText('Dialogue', { exact: true }).isVisible(), true);
assert.equal(await page.locator('#wa-editor input[type=color]').first().inputValue(), '#abcdef');
assert.equal(await page.evaluate(() => context.extensionSettings.wani_atelier.themes['theme:a'].vars['--SmartThemeQuoteColor']), '#a9c0c4');
await page.getByLabel('More', { exact: true }).click();
await page.getByText('Fonts', { exact: true }).click();
assert.equal(await page.getByRole('searchbox', { name: 'Search: Font', exact: true }).isVisible(), true);
await page.getByRole('button', { name: 'Save theme', exact: true }).click();assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--SmartThemeQuoteColor').trim()),'rgba(171, 205, 239, 1)');
await page.evaluate(()=>{context.characterId=1;context.eventSource.emit('changed')});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--SmartThemeQuoteColor').trim()),'#a9c0c4');await page.evaluate(()=>{context.characterId=0;context.eventSource.emit('changed')});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--SmartThemeQuoteColor').trim()),'rgba(171, 205, 239, 1)');
await page.getByRole('button',{name:'Background',exact:true}).click();await page.getByRole('button',{name:'sea.jpg',exact:true}).click();await page.getByRole('button',{name:'Save theme',exact:true}).click();assert.match(await page.locator('#bg1').evaluate(e=>getComputedStyle(e).backgroundImage),/sea.jpg/);
await page.reload();await page.locator('#wa-launcher').click();assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--SmartThemeQuoteColor').trim()),'rgba(171, 205, 239, 1)');
assert.equal(await page.getByLabel('Apply Atelier styling').isChecked(), true);
await page.getByLabel('More', { exact: true }).click();
assert.equal(await page.getByLabel('Interface language').inputValue(), 'en');
await page.getByLabel('Interface language').selectOption('ru');
assert.equal(await page.getByLabel('Язык интерфейса').inputValue(), 'ru');
await page.getByLabel('Ещё', { exact: true }).click();
await page.addScriptTag({url:'/tests/roleplay-tools.fixture.js'});assert.equal(await page.locator('#wa-editor').getAttribute('data-rpt-docked'),'true');assert.equal(await page.locator('#wa-launcher').isVisible(),false);await page.evaluate(()=>WaniRoleplayTools.open('atelier'));assert.equal(await page.locator('#wa-editor').count(),1);await page.evaluate(()=>WaniRoleplayTools.destroy());assert.equal(await page.locator('#wa-editor').getAttribute('data-rpt-docked'),null);assert.equal(await page.locator('#wa-editor').isVisible(),true);
await page.getByLabel('Применять оформление Atelier').uncheck();assert.equal(await page.locator('#wa-live-style').textContent(),'');await page.getByLabel('Применять оформление Atelier').check();await page.locator('#wa-launcher').click();assert.equal(await page.locator('#wa-editor').isVisible(),false);await page.locator('#wa-launcher').click();
await page.screenshot({path:resolve(root,'tests/editor-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS: language switching and persistence, draft isolation, save/reload, same-name characters, album, docking/release, disable, toggle, mobile width; no JS errors');
}finally{await browser.close();server.close();}
