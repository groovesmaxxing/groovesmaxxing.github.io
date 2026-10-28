/* groovesmaxxing shell (shell v2, 2026-10-12). vanilla, no dependencies. the one tab bar for every page:
   home, tracklists, the raised scan button, artists, more. the search tab is gone: search is the floating
   button above the bar, and the sheet it opens reads /search-index.json (plus the tracks from every tracklist
   in /tracks-index.json), scoped to the tab the page sits under, with an "everything" chip to widen it. the
   button lifts out of the way while the follow-along bar (#gmx-now) is showing. this script is the only
   source of the bar: a page that still carries one inline loses it here. it also loads gmx-account.js, which
   paints the "sign in" or "@handle" chip into the header of every page.
   "/" and ctrl/cmd+k open the sheet, as before. a plain tap on any /search link opens it too; a modified
   click (cmd, ctrl, shift, middle) still opens /search in a tab. on /search itself the button focuses the box. */
/* halloween skin (2026-10-27): every page that loads the shell also gets /gmx-spooky.js, which switches itself off after 2026-11-02. index.html loads it in its head instead, so its set swap lands before the carousel starts. */
if (!document.querySelector('script[src^="/gmx-spooky.js"]')) { var gmxSpk = document.createElement('script'); gmxSpk.src = '/gmx-spooky.js?v=2'; document.head.appendChild(gmxSpk); }

