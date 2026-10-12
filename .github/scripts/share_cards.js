/* share cards (2026-10-11). one social image per artist and tracklist page, rendered from the page's own
   data in headless chromium: 1200 by 630, the redline look. only pages whose name or subtitle changed since
   the last run are rendered again, so a push costs seconds, not minutes. then every page whose og:image still
   points at the generic image gets its own. run from the repo root: node .github/scripts/share_cards.js */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('playwright');
const SITE='https://groovesmaxxing.com';
const esc=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const text=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&#x27;/g,"'").replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&middot;/g,'·').replace(/&rarr;/g,'→').replace(/\s+/g,' ').trim();
function artists(){
  const out=[];
  for(const f of fs.readdirSync('artists')){
    if(!f.endsWith('.html'))continue;const s=fs.readFileSync(path.join('artists',f),'utf8');
    if(s.includes('http-equiv="refresh"'))continue;
    const name=(s.match(/<h1 class="aname">(.*?)<\/h1>/)||[])[1];if(!name)continue;
    const tags=[...s.matchAll(/<span class="tag(?: lane)?">(.*?)<\/span>/g)].map(m=>text(m[1])).filter(t=>t&&!/either lane/.test(t)).slice(0,3);
    out.push({kind:'artist',slug:f.slice(0,-5),file:path.join('artists',f),name:text(name),sub:tags.join(' · '),eyebrow:'the artists'});
  }
  for(const f of fs.readdirSync('labels')){
    if(!f.endsWith('.html'))continue;const s=fs.readFileSync(path.join('labels',f),'utf8');
    if(s.includes('http-equiv="refresh"'))continue;
    const name=(s.match(/<h1 class="aname">(.*?)<\/h1>/)||[])[1];if(!name)continue;
    const tags=[...s.matchAll(/<span class="tag(?: lane)?">(.*?)<\/span>/g)].map(m=>text(m[1])).filter(t=>t&&!/either lane/.test(t)).slice(0,3);
    out.push({kind:'label',slug:f.slice(0,-5),file:path.join('labels',f),name:text(name),sub:tags.join(' · '),eyebrow:'the labels'});
  }
  for(const f of fs.readdirSync('tracklists')){
    if(!f.endsWith('.html')||f==='index.html')continue;const s=fs.readFileSync(path.join('tracklists',f),'utf8');
    const name=(s.match(/<h1>(.*?)<\/h1>/)||[])[1];if(!name)continue;
    const sub=text((s.match(/<div class="sub">(.*?)<\/div>/)||[])[1]).replace(/·\s*uploaded.*$/,'').trim();
    const n=(s.match(/<td class="n">/g)||[]).length;
    out.push({kind:'tracklist',slug:f.slice(0,-5),file:path.join('tracklists',f),name:text(name),sub:[sub,n?n+' tracks, timestamped':''].filter(Boolean).join(' · '),eyebrow:'tracklist'});
  }
  return out;
}
const MARK='<svg viewBox="0 0 240 240" width="150" height="150"><g fill="none" stroke="#FF1C02" stroke-width="5"><circle cx="120" cy="120" r="104"/><circle cx="120" cy="120" r="76"/><circle cx="120" cy="120" r="48"/></g><circle cx="120" cy="120" r="18" fill="#FF1C02"/><polyline points="6,120 30,120 48,84 68,150 88,96 108,138 120,114 132,138 152,96 172,150 192,84 210,120 234,120" fill="none" stroke="#F2F2EF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function html(it){
  const big=it.name.length>26?'72px':it.name.length>16?'92px':'112px';
  return `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@900&family=Space+Mono&display=swap" rel="stylesheet"><style>
  html,body{margin:0;width:1200px;height:630px;background:#0B0B0D;color:#F2F2EF;font-family:Poppins,Arial,sans-serif;overflow:hidden}
  .dots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,28,2,.16) 2px,transparent 3px);background-size:28px 28px;-webkit-mask-image:radial-gradient(ellipse 50% 60% at 88% 30%,#000,transparent 70%);mask-image:radial-gradient(ellipse 50% 60% at 88% 30%,#000,transparent 70%)}
  .wrap{position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column;justify-content:flex-end}
  .eye{font-family:"Space Mono",monospace;font-size:24px;letter-spacing:.34em;text-transform:uppercase;color:#FF1C02;margin-bottom:18px}
  h1{margin:0;font-weight:900;font-size:${big};line-height:1.02;letter-spacing:-.02em;max-width:900px;word-wrap:break-word}
  .sub{font-family:"Space Mono",monospace;font-size:26px;color:#8A8A93;margin-top:22px;max-width:900px}
  .foot{position:absolute;right:80px;bottom:60px;font-family:"Space Mono",monospace;font-size:22px;letter-spacing:.12em;color:#F2F2EF}
  .foot b{color:#FF1C02;font-weight:400}.mark{position:absolute;right:80px;top:64px}
  </style></head><body><div class="dots"></div><div class="mark">${MARK}</div><div class="wrap"><div class="eye">${esc(it.eyebrow)}</div><h1>${esc(it.name)}</h1>${it.sub?`<div class="sub">${esc(it.sub)}</div>`:''}</div><div class="foot">grooves<b>MAXXING</b>.com</div></body></html>`;
}
(async()=>{
  const items=artists();const manifestPath='og/manifest.json';
  fs.mkdirSync('og/artists',{recursive:true});fs.mkdirSync('og/labels',{recursive:true});fs.mkdirSync('og/tracklists',{recursive:true});
  let manifest={};try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch(e){}
  const limit=process.argv[2]?parseInt(process.argv[2],10):Infinity;
  const todo=items.filter(it=>{const key=`${it.kind}s/${it.slug}`;const sig=crypto.createHash('md5').update(it.name+'|'+it.sub+'|v1').digest('hex');it.key=key;it.sig=sig;return manifest[key]!==sig||!fs.existsSync(`og/${key}.jpg`)}).slice(0,limit);
  console.log(`${items.length} pages, ${todo.length} to render`);
  if(todo.length){
    const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
    for(const it of todo){
      await p.setContent(html(it),{waitUntil:'load'});
      try{await p.evaluate(()=>document.fonts.ready);}catch(e){}
      await p.screenshot({path:`og/${it.key}.jpg`,type:'jpeg',quality:84});
      manifest[it.key]=it.sig;
    }
    await b.close();
  }
  fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  // point each page at its own card when it still carries the generic image
  let tagged=0;
  for(const it of items){
    if(!fs.existsSync(`og/${it.key}.jpg`))continue;
    const want=`${SITE}/og/${it.key}.jpg`;let s=fs.readFileSync(it.file,'utf8');const o=s;
    s=s.replace(/<meta property="og:image" content="[^"]*">/,`<meta property="og:image" content="${want}">`);
    if(!/name="twitter:image"/.test(s))s=s.replace(/(<meta property="og:image" content="[^"]*">)/,`$1\n<meta name="twitter:image" content="${want}">`);
    else s=s.replace(/<meta name="twitter:image" content="[^"]*">/,`<meta name="twitter:image" content="${want}">`);
    if(s!==o){fs.writeFileSync(it.file,s);tagged++}
  }
  console.log(`og: ${Object.keys(manifest).length} cards in the manifest, ${tagged} pages retagged`);
})().catch(e=>{console.error(e);process.exit(1)});
