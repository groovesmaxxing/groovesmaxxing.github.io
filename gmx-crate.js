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
function toggle(item,button){var l=load(),i=l.findIndex(function(x){return x.id===item.id});if(i>-1){l.splice(i,1);tomb(item.id)}else l.unshift(Object.assign({t:Date.now()},item));save(l);
  try{document.dispatchEvent(new CustomEvent('gmx:crate',{detail:{id:item.id,on:i<0,item:item,button:button||null}}))}catch(e){}
  return i<0}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fold(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/\s+/g,' ').trim()}
var SPLIT=/\s*(?:\bb2b\b|\bb3b\b|\bvs\.?\s|\bx\s|\band\b|\bwith\b|\bfeat\.?|\bft\.?|\+|&|,)\s*/i;
/* "Adam Ten & Rafael" is two artists, "DUZA - Baby" is one artist and a title */
function artistsOf(name){var a=String(name||'').split(/\s+-\s+/)[0];return a.split(SPLIT).map(function(x){return x.replace(/\(.*$/,'').trim()}).filter(function(x){return x.length>1})}
var HEART='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.2-4.6-9.2-9.1C1.4 7.9 3.4 4.8 6.6 4.8c1.9 0 3.4 1.1 4.2 2.4h2.4c.8-1.3 2.3-2.4 4.2-2.4 3.2 0 5.2 3.1 3.8 6.4-2 4.5-9.2 9.1-9.2 9.1z"/></svg>';
var css='.gmx-heart{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;border:1px solid rgba(242,242,239,.18);background:transparent;cursor:pointer;padding:0;color:#8A8A93;flex:none;vertical-align:middle;transition:color .15s,border-color .15s,transform .15s}'+
 '.gmx-heart svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}.gmx-heart:hover{color:#F2F2EF;border-color:#FF1C02}'+
 '.gmx-heart[aria-pressed="true"]{color:#FF1C02;border-color:#FF1C02}.gmx-heart[aria-pressed="true"] svg{fill:#FF1C02}.gmx-heart.pop{transform:scale(1.25)}'+
 '.set-meta .gmx-heart{margin-left:auto}.card .gmx-heart{margin-top:8px;width:34px;height:34px}td.x .gmx-heart{width:30px;height:30px;margin-left:8px}td.x .gmx-heart svg{width:15px;height:15px}'+
 '.gmx-follow{display:inline-flex;align-items:center;gap:7px;cursor:pointer;background:transparent;font:inherit;font-family:"Space Mono",monospace;font-size:.76rem;letter-spacing:.06em;color:var(--steel,#8A8A93);border:1px solid var(--line,#26262b);border-radius:999px;padding:6px 13px;min-height:34px;transition:color .15s,border-color .15s,transform .15s}'+
 '.gmx-follow svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}.gmx-follow:hover{color:#F2F2EF;border-color:#FF1C02}'+
 '.gmx-follow[aria-pressed="true"]{color:#FF1C02;border-color:#FF1C02}.gmx-follow[aria-pressed="true"] svg{fill:#FF1C02}.gmx-follow.pop{transform:scale(1.08)}'+
 '@media (prefers-reduced-motion: reduce){.gmx-heart,.gmx-follow{transition:none}}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
function heart(item,label){
  var make=typeof item==='function'?item:function(){return item},id=make().id;
  var b=document.createElement('button');b.type='button';b.className='gmx-heart';b.innerHTML=HEART;
  var on=has(id);b.setAttribute('aria-pressed',on?'true':'false');b.setAttribute('aria-label',(on?'in your crate: ':'add to your crate: ')+label);b.title='my crate';
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var now=toggle(make(),b);b.setAttribute('aria-pressed',now?'true':'false');b.setAttribute('aria-label',(now?'in your crate: ':'add to your crate: ')+label);b.classList.add('pop');setTimeout(function(){b.classList.remove('pop')},200);});
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
    var get=x.querySelector('.get'),c=x.cloneNode(true),lab=text(c.querySelector('.lab'));
    [].slice.call(c.querySelectorAll('.get,.thx,.gnote,.soft,.sig,.lab,.gmx-heart')).forEach(function(e){e.remove()});
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
function wireProfile(){
  var sec=document.querySelector('section.artist[id]');if(!sec||sec.querySelector('.gmx-follow'))return;
  var meta=sec.querySelector('.meta'),name=text(sec.querySelector('h1.aname'));if(!meta||!name)return;
  var kind=sec.classList.contains('label')?'label':'artist',item={kind:kind,id:kind+':'+sec.id,title:name,url:location.pathname.replace(/\.html$/,'')};
  item[kind]=name;
  var b=document.createElement('button');b.type='button';b.className='tag gmx-follow';
  function paint(on){b.setAttribute('aria-pressed',on?'true':'false');b.innerHTML=HEART+(on?'following':'follow');b.setAttribute('aria-label',(on?'following ':'follow ')+name+(on?', tap to stop':''))}
  paint(has(item.id));
  b.addEventListener('click',function(){var now=toggle(item,b);paint(now);b.classList.add('pop');setTimeout(function(){b.classList.remove('pop')},200)});
  meta.appendChild(b);
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
window.gmxCrate={load:load,save:save,toggle:toggle,has:has,heart:heart,names:names,fold:fold,artistsOf:artistsOf};
/* the account layer replaced the list: repaint every heart and pill on the page */
document.addEventListener('gmx:crate-synced',function(){[].slice.call(document.querySelectorAll('.gmx-heart[aria-label], .gmx-follow')).forEach(function(b){
  var s=b.closest('.set-slide, .card'),id=null;
  if(b.classList.contains('gmx-follow')){var sec=b.closest('section.artist[id]');if(sec)id=(sec.classList.contains('label')?'label':'artist')+':'+sec.id}
  else if(s){var f=s.querySelector('[data-yt]');if(f)id='yt:'+f.getAttribute('data-yt')}
  if(!id)return;var on=has(id);b.setAttribute('aria-pressed',on?'true':'false');if(b.classList.contains('gmx-follow'))b.innerHTML=HEART+(on?'following':'follow');
})});
})();
