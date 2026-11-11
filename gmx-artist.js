/* groovesmaxxing artist profile, the one scroll layout (2026-11-10, after the tabs). vanilla, no dependencies.
   reorganises each artist page's own static markup in the browser: a hero (the newest filmed set, or the name set
   large when there is none), the lane line, the badges folded to four, follow and the link icons on one row, then
   one scroll of blocks: a one sentence intro with the whole bio folded behind "the full story", the sets as a
   sideways rail, the on tour strip, music, at a glance, tracklists and also on the site, caught live.
   each block has a small red heading and a stable id (#sets #tour #music #about #site #live), and only exists
   when it has something in it. old #sets #music #about #site links land on their block.
   the static html is never edited and nothing is rebuilt from data the page does not carry: the intro sentence is
   the page's own place and genre tags put in a sentence (or a <p class="intro"> the page may carry, between
   intro:start and intro:end markers). the laptop scripts and the repo builders keep writing the same markers, rails
   and blocks they always did, and this file only moves those nodes. a node it does not recognise goes to the at a
   glance block, never away.
   invariants (other scripts lean on them, see the maps of 2026-11-10):
   - everything stays inside section.artist[id]: one .meta, h1.aname, and .links reachable from the section
   - the hidden rails and the player's own stages are moved to a hidden stash, never deleted (gmx-related.js
     dedupes on data-yt in the page html, sitecheck counts .gmx-stage hearts)
   - a .player moves together with the a.gmx-src gmx-sheet.js puts after it
   - new classes, ids, attributes and events start with gmxa- (the block ids are the old tab hashes, kept)
   - any error puts every node back where it was and the old page shows. without js the old page shows as is.
   load order: after gmx-player.js (its stages exist), before gmx-motion.js (motion measures the new layout).
   the follow pill (gmx-crate.js), the "…" (gmx-sheet.js), the claim row (gmx-account.js) and the also on the
   site box (gmx-related.js) land later and are caught as they arrive.
   speed (measured at 4x and 6x cpu): the section stays hidden until .gmxa-ready, so every ms here is a blank screen
   on a slow phone. gmx-artist.css leaves the hidden section's blocks out of layout while the page parses
   (content-visibility), the head preloads this file and gmx-player.js (ensure_tags.py), and an embed is parked out of
   the dom before its box moves (park), because moving a live iframe rebuilds its frame. the parked frames go back
   after the first paint (settle). the on tour strip sits under the sets rail and nothing waits for it: it goes in
   when its two fetches answer, and keeps the reader's place when they have already scrolled past it.
   known limit: the static soundcloud, spotify and instagram iframes carry a live src and loading=lazy. in a browser
   without content-visibility the ones near the top may load before this file parks them.
   .links moves into the hero's actions row, still inside section.artist but no longer its child, so gmx-related.js
   appends its box to the section (its guard), and this file takes that box into the site block, its sets into the rail. */
