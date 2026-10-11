/* site check (site review build, 2026-10-11). loads the main pages in headless chromium at phone and desktop
   width and fails on a console error, a page error, a missing same-origin file, a horizontal overflow, a page
   without the tab bar, or a youtube rail that did not become the shared player. content counts are not checked,
   so the laptop scripts can keep changing what the pages say. outside hosts are blocked, so thumbnails stay black. */
const {chromium}=require('playwright');
const BASE='http://127.0.0.1:8787';
const PAGES=['/index.html','/artists.html','/sets.html','/interviews.html','/events.html','/more.html','/scan.html','/badges.html','/upcoming.html','/labels.html','/newsletter.html','/friday.html','/404.html','/search.html','/tracklists/index.html',
  '/artists/adam-ten.html','/artists/max-styler.html','/artists/balanka.html','/artists/gkat.html','/artists/solomun.html','/labels/make-the-girls-dance-records.html','/labels/nu-moda.html','/tracklists/cloonee-live-at-red-rocks.html','/newsletter/fgf-001.html'];
const NO_TABS=['/sets.html','/interviews.html'];
(async()=>{
  const b=await chromium.launch();let fails=0;
  const log=(ok,msg)=>{console.log((ok?'  ok  ':'  FAIL')+' '+msg);if(!ok)fails++;};
  for(const vp of [{w:390,h:844,name:'phone'},{w:1280,h:900,name:'desktop'}]){
    console.log(`\n=== ${vp.name} ${vp.w}x${vp.h} ===`);
    const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h},hasTouch:vp.w<600,isMobile:vp.w<600});
    await ctx.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());
    for(const path of PAGES){
      const p=await ctx.newPage();const errs=[];
      p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
      p.on('pageerror',e=>errs.push('pageerror: '+e.message));
      p.on('response',r=>{if(r.url().startsWith(BASE)&&r.status()>=400)errs.push('http '+r.status()+' '+r.url().replace(BASE,''));});
      try{await p.goto(BASE+path,{waitUntil:'load',timeout:30000});}catch(e){log(false,path+': did not load ('+e.message.split('\n')[0]+')');await p.close();continue;}
      await p.waitForTimeout(500);
      const info=await p.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        tabs:!!document.querySelector('.gmx-tabs'),
        rails:document.querySelectorAll('button[data-yt]:not(.set-facade)').length,
        railsHidden:[...document.querySelectorAll('button[data-yt]:not(.set-facade)')].every(b=>{const c=b.closest('[hidden]');return !!c||getComputedStyle(b).display==='none'||b.closest('.set-stage')!==null}),
        stages:document.querySelectorAll('.gmx-stage').length,
      }));
      const real=errs.filter(e=>!/ERR_FAILED|net::ERR|Failed to load resource/.test(e));
      log(real.length===0,path+': console clean'+(real.length?' -> '+real.join(' | ').slice(0,240):''));
      log(!info.overflow,path+': no horizontal overflow');
      if(!NO_TABS.includes(path))log(info.tabs,path+': tab bar present');
      if(info.rails)log(info.stages>0&&info.railsHidden,path+': youtube rail became the shared player ('+info.stages+' stage(s))');
      if(path==='/sets.html'){
        await p.click('details.a summary >> nth=0');await p.waitForTimeout(1200);
        const n=await p.evaluate(()=>document.querySelector('details.a[open] .grid[data-slug] .card')?document.querySelector('details.a[open] .grid[data-slug]').querySelectorAll('.card').length:0);
        log(n>0,path+': an opened fold renders its cards from sets-index.json ('+n+')');
      }
      if(path==='/search.html'){
        await p.fill('#q','adam ten');await p.waitForTimeout(600);
        const r=await p.evaluate(()=>({hits:document.querySelectorAll('.hit').length,groups:[...document.querySelectorAll('.grp')].map(g=>g.firstChild.textContent)}));
        log(r.hits>0,path+': "adam ten" finds results across groups '+JSON.stringify(r.groups));
      }
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(`\n${fails?fails+' FAILURES':'all checks passed'}`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
