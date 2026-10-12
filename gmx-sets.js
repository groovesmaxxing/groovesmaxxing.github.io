/* groovesmaxxing sets page (site speed build, 2026-10-11). the cards for each artist live in sets-index.json
   and render the moment a fold opens, a hash points at it, or a search runs. the "just added" row is inline.
   vanilla, no dependencies. pairs with .github/scripts/lighten_sets.py, which writes the json. */
(function(){
'use strict';
var PLAY='<span class="set-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';
var index=null, loading=null, tags=null, tagsLoading=null;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function load(){
  if(index)return Promise.resolve(index);
  if(loading)return loading;
  loading=fetch('/sets-index.json').then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){index=j;return j}).catch(function(){loading=null;return null});
  return loading;
}
/* the card tags (tag watcher build, 2026-10-11). set-tags.json carries the approved lane and tags per video id,
   written on the laptop by tagwatch approve. missing or empty, the cards simply carry no chips. */
function loadTags(){
  if(tags)return Promise.resolve(tags);
  if(tagsLoading)return tagsLoading;
  tagsLoading=fetch('/set-tags.json').then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){tags=(j&&j.sets)||{};return tags}).catch(function(){tags={};return tags});
  return tagsLoading;
}
function chips(yt){
  var t=tags&&tags[yt];if(!t)return '';
  var out=[];if(t.lane)out.push('<span class="lane">'+esc(t.lane)+'</span>');
  (t.tags||[]).forEach(function(x){out.push('<span>'+esc(x)+'</span>')});
  if(t.year)out.push('<span>'+esc(t.year)+'</span>');
  return out.length?'<div class="k">'+out.join('')+'</div>':'';
}
function tagWords(yt){var t=tags&&tags[yt];return t?[t.lane||''].concat(t.tags||[],[t.year||'']).join(' '):''}
var st=document.createElement('style');
st.textContent='.card .k{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.card .k span{font-family:"Space Mono",monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--steel,#8A8A93);border:1px solid var(--line,#26262b);border-radius:999px;padding:2px 8px;line-height:1.5}.card .k span.lane{color:var(--racing,#FF1C02);border-color:rgba(255,28,2,.42)}';
document.head.appendChild(st);
function card(c){
  return '<div class="card"><button class="set-facade" type="button" data-yt="'+esc(c.yt)+'" data-title="'+esc(c.title)+'" aria-label="play '+esc(c.title)+'">'+
    '<img src="https://img.youtube.com/vi/'+esc(c.yt)+'/hqdefault.jpg" alt="" loading="lazy" width="480" height="360">'+PLAY+'</button>'+c.html+chips(c.yt)+'</div>';
}
/* the cards already inline on the page (the just added row) get their chips once the tags are in */
loadTags().then(function(){
  [].slice.call(document.querySelectorAll('.card .set-facade[data-yt]')).forEach(function(b){
    var card=b.parentNode;if(!card||card.querySelector('.k'))return;
    var h=chips(b.getAttribute('data-yt'));if(h)card.insertAdjacentHTML('beforeend',h);
  });
});
function fill(grid){
  if(!grid||grid.getAttribute('data-done'))return Promise.resolve();
  return Promise.all([load(),loadTags()]).then(function(r){
    var j=r[0];
    var a=j&&j.artists&&j.artists[grid.getAttribute('data-slug')];
    if(!a){grid.innerHTML='<p class="count">the sets did not load. refresh and try again.</p>';return}
    grid.innerHTML=a.cards.map(card).join('');grid.setAttribute('data-done','1');
    try{grid.dispatchEvent(new CustomEvent('gmx:cards',{bubbles:true}))}catch(e){}
  });
}
function play(b){
  var fr=document.createElement('iframe');
  fr.src='https://www.youtube-nocookie.com/embed/'+b.getAttribute('data-yt')+'?autoplay=1';
  fr.title=b.getAttribute('data-title');fr.allowFullscreen=true;
  fr.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  var w=document.createElement('div');w.className='video-frame';w.appendChild(fr);
  b.parentNode.replaceChild(w,b);
}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.set-facade');if(b)play(b);});
document.addEventListener('toggle',function(e){var d=e.target;if(d.tagName==='DETAILS'&&d.open)fill(d.querySelector('.grid[data-slug]'));},true);
var rows=[].slice.call(document.querySelectorAll('details.a')),secs=[].slice.call(document.querySelectorAll('section.L')),fresh=document.getElementById('newest'),rail=document.getElementById('rail'),empty=document.getElementById('empty'),q=document.getElementById('q'),keys=null,auto=[];
function openHash(){
  var h='';try{h=decodeURIComponent(location.hash.slice(1));}catch(e){}
  if(!h)return;var d=document.getElementById(h);
  if(d&&d.tagName==='DETAILS'){d.open=true;fill(d.querySelector('.grid[data-slug]')).then(function(){d.scrollIntoView();});}
}
openHash();window.addEventListener('hashchange',openHash);
/* the folds closest to the screen render early, so a tap never waits */
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){io.unobserve(x.target);load();}})},{rootMargin:'600px'});
  rows.slice(0,40).forEach(function(d){io.observe(d)});
}
if(!q)return;
function norm(s){return (s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/ø/g,'o').replace(/æ/g,'ae').replace(/ß/g,'ss').replace(/đ/g,'d').replace(/ł/g,'l');}
function keysFor(j){
  keys=rows.map(function(d){var a=j&&j.artists&&j.artists[d.id],t=a?a.cards.map(function(c){return c.title+' '+tagWords(c.yt)}).join(' '):'';return norm(d.id+' '+d.querySelector('summary').textContent+' '+t)});
}
function run(){
  var v=norm(q.value).trim(),hits=[];
  for(var a=0;a<auto.length;a++){auto[a].open=false;}auto=[];
  for(var i=0;i<rows.length;i++){var hit=!v||keys[i].indexOf(v)!==-1;rows[i].hidden=!hit;if(hit&&v)hits.push(rows[i]);}
  for(var j=0;j<secs.length;j++){secs[j].hidden=!!v&&!secs[j].querySelector('details.a:not([hidden])');}
  if(fresh)fresh.hidden=!!v;
  if(rail)rail.hidden=!!v;
  if(v&&hits.length<=3){for(var h=0;h<hits.length;h++){if(!hits[h].open){hits[h].open=true;auto.push(hits[h]);fill(hits[h].querySelector('.grid[data-slug]'));}}}
  empty.style.display=(v&&!hits.length)?'block':'none';
}
q.addEventListener('input',function(){ if(keys)return run(); Promise.all([load(),loadTags()]).then(function(r){keysFor(r[0]);run();}); });
})();
