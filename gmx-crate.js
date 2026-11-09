/* groovesmaxxing my crate (2026-10-11, follows added the same day). a heart on sets and on tracklist rows,
   a follow pill on artist and label profiles, saved on this phone only, in localStorage under gmx_crate.
   no account, no server, nothing leaves the phone. /crate lists it all, /upcoming can filter on it.
   every item carries the artist and the label it knows, so the dropping soon page can match releases to
   the crate without a lookup. vanilla, no dependencies. runs after gmx-player.js so the stages are built,
   and listens for stages and card grids that render later.
   synced since 2026-10-13 (accounts design section 1): every toggle fires a gmx:crate event and an unheart
   leaves a tombstone in gmx_crate_rm, and gmx-account.js carries both to the account when signed in. */
(function(){
'use strict';
var KEY='gmx_crate',RM='gmx_crate_rm',MAX=500;
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return []}}
function save(list){try{localStorage.setItem(KEY,JSON.stringify(list.slice(0,MAX)))}catch(e){}}
function has(id){return load().some(function(x){return x.id===id})}
function tomb(id){try{var r=JSON.parse(localStorage.getItem(RM)||'[]');r=r.filter(function(x){return x.id!==id});r.unshift({id:id,t:Date.now()});localStorage.setItem(RM,JSON.stringify(r.slice(0,MAX)))}catch(e){}}
function toggle(item,button){var l=load(),i=l.findIndex(function(x){return x.id===item.id});
  /* an add needs a whole item: a stale row on /crate passing only {id} must not save a ghost with no kind or title */
  if(i<0&&!item.kind)return false;
  if(i>-1){l.splice(i,1);tomb(item.id)}else l.unshift(Object.assign({t:Date.now()},item));save(l);
  try{document.dispatchEvent(new CustomEvent('gmx:crate',{detail:{id:item.id,on:i<0,item:item,button:button||null}}))}catch(e){}
  return i<0}
/* clear the whole crate (2026-11-09): a tombstone and a gmx:crate event per item, so a signed-in clear reaches the
   account (the server keeps a union, an empty save alone came back on the next load) and artist follows end there too */
function clear(){var l=load();l.forEach(function(x){tomb(x.id)});save([]);
  l.forEach(function(x){try{document.dispatchEvent(new CustomEvent('gmx:crate',{detail:{id:x.id,on:false,item:x,button:null}}))}catch(e){}})}