(function(){
'use strict';
if(window.gmxNav)return;
var ICON={
  home:'<path d="M3.8 11.2 12 4.4l8.2 6.8"/><path d="M6.2 9.4v10.1h11.6V9.4"/><path d="M10 19.5v-5.2h4v5.2"/>',
  tracklists:'<path d="M4 6.5h9"/><path d="M4 12h9"/><path d="M4 17.5h6"/><circle cx="17.5" cy="15.5" r="2.6"/><path d="M20.1 15.5V6.2l-4.4 1.3"/>',
  artists:'<circle cx="12" cy="8.6" r="3.8"/><path d="M4.6 20.2c.9-3.8 3.9-5.8 7.4-5.8s6.5 2 7.4 5.8"/>',
  more:'<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>'
};
/* the homepage logo: three red grooves, the red centre, the white waveform, on a night disc ringed in red.
   gmx-nav.css swells the waveform and sends the grooves out in a slow ripple. */
var WAVE='6,120 30,120 48,84 68,150 88,96 108,138 120,114 132,138 152,96 172,150 192,84 210,120 234,120';
var MARK='<svg viewBox="0 0 240 240" aria-hidden="true"><g fill="none" stroke="#FF1C02" stroke-width="10"><circle class="gx-r gx-r3" cx="120" cy="120" r="104"/><circle class="gx-r gx-r2" cx="120" cy="120" r="76"/><circle class="gx-r gx-r1" cx="120" cy="120" r="48"/></g><circle cx="120" cy="120" r="20" fill="#FF1C02"/><polyline class="gx-wv" points="'+WAVE+'" fill="none" stroke="#F2F2EF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var TABS=[['/','home'],['/tracklists/','tracklists'],['/scan','scan'],['/artists','artists'],['/more','more']];
var path=location.pathname.replace(/\.html$/,'').replace(/\/index$/,'/');
function under(p){return path===p||path.indexOf(p+'/')===0;}
/* the active-state rules: which tab a page sits under */
function tabOf(){
  if(document.body&&document.body.classList.contains('gmx-404'))return null; /* the 404 page sits under no tab, whatever path it was served at */
  if(path==='/')return 'home';
  if(path==='/scan')return 'scan';
  if(under('/sets')||under('/tracklists')||path==='/interviews'||path==='/radio'||path==='/open-ids')return 'tracklists';
  if(under('/artists')||under('/labels')||path==='/roster'||path==='/badges')return 'artists';
  if(under('/more')||under('/newsletter')||under('/upcoming')||path==='/events'||path==='/tours'||path==='/venues'||path==='/friday'||path==='/privacy'||path==='/terms'||path==='/crate'||path==='/search')return 'more';
  return null;
}
var tab=tabOf();
function buildTabs(){
  var old=document.querySelectorAll('.gmx-tabs');for(var i=0;i<old.length;i++)old[i].parentNode.removeChild(old[i]);
  var nav=document.createElement('nav');nav.className='gmx-tabs';nav.setAttribute('aria-label','app tabs');
  var ul=document.createElement('ul');
  TABS.forEach(function(t){
    var li=document.createElement('li'),a=document.createElement('a');
    a.href=t[0];if(tab===t[1])a.setAttribute('aria-current','page');
    if(t[1]==='scan'){li.className='gmx-scan';a.innerHTML='<span class="gmx-disc">'+MARK+'</span>scan';a.setAttribute('aria-label','scan what is playing')}
    else a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[t[1]]+'</svg>'+t[1];
    if(t[1]==='scan'&&tab==='scan')a.addEventListener('click',function(e){var go=document.getElementById('go');if(!go)return;e.preventDefault();go.click();try{go.scrollIntoView({block:'center',behavior:'smooth'})}catch(x){}});
    li.appendChild(a);ul.appendChild(li);
  });
  nav.appendChild(ul);document.body.appendChild(nav);
  /* a skip link for keyboard and screen reader users */
  if(!document.querySelector('.gmx-skip')){var main=document.querySelector('main')||document.querySelector('.wrap');if(main){if(!main.id)main.id='gmx-main';var sk=document.createElement('a');sk.className='gmx-skip';sk.href='#'+main.id;sk.textContent='skip to content';document.body.insertBefore(sk,document.body.firstChild);}}
}
/* ---- the search sheet ---- */
var KIND={artist:['artists','🎤'],track:['tracks','🎵'],label:['labels','🏷️'],set:['sets','▶️'],tracklist:['tracklists','🎧'],talk:['talks','🎙️'],issue:['newsletter','📨']};
var ORDER=['artist','track','label','set','tracklist','talk','issue'],PER=4,MAX=16,RECENT='gmx_quick_recent';
/* what each tab narrows the sheet to. the other tabs are everything. */
var SCOPE={tracklists:{label:'tracklists',kinds:['set','tracklist','track']},artists:{label:'artists',kinds:['artist','label']}};
var scope=SCOPE[tab]?SCOPE[tab].kinds:null;
var index=null,loading=null,opener=null,lit=-1,rows=[],timer=null,sheet,box,res,hint,recent,count,chips;
function fold(t){return (t||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function mark(s,terms){var h=esc(s);terms.forEach(function(t){if(t.length<2)return;h=h.replace(new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>')});return h}
function score(it,terms){var k=it.k,n=fold(it.n),s=0;for(var i=0;i<terms.length;i++){var t=terms[i];if(k.indexOf(t)<0)return 0;s+=n.indexOf(t)===0?3:n.indexOf(t)>-1?2:1}return s}
function tracks(j){
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
  var sc=SCOPE[tab]?'<button type="button" class="gmx-quick-chip" data-scope="tab" aria-pressed="true">'+SCOPE[tab].label+'</button><button type="button" class="gmx-quick-chip" data-scope="all" aria-pressed="false">everything</button>':'<button type="button" class="gmx-quick-chip" data-scope="all" aria-pressed="true">everything</button>';
  sheet.innerHTML='<div class="gmx-quick-back" data-close></div>'+
    '<div class="gmx-quick-panel" role="dialog" aria-modal="true" aria-label="search">'+
      '<div class="gmx-quick-top"><input type="search" class="gmx-quick-box" placeholder="'+(SCOPE[tab]?'search the '+SCOPE[tab].label+'…':'artist, set, label, sound…')+'" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="search the site" aria-controls="gmx-quick-res" aria-autocomplete="list">'+
      '<button type="button" class="gmx-quick-x" data-close aria-label="close search">×</button></div>'+
      '<div class="gmx-quick-scope" role="group" aria-label="search in"><span class="gmx-quick-rl">in</span>'+sc+'</div>'+
      '<div class="gmx-quick-recent"></div>'+
      '<div class="gmx-quick-res" id="gmx-quick-res" role="listbox"></div>'+
      '<p class="gmx-quick-count" aria-live="polite"></p>'+
      '<a class="gmx-quick-all" href="/search">full search →</a>'+
    '</div>';
  document.body.appendChild(sheet);
  box=sheet.querySelector('.gmx-quick-box');res=sheet.querySelector('.gmx-quick-res');hint=sheet.querySelector('.gmx-quick-all');recent=sheet.querySelector('.gmx-quick-recent');count=sheet.querySelector('.gmx-quick-count');chips=sheet.querySelector('.gmx-quick-scope');
  sheet.addEventListener('click',function(e){
    if(e.target.closest('[data-close]'))close();
    var s=e.target.closest('[data-scope]');if(s){setScope(s.getAttribute('data-scope'));run();box.focus();return}
    var r=e.target.closest('[data-q]');if(r){box.value=r.getAttribute('data-q');run();box.focus()}
  });
  box.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(run,60)});
  box.addEventListener('keydown',function(e){
    if(e.key==='ArrowDown'){e.preventDefault();light(Math.min(lit+1,rows.length-1))}
    else if(e.key==='ArrowUp'){e.preventDefault();light(Math.max(lit-1,-1))}
    else if(e.key==='Enter'){e.preventDefault();var t=rows[lit]||null;remember(box.value);if(t)location.href=t.getAttribute('href');else if(box.value.trim())location.href='/search?q='+encodeURIComponent(box.value.trim())}
  });
  res.addEventListener('click',function(){remember(box.value)});
}
function setScope(which){
  scope=which==='tab'&&SCOPE[tab]?SCOPE[tab].kinds:null;
  [].slice.call(chips.querySelectorAll('[data-scope]')).forEach(function(b){b.setAttribute('aria-pressed',b.getAttribute('data-scope')===which?'true':'false')});
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
    var hits={},total=0,outside=0;
    j.items.forEach(function(it){var sc=score(it,terms);if(!sc)return;if(scope&&scope.indexOf(it.t)<0){outside++;return}(hits[it.t]=hits[it.t]||[]).push([sc,it]);total++});
    var out='',n=0;
    ORDER.forEach(function(k){
      var h=hits[k];if(!h||!h.length||n>=MAX)return;
      h.sort(function(a,b){return b[0]-a[0]||a[1].n.localeCompare(b[1].n)});
      out+='<div class="gmx-quick-grp">'+KIND[k][0]+'<span>'+h.length+'</span></div>';
      h.slice(0,PER).forEach(function(p){if(n>=MAX)return;var it=p[1];out+='<a class="gmx-quick-hit" role="option" id="gmx-quick-'+(n++)+'" href="'+esc(it.u)+'"><span class="k" aria-hidden="true">'+KIND[k][1]+'</span><span class="n">'+mark(it.n,terms)+'</span><span class="s">'+mark(it.s,terms)+'</span></a>'});
    });
    if(!out)out='<p class="gmx-quick-none">'+(outside?'nothing in the '+SCOPE[tab].label+' for that, but '+outside+' elsewhere. <button type="button" class="gmx-quick-chip" data-scope="all">search everything</button>':'nothing for that. fewer letters, or the full search.')+'</p>';
    res.innerHTML=out;
    rows=[].slice.call(res.querySelectorAll('.gmx-quick-hit'));light(rows.length?0:-1);
    count.textContent=total?(total+' result'+(total===1?'':'s')+(total>rows.length?', the first '+rows.length+' here':'')+(scope&&outside?' · '+outside+' more in everything':'')):'';
  });
}
function open(from){
  if(path==='/search'){var q=document.getElementById('q');if(q){q.focus();try{q.scrollIntoView({block:'center'})}catch(e){}}return}
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
  if(!a||a.closest('.gmx-quick')||path==='/search')return;
  e.preventDefault();open(a);
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&sheet&&!sheet.hidden){e.preventDefault();close();return}
  if((e.key==='k'||e.key==='K')&&(e.metaKey||e.ctrlKey)){e.preventDefault();if(sheet&&!sheet.hidden)close();else open();return}
  if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!typing(e.target)&&!(sheet&&!sheet.hidden)){e.preventDefault();open()}
});
/* the floating search button, and the lift while the follow-along bar is on. the pages that already have a
   search box of their own go without it, and html.gmx-fab-on tells gmx-nav.css to end the page above it. */
var NOFAB=['/artists','/sets','/search','/radio'];
function buildFab(){
  var old=document.querySelector('.gmx-fab');if(old)old.parentNode.removeChild(old);
  if(NOFAB.indexOf(path)>-1)return;
  document.documentElement.classList.add('gmx-fab-on');
  var b=document.createElement('button');b.type='button';b.className='gmx-fab';b.setAttribute('aria-label','search the site');b.setAttribute('data-gmx-quick','');
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON.search+'</svg>';
  b.addEventListener('click',function(){open(b)});
  document.body.appendChild(b);
}
function watchNow(){
  var html=document.documentElement;
  function sync(el){html.classList.toggle('gmx-nowon',!!el&&el.classList.contains('on'))}
  function arm(el){sync(el);new MutationObserver(function(){sync(el)}).observe(el,{attributes:true,attributeFilter:['class']})}
  var now=document.getElementById('gmx-now');
  if(now){arm(now);return}
  if(!window.MutationObserver)return;
  var mo=new MutationObserver(function(){var el=document.getElementById('gmx-now');if(el){mo.disconnect();arm(el)}});
  mo.observe(document.body,{childList:true});
}
function loadAccount(){
  if(window.gmxAccount||document.querySelector('script[src^="/gmx-account.js"]'))return;
  var s=document.createElement('script');s.src='/gmx-account.js?v=17';s.defer=true;document.head.appendChild(s);
}
function mount(){
  if(document.querySelector('meta[http-equiv="refresh"]'))return;
  buildTabs();buildFab();watchNow();loadAccount();
}
if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
window.gmxQuick={open:open,close:close};
window.gmxNav={tab:tab,open:open,close:close,mark:MARK,icon:ICON};
})();
