/* site check (site review build, 2026-10-11). loads the main pages in headless chromium at phone and desktop
   width and fails on a console error, a page error, a missing same-origin file, a horizontal overflow, a page
   without the tab bar, or a youtube rail that did not become the shared player. content counts are not checked,
   so the laptop scripts can keep changing what the pages say. outside hosts are blocked, so thumbnails stay black. */
const {chromium}=require('playwright');
const BASE='http://127.0.0.1:8787';
const PAGES=['/index.html','/artists.html','/sets.html','/interviews.html','/events.html','/more.html','/scan.html','/badges.html','/upcoming.html','/labels.html','/newsletter.html','/friday.html','/404.html','/search.html','/radio.html','/crate.html','/open-ids.html','/tracklists/index.html',
  '/artists/adam-ten.html','/artists/max-styler.html','/artists/balanka.html','/artists/gkat.html','/artists/solomun.html','/labels/make-the-girls-dance-records.html','/labels/nu-moda.html','/tracklists/cloonee-live-at-red-rocks.html','/newsletter/fgf-001.html'];
const NO_TABS=['/sets.html','/interviews.html'];
/* the render proof: full-page screenshots of the pages a layout change usually touches, saved to shots/ and
   uploaded as a workflow artifact, so a push that moved something can be looked at, not just trusted */
