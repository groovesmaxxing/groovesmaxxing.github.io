/* groovesmaxxing quick search (ui build 1, 2026-10-11). vanilla, no dependencies. the spotify and
   linear move: search from any page without leaving it. a plain tap on a search link or the search
   tab, the "/" key, or ctrl/cmd+k opens a sheet over the page with one box; results come from
   /search-index.json with the same folding and scoring as /search, grouped the same way, the top few
   per kind, plus the tracks from every tracklist (/tracks-index.json), so a record someone heard in a
   set is one box away from the set and the second it played. arrow keys move, enter opens the lit
   row (or the full search page when nothing is lit),
   escape closes and hands focus back. the last five queries wait under the box (gmx_quick_recent, this
   phone only). on /search itself this does nothing: the page is the full version. a modified click
   (cmd, ctrl, shift, middle) still opens /search in a tab as before. */
(function(){
'use strict';
if(document.querySelector('.gmx-quick'))return;
var path=location.pathname.replace(/\.html$/,'');
if(path==='/search')return;
var KIND={artist:['artists','🎤'],track:['tracks','🎵'],label:['labels','🏷️'],set:['sets','▶️'],tracklist:['tracklists','🎧'],talk:['talks','🎙️'],issue:['newsletter','📨']};
var ORDER=['artist','track','label','set','tracklist','talk','issue'],PER=4,MAX=16,RECENT='gmx_quick_recent';
var index=null,loading=null,opener=null,lit=-1,rows=[],timer=null,sheet,box,res,hint,recent,count;
function fold(t){return (t||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function mark(s,terms){var h=esc(s);terms.forEach(function(t){if(t.length<2)return;h=h.replace(new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>')});return h}
function score(it,terms){var k=it.k,n=fold(it.n),s=0;for(var i=0;i<terms.length;i++){var t=terms[i];if(k.indexOf(t)<0)return 0;s+=n.indexOf(t)===0?3:n.indexOf(t)>-1?2:1}return s}
function tracks(j){
  /* one item per tracklist row: the name, the set and the second as the small line, the page as the link */
  return ((j&&j.rows)||[]).filter(function(r){return r.q&&!/^id\b/.test(r.q)}).map(function(r){return {t:'track',n:r.n,s:(r.set||'')+(r.at?' · '+r.at:''),u:r.u,k:r.q+' '+fold(r.set)}});
}
function load(){
  if(index)return Promise.resolve(index);
  if(!loading)loading=Promise.all([
    fetch('/search-index.json').then(function(r){return r.json()}),
    fetch('/tracks-index.json').then(function(r){return r.json()}).catch(function(){return null})
  ]).then(function(a){index={items:a[0].items.concat(tracks(a[1]))};return index}).catch(function(){loading=null;return null});
  return loading;
}
function getRecent(){try{var a=JSON.parse(localStorage.getItem(RECENT)||'[]');return Array.isArray(a)?a.slice(0,5):[]}catch(e){return []}}
function remember(q){q=q.trim();if(!q)return;try{var a=getRecent().filter(function(x){return x!==q});a.unshift(q);localStorage.setItem(RECENT,JSON.stringify(a.slice(0,5)))}catch(e){}}
function build(){
  sheet=document.createElement('div');sheet.className='gmx-quick';sheet.hidden=true;
  sheet.innerHTML='<div class="gmx-quick-back" data-close></div>'+
    '<div class="gmx-quick-panel" role="dialog" aria-modal="true" aria-label="quick search">'+
      '<div class="gmx-quick-top"><input type="search" class="gmx-quick-box" placeholder="artist, set, label, sound…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="search the site" aria-controls="gmx-quick-res" aria-autocomplete="list">'+
      '<button type="button" class="gmx-quick-x" data-close aria-label="close search">×</button></div>'+
      '<div class="gmx-quick-recent"></div>'+
      '<div class="gmx-quick-res" id="gmx-quick-res" role="listbox"></div>'+
      '<p class="gmx-quick-count" aria-live="polite"></p>'+
      '<a class="gmx-quick-all" href="/search">full search →</a>'+
    '</div>';
  document.body.appendChild(sheet);
  box=sheet.querySelector('.gmx-quick-box');res=sheet.querySelector('.gmx-quick-res');hint=sheet.querySelector('.gmx-quick-all');recent=sheet.querySelector('.gmx-quick-recent');count=sheet.querySelector('.gmx-quick-count');
  sheet.addEventListener('click',function(e){if(e.target.closest('[data-close]'))close();var r=e.target.closest('[data-q]');if(r){box.value=r.getAttribute('data-q');run();box.focus()}});
  box.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(run,60)});
  box.addEventListener('keydown',function(e){
    if(e.key==='ArrowDown'){e.preventDefault();light(Math.min(lit+1,rows.length-1))}
    else if(e.key==='ArrowUp'){e.preventDefault();light(Math.max(lit-1,-1))}
    else if(e.key==='Enter'){e.preventDefault();var t=rows[lit]||null;remember(box.value);if(t)location.href=t.getAttribute('href');else if(box.value.trim())location.href='/search?q='+encodeURIComponent(box.value.trim())}
  });
  res.addEventListener('click',function(){remember(box.value)});
}
function light(i){
  lit=i;rows.forEach(function(r,n){r.classList.toggle('lit',n===i);r.setAttribute('aria-selected',n===i?'true':'false')});
  if(i>-1&&rows[i]){box.setAttribute('aria-activedescendant',rows[i].id);rows[i].scrollIntoView({block:'nearest'})}else box.removeAttribute('aria-activedescendant');
}
function drawRecent(){
  var a=getRecent();
  recent.innerHTML=a.length?'<span class="gmx-quick-rl">recent</span>'+a.map(function(q){return '<button type="button" class="gmx-quick-chip" data-q="'+esc(q)+'">'+esc(q)+'</button>'}).join(''):'';
  recent.hidden=!a.length||!!box.value;
}
function run(){
  var v=fold(box.value),terms=v.split(' ').filter(Boolean);
  hint.href=terms.length?'/search?q='+encodeURIComponent(box.value.trim()):'/search';
  drawRecent();
  if(!terms.length){res.innerHTML='';rows=[];lit=-1;count.textContent='';return}
  load().then(function(j){
    if(!j){res.innerHTML='<p class="gmx-quick-none">the index did not load. try the full search.</p>';count.textContent='';return}
    if(fold(box.value)!==v)return;
    var hits={},total=0;
    j.items.forEach(function(it){var sc=score(it,terms);if(!sc)return;(hits[it.t]=hits[it.t]||[]).push([sc,it]);total++});
    var out='',n=0;
    ORDER.forEach(function(k){
      var h=hits[k];if(!h||!h.length||n>=MAX)return;
      h.sort(function(a,b){return b[0]-a[0]||a[1].n.localeCompare(b[1].n)});
      out+='<div class="gmx-quick-grp">'+KIND[k][0]+'<span>'+h.length+'</span></div>';
      h.slice(0,PER).forEach(function(p){if(n>=MAX)return;var it=p[1];out+='<a class="gmx-quick-hit" role="option" id="gmx-quick-'+(n++)+'" href="'+esc(it.u)+'"><span class="k" aria-hidden="true">'+KIND[k][1]+'</span><span class="n">'+mark(it.n,terms)+'</span><span class="s">'+mark(it.s,terms)+'</span></a>'});
    });
    res.innerHTML=out||'<p class="gmx-quick-none">nothing for that. fewer letters, or the full search.</p>';
    rows=[].slice.call(res.querySelectorAll('.gmx-quick-hit'));light(rows.length?0:-1);
    count.textContent=total?(total+' result'+(total===1?'':'s')+(total>rows.length?', the first '+rows.length+' here':'')):'';
  });
}
function open(from){
  if(!sheet)build();
  opener=from||document.activeElement;
  sheet.hidden=false;document.documentElement.classList.add('gmx-quick-open');
  box.value='';run();load();
  setTimeout(function(){box.focus()},20);
}
function close(){
  if(!sheet||sheet.hidden)return;
  sheet.hidden=true;document.documentElement.classList.remove('gmx-quick-open');
  if(opener&&opener.focus)try{opener.focus()}catch(e){}
}
function typing(t){return t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)}
document.addEventListener('click',function(e){
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  var a=e.target.closest('a[href="/search"],a[href="/search.html"],[data-gmx-quick]');
  if(!a||a.closest('.gmx-quick'))return;
  e.preventDefault();open(a);
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&sheet&&!sheet.hidden){e.preventDefault();close();return}
  if((e.key==='k'||e.key==='K')&&(e.metaKey||e.ctrlKey)){e.preventDefault();if(sheet&&!sheet.hidden)close();else open();return}
  if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!typing(e.target)&&!(sheet&&!sheet.hidden)){e.preventDefault();open()}
});
window.gmxQuick={open:open,close:close};
})();
