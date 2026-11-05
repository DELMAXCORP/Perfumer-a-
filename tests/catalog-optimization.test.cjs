const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function element(tag = 'div') {
  return { tag, children: [], listeners: {}, hidden: false, textContent: '', value: '',
    append(...items) { for (const child of items) { if (child && typeof child === 'object') child.parent = this; this.children.push(child); } },
    after() {}, prepend(child) { this.children.unshift(child); child.parent=this; }, setAttribute() {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    replaceChildren() { this.children = []; this.replacements = (this.replacements || 0) + 1; },
    closest(selector) { if (selector === '.product-card' && this.className === 'product-card') return this; return this.parent?.closest(selector); },
    querySelector(selector) { const all = this.querySelectorAll(selector); return all[0]; },
    querySelectorAll(selector) { const result=[]; for (const child of this.children) if(child?.children) { if (child.className === selector.slice(1)) result.push(child); result.push(...child.querySelectorAll(selector)); } return result; }
  };
}
test('catálogo: sin audio automático, caché, actualización manual y nodos estables', async () => {
  const nodes = new Map(); const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  node('product-count').parentElement=element();
  const intervals=[], events={}, player={ plays:0,preload:'',src:'',pause(){},play(){this.plays++;return Promise.resolve();} };
  let queries=0;
  const sandbox = { URL, Event, console, performance, Date,
    document: { hidden:false, getElementById:node, createElement:element, createTextNode:text=>({textContent:text}), addEventListener:(type,fn)=>{events[type]=(events[type]||[]).concat(fn);} },
    Audio: function(){return player;}, setInterval:(fn,ms)=>{intervals.push({fn,ms});},
    addEventListener:(type,fn)=>{events[type]=(events[type]||[]).concat(fn);}, dispatchEvent(){},
    AlphaDecantPricing:{price30ml:()=>90},
    supabaseClient:{from:()=>({select(){return this;},order(){return this;},range(offset){queries++;return Promise.resolve({data:offset?[]:[{id:1,nombre:'Ejemplo',tipo:'Perfume Sellado',precio_venta:100,audio_url:'https://example/audio.mp3'}]});}})}
  };
  sandbox.window=sandbox; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('alpha-data.js','utf8'),sandbox);
  vm.runInContext(fs.readFileSync('panel/catalogo.js','utf8'),sandbox);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queries,2); assert.equal(player.plays,0); assert.equal(player.preload,'none');
  assert.equal(intervals[0].ms,300000);
  const grid=node('catalog-grid'), card=grid.children[0];
  const controls=card.querySelectorAll('.decant-toggle');
  controls.find(c=>c.children[0]?.textContent==='Ver decants y precios').listeners.click(); assert.equal(player.plays,0);
  controls.find(c=>c.textContent==='Escuchar descripción').listeners.click(); assert.equal(player.plays,1);
  events.visibilitychange.forEach(fn=>fn()); await new Promise(resolve=>setImmediate(resolve)); assert.equal(queries,2);
  node('product-count').parentElement.children[0].listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queries,4); assert.equal(grid.children[0],card);
  sandbox.document.hidden=true; intervals[0].fn(); await new Promise(resolve=>setImmediate(resolve)); assert.equal(queries,4);
});

test('imágenes nuevas producen JPEG de 1400 y 360 px y liberan URL local', async () => {
  const sizes=[], revoked=[];
  const sandbox={ console, addEventListener(){}, URL:{createObjectURL:()=> 'blob:local',revokeObjectURL:url=>revoked.push(url)},
    Image:class { naturalWidth=4000;naturalHeight=2000;set src(value){queueMicrotask(()=>this.onload());} },
    document:{createElement(){return {width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),
      toBlob(callback,type,quality){sizes.push([this.width,this.height,type,quality]);callback(new Blob(['image'],{type}));}};} }
  };
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync('alpha-data.js','utf8'),sandbox);
  const variants=await sandbox.AlphaData.imageVariants({});
  assert.deepEqual(sizes,[[1400,700,'image/jpeg',0.85],[360,180,'image/jpeg',0.85]]);
  assert.equal(variants.full.type,'image/jpeg');assert.deepEqual(revoked,['blob:local']);
});