const SHOTS=['/index.html','/scan.html','/upcoming.html','/open-ids.html','/search.html','/artists/adam-ten.html','/tracklists/cloonee-live-at-red-rocks.html'];
const fs=require('fs');try{fs.mkdirSync('shots',{recursive:true})}catch(e){}
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
      if(path==='/tracklists/cloonee-live-at-red-rocks.html'){
        const f=await p.evaluate(()=>({bar:!!document.getElementById('gmx-now'),api:/enablejsapi=1/.test(document.querySelector('.embed iframe').src),hearts:document.querySelectorAll('table.tl .gmx-heart').length}));
        log(f.bar&&f.api,path+': follow-along armed (bar present, player api enabled)');
        log(f.hearts>10,path+': hearts on the rows ('+f.hearts+')');
      }
      if(path==='/radio.html'){
        await p.waitForTimeout(1200);
        const r=await p.evaluate(()=>({slides:document.querySelectorAll('.gmx-stage .set-slide').length,count:(document.querySelector('.set-count')||{}).textContent,first:(document.querySelector('.set-slide .set-meta .mono')||{}).textContent}));
        log(r.slides>100&&/of/.test(r.count||''),path+': stage built from the index ('+r.slides+' sets, first card: '+(r.first||'')+')');
      }
      if(path==='/artists/adam-ten.html'){
        const h=await p.evaluate(()=>document.querySelectorAll('.gmx-stage .gmx-heart').length);
        log(h>0,path+': hearts on the stage slides ('+h+')');
      }
      if(path==='/events.html'){
        await p.evaluate(()=>document.getElementById('tours').scrollIntoView());await p.waitForTimeout(900);
        const v=await p.evaluate(()=>({rows:document.querySelectorAll('.tour').length,opacity:getComputedStyle(document.getElementById('tours')).opacity}));
        log(v.rows>0&&v.opacity==='1',path+': the tour list is visible after it renders ('+v.rows+' rows, opacity '+v.opacity+')');
      }
      if(path==='/artists/solomun.html'){
        await p.waitForTimeout(900);
        const r=await p.evaluate(()=>({box:!!document.querySelector('.gmx-rel'),chips:document.querySelectorAll('.gmx-rel .row a').length,stages:document.querySelectorAll('.gmx-rel .gmx-stage').length}));
        log(r.box,path+': "also on the site" box present ('+r.chips+' links, '+r.stages+' stages)');
      }
      if(path==='/events.html'){
        await p.waitForTimeout(600);
        const l=await p.evaluate(()=>document.querySelectorAll('#radar strong a.gmx-ar').length);
        log(l>20,path+': bold artist names link to profiles ('+l+')');
      }
      if(path==='/tracklists/cloonee-live-at-red-rocks.html'){
        await p.waitForTimeout(600);
        const l=await p.evaluate(()=>({ar:document.querySelectorAll('table.tl a.gmx-ar').length,more:!!document.querySelector('.gmx-rel')}));
        log(l.ar>0&&l.more,path+': row names linked ('+l.ar+') and the keep going box present');
      }
      if(path==='/sets.html'){
        await p.click('details.a summary >> nth=0');await p.waitForTimeout(1200);
        const n=await p.evaluate(()=>document.querySelector('details.a[open] .grid[data-slug] .card')?document.querySelector('details.a[open] .grid[data-slug]').querySelectorAll('.card').length:0);
        log(n>0,path+': an opened fold renders its cards from sets-index.json ('+n+')');
      }
      if(path==='/scan.html'){
        const a=await p.evaluate(()=>({auto:!!document.querySelector('#autobar #autobtn'),pending:!!document.getElementById('pendingbar'),api:typeof window.gmxSession==='object'}));
        log(a.auto&&a.pending&&a.api,path+': auto button, pending bar and session hooks present');
        // what happens next (ui build 4): four steps from a made-up match, a guess and a blank, and the sent state
        const w=await p.evaluate(()=>{
          const t={t0:Date.now()-16800,first:16800,rounds:[{at:5000},{at:9000},{at:12000},{at:15000}]};
          const cand={artist_claim:'Space Motion',title_claim:'Woop Woop',headline:'Woop Woop',subline:'Space Motion',status:'unreleased',shown_score:97,tier:'CONFIRMED',confidence:97,heard_in:[],store_links:{}};
          const match=gmxPath.block({card:{kind:'match',candidate:cand},timing:t,in_set:{set_title:'Vintage Culture at Club Space',at:'44:15',row:'Space Motion - Woop Woop (unreleased)'}});
          const guess=gmxPath.block({card:{kind:'guess',candidate:Object.assign({},cand,{shown_score:62,tier:'LIKELY'})},timing:t,in_set:null});
          const none=gmxPath.block({card:{kind:'none',candidate:null},timing:t,in_set:null});
          const d=document.createElement('div');d.innerHTML=match;const m=d.querySelectorAll('.path li');
          const states=[...m].map(li=>li.className);
          document.getElementById('card').innerHTML=match;gmxPath.sent('confirm');const last=document.querySelector('#path li:last-child');
          return {steps:m.length,states,guessNow:/st-now/.test(guess)&&/under our bar/.test(guess),noneNow:/nothing yet/.test(none),placed:/Club Space/.test(match)&&/calls it/.test(match),sent:last.className==='st-done'&&/your word is in/.test(last.textContent)};
        });
        log(w.steps===4&&w.states.join()==='st-done,st-done,st-done,st-now'&&w.guessNow&&w.noneNow&&w.placed&&w.sent,path+': what happens next renders four steps ('+w.states.join(' ')+'), the guess and blank cases, and the sent state');
      }
      if(path==='/open-ids.html'){
        await p.waitForTimeout(900);
        const o=await p.evaluate(()=>({sets:document.querySelectorAll('.oset').length,rows:document.querySelectorAll('.orow').length,reps:document.querySelectorAll('.rep').length}));
        log(o.sets>0&&o.rows>0,path+': the board renders from open-ids.json ('+o.sets+' sets, '+o.rows+' rows, '+o.reps+' repeats)');
      }
      if(path==='/upcoming.html'){
        await p.waitForTimeout(600);
        const u=await p.evaluate(()=>({bar:!!document.querySelector('.gmx-mine'),chips:document.querySelectorAll('.gmx-mine button').length}));
        log(u.bar&&u.chips===2,path+': the crate filter bar is present ('+u.chips+' chips)');
      }
      if(path==='/artists/adam-ten.html'){
        const f=await p.evaluate(()=>!!document.querySelector('section.artist .meta .gmx-follow'));
        log(f,path+': follow pill in the meta row');
      }
      if(path==='/tracklists/cloonee-live-at-red-rocks.html'||path==='/artists/adam-ten.html'){
        // bottom sheet (ui build 2): a "…" beside the hearts and the follow pill opens a sheet of actions
        await p.waitForTimeout(600);
        const m=await p.evaluate(()=>document.querySelectorAll('.gmx-more').length);
        await p.click('.gmx-more >> nth=0');await p.waitForTimeout(300);
        const s=await p.evaluate(()=>{const sh=document.querySelector('.gmx-sheet');return {open:!!sh&&!sh.hidden,acts:sh?sh.querySelectorAll('.gmx-sheet-act').length:0,title:sh?sh.querySelector('.gmx-sheet-title').textContent:'',focused:!!sh&&sh.contains(document.activeElement)}});
        await p.keyboard.press('Escape');await p.waitForTimeout(200);
        const gone=await p.evaluate(()=>document.querySelector('.gmx-sheet').hidden);
        log(m>0&&s.open&&s.acts>=3&&s.focused&&gone,path+': "…" buttons ('+m+'), the first opens a sheet ("'+s.title+'", '+s.acts+' actions, focus inside) and escape closes it');
      }
      if(path==='/artists/adam-ten.html'||path==='/index.html'){
        // quick search (ui build 1): the "/" key opens the sheet, typing finds rows, escape closes it
        await p.keyboard.press('/');await p.waitForTimeout(300);
        const opened=await p.evaluate(()=>{const s=document.querySelector('.gmx-quick');return !!s&&!s.hidden&&document.activeElement===s.querySelector('.gmx-quick-box')});
        await p.keyboard.type('adam ten');await p.waitForTimeout(900);
        const q=await p.evaluate(()=>({hits:document.querySelectorAll('.gmx-quick-hit').length,lit:!!document.querySelector('.gmx-quick-hit.lit'),all:(document.querySelector('.gmx-quick-all')||{}).getAttribute&&document.querySelector('.gmx-quick-all').getAttribute('href')}));
        await p.keyboard.press('Escape');await p.waitForTimeout(200);
        const closed=await p.evaluate(()=>document.querySelector('.gmx-quick').hidden);
        log(opened&&q.hits>0&&q.lit&&/q=adam/.test(q.all||'')&&closed,path+': quick search opens on "/", finds "adam ten" ('+q.hits+' rows, first lit, full link '+q.all+') and closes on escape');
      }
      if(path==='/search.html'){
        await p.fill('#q','adam ten');await p.waitForTimeout(600);
        const r=await p.evaluate(()=>({hits:document.querySelectorAll('.hit').length,groups:[...document.querySelectorAll('.grp')].map(g=>g.firstChild.textContent)}));
        log(r.hits>0,path+': "adam ten" finds results across groups '+JSON.stringify(r.groups));
      }
      if(path==='/index.html'){
        // next up (ui build 3): hidden with an empty crate; a crate that follows an artist from upcoming.json shows the band
        const empty=await p.evaluate(()=>document.getElementById('nextup').hidden);
        const seeded=await p.evaluate(async()=>{
          const j=await (await fetch('/upcoming.json')).json();
          const row=(j.rows||[]).find(r=>r.tier!=='named, not dated'&&r.artists.length);if(!row)return null;
          localStorage.setItem('gmx_crate',JSON.stringify([{kind:'artist',id:'artist:test',title:row.artists[0],artist:row.artists[0],t:Date.now()}]));return row.artists[0];
        });
        await p.reload();await p.waitForTimeout(1200);
        const band=await p.evaluate(()=>({hidden:document.getElementById('nextup').hidden,rows:document.querySelectorAll('#nextup-list li').length,first:(document.querySelector('#nextup-list li .t')||{}).textContent||''}));
        await p.evaluate(()=>localStorage.removeItem('gmx_crate'));
        log(empty&&!!seeded&&!band.hidden&&band.rows>0,path+': next up band hidden on an empty crate, shown after following "'+seeded+'" ('+band.rows+' rows, first: '+band.first.slice(0,60)+')');
      }
      if(SHOTS.includes(path)){try{await p.screenshot({path:'shots/'+vp.name+path.replace(/\//g,'_').replace(/\.html$/,'')+'.png',fullPage:path!=='/index.html'})}catch(e){}}
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(`\n${fails?fails+' FAILURES':'all checks passed'}`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