/* a label page once saved its follow as an artist (labels/nu-moda): move such rows to the label id, once */
(function(){var l=load(),moved=false;l.forEach(function(x){if(x&&x.kind==='artist'&&/^\/labels\//.test(x.url||'')){var old=x.id;x.kind='label';x.id='label:'+String(old).replace(/^artist:/,'');x.label=x.label||x.artist||x.title;delete x.artist;tomb(old);moved=true}});if(moved)save(l)})();
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fold(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/\s+/g,' ').trim()}
var SPLIT=/\s*(?:\bb2b\b|\bb3b\b|\bvs\.?\s|\bx\s|\band\b|\bwith\b|\bfeat\.?|\bft\.?|\+|&|,)\s*/i;
/* "Adam Ten & Rafael" is two artists, "DUZA - Baby" is one artist and a title */
function artistsOf(name){var a=String(name||'').split(/\s+-\s+/)[0];return a.split(SPLIT).map(function(x){return x.replace(/\(.*$/,'').trim()}).filter(function(x){return x.length>1})}
var HEART='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.2-4.6-9.2-9.1C1.4 7.9 3.4 4.8 6.6 4.8c1.9 0 3.4 1.1 4.2 2.4h2.4c.8-1.3 2.3-2.4 4.2-2.4 3.2 0 5.2 3.1 3.8 6.4-2 4.5-9.2 9.1-9.2 9.1z"/></svg>';
var css='.gmx-heart{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;border:1px solid rgba(242,242,239,.18);background:transparent;cursor:pointer;padding:0;color:#8A8A93;flex:none;vertical-align:middle;transition:color .15s,border-color .15s,transform .15s}'+
 '.gmx-heart svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}.gmx-heart:hover{color:#F2F2EF;border-color:#FF1C02}'+
 '.gmx-heart[aria-pressed="true"]{color:#FF1C02;border-color:#FF1C02}.gmx-heart[aria-pressed="true"] svg{fill:#FF1C02}.gmx-heart.pop{transform:scale(1.25)}'+
 '.set-meta .gmx-heart{margin-left:auto}.card .gmx-heart{margin-top:8px;width:34px;height:34px}td.x .gmx-heart{width:30px;height:30px;margin-left:8px;position:relative}td.x .gmx-heart svg{width:15px;height:15px}td.x .gmx-heart::before{content:"";position:absolute;inset:-7px -3px}'+
 '.gmx-follow{display:inline-flex;align-items:center;gap:7px;cursor:pointer;background:transparent;font:inherit;font-family:"Space Mono",monospace;font-size:.76rem;letter-spacing:.06em;color:var(--steel,#8A8A93);border:1px solid var(--line,#26262b);border-radius:999px;padding:6px 13px;min-height:34px;transition:color .15s,border-color .15s,transform .15s}'+
 '.gmx-follow svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}.gmx-follow:hover{color:#F2F2EF;border-color:#FF1C02}'+
 '.gmx-follow[aria-pressed="true"]{color:#FF1C02;border-color:#FF1C02}.gmx-follow[aria-pressed="true"] svg{fill:#FF1C02}.gmx-follow.pop{transform:scale(1.08)}'+
 '.gmx-lnext{display:block;width:max-content;max-width:100%;margin:-4px 0 18px;padding:10px 0;font-family:"Space Mono",monospace;font-size:.75rem;letter-spacing:.04em;color:var(--steel,#8A8A93);text-decoration:underline;text-underline-offset:3px}.gmx-lnext:hover,.gmx-lnext:focus-visible{color:#FF1C02}'+
 '@media (prefers-reduced-motion: reduce){.gmx-heart,.gmx-follow{transition:none}}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
/* the button keeps its id and label, so a sync or another tab can repaint it (tracklist rows have no [data-yt]) */
function paintHeart(b,on){b.setAttribute('aria-pressed',on?'true':'false');b.setAttribute('aria-label',(on?'in your crate: ':'add to your crate: ')+(b.dataset.crateLabel||''))}
function heart(item,label){
  var make=typeof item==='function'?item:function(){return item},id=make().id;
  var b=document.createElement('button');b.type='button';b.className='gmx-heart';b.innerHTML=HEART;
  b.dataset.crateId=id;b.dataset.crateLabel=label||'';
  paintHeart(b,has(id));b.title='my crate';
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var now=toggle(make(),b);paintHeart(b,now);b.classList.add('pop');setTimeout(function(){b.classList.remove('pop')},200);});
  return b;
}
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():''}
/* sets: a heart in each slide's meta row and on each card on the sets page */
function wireSets(root){
  [].slice.call((root||document).querySelectorAll('.set-slide, .card')).forEach(function(s){
    if(s.querySelector('.gmx-heart'))return;
    var f=s.querySelector('[data-yt]'),id=f&&f.getAttribute('data-yt');if(!id)return;
    var title=f.getAttribute('data-title')||text(s.querySelector('.t'))||'set',sub=text(s.querySelector('.set-meta .mono, .m'));
    var meta=s.querySelector('.set-meta')||s;
    var who=text(document.querySelector('section.artist:not(.label) h1.aname'))||(sub.split(' · ')[0]||'');
    meta.appendChild(heart({kind:'set',id:'yt:'+id,title:title,sub:sub,url:'https://www.youtube.com/watch?v='+id,page:location.pathname,artist:who},title));
  });
}
/* tracklist rows: the track name and whatever store links the row carries */
function wireRows(){
  [].slice.call(document.querySelectorAll('table.tl tr')).forEach(function(r){
    var x=r.querySelector('td.x');if(!x||x.querySelector('.gmx-heart'))return;
    /* the tracklists hub lists whole sets, not tracks: no track heart there */
    if(r.querySelector('a.hrow')||!r.querySelector('td.n, td.t'))return;
    var get=x.querySelector('.get'),c=x.cloneNode(true),lab=text(c.querySelector('.lab'));
    [].slice.call(c.querySelectorAll('.get,.thx,.gnote,.soft,.sig,.lab,.gmx-heart,.gmx-more,.gmx-also')).forEach(function(e){e.remove()});
    var name=text(c);
    if(!name||/^ID\b/i.test(name)&&name.length<6)return;
    var links={};[].slice.call(x.querySelectorAll('.get a')).forEach(function(a){var h=a.getAttribute('href')||'';if(/open\.spotify\.com/.test(h))links.spotify=h;else if(/beatport\.com/.test(h))links.beatport=h;else if(/soundcloud\.com/.test(h))links.soundcloud=h;else if(/music\.apple\.com/.test(h))links.apple=h;});
    var n=text(r.querySelector('td.n')),h1=text(document.querySelector('h1')),id='tl:'+location.pathname.replace(/^\/tracklists\//,'').replace(/\.html$/,'')+':'+(n||name);
    var target=get||x;
    var b=heart({kind:'track',id:id,title:name,sub:[lab,h1+(n?' · track '+n:'')].filter(Boolean).join(' · '),url:location.pathname+'#'+(n?'t'+n:''),links:links,artist:artistsOf(name).join(', '),label:lab},name);
    if(get)get.appendChild(b);else x.appendChild(b);
  });
}
/* artist and label profiles: a follow pill in the meta row. following is the same heart under the hood,
   kind artist or label, so /upcoming can filter releases on it and /crate lists it */
/* the profile's slug and kind. a page with no id on its section (28 upgraded profiles did) takes the slug from the
   address, and a page under /labels/ is a label even when the section misses the class */
function profileOf(sec){
  if(!sec)return null;
  var slug=(sec.id||(location.pathname.split('/').pop()||'').replace(/\.html$/,'')).toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]*$/.test(slug))return null;
  return {slug:slug,kind:(sec.classList.contains('label')||/^\/labels\//.test(location.pathname))?'label':'artist'};
}
function paintFollow(b,on,name){b.setAttribute('aria-pressed',on?'true':'false');b.innerHTML=HEART+(on?'following':'follow');b.setAttribute('aria-label',(on?'following ':'follow ')+name+(on?', tap to stop':''))}
function wireProfile(){
  var sec=document.querySelector('section.artist');if(!sec||sec.querySelector('.gmx-follow')||!/^\/(artists|labels)\//.test(location.pathname))return;
  var meta=sec.querySelector('.meta'),name=text(sec.querySelector('h1.aname')),pr=profileOf(sec);if(!meta||!name||!pr)return;
  var kind=pr.kind,item={kind:kind,id:kind+':'+pr.slug,title:name,url:location.pathname.replace(/\.html$/,'')};
  item[kind]=name;
  var b=document.createElement('button');b.type='button';b.className='tag gmx-follow';b.dataset.crateId=item.id;b.dataset.crateLabel=name;
  function paint(on){paintFollow(b,on,name)}
  paint(has(item.id));
  b.addEventListener('click',function(){var now=toggle(item,b);paint(now);b.classList.add('pop');setTimeout(function(){b.classList.remove('pop')},200)});
  meta.appendChild(b);
  /* a label page says where following it shows up: the dropping soon list filtered to what you follow (2026-11-09) */
  if(kind==='label'&&!sec.querySelector('.gmx-lnext')){var ln=document.createElement('a');ln.className='gmx-lnext';ln.href='/upcoming?mine=1';ln.textContent='what\'s dropping from the labels you follow →';meta.parentNode.insertBefore(ln,meta.nextSibling)}
}
/* every artist and label the crate knows, folded, for the dropping soon filter */
function names(){
  var a={},l={},list=load();
  list.forEach(function(it){
    if(it.kind==='artist'||it.artist)artistsOf(it.artist||it.title).forEach(function(x){a[fold(x)]=1});
    if(it.kind==='label'||it.label){var k=fold(it.label||it.title);if(k)l[k]=1}
  });
  return {artists:a,labels:l,count:list.length};
}
wireSets();wireRows();wireProfile();
document.addEventListener('gmx:stage',function(e){wireSets(e.target)});
document.addEventListener('gmx:cards',function(e){wireSets(e.target)});
window.gmxCrate={load:load,save:save,toggle:toggle,clear:clear,has:has,heart:heart,names:names,fold:fold,artistsOf:artistsOf};
/* the account layer replaced the list, or another tab changed it: repaint every heart and pill on the page */
document.addEventListener('gmx:crate-synced',function(){[].slice.call(document.querySelectorAll('.gmx-heart[aria-label], .gmx-follow')).forEach(function(b){
  var id=b.dataset.crateId||null;
  if(!id&&b.classList.contains('gmx-follow')){var pr=profileOf(b.closest('section.artist'));if(pr)id=pr.kind+':'+pr.slug}
  if(!id){var s=b.closest('.set-slide, .card'),f=s&&s.querySelector('[data-yt]');if(f)id='yt:'+f.getAttribute('data-yt')}
  if(!id)return;var on=has(id);
  if(b.classList.contains('gmx-follow'))paintFollow(b,on,b.dataset.crateLabel||text(document.querySelector('section.artist h1.aname')));
  else paintHeart(b,on);
})});
/* another tab or the installed app changed the crate: this page hears it and repaints (no sync is started from here) */
window.addEventListener('storage',function(e){if(e.key===KEY||e.key===null)try{document.dispatchEvent(new CustomEvent('gmx:crate-synced',{detail:{reason:'storage'}}))}catch(x){}});
})();
