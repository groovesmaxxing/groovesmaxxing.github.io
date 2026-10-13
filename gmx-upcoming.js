/* groovesmaxxing dropping soon, filtered on the crate (2026-10-11). vanilla, no dependencies beyond
   gmx-crate.js. the release rows come from the laptop's upcomingpage.py and this never edits them. it adds
   a chip row under the legend: everything, or only the releases whose artist or label is in the crate
   (liked sets and tracks, followed artists and labels). the choice stays on this phone under
   gmx_upcoming_mine, and /upcoming?mine=1 switches it on. a tier with nothing left to show folds away. */
(function(){
'use strict';
var KEY='gmx_upcoming_mine';
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():''}
function start(){
  var rows=[].slice.call(document.querySelectorAll('.ev'));
  var anchor=document.querySelector('.legend')||document.querySelector('p.sub');
  if(!rows.length||!anchor||!window.gmxCrate||document.querySelector('.gmx-mine'))return;
  var fold=gmxCrate.fold,split=gmxCrate.artistsOf;
  var st=document.createElement('style');
  st.textContent='.gmx-mine{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-18px 0 30px}'+
   '.gmx-mine button{font-family:"Space Mono",monospace;font-size:.75rem;letter-spacing:.04em;color:var(--steel,#8A8A93);border:1px solid var(--line,#2a2a31);border-radius:999px;padding:7px 14px;cursor:pointer;background:none;min-height:36px}'+
   '.gmx-mine button[aria-pressed="true"]{color:var(--racing,#FF1C02);border-color:var(--racing,#FF1C02)}.gmx-mine button b{font-weight:400;color:inherit;margin-left:6px;opacity:.75}'+
   '.gmx-mine .why{flex-basis:100%;font-family:"Space Mono",monospace;font-size:.74rem;color:var(--steel,#8A8A93);line-height:1.7}.gmx-mine .why a{color:#cfcfc9}'+
   '.gmx-hidden{display:none !important}';
  document.head.appendChild(st);
  /* what each row is: the artists in the small line, the label in the first part of the where line */
  var meta=rows.map(function(ev){
    var small=ev.querySelector('h3 small'),where=ev.querySelector('.where');
    var artists=split(text(small)).map(fold),label=fold((text(where).split(' · ')[0]||''));
    return {ev:ev,artists:artists,label:label};
  });
  function matches(m,n){if(m.label&&n.labels[m.label])return true;for(var i=0;i<m.artists.length;i++)if(n.artists[m.artists[i]])return true;return false}
  /* the tiers: every heading run (tierline, h2.tier, tiersub) and the rows under it until the next one */
  var groups=[],cur=null;
  [].slice.call(anchor.parentNode.children).forEach(function(el){
    if(el.classList.contains('tierline')){cur={heads:[el],rows:[]};groups.push(cur);return}
    if(!cur)return;
    if(el.matches('h2.tier,.tiersub,.empty'))cur.heads.push(el);
    else if(el.classList.contains('ev'))cur.rows.push(el);
    else if(!el.matches('script,style,link'))cur=null;
  });
  var bar=document.createElement('div');bar.className='gmx-mine';bar.setAttribute('role','group');bar.setAttribute('aria-label','show');
  bar.innerHTML='<button type="button" data-m="0">everything<b>'+rows.length+'</b></button><button type="button" data-m="1">my crate<b></b></button><p class="why" hidden></p>';
  anchor.parentNode.insertBefore(bar,anchor.nextSibling);
  var all=bar.querySelector('[data-m="0"]'),mine=bar.querySelector('[data-m="1"]'),why=bar.querySelector('.why');
  function apply(on){
    var n=gmxCrate.names(),hit=0;
    meta.forEach(function(m){var show=!on||matches(m,n);m.ev.classList.toggle('gmx-hidden',!show);if(show&&on)hit++});
    groups.forEach(function(g){var any=g.rows.some(function(r){return !r.classList.contains('gmx-hidden')});g.heads.forEach(function(h){h.classList.toggle('gmx-hidden',on&&!any)})});
    mine.querySelector('b').textContent=hit||'';
    all.setAttribute('aria-pressed',on?'false':'true');mine.setAttribute('aria-pressed',on?'true':'false');
    if(on&&!hit){
      why.hidden=false;
      why.innerHTML=n.count?'nothing on the list matches your crate yet. it matches on the artist or the label of what you liked, and on the artists and labels you follow. keep digging and check back.':'your crate is empty on this phone. tap the heart under a set or next to a track, or follow an artist or a label on their page, and this filter wakes up. <a href="/crate">my crate</a>';
    }else why.hidden=true;
    try{localStorage.setItem(KEY,on?'1':'0')}catch(e){}
  }
  bar.addEventListener('click',function(e){var b=e.target.closest('[data-m]');if(!b)return;apply(b.getAttribute('data-m')==='1')});
  var want=false;
  try{want=/[?&]mine=1\b/.test(location.search)||localStorage.getItem(KEY)==='1'}catch(e){}
  apply(want);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