(function(){
'use strict';
if(window.__gmxArtist)return;window.__gmxArtist=1;
var D=document;
if(!/^\/artists\//.test(location.pathname)||D.querySelector('meta[http-equiv="refresh"]'))return;
var any=D.querySelector('section.artist');if(!any)return;
var sec=D.querySelector('section.artist[id]:not(.label)');
if(!sec){any.classList.add('gmxa-ready');return;}

var PLAY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
var ARR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
var YTI='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4.2" fill="currentColor"/><path d="M10.2 8.9v6.2L15.6 12z" fill="#0B0B0D"/></svg>';
var SCI='<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="1.6" y="11.4" width="1.3" height="5.2" rx=".65"/><rect x="4.1" y="9.6" width="1.3" height="7" rx=".65"/><rect x="6.6" y="8.4" width="1.3" height="8.2" rx=".65"/><rect x="9.1" y="10.2" width="1.3" height="6.4" rx=".65"/><path d="M11.9 6.9c.5-.35 1.1-.55 1.8-.55 1.9 0 3.5 1.45 3.7 3.3.3-.1.6-.15.95-.15 1.6 0 2.9 1.3 2.9 2.9S19.95 15.3 18.35 15.3H11.9a.6.6 0 0 1-.6-.6V7.4c0-.2.1-.4.6-.5z"/></g></svg>';
var IGI='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.1"/></svg>';
var STOP={live:1,at:1,set:1,dj:1,full:1,the:1};
var KINDS=['filmed','audio','clips','talks'];
/* the blocks in page order. intro has no heading, tour is the strip */
var ORDER=['intro','sets','tour','music','about','site','live'];

/* ---- small helpers ---- */
function el(tag,cls,html){var e=D.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():'';}
function fold(s){return (s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,'and').replace(/\s+/g,' ').trim();}
function arr(l){return [].slice.call(l||[]);}
function frame(f){(window.requestAnimationFrame||setTimeout)(function(){try{f();}catch(e){}});}
function fire(node,name){try{node.dispatchEvent(new CustomEvent(name,{bubbles:true}));}catch(e){}}
function resize(){try{window.dispatchEvent(new Event('resize'));}catch(e){var ev=D.createEvent('UIEvents');ev.initUIEvent('resize',true,false,window,0);window.dispatchEvent(ev);}}
function ytOf(h){var m=/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/.exec(h||'');return m?m[1]:'';}
function startOf(h){var m=/[?&#](?:t|start)=(\d+)s?\b/.exec(h||'');return m?m[1]:'';}
function scUrl(src){var m=/[?&]url=([^&]+)/.exec(src||'');if(!m)return '';try{return decodeURIComponent(m[1]);}catch(e){return '';}}
function yearOf(s){var m=/\b(19|20)\d\d\b/.exec(s||'');return m?+m[0]:0;}
/* a rail caption keeps its <br> as a line break (textContent glues the two lines), so read it line by line */
function linesOf(nodes){
  var s='';nodes.forEach(function(k){var c=k.cloneNode(true);arr(c.querySelectorAll?c.querySelectorAll('br'):[]).forEach(function(b){b.parentNode.replaceChild(D.createTextNode('\n'),b);});s+='\n'+(c.textContent||'');});
  return s.split(/\n|\s{2,}/).map(function(l){return l.replace(/\s+/g,' ').trim();}).filter(Boolean);
}
var REDUCE=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- the undo log: every move, every class, every wrapper, so an error can put the page back ---- */
var moved=[],made=[],classed=[],frames=[],attrs=[];
function move(n,into,before){if(!n)return;if(!n.__gmxaHome){n.__gmxaHome=1;moved.push([n,n.parentNode,n.nextSibling]);}into.insertBefore(n,before||null);}
function make(tag,cls,html){var e=el(tag,cls,html);made.push(e);return e;}
function cls(n,c){n.classList.add(c);classed.push([n,c]);}
function attr(n,a,v){attrs.push([n,a]);n.setAttribute(a,v);}
/* an iframe that has not been tapped: out of the dom with no src, so it stops loading, and a hidden <i> stand-in keeps its
   place. every time an iframe that sits in the page is moved, the browser tears its frame down and builds a new one, which
   was most of this file's cost on a slow phone. so a frame is parked before the box around it moves, the boxes travel with
   the stand-in, and the frame goes back in place (no src, as before) once the page has painted (settle) or when it is
   tapped (wake), whichever comes first */
var held=[];
function park(f){
  var s=f.getAttribute('src');if(!s||f.hasAttribute('data-gmxa-src'))return;
  var p=f.parentNode;
  if(p){var ph=D.createElement('i');ph.className='gmxa-ph';ph.hidden=true;p.replaceChild(ph,f);f.__gmxaPh=ph;held.push(f);}
  hush(f,s);
}
/* the src goes, the frame stays where it is (harvest still finds it): for the hand-indented pages' sibling sections, which
   are moved before harvest, and a lazy frame moved with its src would be asked for on the spot */
function hush(f,s){s=s||f.getAttribute('src');if(!s||f.hasAttribute('data-gmxa-src'))return;f.setAttribute('data-gmxa-src',s);f.setAttribute('data-src',s);f.removeAttribute('src');frames.push(f);}
/* a frame that is its own box (no .player around it) moves first and is parked where it lands */
function carry(box,f,into,before){if(f&&box!==f)park(f);move(box,into,before);if(f&&box===f)park(f);}
function unhold(f){var ph=f.__gmxaPh;if(!ph)return;f.__gmxaPh=null;var i=held.indexOf(f);if(i>-1)held.splice(i,1);if(ph.parentNode)ph.parentNode.replaceChild(f,ph);}
function wake(f){if(!f)return;unhold(f);var s=f.getAttribute('data-gmxa-src');if(s&&f.getAttribute('src')!==s)f.setAttribute('src',s);}
/* the parked frames under a node, the ones still out of the page included */
function parked(root){return frames.filter(function(f){var at=f.__gmxaPh||f;return root&&root.contains(at);});}
/* phase two, after the first paint: the parked frames go back in place a few at a time while the phone is idle, then the
   sheet is told, so its "open on soundcloud" links (it reads the iframe in each .player) arrive with them */
function settle(){
  if(!held.length)return;
  var idle=window.requestIdleCallback||function(f){return setTimeout(function(){f({timeRemaining:function(){return 8;},didTimeout:true});},200);};
  idle(function step(dl){
    try{while(held.length&&(dl.didTimeout||dl.timeRemaining()>4))unhold(held[0]);}catch(e){held=[];}
    if(held.length)idle(step,{timeout:600});else fire(sec,'gmx:cards');
  },{timeout:1200});
}
var obs=[];
function restore(){
  obs.forEach(function(o){try{o.disconnect();}catch(e){}});
  held.slice().forEach(function(f){try{unhold(f);}catch(e){}});
  for(var i=moved.length-1;i>=0;i--){var m=moved[i];try{if(m[2]&&m[2].parentNode===m[1])m[1].insertBefore(m[0],m[2]);else m[1].appendChild(m[0]);}catch(e){}}
  made.forEach(function(e){if(e.parentNode)e.parentNode.removeChild(e);});
  classed.forEach(function(c){c[0].classList.remove(c[1]);});
  attrs.forEach(function(a){a[0].removeAttribute(a[1]);});
  frames.forEach(function(f){var s=f.getAttribute('data-gmxa-src');f.removeAttribute('data-gmxa-src');f.removeAttribute('data-src');if(s)f.setAttribute('src',s);});
  D.documentElement.classList.remove('gmxa-page');
}

var name=text(sec.querySelector('h1.aname')),fname=fold(name);
var stash,blocks={};

/* ---- 1. harvest the media the page already carries ---- */
function kindOfRail(rail){
  var h=rail.innerHTML.slice(0,400);
  if(/<!--\s*sets-2:start/.test(h))return 'clips';
  if(/<!--\s*interviews:start/.test(h))return 'talks';
  if(/<!--\s*sets:start/.test(h))return 'filmed';
  var lead=rail.previousElementSibling,hint=(rail.id||'')+' '+(lead&&lead.tagName==='P'?text(lead):'');
  if(/pod|interview|talk|own words/i.test(hint))return 'talks';
  if(/from the floor|clip/i.test(hint))return 'clips';
  return 'filmed';
}
function leadOf(n){var p=n&&n.previousElementSibling;return p&&p.tagName==='P'&&!p.className&&!p.querySelector('a')&&text(p).length<220?p:null;}
function noteText(p){return text(p).replace(/\s*slide\s*(→|&rarr;)?\s*$/i,'').replace(/\s*→\s*$/,'');}

function harvest(){
  var items=[],notes={},seen={};
  /* the player's stages, each right after its hidden rail */
  arr(sec.querySelectorAll('.set-stage')).forEach(function(st){
    if(st.closest('.gmx-rel,.gmxa-stash'))return;
    var rail=st.previousElementSibling,kind=rail?kindOfRail(rail):'filmed',lead=rail?leadOf(rail):null;
    if(lead&&!notes[kind])notes[kind]=noteText(lead);
    var first=rail&&/<!--\s*sets:start/.test(rail.innerHTML.slice(0,400));
    arr(st.querySelectorAll('.set-slide')).forEach(function(s,i){
      var f=s.querySelector('.set-facade');if(!f)return;var id=f.getAttribute('data-yt');if(!id||seen[id])return;seen[id]=1;
      var img=f.querySelector('img'),ob=rail&&rail.querySelector('button[data-yt="'+id+'"]'),w=ob&&ob.parentElement!==rail?ob.parentElement:null;
      var ln=w?linesOf(arr(w.children).filter(function(k){return k!==ob;})):[];if(!ln.length){var mc=text(s.querySelector('.set-meta .mono'));if(mc)ln=[mc];}
      items.push({id:id,kind:kind,title:f.getAttribute('data-title')||'set',cap:ln.join(' · '),cap1:ln[0]||'',img:img?img.getAttribute('src'):'',lead:first&&i===0});
    });
    if(lead)move(lead,stash);if(rail){arr(rail.querySelectorAll('iframe')).forEach(park);move(rail,stash);}move(st,stash);
  });
  /* a plain list of youtube links (max-styler's "every set we're tracking:"): each one not already on a card */
  arr(sec.querySelectorAll('div,p')).forEach(function(d){
    if(d.closest('.bio,.facts,.gmxa-stash,.gmx-rel,.gmx-rel-static,.meta,.links'))return;
    var as=arr(d.children);if(as.length<2||as.some(function(a){return a.tagName!=='A'||!ytOf(a.getAttribute('href'));}))return;
    var yr=0;
    as.forEach(function(a){var h=a.getAttribute('href'),id=ytOf(h),t=text(a);yr=yearOf(t)||yr;if(seen[id])return;seen[id]=1;
      items.push({id:id,kind:'filmed',title:t,cap:t,img:'',start:startOf(h),yr:yr});});
    move(d,stash);
  });
  /* soundcloud: the bare profile embed, and every set or track embed */
  var sc=[],prof=null;
  arr(sec.querySelectorAll('iframe')).forEach(function(f){
    var src=f.getAttribute('src')||f.getAttribute('data-src')||'';if(!/w\.soundcloud\.com\/player/.test(src))return;
    var u=scUrl(src),path=u.replace(/^https?:\/\/[^\/]+/,'').replace(/[?#].*$/,'').replace(/\/+$/,'');
    var box=f.closest('.player,.scwrap')||f;if(!sec.contains(box))return;
    var ps=box.closest('section.sec');
    var it={kind:'audio',sc:u,title:f.getAttribute('title')||'soundcloud',box:box,frame:f,lead:leadOf(box),sec:ps&&ps.parentNode===sec?ps:null};
    if(!prof&&/^\/[^\/]+$/.test(path))prof=it;else sc.push(it);
  });
  /* spotify */
  var sp=[];
  arr(sec.querySelectorAll('iframe')).forEach(function(f){
    var src=f.getAttribute('src')||f.getAttribute('data-src')||'';if(!/open\.spotify\.com\/embed/.test(src))return;
    /* the embed travels with its own wrapper (.player, or gkat's .spot inside a section that holds only it), so the page's sizing still applies */
    var s=f.closest('section.sec');if(s&&s.parentNode===sec&&s.querySelectorAll('iframe').length===1&&!s.querySelector('.rel'))return sp.push(s);
    sp.push(f.closest('.player,.spot')||f);
  });
  return {items:items,notes:notes,sc:sc,prof:prof,sp:sp,seen:seen};
}

/* ---- 2. twins: a soundcloud set and a filmed set of the same night ---- */
function toks(t){
  var s=fold(t);if(fname)s=s.split(fname).join(' ');
  return s.replace(/[^a-z0-9À-￿]+/g,' ').split(' ').filter(function(w){return w&&!STOP[w];});
}
function same(a,b){
  var A=toks(a),B=toks(b);if(!A.length||!B.length)return false;
  var ya=A.filter(function(w){return /^(19|20)\d\d$/.test(w);}).sort().join(),yb=B.filter(function(w){return /^(19|20)\d\d$/.test(w);}).sort().join();
  if(ya!==yb)return false;
  var u={},n=0,k;A.forEach(function(w){u[w]=1;});B.forEach(function(w){if(u[w]===1){u[w]=2;n++;}else if(!u[w])u[w]=3;});
  var all=0;for(k in u)all++;
  return all>0&&n/all>=0.75;
}

/* ---- 3. cards ---- */
function stopAll(except){
  arr(sec.querySelectorAll('.gmxa-on')).forEach(function(c){
    if(c===except||c===sec||c.hasAttribute('data-gmxa-keep'))return;c.classList.remove('gmxa-on','gmxa-scon','gmxa-playing');
    arr(c.querySelectorAll('.video-frame')).forEach(function(v){if(v.__facade&&v.parentNode)v.parentNode.replaceChild(v.__facade,v);});
    arr(c.querySelectorAll('iframe[data-gmxa-src]')).forEach(function(f){f.removeAttribute('src');});
    arr(c.querySelectorAll('[aria-pressed="true"]')).forEach(function(b){b.setAttribute('aria-pressed','false');});
  });
}
function ytFrame(b){
  var fr=D.createElement('iframe'),st=b.getAttribute('data-gmxa-start');
  fr.src='https://www.youtube-nocookie.com/embed/'+b.getAttribute('data-yt')+'?autoplay=1'+(st?'&start='+st:'');
  fr.title=b.getAttribute('data-title')||'';fr.allowFullscreen=true;
  fr.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  var w=el('div','video-frame');w.appendChild(fr);w.__facade=b;b.parentNode.replaceChild(w,b);
}
function ytCard(it){
  var s=window.gmxPlayer?gmxPlayer.slide({id:it.id,title:it.title,cap:'',img:it.img}):null;
  if(!s){s=el('div','set-slide');var fb=el('button','set-facade','<img alt="" loading="lazy" src="https://img.youtube.com/vi/'+it.id+'/hqdefault.jpg"><span class="set-play" aria-hidden="true">'+PLAY+'</span>');fb.type='button';fb.setAttribute('data-yt',it.id);fb.setAttribute('data-title',it.title);fb.setAttribute('aria-label','play '+it.title);s.appendChild(fb);var mt=el('div','set-meta');mt.appendChild(el('span','t'));s.appendChild(mt);}
  s.classList.add('gmxa-card');s.setAttribute('data-gmxa-kind',it.kind);
  var f=s.querySelector('.set-facade'),meta=s.querySelector('.set-meta'),t=meta.querySelector('.t');
  if(it.start)f.setAttribute('data-gmxa-start',it.start);
  var media=el('div','gmxa-media'+(it.kind==='clips'?' gmxa-tall':''));f.parentNode.insertBefore(media,f);media.appendChild(f);
  media.appendChild(el('span','gmxa-pill',it.kind==='clips'?'clip':it.kind==='talks'?'talk':'yt'));
  var cap=it.cap||'',c1=it.cap1||cap;
  t.textContent=cap&&cap.length<140?cap:c1&&c1.length<140?c1:it.title;
  arr(meta.querySelectorAll('.mono')).forEach(function(m){m.parentNode.removeChild(m);});
  var sub=el('span','mono',it.kind==='clips'?'clip':it.kind==='talks'?'talk':'filmed');meta.appendChild(sub);
  var href='https://www.youtube.com/watch?v='+it.id+(it.start?'&t='+it.start+'s':'');
  if(it.ext){
    /* a set the uploader will not let embed: the card is a plain link out, the way the page wrote it */
    var a=el('a','set-facade gmxa-ext',f.innerHTML);a.href=href;a.target='_blank';a.rel='noopener';a.setAttribute('data-yt',it.id);a.setAttribute('aria-label',it.title+', opens on youtube');
    f.parentNode.replaceChild(a,f);media.querySelector('.gmxa-pill').textContent='yt ↗';return s;
  }
  var out=el('a','gmxa-out','youtube ↗');out.href=href;out.target='_blank';out.rel='noopener';meta.appendChild(out);
  return s;
}
function wave(seed){var h='';for(var i=0;i<14;i++){var v=30+((seed*7+i*37)%70);h+='<i style="height:'+v+'%"></i>';}return '<span class="gmxa-wave" aria-hidden="true">'+h+'</span>';}
/* a soundcloud player, tap to load: the .player box (and the sheet's link after it) moves into the card */
function scInto(card,it,host){
  var link=it.box.nextElementSibling&&it.box.nextElementSibling.classList.contains('gmx-src')?it.box.nextElementSibling:null;
  if(it.lead)move(it.lead,stash);
  carry(it.box,it.frame,host);if(link){move(link,host);short(link);}
  cls(it.box,'gmxa-scbox');
}
function scCard(it,n){
  var c=make('div','gmxa-card gmxa-sc');c.setAttribute('data-gmxa-kind','audio');
  var media=el('div','gmxa-media'),b=el('button','gmxa-scbtn',wave(n)+'<span class="gmxa-pi" aria-hidden="true">'+PLAY+'</span><span class="gmxa-pill" aria-hidden="true">sc</span>');
  b.type='button';b.setAttribute('aria-label','listen to '+it.title);b.setAttribute('aria-pressed','false');
  media.appendChild(b);c.appendChild(media);
  var meta=el('div','gmxa-cmeta');meta.appendChild(el('span','t',''));meta.firstChild.textContent=it.title.replace(new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[-:@|]?\\s*','i'),'')||it.title;if(/^(on )?soundcloud$/i.test(meta.firstChild.textContent))meta.firstChild.textContent=name+' on soundcloud';
  meta.appendChild(el('span','mono','audio'));c.appendChild(meta);
  scInto(c,it,c);
  b.addEventListener('click',function(){playSc(c,b,it.frame);});
  return c;
}
/* the tapped button hides with the facade, so focus goes to the player that replaces it, never to <body> */
function playSc(card,b,f){stopAll(card);card.classList.add('gmxa-on','gmxa-scon');b.setAttribute('aria-pressed','true');wake(f);focusIn(f);}
/* the sheet's "open on soundcloud ↗" sits on a card's kind line, where it reads as "soundcloud ↗" */
function short(a){if(a&&a.closest('.gmxa-card,.gmxa-herosc')&&/soundcloud/i.test(a.textContent))a.textContent='soundcloud ↗';}
function focusIn(f){setTimeout(function(){try{f.focus();}catch(e){}},0);}
function twin(card,it){
  card.setAttribute('data-gmxa-kind','filmed audio');
  var f=card.querySelector('.set-facade'),row=el('div','gmxa-twin');
  var w=el('button','gmxa-src2',YTI+'<span>watch</span>'),l=el('button','gmxa-src2',SCI+'<span>listen</span>');
  w.type=l.type='button';w.setAttribute('aria-pressed','false');l.setAttribute('aria-pressed','false');
  w.setAttribute('aria-label','watch on youtube');l.setAttribute('aria-label','listen on soundcloud');
  row.appendChild(w);row.appendChild(l);
  card.querySelector('.gmxa-media').appendChild(el('span','gmxa-duo','yt + sc'));
  var pill=card.querySelector('.gmxa-media .gmxa-pill');if(pill)pill.parentNode.removeChild(pill);
  /* watch and listen sit on the picture, so a twin is as tall as the cards beside it in the rail */
  card.querySelector('.gmxa-media').appendChild(row);
  var host=el('div','gmxa-schost');card.appendChild(host);scInto(card,it,host);
  w.addEventListener('click',function(){var fb=card.querySelector('.set-facade');card.classList.remove('gmxa-scon');if(fb)fb.click();w.setAttribute('aria-pressed','true');l.setAttribute('aria-pressed','false');});
  l.addEventListener('click',function(){var v=card.querySelector('.video-frame');if(v&&v.__facade)v.parentNode.replaceChild(v.__facade,v);playSc(card,l,it.frame);w.setAttribute('aria-pressed','false');opened(card);});
  return f;
}

/* ---- 4. the hero ---- */
function hero(lead){
  var h=make('div','gmxa-hero'+(lead?' gmxa-img':' gmxa-type')),id=make('div','gmxa-id');
  if(lead&&window.gmxPlayer){
    var box=el('div','gmxa-stagebox'),st=el('div','set-stage gmxa-hstage'),vp=el('div','set-viewport'),rl=el('div','set-rail');
    st.setAttribute('data-label','set');
    var s=gmxPlayer.slide({id:lead.id,title:lead.title,cap:'',img:'https://img.youtube.com/vi/'+lead.id+'/maxresdefault.jpg'});
    var img=s.querySelector('img');img.loading='eager';img.setAttribute('fetchpriority','high');img.onerror=null;
    /* maxresdefault, then hqdefault. youtube answers a missing size with a 120 px grey card: hqdefault at 120 px means the
       video is gone or private, so the hero goes typographic and the set drops to the rail (h.__dead) */
    var hq='https://img.youtube.com/vi/'+lead.id+'/hqdefault.jpg';
    /* only a grey card that arrived counts: a network error (offline, a blocker) keeps the hero as it is */
    img.addEventListener('load',function(){if(!img.naturalWidth||img.naturalWidth>120)return;if(img.src.indexOf('/hqdefault')<0)img.src=hq;else if(h.__dead)h.__dead();});
    img.addEventListener('error',function(){if(img.src.indexOf('/hqdefault')<0)img.src=hq;});
    var t=s.querySelector('.set-meta .t');if(t)t.className='t gmxa-vh';
    rl.appendChild(s);vp.appendChild(rl);st.appendChild(vp);box.appendChild(st);
    var eye=el('p','gmxa-eye','<b>newest set</b>');var ec=el('span');ec.textContent=' · '+(lead.cap1||lead.title);eye.appendChild(ec);
    box.appendChild(eye);h.appendChild(box);
    st.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.set-facade')){stopAll(null);stopSc(h);h.classList.add('gmxa-playing');}},true);
    h.__stage=st;
  }
  h.appendChild(id);return h;
}
function stopSc(c){if(!c.classList.contains('gmxa-scon'))return;c.classList.remove('gmxa-scon','gmxa-on');arr(c.querySelectorAll('iframe[data-gmxa-src]')).forEach(function(f){f.removeAttribute('src');});arr(c.querySelectorAll('[aria-pressed="true"]')).forEach(function(b){b.setAttribute('aria-pressed','false');});}
/* the newest set has a soundcloud twin: one listen button on the hero, the player opens under it. no second card */
function heroTwin(h,it){
  var host=make('div','gmxa-schost gmxa-herosc');h.insertBefore(host,h.querySelector('.gmxa-id'));scInto(null,it,host);
  var meta=h.__stage.querySelector('.set-meta'),l=el('button','gmxa-hlisten',SCI);l.type='button';
  l.setAttribute('aria-label','listen on soundcloud');l.setAttribute('aria-pressed','false');meta.insertBefore(l,meta.firstChild);
  l.addEventListener('click',function(){stopAll(h);arr(h.querySelectorAll('.video-frame')).forEach(function(v){if(v.__facade)v.parentNode.replaceChild(v.__facade,v);});
    h.classList.add('gmxa-on','gmxa-scon','gmxa-playing');l.setAttribute('aria-pressed','true');wake(it.frame);focusIn(it.frame);});
}
/* the lane line, the badges fold, the follow and links row */
function idBlock(h){
  var id=h.querySelector('.gmxa-id'),meta=sec.querySelector('.meta'),h1=sec.querySelector('h1.aname'),links=sec.querySelector('.links');
  move(h1,id);
  var plain=arr(meta.querySelectorAll('.tag')).filter(function(t){return !t.classList.contains('badge')&&!t.classList.contains('gmx-follow')&&t.parentNode===meta;});
  if(plain.length){
    var sub=make('p','gmxa-sub');
    plain.forEach(function(t,i){if(i)sub.appendChild(D.createTextNode(' · '));var s=el('span',t.classList.contains('lane')?'gmxa-lane':'');s.textContent=text(t);sub.appendChild(s);cls(t,'gmxa-x');});
    id.appendChild(sub);
  }
  move(meta,id);cls(meta,'gmxa-meta');
  var vb=sec.querySelector('.vb-lines');
  var badges=arr(meta.children).filter(function(t){return t.classList.contains('tag')&&t.classList.contains('badge')&&!t.classList.contains('gmx-follow');});
  badges=badges.filter(function(b){return !/\b(ss|vb)\b/.test(b.className);}).concat(badges.filter(function(b){return /\b(ss|vb)\b/.test(b.className);}));
  if(badges.length){
    var wrap=make('div','gmxa-badges');wrap.id='gmxa-badges';meta.insertBefore(wrap,meta.firstChild);
    badges.forEach(function(b,i){move(b,wrap);if(i>=4)cls(b,'gmxa-folded');});
    if(badges.length>4){
      var n=badges.length-4,p=el('button','gmxa-plus');p.type='button';
      /* the name starts with what the button shows (+7 more badges, less badges): no aria-label to drift from it */
      function lab(open){p.innerHTML='';p.appendChild(D.createTextNode(open?'less':'+'+n));p.appendChild(el('span','gmxa-vh',open?' badges':' more badges'));}
      p.setAttribute('aria-expanded','false');p.setAttribute('aria-controls','gmxa-badges');lab(false);
      p.addEventListener('click',function(){var open=p.getAttribute('aria-expanded')!=='true';p.setAttribute('aria-expanded',open?'true':'false');
        badges.slice(4).forEach(function(b){b.classList.toggle('gmxa-folded',!open);});lab(open);});
      wrap.appendChild(p);
    }
  }
  var acts=make('div','gmxa-acts');meta.appendChild(acts);
  if(links)move(links,acts);
  if(vb)move(vb,id);
  var f=meta.querySelector('.gmx-follow');if(f)acts.insertBefore(f,acts.firstChild);
  function edge(){acts.classList.toggle('gmxa-cut',acts.scrollWidth-acts.clientWidth-acts.scrollLeft>4);}
  acts.addEventListener('scroll',edge,{passive:true});window.addEventListener('resize',function(){frame(edge);});frame(edge);
  h.__acts=acts;h.__edge=edge;
  return plain;
}

/* ---- 5. the intro: one sentence from the page's own tags, never a word the page does not carry ----
   the tags under the name are a lane (.tag.lane, not used here), a place and a genre, mostly in that order, but not
   always (seven pages put the genre first, 105 carry only one tag, one carries three). so each tag is read for what
   it is: a genre names a sound (house, techno, disco, indie dance...), a place is anything else, unless it reads as a
   label, a crew or a note ("REWLER records", "origin undisclosed") or it is an "a to b" move whose every part names a
   label in the page's own facts ("bunny tiger to bassmatic"). words are only ever dropped, never added, except "the"
   before a country ("from the uk") and "and" to close a list. a move keeps one end: where they come from ("staten island
   to orlando" -> staten island), what they make now ("house to bass house" -> bass house). a part that describes rather
   than names a sound ("house, sung", "pop crossover", "with acid edges") is left out. two genre tags join with "+", a
   flavour ("indie tech") steps aside for a core genre. three sounds or more, or nothing left but a description, read
   "<name> is from <place> and makes <list>" */
var GEN=/\b(house|techno|disco|nu-disco|dance|garage|bass|bassline|trap|minimal|tech|afro\w*|edm|electro\w*|funk\w*|pop|club|trance|breaks?|beat|jungle|drum|dubstep|grime|hip|soul\w*|r&b|jazz\w*|ambient|downtempo|progressive|organic|melodic|indie|acid|edits?|remix\w*|bpm|groov\w*|rave|vocal\w*|songwrit\w*|electronic\w*|leftfield|amapiano|latin|tribal|dub|psy\w*|tekno|balearic|french touch|chanson|italo)\b/i;
var STRONG=/\b(records?|recordings|crew|anonymous|undisclosed|not published|project|topliner|regular|nothing but)\b/i,WEAK=/\b(music|duo|vibes)\b/i;
var CORE=/\b(house|techno|disco|dance|garage|tech|trance|minimal|balearic|french touch|electro\w*|breaks|trap|bass)\b/i;
var FLAV=/^(indie tech|psychedelic edge|la .*)$/i,ROLE=/\b(vocalist|songwriter|duo|band|producer|trio|collective)$/i;
var DESC=/(^|\s)(sung|played live|then|crossover|edges?|roots|vocals|songwriting|flavours?|edits)(\s|$)|-(adjacent|inflected|infused)\b|-$|\stinged$/i;
var THE=/^(united kingdom|united states|netherlands|bay area|uk|usa|south of france)$/i;
var SEP=/(\s*,\s*|\s+[+\/·]\s+|\s+and\s+|\s+&\s+(?!bass))/;
/* a genre phrase cleaned: [text, the makes frame] */
function gclean(g){
  g=g.replace(/\s*\([^)]*\)/g,'').trim();var mv=g.split(/\s+(?:to|→)\s+/);g=mv[mv.length-1].split(/\s+(?:meets|turned|with)\s+/)[0];
  var tk=g.split(SEP),keep=[];
  for(var i=0;i<tk.length;i+=2)if(!DESC.test(tk[i]))keep.push([tk[i],i?tk[i-1]:'']);
  if(!keep.length)return [tk[0],1];
  if(keep.length>2)return [keep.slice(0,-1).map(function(k){return k[0];}).join(', ')+' and '+keep[keep.length-1][0],1];
  if(keep.length<2)return [keep[0][0],/^(la|the) /i.test(keep[0][0])];
  var s=keep[1][1].trim();return [keep[0][0]+(!s||s===','||s==='·'?' and ':' '+s+' ')+keep[1][0],0];
}
function pclean(p){
  var m=/^(.*?),?\s*based in (.+)$/i.exec(p),b=m?m[2].replace(/\.$/,''):'';if(m)p=m[1];
  p=p.split(/\s+(?:to|→)\s+/)[0].replace(/\s+\+\s+/g,' and ').replace(/\.$/,'').split(/(\s+and\s+)/).map(function(x){return THE.test(x)?'the '+x:x;}).join('');
  return (p?'from '+p:'')+(p&&b?', ':'')+(b?'based in '+b:'');
}
function intro(nm,tags,labels){
  var place='',gens=[],used=[];
  tags.forEach(function(t){
    if(!t||STRONG.test(t)||(labels&&labels.split(/\s*[|,]\s*/).indexOf(fold(t))>-1))return;
    if(GEN.test(t))return gens.push(t);
    if(WEAK.test(t))return;
    var parts=fold(t).split(/\s+(?:to|and|\+|→)\s+|,\s*/).filter(function(x){return x.length>2;});
    if(labels&&parts.length>1&&parts.every(function(x){return labels.indexOf(x)>-1;}))return;
    if(!place){place=t;used.push(t);}
  });
  var core=gens.filter(function(x){return !FLAV.test(x)&&!(gens.length>1&&ROLE.test(x));});if(core.length)gens=core;gens=gens.slice(-2);used=used.concat(gens);
  var gc=gens.length?gclean(gens.join(' + ')):['',0],g=gc[0],mk=gc[1],where=place?pclean(place):'';
  var a=/^(uk|u\.|uni|euro|one)/i.test(g)?'a':/^(r&b|r\b|[aeiou8])/i.test(g)?'an':'a',role=ROLE.test(g),r={g:g,p:place,used:used};
  if(g&&where)r.s=mk?nm+' is '+where+' and makes '+g+'.':nm+' is '+a+' '+g+(role?'':' artist')+' '+where+'.';
  else if(where)r.s=nm+' is '+where+'.';
  else if(g)r.s=role&&!mk?nm+' is '+a+' '+g+'.':nm+' makes '+g+'.';
  else return null;
  r.f=g&&where?'genre+place':g?'genre':'place';return r;
}
/* the intro block: the sentence (the page's own p.intro first), then the bio behind "the full story". a one short
   paragraph starter shows as it is, with no fold, and no sentence above it that would say the same thing */
function storyBlock(plain){
  var box=make('div','gmxa-intro'),bio=sec.querySelector('.bio'),own=sec.querySelector('p.intro');
  var it=null,lede=null;
  var tags=plain.filter(function(t){return !t.classList.contains('lane');}).map(text);
  var lab=arr(sec.querySelectorAll('.facts .fact')).filter(function(f){return /label|releases on|runs/i.test(text(f.querySelector('.k')));}).map(function(f){return fold(text(f.querySelector('.v')));}).join(' | ');
  it=intro(name,tags,lab);
  if(own&&!own.closest('.gmxa-intro')){
    /* the page's own sentence wins. the line under the name still drops the genre tags, and the place tag when the sentence names it */
    move(own,box);cls(own,'gmxa-lede');lede=own;
    var said=fold(text(own));
    it=it?{used:it.used.filter(function(t){return t!==it.p||said.indexOf(fold(t))>-1;})}:null;
  }
  else if(it){lede=make('p','gmxa-lede');lede.textContent=it.s;box.appendChild(lede);}
  box.__it=it;
  if(!bio||!text(bio)){if(!lede)return null;return box;}
  move(bio,box);
  var ps=arr(bio.children),thin=ps.length===1&&ps[0].tagName==='P'&&text(ps[0]).length<700;
  box.__bio=bio;box.__thin=thin;
  if(thin){
    if(lede&&it){var bt=fold(text(bio));if((it.p&&bt.indexOf(fold(it.p))>-1)||(it.g&&bt.indexOf(fold(it.g))>-1)){box.removeChild(lede);box.__it=null;}}
    return box;
  }
  if(lede){attr(bio,'data-more','fold');attr(bio,'data-more-label','the full story');storyEnd(bio,box);return box;}
  /* no sentence: the first paragraph is the opener, the rest folds */
  var first=ps.filter(function(c){return c.tagName==='P';})[0],after=arr(bio.childNodes).slice(first?arr(bio.childNodes).indexOf(first)+1:0);
  if(after.some(function(n){return n.nodeType===1;})){var rest=make('div','gmxa-rest');rest.setAttribute('data-more','fold');rest.setAttribute('data-more-label','the full story');bio.appendChild(rest);after.forEach(function(n){move(n,rest);});box.__rest=rest;storyEnd(rest,box);}
  return box;
}
/* a long open story closes from its end too, and the reader lands back on the intro */
function storyEnd(f,box){
  var b=make('button','gmx-more-btn gmxa-close','hide the full story');b.type='button';b.setAttribute('aria-expanded','true');f.appendChild(b);
  b.addEventListener('click',function(){var t=f.__gmxMoreBtn;if(t){t.click();try{t.focus({preventScroll:true});}catch(e){}}try{box.scrollIntoView({block:'start',behavior:REDUCE?'auto':'smooth'});}catch(e){}});
}
/* once the sentence says where they are from and what they make, the line under the name keeps only the rest (the lane) */
function trimSub(h,it){
  var sub=h.querySelector('.gmxa-sub');if(!sub||!it||!it.used)return;
  var keep=arr(sub.children).filter(function(s){return it.used.indexOf(s.textContent)<0;});sub.textContent='';
  keep.forEach(function(s,i){if(i)sub.appendChild(D.createTextNode(' · '));sub.appendChild(s);});
  if(!keep.length)sub.parentNode.removeChild(sub);
}

/* ---- 6. the blocks: a heading row (label, count, arrows), placed in page order whenever they come to life ---- */
/* a count in its own span (the translator matches words only), with a hidden comma so it is read "sets, 19" */
function cnt(n){var s=el('span','gmxa-n');s.appendChild(el('span','gmxa-vh',', '));s.appendChild(D.createTextNode(String(n)));return s;}
function block(k,label){
  var s=make('section','gmxa-blk gmxa-b-'+k);s.id=k;
  var hd=el('div','gmxa-rowhead'),h=el('h2','gmxa-eyebrow'),l=el('span','gmxa-hl');h.id='gmxa-h-'+k;l.textContent=label;h.appendChild(l);
  s.setAttribute('aria-labelledby',h.id);hd.appendChild(h);s.appendChild(hd);s.__h=h;s.__hd=hd;blocks[k]=s;return s;
}
function relabel(k,t){var b=blocks[k];if(b)b.__h.querySelector('.gmxa-hl').textContent=t;}
function count(k,n){var b=blocks[k];if(!b)return;var h=b.__h,o=h.querySelector('.gmxa-n');if(o)h.removeChild(o);if(n)h.appendChild(cnt(n));}
function put(k){
  var s=blocks[k];if(!s)return;var nx=stash;
  for(var j=ORDER.indexOf(k)+1;j<ORDER.length;j++){var b=blocks[ORDER[j]];if(b&&b.parentNode===sec){nx=b;break;}}
  if(s.parentNode!==sec||s.nextSibling!==nx)sec.insertBefore(s,nx);
}
/* a sideways rail: snap, keyboard scroll, arrows in the heading row, an edge fade that says there is more */
function rail(r,blk,what){
  r.tabIndex=0;r.setAttribute('role','region');r.setAttribute('aria-label',what);
  var side=el('div','gmxa-side'),ar=el('div','gmxa-arrows'),bk=el('button','gmxa-arr',ARR),fw=el('button','gmxa-arr gmxa-fw',ARR);bk.type=fw.type='button';
  bk.setAttribute('aria-label','scroll '+what+' back');fw.setAttribute('aria-label','scroll '+what+' on');ar.appendChild(bk);ar.appendChild(fw);side.appendChild(ar);blk.__hd.appendChild(side);
  function st(){var l=r.scrollLeft,m=r.scrollWidth-r.clientWidth;bk.disabled=l<4;fw.disabled=l>=m-4;ar.hidden=m<=4;r.classList.toggle('gmxa-fl',l>4);r.classList.toggle('gmxa-fr',l<m-4);}
  function go(d){r.scrollBy({left:d*Math.max(200,r.clientWidth*0.8),behavior:REDUCE?'auto':'smooth'});}
  bk.addEventListener('click',function(){go(-1);});fw.addEventListener('click',function(){go(1);});
  r.addEventListener('scroll',st,{passive:true});window.addEventListener('resize',function(){frame(st);});frame(st);
  r.__st=st;return side;
}
/* a card that plays takes the rail's whole visible width (the iframe and the hearts stay in the card), and comes to the start */
function opened(c){
  var r=c.parentNode;if(!r||!r.classList.contains('gmxa-srail'))return;
  frame(function(){try{c.scrollIntoView({block:'nearest',inline:'start',behavior:REDUCE?'auto':'smooth'});}catch(e){}if(r.__st)r.__st();});
}

/* ---- 7. on tour, from the radar: the artist-field rule only, nothing invented ---- */
var MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
/* one request per data file per page: the answers are shared with gmx-related.js (it reads names-index.json too) through
   window.__gmxJSON, and this plain fetch (mode cors, same-origin credentials) is what the head's preload with a bare
   crossorigin asks for, so the first fetch takes the preloaded answer instead of asking again */
var JSN=window.__gmxJSON||(window.__gmxJSON={});
function get(u){return JSN[u]||(JSN[u]=fetch(u).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}));}
var tourP=null;
if(window.fetch&&window.Promise)tourP=Promise.all([get('/radar-events.json'),get('/names-index.json')]);
/* the strip goes under the sets rail when the answer comes. nothing waits for it. a reader who has already scrolled past
   the spot keeps their place: the browser's scroll anchoring does it where it has it, the rest is scrolled by hand */
function tour(){
  if(!tourP)return;
  tourP.then(function(r){
    try{if(!r[0]||!r[1]||blocks.tour||!sec.classList.contains('gmxa-on'))return;
      var s=strip(r);if(!s)return;
      var nx=null;for(var j=ORDER.indexOf('tour')+1;j<ORDER.length&&!nx;j++){var b=blocks[ORDER[j]];if(b&&b.parentNode===sec)nx=b;}
      var y0=nx?nx.getBoundingClientRect().top:1;put('tour');
      if(nx&&y0<0){var dy=nx.getBoundingClientRect().top-y0;if(Math.abs(dy)>=1)window.scrollBy(0,dy);}
      if(location.hash==='#tour')s.scrollIntoView();
    }catch(e){}
  });
}
/* the on tour strip, built from the answer. returns it, or nothing when the artist has no dates */
function strip(r){
  var ev=r[0],nx=r[1];if(!ev||!ev.events||!nx||!nx.a)return;
  var d=new Date(),today=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2),seen={};
  var rows=ev.events.filter(function(e){if(!e||nx.a[fold(e.artist)]!==sec.id||!(e.date>=today))return false;var k=e.date+'|'+e.venue;if(seen[k])return false;seen[k]=1;return true;});
  if(!rows.length)return;
  var s=block('tour','on tour'),side=null;cls(s,'gmxa-tour');count('tour',rows.length>1?rows.length:0);
  var rl=el('div','gmxa-rail');rl.id='gmxa-tourrail';
  rows.forEach(function(e){
    var p=e.date.split('-'),a=el('a','gmxa-date');a.href=e.url||'/events#tours';if(/^https?:/.test(a.href)){a.target='_blank';a.rel='noopener';}
    var blk=el('span','gmxa-dblk'),m=el('span','gmxa-dm',MON[+p[1]-1]||'');blk.appendChild(m);
    if(+p[0]!==d.getFullYear())blk.appendChild(el('span','gmxa-dy',"'"+p[0].slice(2)));
    blk.appendChild(el('span','gmxa-dd',String(+p[2])));a.appendChild(blk);
    var tx=el('span','gmxa-dtxt'),b=el('b'),sm=el('span');b.textContent=e.venue||e.event||'';
    var where=[e.city,e.region].filter(Boolean).join(', '),title=e.event&&fname&&fold(e.event).indexOf(fname)<0&&e.event!==e.venue?e.event:'';
    sm.textContent=[where,title].filter(Boolean).join(' · ');tx.appendChild(b);tx.appendChild(sm);a.appendChild(tx);rl.appendChild(a);
  });
  s.appendChild(rl);side=rail(rl,s,'dates');
  var rad=el('a','gmxa-eye2','the radar →');rad.href='/events#tours';side.insertBefore(rad,side.firstChild);
  return s;
}

/* ---- 8. the reorganise ---- */
function meaningful(n){
  if(n.nodeType!==1)return false;
  if(n.matches('h1,h2,.eyebrow2,.vh'))return false;
  if(n.querySelector('a,img,iframe,button,.rel,blockquote,[data-tok]'))return true;
  var t='';arr(n.childNodes).forEach(function(c){if(c.nodeType===3)t+=c.data;else if(c.nodeType===1&&!c.matches('h1,h2,.eyebrow2,.vh,script,style'))t+=c.textContent;});
  return t.replace(/\s+/g,'').length>0;
}
function run(){
  D.documentElement.classList.add('gmxa-page');cls(sec,'gmxa-on');
  /* 29 hand-indented pages close the section after the bio: their sections follow it as siblings up to nav.pn */
  var sib=sec.nextElementSibling;
  while(sib&&!sib.matches('nav,footer,.pn,p.note')){var nx=sib.nextElementSibling;if(!sib.matches('script,style,.gmxreel')){arr(sib.querySelectorAll('iframe')).forEach(function(f){hush(f);});move(sib,sec);}sib=nx;}
  var kids=arr(sec.childNodes);
  stash=make('div','gmxa-stash');stash.hidden=true;stash.setAttribute('aria-hidden','true');sec.appendChild(stash);
  var H=harvest(),items=H.items;
  var lead=null;items.some(function(it){if(it.kind==='filmed'&&it.lead){lead=it;return true;}return false;});
  if(!lead)items.some(function(it){if(it.kind==='filmed'){lead=it;return true;}return false;});
  var filmed=items.filter(function(it){return it.kind==='filmed'&&it!==lead;});
  var h=hero(lead);sec.insertBefore(h,sec.firstChild);var plain=idBlock(h);
  if(lead)cls(D.documentElement,'gmxa-imgpage');
  if(h.__stage)gmxPlayer.run(h.__stage);
  var story=storyBlock(plain);if(story){blocks.intro=story;sec.insertBefore(story,h.nextSibling);trimSub(h,story.__it);}
  /* sets: the cards list is built once, renderSets() lays chips, notes and the rail around it (again when a card arrives late) */
  var P=block('sets','sets'),srail=make('div','gmxa-srail'),cards=[],chips=null,notes={},filter='all',nMix=0;srail.id='gmxa-setrail';
  var setsTail=make('div','gmxa-tail');rail(srail,P,'sets');
  var yr=0;filmed.forEach(function(it,i){it.yr=yearOf(it.cap+' '+it.title)||it.yr||yr;yr=it.yr;it.ord=i;});
  filmed.forEach(function(it){var c=ytCard(it);made.push(c);it.card=c;});
  var scs=H.sc.slice(),sco=[];
  if(H.prof){if(scs.length||lead){scInto(null,H.prof,stash);H.gone=1;}else scs.push(H.prof);}
  scs.forEach(function(it,i){
    if(lead&&!lead.tw&&h.__stage&&same(it.title,lead.title)){lead.tw=it;heroTwin(h,it);return;}
    var m=null;filmed.forEach(function(f){if(!m&&!f.tw&&same(it.title,f.title))m=f;});
    if(m){m.tw=1;twin(m.card,it);return;}
    it.yr=yearOf(it.title);it.ord=filmed.length+i;sco.push({card:scCard(it,i),yr:it.yr,ord:it.ord});
    if(it.lead&&!H.notes.audio)H.notes.audio=noteText(it.lead);
  });
  var mix=filmed.map(function(it){return {card:it.card,yr:it.yr,ord:it.ord};}).concat(sco);
  if(mix.some(function(x){return x.yr;}))mix.sort(function(a,b){return (b.yr||0)-(a.yr||0)||a.ord-b.ord;});
  mix.forEach(function(x){cards.push(x.card);});nMix=cards.length;
  ['clips','talks'].forEach(function(k){items.forEach(function(it){if(it.kind===k){var c=ytCard(it);made.push(c);cards.push(c);}});});
  function kinds(c){return c.getAttribute('data-gmxa-kind').split(' ');}
  /* a late card: filmed ones close the filmed run, clips go after the last clip */
  function place(c,k){
    if(k==='filmed'){cards.splice(nMix,0,c);nMix++;return;}
    var at=nMix;cards.forEach(function(x,i){if(kinds(x).indexOf('clips')>-1)at=i+1;});cards.splice(at,0,c);
  }
  function renderSets(){
    arr(P.children).forEach(function(n){if(n!==P.__hd&&n!==srail&&n!==setsTail)P.removeChild(n);});
    if(!cards.length&&!setsTail.firstChild)return;
    var counts={};cards.forEach(function(c){kinds(c).forEach(function(k){counts[k]=(counts[k]||0)+1;});});
    var ks=KINDS.filter(function(k){return counts[k];});
    chips=null;notes={};if(filter!=='all'&&!counts[filter])filter='all';
    if(srail.parentNode!==P)P.insertBefore(srail,setsTail.parentNode===P?setsTail:null);
    if(ks.length>1){
      chips=el('div','gmxa-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','filter sets');
      ['all'].concat(ks).forEach(function(k){var b=el('button','gmxa-chip');b.type='button';b.setAttribute('data-gmxa-f',k);b.setAttribute('aria-pressed',k===filter?'true':'false');
        var l=el('span');l.textContent=k;b.appendChild(l);b.appendChild(cnt(k==='all'?cards.length:counts[k]));
        b.addEventListener('click',function(){filter=k;arr(chips.children).forEach(function(c){c.setAttribute('aria-pressed',c===b?'true':'false');});lay();srail.scrollLeft=0;});
        chips.appendChild(b);});
      P.insertBefore(chips,srail);
    }
    /* a kind's own lead line shows while that chip is on. the hero already says which set is newest */
    KINDS.map(function(k){return [k,H.notes[k]||''];}).forEach(function(n){if(!n[1]||!counts[n[0]])return;var p=el('p','gmxa-note');p.textContent=n[1];p.setAttribute('data-gmxa-for',n[0]);notes[n[0]]=p;P.insertBefore(p,srail);});
    /* the old rail headings ("dj sets") under the rail: the block heading says it already */
    arr(setsTail.querySelectorAll('.eyebrow2')).forEach(function(x){if(!x.classList.contains('gmxa-x'))cls(x,'gmxa-x');});
    cards.forEach(function(c,i){if(srail.children[i]!==c)srail.insertBefore(c,srail.children[i]||null);});
    if(!cards.length)srail.hidden=true;else srail.hidden=false;
    lay();count('sets',cards.length);put('sets');fire(srail,'gmx:cards');
  }
  function lay(){
    cards.forEach(function(c){c.classList.toggle('gmxa-off',!(filter==='all'||kinds(c).indexOf(filter)>-1));});
    for(var k in notes)notes[k].hidden=k!==filter;
    arr(setsTail.children).forEach(function(n){var k=n.getAttribute('data-gmxa-for');if(k)n.classList.toggle('gmxa-off',filter!=='all'&&filter!==k);});
    if(srail.__st)frame(srail.__st);
  }
  srail.addEventListener('click',function(e){
    var b=e.target.closest?e.target.closest('.set-facade'):null;if(!b||!srail.contains(b)||b.tagName==='A')return;
    var c=b.closest('.gmxa-card');stopAll(c);stopHero();c.classList.add('gmxa-on');c.classList.remove('gmxa-scon');ytFrame(b);opened(c);
  });
  srail.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.gmxa-scbtn');if(b){stopHero();opened(b.closest('.gmxa-card'));}},true);
  function stopHero(){h.classList.remove('gmxa-playing');stopSc(h);arr(h.querySelectorAll('.video-frame')).forEach(function(v){if(v.__facade)v.parentNode.replaceChild(v.__facade,v);});}
  /* the hero's thumbnail came back as youtube's grey card: typographic hero, and the set joins the rail as a card */
  h.__dead=function(){
    h.__dead=null;var box=h.querySelector('.gmxa-stagebox'),hs=h.querySelector('.gmxa-herosc');
    if(box)box.parentNode.removeChild(box);
    h.className='gmxa-hero gmxa-type';D.documentElement.classList.remove('gmxa-imgpage');h.__stage=null;
    if(window.console&&console.info)console.info('gmx-artist: the newest set ('+lead.id+') has no thumbnail on youtube, it may be gone. it left the hero');
    var c=ytCard(lead);made.push(c);if(typeof lead.tw==='object'){if(hs)hs.parentNode.removeChild(hs);twin(c,lead.tw);}
    place(c,'filmed');renderSets();resize();
  };
  /* a tiktok teaser (tobehonest's #tbhtok): a clip card around the page's own button, its inline binder still loads it */
  function tokCard(n){
    var b=n.querySelector('[data-tok]'),c=make('div','gmxa-card gmxa-tok'),m=el('div','gmxa-media gmxa-tall'),meta=el('div','gmxa-cmeta'),t=el('span','t');
    c.setAttribute('data-gmxa-kind','clips');move(n,m);m.appendChild(el('span','gmxa-pill','tt'));c.appendChild(m);
    t.textContent=(b.getAttribute('aria-label')||'tiktok teaser').replace(/^load (the )?/i,'').replace(/ from tiktok$/i,'');
    meta.appendChild(t);meta.appendChild(el('span','mono','clip · tiktok'));c.appendChild(meta);
    c.addEventListener('click',function(e){if(!e.target.closest||!e.target.closest('[data-tok]'))return;stopAll(c);stopHero();c.classList.add('gmxa-on');c.setAttribute('data-gmxa-keep','');opened(c);
      setTimeout(function(){var f=m.querySelector('iframe');if(f)try{f.focus();}catch(x){}},0);},true);
    place(c,'clips');
  }
  /* a lone youtube link in a sentence ("one more that will not embed, so it opens on youtube: …"): a filmed card. a sentence
     that says it will not embed makes a card that links out instead of playing */
  function linkCard(p,a){
    var hr=a.getAttribute('href'),id=ytOf(hr);if(!id||H.seen[id])return false;H.seen[id]=1;
    var it={id:id,kind:'filmed',title:text(a),cap:text(a),img:'',start:startOf(hr),ext:/embed/i.test(text(p))},c=ytCard(it);made.push(c);place(c,'filmed');return true;
  }

  /* music, at a glance, the site: everything left in the section, routed by what it is */
  var M=block('music','music'),A=block('about','at a glance'),S=block('site','tracklists'),bio=story&&story.__bio;
  var colA=make('div','gmxa-col'),colB=make('div','gmxa-col');
  H.sp.forEach(function(b){var l=b.nextElementSibling&&b.nextElementSibling.classList.contains('gmx-src')?b.nextElementSibling:null;
    var lp=leadOf(b);if(lp)move(lp,colB);
    carry(b,b.tagName==='IFRAME'?b:b.querySelector('iframe'),colB);if(l)move(l,colB);});
  var facts=sec.querySelector('.facts');
  if(facts&&facts.querySelector('.fact')){move(facts,A);cls(facts,'gmxa-glance');attr(facts,'data-more','items');attr(facts,'data-more-items','4');
    arr(facts.querySelectorAll('.fact')).forEach(function(f){var v=f.querySelector('.v');if(text(v).length>70)cls(f,'gmxa-wide');if(/dropping soon|next|verdict/i.test(text(f.querySelector('.k'))))cls(f,'gmxa-hot');});}
  var aboutTail=make('div','gmxa-tail'),dest=[];
  var tl=false,tls=false,scSecs=H.sc.concat(H.prof&&!H.gone?[H.prof]:[]).map(function(it){return it.sec;}).filter(Boolean);
  /* loose quotes join the bio: inside the whole fold, or the rest of it */
  function quoteHome(){return story&&story.__rest?story.__rest:bio&&!story.__thin?bio:null;}
  /* a section's own words once its heading is set aside */
  function words(n){var c=n.cloneNode(true);arr(c.querySelectorAll('h1,h2,h3,.eyebrow2,.vh,script,style')).forEach(function(x){x.parentNode.removeChild(x);});return text(c);}
  kids.forEach(function(n){
    if(n.parentNode!==sec)return;
    if(n.nodeType===8){var c=n.data.trim();if(/^tracklists:start/.test(c))tl=tls=true;if(/^(tracklists|related):/.test(c))dest.push([n,S]);if(/^tracklists:end/.test(c))tl=false;return;}
    if(n.nodeType!==1)return;
    if(tl){dest.push([n,S]);return;}
    if(n.matches('script,style,template'))return;
    if(n.matches('.gmx-rel-static'))return dest.push([n,S]);
    if(n.matches('section.sec')&&/^tagged by us/i.test(text(n.querySelector('.eyebrow2')))){tls=true;return dest.push([n,S]);}
    if(!meaningful(n))return dest.push([n,stash]);
    /* the section a soundcloud player came out of: its line becomes the audio note, or it follows the player to sets */
    if(scSecs.indexOf(n)>-1){var w=words(n);
      if(w&&w.length<240&&!H.notes.audio&&!n.querySelector('a,iframe,img,button,blockquote')){H.notes.audio=w;return dest.push([n,stash]);}
      attr(n,'data-gmxa-for','audio');return dest.push([n,setsTail]);}
    if(n.querySelector('.rel')||n.matches('.rel'))return dest.push([n,colA]);
    if(n.querySelector('iframe[src*="open.spotify.com"],iframe[data-src*="open.spotify.com"]'))return dest.push([n,colB]);
    var lp=dest[dest.length-1],yl=n.tagName==='P'?n.querySelectorAll('a'):[];
    if(n.querySelector('[data-tok]')&&!n.matches('blockquote')){if(lp&&lp[0]===n.previousElementSibling&&lp[0].tagName==='P')lp[1]=stash;return tokCard(n);}
    if(yl.length===1&&text(n).length<300&&linkCard(n,yl[0]))return dest.push([n,stash]);
    if(n.querySelector('a[href*="youtu"]')&&!n.matches('blockquote'))return dest.push([n,setsTail]);
    if(n.matches('blockquote')&&quoteHome())return dest.push([n,quoteHome()]);
    dest.push([n,aboutTail]);
  });
  /* a lead-in line goes where the block it introduces goes */
  for(var i=dest.length-2;i>=0;i--){var a=dest[i][0];if(a.nodeType===1&&a.tagName==='P'&&!a.querySelector('a')&&dest[i][1]===aboutTail){var nx=dest[i+1];if(nx&&nx[0]===a.nextElementSibling)dest[i][1]=nx[1];}}
  /* what goes to the stash parks its frames first, so they are not rebuilt there only to be parked after */
  dest.forEach(function(d){if(d[1]===stash&&d[0].nodeType===1&&d[0].tagName!=='IFRAME')arr(d[0].querySelectorAll('iframe')).forEach(park);move(d[0],d[1]);});
  /* music: spotify, then the selected releases (three rows, the rest behind more), then the releases note */
  arr(colA.querySelectorAll('.rel')).forEach(function(r){
    if(r.parentNode.classList.contains('gmxa-rels'))return;var w=make('div','gmxa-rels');w.setAttribute('data-more','items');w.setAttribute('data-more-items','3');
    r.parentNode.insertBefore(w,r);var x=r;while(x&&x.nodeType===1&&x.classList.contains('rel')){var y=x.nextElementSibling;move(x,w);x=y;}});
  if(colA.firstChild&&colB.firstChild){var mc=make('div','gmxa-cols'+(H.sp.length===2&&colB.children.length===2?' gmxa-two':''));mc.appendChild(colB);mc.appendChild(colA);M.appendChild(mc);}
  else{if(colB.firstChild)M.appendChild(colB);if(colA.firstChild)M.appendChild(colA);}
  if(H.gone&&H.notes.audio)H.notes.audio=H.notes.audio.replace(/\b(off|from|on) (the|his|her|their) (soundcloud )?profile above\b/i,'$1 soundcloud');
  if(setsTail.firstChild)P.appendChild(setsTail);
  renderSets();
  /* what the page carries beyond the facts (no-static's receipts): a long run of it folds, so the scroll stays easy */
  if(aboutTail.firstChild){A.appendChild(aboutTail);if(aboutTail.children.length>3||text(aboutTail).length>600){aboutTail.setAttribute('data-more','fold');aboutTail.setAttribute('data-more-label','everything else');}}
  if(colA.firstChild||colB.firstChild)put('music');
  if(A.children.length>1)put('about');
  /* the spotify embed asks for its page only when the block comes within about 600 px of the screen, then never again */
  var sp=parked(M).filter(function(f){return !(f.__gmxaPh||f).closest('.gmxa-scbox');});
  var spu=/open\.spotify\.com\/embed\/(artist|playlist|album)\/([A-Za-z0-9]+)/.exec(sp.length?sp[0].getAttribute('data-gmxa-src'):'');
  if(spu){var so=el('a','gmxa-eye2','open on spotify ↗');so.href='https://open.spotify.com/'+spu[1]+'/'+spu[2];so.target='_blank';so.rel='noopener';var sd=el('div','gmxa-side');sd.appendChild(so);M.__hd.appendChild(sd);}
  if(sp.length){if(window.IntersectionObserver){var io=new IntersectionObserver(function(es){if(!es.some(function(e){return e.isIntersecting;}))return;io.disconnect();sp.forEach(wake);},{rootMargin:'600px 0px'});io.observe(M);obs.push(io);}else sp.forEach(wake);}
  /* tracklists and also on the site: one heading, the blocks' own "also on the site" titles set aside */
  function siteDress(){
    var rel=S.querySelector('.gmx-rel-static,.gmx-rel');
    arr(S.querySelectorAll('h2,h3,.eyebrow2')).forEach(function(x){if(x!==S.__h&&/^(also on the site|tagged by us)$/i.test(text(x))&&!x.classList.contains('gmxa-x'))cls(x,'gmxa-x');});
    /* the static block's lists (heard in these sets, on these labels) show one row, the rest behind more (n) */
    arr(S.querySelectorAll('.gmx-rel-static > div')).forEach(function(d){var chip=!d.querySelector('a *'),k=chip?2:1;if(d.hasAttribute('data-more')||d.children.length<k+2)return;attr(d,'data-more','items');attr(d,'data-more-items',String(k));});
    if(window.gmxMore&&gmxMore.refresh)gmxMore.refresh();
    relabel('site',[tls?'tracklists':'',rel?'also on the site':''].filter(Boolean).join(' · ')||'on the site');
    var u={},n=0;arr(S.querySelectorAll('a[href*="/tracklists/"]')).forEach(function(a){if(a.closest('.set-meta,.gmxa-vh'))return;var k=a.getAttribute('href').replace(/[?#].*$/,'');if(!u[k]){u[k]=1;n++;}});
    count('site',n+S.querySelectorAll('.gmx-rel .set-slide').length);
  }
  if(S.querySelector('a,iframe')){siteDress();put('site');}
  /* caught live: the reel section sits after section.artist in the static page. each reel is a tap to load card */
  var reel=D.querySelector('section.gmxreel');
  if(reel&&!reel.closest('section.artist')){
    var L=block('live','caught live'),rw=arr(reel.querySelectorAll('.gmxreel-wrap')).map(function(w){var f=w.querySelector('iframe');if(f)park(f);return [w,f];});
    move(reel,L);cls(reel,'gmxa-reels');arr(reel.querySelectorAll('.gmxreel-eye')).forEach(function(e){cls(e,'gmxa-x');});
    var cardsL=[];
    rw.forEach(function(x){var w=x[0],f=x[1];if(!f)return;cls(w,'gmxa-shut');
      var c=make('div','gmxa-reelc'),lk=w.nextElementSibling&&w.nextElementSibling.classList.contains('gmx-src')?w.nextElementSibling:null;
      var b=make('button','gmxa-reel','<span class="gmxa-sq" aria-hidden="true">'+IGI+'</span><span><b></b><span>instagram reel · tap to load</span></span>');b.type='button';
      b.querySelector('b').textContent=f.getAttribute('title')||'instagram reel';b.setAttribute('aria-expanded','false');
      b.addEventListener('click',function(){w.classList.remove('gmxa-shut');wake(f);b.setAttribute('aria-expanded','true');b.hidden=true;focusIn(f);});
      w.parentNode.insertBefore(c,w);c.appendChild(b);move(w,c);if(lk)move(lk,c);cardsL.push(c);});
    if(cardsL.length>1){var lr=make('div','gmxa-rail gmxa-lrail');reel.insertBefore(lr,cardsL[0]);cardsL.forEach(function(c){lr.appendChild(c);});rail(lr,L,'reels');count('live',cardsL.length);}
    put('live');
  }
  /* the soundcloud profile embed as the page's only audio already sits on a card. a stray one with no card is parked */
  arr(stash.querySelectorAll('iframe')).forEach(park);
  tour();

  /* the sets the also on the site box found join the one sets rail (its own stage goes to the stash), so the sets are never
     split across the page. without a sets block they stay where the box put them */
  function relSets(n){
    if(!blocks.sets||blocks.sets.parentNode!==sec)return 0;var k=0;
    arr(n.querySelectorAll('.set-stage')).forEach(function(st){
      var kind=st.getAttribute('data-label')==='talk'?'talks':'filmed',hd=st.previousElementSibling;
      arr(st.querySelectorAll('.set-facade')).forEach(function(f){var id=f.getAttribute('data-yt');if(!id||H.seen[id])return;H.seen[id]=1;
        var c=ytCard({id:id,kind:kind,title:f.getAttribute('data-title')||'set',cap:'',img:''});made.push(c);place(c,kind);k++;});
      if(hd&&hd.tagName==='H3')cls(hd,'gmxa-x');move(st,stash);
    });
    var nt=n.querySelector('.note');if(k&&nt&&/rails above/.test(nt.textContent))nt.textContent='gathered from the tracklists, the sets page, the interviews page and the label pages.';
    if(k)renderSets();return k;
  }
  /* late arrivals: the follow pill into the actions row, the also on the site box into the site block */
  if(window.MutationObserver){
    var mo=new MutationObserver(function(list){
      list.forEach(function(r){arr(r.addedNodes).forEach(function(n){
        if(n.nodeType!==1)return;
        if(n.classList.contains('gmx-follow')&&n.parentNode!==h.__acts){h.__acts.insertBefore(n,h.__acts.firstChild);h.__edge();}
        else if(n.classList.contains('gmx-src'))short(n);
        else if(n.classList.contains('gmx-more-btn'))[n.previousElementSibling,n.nextElementSibling].forEach(function(x){if(x&&x.classList.contains('gmxa-mph'))x.parentNode.removeChild(x);});
        else if(n.classList.contains('gmx-rel')&&n.parentNode!==S&&n.parentNode!==stash){if(relSets(n)&&!n.querySelector('a')){move(n,stash);return;}var y0=S.parentNode===sec?0:null,nb=null;
          if(S.parentNode!==sec){for(var j=ORDER.indexOf('site')+1;j<ORDER.length&&!nb;j++){var b=blocks[ORDER[j]];if(b&&b.parentNode===sec)nb=b;}y0=nb?nb.getBoundingClientRect().top:1;}
          S.appendChild(n);siteDress();put('site');
          if(nb&&y0<0){var dy=nb.getBoundingClientRect().top-y0;if(Math.abs(dy)>=1)window.scrollBy(0,dy);}
          if(location.hash==='#site')S.scrollIntoView();}
      });});
    });
    mo.observe(sec,{childList:true,subtree:true});obs.push(mo);
  }
}
/* an old tab link (#sets #music #about #site) or a block link lands on its block once the page shows */
function landing(){var k=(location.hash||'').slice(1);if(ORDER.indexOf(k)<1)return;var t=D.getElementById(k);if(t&&sec.contains(t))frame(function(){t.scrollIntoView();});}

/* the folds (story, releases, facts) are closed before the first paint, the way gmx-more.js will close them: it loads
   after this file, and the phone can paint in between, so an open story showed and then folded, moving all under it.
   a stand-in keeps the button's room until it comes (the late arrivals observer takes it away) */
function prefold(el){
  var m=el.getAttribute('data-more'),ph=make('i','gmxa-mph');ph.setAttribute('aria-hidden','true');
  if(m==='fold'){attr(el,'hidden','');el.parentNode.insertBefore(ph,el);return;}
  var n=+el.getAttribute('data-more-items')||6,k=el.children;if(m!=='items'||k.length<=n+1)return;
  for(var i=n;i<k.length;i++)attr(k[i],'data-more-hide','');ph.className='gmxa-mph gmxa-mphq';el.parentNode.insertBefore(ph,el.nextSibling);
}
try{run();if(window.gmxMore&&gmxMore.refresh)gmxMore.refresh();else if(D.querySelector('script[src*="gmx-more.js"]'))arr(sec.querySelectorAll('[data-more]')).forEach(prefold);
  sec.classList.add('gmxa-ready');landing();settle();}
catch(e){try{restore();}catch(x){}sec.classList.add('gmxa-ready');if(window.console&&console.warn)console.warn('gmx-artist: kept the old layout',e);}
/* gmx-motion loads after this file: the resize it measures on is sent once every deferred script has run */
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',resize);else resize();
})();
