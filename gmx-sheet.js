/* groovesmaxxing bottom sheet (ui build 2, 2026-10-11). vanilla, no dependencies beyond gmx-crate.js
   for the crate and follow state. the airbnb and mobbin move: one "…" next to every heart and follow
   pill opens a sheet from the bottom of the phone (a small panel on a wide screen) with everything you
   can do with that thing, instead of a scatter of small links.
     a set (stage slide or sets-page card): play, crate, follow the artist when the card names one with
       a profile, the tracklist when the card links one, open on youtube, share, scan.
     a tracklist row: play from here (the follow-along jumps the embedded set), crate, the artists in the
       row, the store links the row carries, share the second, "i know this one" on an open row, scan.
     an artist or label profile: follow, every verified link the page lists, share, scan.
   escape, the backdrop or the close button shut it and hand focus back. share uses the phone's share
   sheet, or copies the link and says so. nothing here is stored. */
(function(){
'use strict';
if(window.__gmxSheet)return;window.__gmxSheet=1;
var MAIL='groovesmaxxing@gmail.com';
var I={
  play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  heart:'<path d="M12 20.3s-7.2-4.6-9.2-9.1C1.4 7.9 3.4 4.8 6.6 4.8c1.9 0 3.4 1.1 4.2 2.4h2.4c.8-1.3 2.3-2.4 4.2-2.4 3.2 0 5.2 3.1 3.8 6.4-2 4.5-9.2 9.1-9.2 9.1z"/>',
  person:'<circle cx="12" cy="8.6" r="3.8"/><path d="M4.6 20.2c.9-3.8 3.9-5.8 7.4-5.8s6.5 2 7.4 5.8"/>',
  list:'<path d="M5 7h14M5 12h14M5 17h9"/>',
  link:'<path d="M10.1 13.9a4.2 4.2 0 0 0 6 0l2.6-2.6a4.24 4.24 0 0 0-6-6l-1.3 1.3"/><path d="M13.9 10.1a4.2 4.2 0 0 0-6 0l-2.6 2.6a4.24 4.24 0 0 0 6 6l1.3-1.3"/>',
  share:'<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v7h14v-7"/>',
  scan:'<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  mail:'<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  tag:'<path d="M20 12.5 12.5 20 4 11.5V4h7.5z"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/>'
};
function svg(k){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(I[k]||I.link)+'</svg>'}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():''}
var sheet,panel,opener,toastT;
function build(){
  sheet=document.createElement('div');sheet.className='gmx-sheet';sheet.hidden=true;
  sheet.innerHTML='<div class="gmx-sheet-back" data-close></div><div class="gmx-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="gmx-sheet-title"><div class="gmx-sheet-grip" aria-hidden="true"></div><div class="gmx-sheet-head"><div class="gmx-sheet-tx"><p class="gmx-sheet-title" id="gmx-sheet-title"></p><p class="gmx-sheet-sub"></p></div><button type="button" class="gmx-sheet-x" data-close aria-label="close">×</button></div><div class="gmx-sheet-acts"></div></div><div class="gmx-sheet-toast" role="status" aria-live="polite"></div>';
  document.body.appendChild(sheet);panel=sheet.querySelector('.gmx-sheet-panel');
  sheet.addEventListener('click',function(e){if(e.target.closest('[data-close]'))close()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sheet&&!sheet.hidden){e.preventDefault();close()}});
}
function toast(msg){var t=sheet.querySelector('.gmx-sheet-toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on')},1800)}
function open(model,from){
  if(!sheet)build();
  opener=from||document.activeElement;
  sheet.querySelector('.gmx-sheet-title').textContent=model.title||'';
  var sub=sheet.querySelector('.gmx-sheet-sub');sub.textContent=model.sub||'';sub.hidden=!model.sub;
  var acts=sheet.querySelector('.gmx-sheet-acts');acts.innerHTML='';
  model.actions.forEach(function(a){
    if(!a)return;
    var el=document.createElement(a.href?'a':'button');el.className='gmx-sheet-act'+(a.pressed?' on':'');
    if(a.href){el.href=a.href;if(a.external){el.target='_blank';el.rel='noopener'}}else el.type='button';
    el.innerHTML=svg(a.icon)+'<span class="l">'+esc(a.label)+'</span>'+(a.note?'<span class="n">'+esc(a.note)+'</span>':'')+(a.external?'<span class="n" aria-hidden="true">↗</span>':'');
    if(a.onClick)el.addEventListener('click',function(e){var keep=a.onClick(e,el);if(keep!==true)close()});
    else if(a.href&&!a.external)el.addEventListener('click',function(){close()});
    acts.appendChild(el);
  });
  sheet.hidden=false;document.documentElement.classList.add('gmx-sheet-open');
  var first=acts.querySelector('.gmx-sheet-act');setTimeout(function(){(first||sheet.querySelector('.gmx-sheet-x')).focus()},30);
}
function close(){
  if(!sheet||sheet.hidden)return;
  sheet.hidden=true;document.documentElement.classList.remove('gmx-sheet-open');
  if(opener&&opener.focus)try{opener.focus()}catch(e){}
}
function share(title,url){
  return function(){
    var u=/^https?:/.test(url)?url:location.origin+url;
    if(navigator.share){navigator.share({title:'groovesMAXXING',text:title,url:u}).catch(function(){});return}
    if(navigator.clipboard){navigator.clipboard.writeText(title+' '+u).then(function(){toast('link copied')}).catch(function(){toast(u)});return true}
    toast(u);return true;
  };
}
function crateAct(heart){
  if(!heart)return null;
  var on=heart.getAttribute('aria-pressed')==='true';
  return {icon:'heart',label:on?'in your crate, tap to take out':'add to my crate',pressed:on,onClick:function(){heart.click()}};
}
function followAct(name,slug,kind){
  if(!window.gmxCrate||!slug)return null;
  kind=kind||'artist';var item={kind:kind,id:kind+':'+slug,title:name,url:'/'+kind+'s/'+slug};item[kind]=name;
  var on=gmxCrate.has(item.id);
  return {icon:'person',label:(on?'following ':'follow ')+name,note:on?'tap to stop':'',pressed:on,onClick:function(){gmxCrate.toggle(item)}};
}
function slugOf(href){var m=/^\/(artists|labels)\/([a-z0-9-]+)/.exec(href||'');return m?{kind:m[1].slice(0,-1),slug:m[2]}:null}
/* a set: stage slide or sets-page card */
function setModel(s){
  var f=s.querySelector('[data-yt]')||s.querySelector('.video-frame'),id=f&&(f.getAttribute('data-yt')||(f.__facade&&f.__facade.getAttribute('data-yt')));if(!id)return null;
  var title=(f.getAttribute&&f.getAttribute('data-title'))||(f.__facade&&f.__facade.getAttribute('data-title'))||text(s.querySelector('.t'))||'set';
  var sub=text(s.querySelector('.set-meta .mono, .m')).replace(/\s*·\s*tracklist\s*↗?\s*$/,''),url='https://www.youtube.com/watch?v='+id;
  var prof=document.querySelector('section.artist:not(.label)[id]'),who=prof?{name:text(prof.querySelector('h1.aname')),slug:prof.id}:null;
  var al=s.querySelector('a[href^="/artists/"]');if(!who&&al){var p=slugOf(al.getAttribute('href'));if(p)who={name:text(al)||p.slug,slug:p.slug}}
  var tl=s.querySelector('a[href^="/tracklists/"]');
  var acts=[
    {icon:'play',label:'play',onClick:function(){var b=s.querySelector('.set-facade');if(b)b.click();else{var w=s.querySelector('.video-frame');if(w)w.scrollIntoView({block:'center'})}}},
    crateAct(s.querySelector('.gmx-heart')),
    who&&!prof?followAct(who.name,who.slug):null,
    tl?{icon:'list',label:'the tracklist',href:tl.getAttribute('href')}:null,
    {icon:'link',label:'open on youtube',href:url,external:true},
    {icon:'share',label:'share this set',onClick:share(title,url)},
    {icon:'scan',label:'scan what is playing',href:'/scan'}
  ];
  return {title:title,sub:sub,actions:acts};
}
/* a tracklist row */
function rowModel(r){
  var x=r.querySelector('td.x');if(!x)return null;
  var c=x.cloneNode(true);[].slice.call(c.querySelectorAll('.get,.thx,.gnote,.soft,.sig,.lab,.gmx-heart,.gmx-more')).forEach(function(e){e.remove()});
  var name=text(c),n=text(r.querySelector('td.n')),ta=r.querySelector('td.t a'),at=text(r.querySelector('td.t')),open=r.classList.contains('open')||/^ID\s*-\s*ID\b/i.test(name);
  var h1=text(document.querySelector('h1')),sub=text(document.querySelector('.mast .sub')),setName=h1+(sub?' · '+sub.split(' · ')[0]:'');
  var deep=ta?ta.getAttribute('href'):null,here=location.pathname.replace(/\.html$/,'')+(n?'#t'+n:'');
  var acts=[
    at?{icon:'play',label:'play from '+at,onClick:function(){if(ta&&document.querySelector('.embed iframe')){ta.click();return}if(deep)window.open(deep,'_blank','noopener')}}:null,
    crateAct(x.querySelector('.gmx-heart'))
  ];
  [].slice.call(x.querySelectorAll('a.ar')).forEach(function(a){var p=slugOf(a.getAttribute('href'));if(p)acts.push({icon:'person',label:text(a),href:'/artists/'+p.slug})});
  [].slice.call(x.querySelectorAll('.get a')).forEach(function(a){var l=text(a).replace(/\s*[⌕↗]\s*$/,'');if(l)acts.push({icon:'link',label:l,href:a.getAttribute('href'),external:true})});
  acts.push({icon:'share',label:'share this second',onClick:share((open?'an open ID':name)+' at '+at+' in '+setName,deep||here)});
  if(open)acts.push({icon:'mail',label:'i know this one',href:'mailto:'+MAIL+'?subject='+encodeURIComponent('ID at '+at+' in '+setName)+'&body='+encodeURIComponent('i know the ID at '+at+(n?' (track '+n+')':'')+' in '+setName+'.\n\nit is: \n\nhow i know: \n\n'+(deep||location.origin+here)),external:true});
  acts.push({icon:'scan',label:'scan what is playing',href:'/scan'});
  return {title:open?'ID at '+at:name,sub:setName+(at&&!open?' · '+at:''),actions:acts};
}
/* an artist or label profile */
function profileModel(sec){
  var name=text(sec.querySelector('h1.aname')),kind=sec.classList.contains('label')?'label':'artist';
  var acts=[];
  var pill=sec.querySelector('.gmx-follow');
  if(pill){var on=pill.getAttribute('aria-pressed')==='true';acts.push({icon:'person',label:on?'following, tap to stop':'follow '+name,pressed:on,onClick:function(){pill.click()}})}
  [].slice.call(sec.querySelectorAll('.links a[href]')).forEach(function(a){var l=(a.getAttribute('aria-label')||a.getAttribute('title')||text(a)).replace(/\s*[↗→]\s*$/,'');if(l)acts.push({icon:'link',label:l,href:a.getAttribute('href'),external:/^https?:/.test(a.getAttribute('href'))})});
  var claim=document.querySelector('.gmx-claim-row:not(.mine) .gmx-claim');  /* "this is me" lives here now (site review item 9) */
  if(claim)acts.push({icon:'person',label:kind==='label'?'run this label? claim the page':'this is me: claim this page',onClick:function(){claim.click()}});
  acts.push({icon:'share',label:'share this page',onClick:share(name+' on groovesmaxxing',location.pathname.replace(/\.html$/,''))});
  acts.push({icon:'scan',label:'scan what is playing',href:'/scan'});
  return {title:name,sub:kind==='label'?'label':'artist',actions:acts};
}
function more(label,model){
  var b=document.createElement('button');b.type='button';b.className='gmx-more';b.setAttribute('aria-label','more for '+label);b.setAttribute('aria-haspopup','dialog');b.title='more';
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>';
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var m=model();if(m)open(m,b)});
  return b;
}
function wire(root){
  root=root||document;
  [].slice.call(root.querySelectorAll('.set-slide .gmx-heart, .card .gmx-heart')).forEach(function(h){
    if(h.nextElementSibling&&h.nextElementSibling.classList.contains('gmx-more'))return;
    var s=h.closest('.set-slide, .card');if(!s)return;
    h.parentNode.insertBefore(more(text(s.querySelector('.t'))||'this set',function(){return setModel(s)}),h.nextSibling);
  });
  [].slice.call(root.querySelectorAll('table.tl tr')).forEach(function(r){
    var x=r.querySelector('td.x');if(!x||x.querySelector('.gmx-more'))return;
    var h=x.querySelector('.gmx-heart'),open=r.classList.contains('open');
    if(!h&&!open)return;
    var b=more(h?h.getAttribute('aria-label').replace(/^[^:]*:\s*/,''):'this ID',function(){return rowModel(r)});
    if(h)h.parentNode.insertBefore(b,h.nextSibling);else x.appendChild(b);
  });
  var sec=root.querySelector?document.querySelector('section.artist[id]'):null;
  if(sec&&!sec.querySelector('.meta .gmx-more')){var pill=sec.querySelector('.meta .gmx-follow');if(pill)pill.parentNode.insertBefore(more(text(sec.querySelector('h1.aname')),function(){return profileModel(sec)}),pill.nextSibling)}
}
function later(e){setTimeout(function(){wire(e&&e.target&&e.target.querySelectorAll?e.target:document)},0)}
function start(){wire();setTimeout(wire,400);setTimeout(wire,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
document.addEventListener('gmx:stage',later);document.addEventListener('gmx:cards',later);
window.gmxSheet={open:open,close:close,wire:wire};
})();
