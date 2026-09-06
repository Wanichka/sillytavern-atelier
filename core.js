export const KEY = 'wani_atelier';
export const DEFAULT = Object.freeze({accent:'#a9c0c4',text:'#e6dfd3',quote:'#cd956c',italic:'#a9c0c4',underline:'#d7cbbb',panel:'#111b20',user:'#172227',assistant:'#10191c',border:'#35464d',background:'',fit:'cover',dim:20,blur:0,font:'Georgia, serif',fontSize:17,line:1.65,gap:14,radius:14,padding:20,avatarWidth:140,avatarRadius:12,avatarFit:'contain',focus:50,layout:'opposite',reverse:false,width:1100});
export const FONTS=['Georgia, serif','system-ui, sans-serif','"Times New Roman", serif','"Courier New", monospace'];
const enums={font:FONTS,fit:['cover','contain'],avatarFit:['contain','cover'],layout:['ripple','opposite','compact','cover']};
const ranges={dim:[0,85],blur:[0,12],fontSize:[12,28],line:[1.2,2.2],gap:[0,36],radius:[0,40],padding:[8,40],avatarWidth:[48,240],avatarRadius:[0,120],focus:[0,100],width:[500,1800]};
export function normalize(data={}) {
 const t={...DEFAULT}; if(!data||typeof data!=='object')return t;
 for(const k of Object.keys(t)) {
  const v=data[k]; if(k==='background'){if(typeof v==='string'&&v.length<500&&!/[\x00-\x1f]/.test(v))t[k]=v;}
  else if(k==='reverse')t[k]=v===true;
  else if(enums[k]){if(enums[k].includes(v))t[k]=v;}
  else if(ranges[k]){if(typeof v==='number'&&Number.isFinite(v))t[k]=Math.max(ranges[k][0],Math.min(ranges[k][1],v));}
  else if(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))t[k]=v;
 }return t;
}
export function targetKey(ctx){return ctx.groupId!=null?'global':ctx.characters?.[ctx.characterId]?.avatar?'char:'+ctx.characters[ctx.characterId].avatar:'global';}
export function readStore(value){const s={version:1,enabled:false,global:normalize(),themes:{},presets:{}};if(!value||value.version!==1)return s;s.enabled=value.enabled===true;s.global=normalize(value.global);for(const [k,v]of Object.entries(value.themes||{}))if(k.startsWith('char:'))s.themes[k]=normalize(v);for(const [k,v]of Object.entries(value.presets||{}))if(k.startsWith('preset:'))s.presets[k]=normalize(v);return s;}
export function themeFor(s,key){return normalize(key==='global'?s.global:s.themes[key]||s.global);}
export function backgroundUrl(name){return name?'/backgrounds/'+encodeURIComponent(name):'';}
export function backgroundNames(data){const list=Array.isArray(data)?data:data?.images;if(!Array.isArray(list))throw Error('Неизвестный формат альбома фонов');return list.map(x=>typeof x==='string'?x:x?.filename).filter(x=>typeof x==='string');}
export function variables(t){return Object.entries(t).filter(([k])=>k!=='background').map(([k,v])=>`--wa-${k}:${typeof v==='number'&&!['line','dim','focus'].includes(k)?v+'px':v};`).join('');}
