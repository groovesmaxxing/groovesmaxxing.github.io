/* groovesmaxxing mood picker (2026-11-04). vanilla, no dependencies, nothing leaves the browser.
   moods.html loads this. it fetches /moods-index.json once: his four lane playlists (good vibe juice, bumpy,
   waaavy, wen playa), released tracks only, one version per song, written by moodindex.py on the laptop. the
   page paints the mood chips, reads a typed mood (english or spanish, a genre, a tempo, an artist or a label we
   play) and builds a list of up to 30 tracks with listen links built from ids the catalog already holds.
   the mood, the typed words and the shuffle seed sit in the address hash (#mood=late-night&s=123 or
   #q=sunday%20morning&s=123), so a shared link rebuilds the same list. the hash never reaches a server.
   the page's own words go through gmx-lang.js (the moods page block in gmx-lang-es.js, scoped to .mzp).
   track, artist and label names carry translate="no". hearts come from gmx-crate.js when it is on the page. */
(function(){
'use strict';
var root=document.getElementById('mz');if(!root)return;
var chipsEl=document.getElementById('mz-chips'),res=document.getElementById('mz-res'),form=document.getElementById('mz-ask'),
    input=document.getElementById('mz-q'),live=document.getElementById('mz-live'),metaEl=document.getElementById('mz-meta');
var D=null,loading=null,names=null,cur=null,MOOD={},GW={},NEVER=[],ALL=[];
var N=30,PER_ARTIST=2,PRIMARY=6;
var C={sp:0,t:1,a:2,l:3,g:4,ag:5,b:6,k:7,ln:8,f:9,r:10,bp:11,dz:12,ar:13,h:14};
var STOP={};('a an the and or for to of in on at with my me i some music songs song tracks track playlist mix mood moods vibe something '+
  'give want need please like que el la los las un una unos unas de del y o para por con mi musica cancion canciones algo dame quiero tracks rolas').split(' ').forEach(function(w){STOP[w]=1});
var MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
/* the same fold as moodindex.py: accents off, lowercase, anything not a letter or digit is a space */
function fold(s){return String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function normLabel(s){
  s=String(s||'').toLowerCase().split(/\s+\/\s+contains|,?\s+a division of/)[0].replace(/\(.*?\)/g,' ');
  return fold(s.replace(/\b(records|recordings|records limited|music|musique|ltd|llc|inc|limited)\b\.?/g,' '));
}
function rng(seed){var a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function newSeed(){return 1+Math.floor(Math.random()*99999)}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function daysSince(iso){var p=iso.split('-');return Math.floor((Date.now()-new Date(+p[0],p[1]-1,+p[2]).getTime())/864e5)}
function chip(id){for(var i=0;i<D.chips.length;i++)if(D.chips[i].id===id)return D.chips[i];return null}
function inSeason(c){if(!c.season)return true;var md=today().slice(5);return c.season[0]<=c.season[1]?md>=c.season[0]&&md<=c.season[1]:md>=c.season[0]||md<=c.season[1]}
function poolOf(c){
  if(c.pool)return c.pool;
  if(c.days){var out=[];D.rows.forEach(function(r,i){if(r[C.f]&&daysSince(r[C.f])<=c.days)out.push(i)});
    return out.sort(function(a,b){return D.rows[a][C.f]<D.rows[b][C.f]?1:D.rows[a][C.f]>D.rows[b][C.f]?-1:a-b})}
  return [];
}
function lead(i){return fold(D.rows[i][C.a].split(', ')[0])}

/* ---- the catalog ---- */
function load(){
  if(D)return Promise.resolve(D);
  if(loading)return loading;
  loading=fetch('/moods-index.json').then(function(r){if(!r.ok)throw new Error('moods-index '+r.status);return r.json()}).then(function(d){
    D=d;ALL=d.rows.map(function(_,i){return i});
    d.chips.forEach(function(c){(c.w||[]).forEach(function(w){if(!MOOD[w])MOOD[w]=c.id})});
    GW=d.genre_words||{};NEVER=(d.never||[]).map(fold);
    return d;
  }).catch(function(e){loading=null;throw e});
  return loading;
}
/* every artist and label name in the catalog, folded, to the rows that carry it */
function nameIndex(){
  if(names)return names;
  names={a:{},l:{},an:{},ln:{}};
  D.rows.forEach(function(r,i){
    r[C.a].split(', ').forEach(function(n){var f=fold(n);if(f.length<2||/^\d+$/.test(f))return;(names.a[f]=names.a[f]||[]).push(i);names.an[f]=n});
    var l=normLabel(r[C.l]);if(l.length>=3){(names.l[l]=names.l[l]||[]).push(i);if(!names.ln[l])names.ln[l]=r[C.l]}
  });
  return names;
}

/* ---- reading what was typed ---- */
function parse(q){
  var raw=String(q||'').toLowerCase().slice(0,120),p={moods:[],genres:[],gw:[],bpm:null,artists:[],labels:[],never:null};
  var fq=' '+fold(raw)+' ';
  for(var n=0;n<NEVER.length;n++)if(fq.indexOf(' '+NEVER[n]+' ')>-1){p.never=NEVER[n];return p}
  var m=raw.match(/\b(\d{2,3})\s*(?:-|–|—|to|a)\s*(\d{2,3})(?:\s*bpm)?\b/);
  if(m&&+m[1]>=60&&+m[2]<=200){p.bpm=[Math.min(+m[1],+m[2]),Math.max(+m[1],+m[2])];raw=raw.replace(m[0],' ')}
  else{m=raw.match(/\b(\d{2,3})\s*bpm\b/)||raw.match(/(?:^|\s)(\d{3})(?=\s|$)/);
    if(m&&+m[1]>=70&&+m[1]<=180){p.bpm=[+m[1]-3,+m[1]+3];raw=raw.replace(m[0],' ')}}
  var ix=nameIndex(),toks=fold(raw).split(' ').filter(Boolean),rest=[],i=0;
  function add(list,v){if(list.indexOf(v)<0)list.push(v)}
  while(i<toks.length){
    var took=0;
    for(var k=Math.min(4,toks.length-i);k>=1&&!took;k--){
      var ph=toks.slice(i,i+k).join(' ');
      if(MOOD[ph]){add(p.moods,MOOD[ph]);took=k}
      else if(GW[ph]){GW[ph].forEach(function(g){add(p.genres,g)});add(p.gw,ph);took=k}
      else if(ph.length>=3&&!STOP[ph]&&ix.a[ph]){add(p.artists,ph);took=k}
      else if(ph.length>=3&&!STOP[ph]&&ix.l[ph]){add(p.labels,ph);took=k}
    }
    if(took)i+=took;else{if(!STOP[toks[i]])rest.push(toks[i]);i++}
  }
  /* what is left: a name typed in part (lake, magician). a whole-word run inside one to three names counts */
  var left=rest.join(' ');
  function partial(ph){
    if(ph.length<4)return false;
    var hits=Object.keys(ix.a).filter(function(nm){return (' '+nm+' ').indexOf(' '+ph+' ')>-1});
    if(hits.length&&hits.length<=3){hits.forEach(function(h){add(p.artists,h)});return true}
    return false;
  }
  if(left&&!partial(left))rest.forEach(partial);
  return p;
}
function hasFacet(p){return p.moods.length||p.genres.length||p.bpm||p.artists.length||p.labels.length}

/* ---- the pool for a pick ---- */
function candidates(st){
  var out={title:'',desc:'',read:null,primary:[],pool:[],size:0,relaxed:[],state:''};
  if(st.mood){
    var c=chip(st.mood);if(!c){out.state='none';return out}
    out.title=c.en;out.desc=c.d;out.pool=poolOf(c).slice();out.size=out.pool.length;
    if(!out.size)out.state='none';
    return out;
  }
  var p=parse(st.q);out.read=p;out.title=st.q;
  if(p.never){out.state='never';return out}
  if(!hasFacet(p)){out.state='none';return out}
  var base=ALL;
  if(p.moods.length){var seen={};base=[];p.moods.forEach(function(id){var c=chip(id);if(c)poolOf(c).forEach(function(i){if(!seen[i]){seen[i]=1;base.push(i)}})});
    if(p.moods.length===1){var c1=chip(p.moods[0]);out.desc=c1.d}}
  var gs={};p.genres.forEach(function(g){var k=D.genres.indexOf(g);if(k>0)gs[k]=1});
  var ls={};p.labels.forEach(function(l){ls[l]=1});
  function keep(useG,useB){return base.filter(function(i){var r=D.rows[i];
    if(useG&&p.genres.length&&!gs[r[C.g]]&&!gs[r[C.ag]])return false;
    if(useB&&p.bpm&&!(r[C.b]&&r[C.b]>=p.bpm[0]&&r[C.b]<=p.bpm[1]))return false;
    if(p.labels.length&&!p.artists.length&&!ls[normLabel(r[C.l])])return false;
    return true})}
  var other=p.moods.length||p.artists.length||p.labels.length;
  var list=keep(true,true);
  if(list.length<10&&p.genres.length&&(other||p.bpm)){list=keep(false,true);out.relaxed.push('genre')}
  if(list.length<10&&p.bpm&&other){list=keep(false,false);out.relaxed.push('tempo')}
  if(p.artists.length){
    /* an artist we play: their tracks first, then the ones that share a label or a sound with them */
    var ix=nameIndex(),mine={},prim=[];
    p.artists.forEach(function(a){(ix.a[a]||[]).forEach(function(i){mine[i]=1})});
    prim=list.filter(function(i){return mine[i]});
    if(!prim.length)prim=Object.keys(mine).map(Number).sort(function(a,b){return a-b});
    var labs={},gen={};
    Object.keys(mine).forEach(function(i){var r=D.rows[i],l=normLabel(r[C.l]);if(l)labs[l]=1;if(r[C.g])gen[r[C.g]]=1;if(r[C.ag])gen[r[C.ag]]=1});
    var sec=list.filter(function(i){if(mine[i])return false;var r=D.rows[i];return labs[normLabel(r[C.l])]||gen[r[C.g]]||gen[r[C.ag]]});
    if(sec.length<N&&p.moods.length){var s2={};sec.forEach(function(i){s2[i]=1});list.forEach(function(i){if(!mine[i]&&!s2[i])sec.push(i)})}
    out.primary=prim;out.pool=sec;out.size=prim.length+sec.length;
  }else{out.pool=list;out.size=list.length}
  if(!out.size)out.state='none';
  return out;
}

/* ---- the pick: a seeded shuffle that leans on the rank, two per artist at most, never the same one back to back ---- */
function pick(cand,seed){
  var R=rng(seed),pool=cand.pool,H=Math.max(24,pool.length/5),per={},out=[];
  var prim=cand.primary.slice();
  for(var j=prim.length-1;j>0;j--){var x=Math.floor(R()*(j+1)),t=prim[j];prim[j]=prim[x];prim[x]=t}
  prim=prim.slice(0,PRIMARY);
  var keyed=pool.map(function(i,pos){return [i,Math.pow(R(),1+pos/H)]}).sort(function(a,b){return b[1]-a[1]});
  var rest=[],skipped=[];
  for(var k=0;k<keyed.length&&rest.length<N-prim.length;k++){var i=keyed[k][0],a=lead(i);if((per[a]||0)>=PER_ARTIST){skipped.push(i);continue}per[a]=(per[a]||0)+1;rest.push(i)}
  /* a small pool (spooky, one label) would come out thin under the cap: the rest of it fills in */
  for(var f=0;f<skipped.length&&rest.length<N-prim.length;f++)rest.push(skipped[f]);
  /* the asked-for artist every third row, the rest around it */
  var pi=0,ri=0;
  while(pi<prim.length||ri<rest.length){if(pi<prim.length&&(out.length%3===0||ri>=rest.length))out.push(prim[pi++]);else out.push(rest[ri++])}
  for(var n=1;n<out.length;n++){if(lead(out[n])===lead(out[n-1])){for(var m=n+1;m<out.length;m++){if(lead(out[m])!==lead(out[n-1])){var s=out[n];out[n]=out[m];out[m]=s;break}}}}
  return out;
}

/* ---- painting ---- */
function chipBtn(c,on){return '<button type="button" class="lc" data-mood="'+esc(c.id)+'" aria-pressed="'+(on?'true':'false')+'">'+esc(c.en)+'</button>'}
function paintChips(){
  chipsEl.innerHTML=D.chips.filter(function(c){return inSeason(c)&&poolOf(c).length}).map(function(c){return chipBtn(c,cur&&cur.mood===c.id)}).join('');
}
function suggest(ids){return '<div class="mz-sug">'+ids.map(chip).filter(Boolean).map(function(c){return chipBtn(c,false)}).join('')+'</div>'}
function month(iso){var p=iso.split('-');return MON[+p[1]-1]+' '+p[0]}
function day(iso){var p=iso.split('-');return MON[+p[1]-1]+' '+(+p[2])}
function row(i,n){
  var r=D.rows[i],sp=r[C.sp],m=[],l=[];
  if(r[C.l])m.push('<span translate="no">'+esc(r[C.l])+'</span>');
  if(r[C.g])m.push('<span class="nb" translate="no">'+esc(D.genres[r[C.g]])+'</span>');
  if(r[C.b])m.push('<span class="nb" translate="no">'+r[C.b]+' bpm</span>');
  if(r[C.k])m.push('<span class="nb" translate="no">'+esc(r[C.k])+'</span>');
  if(r[C.r])m.push('<span class="nb">'+month(r[C.r])+'</span>');
  D.lanes.forEach(function(ln,b){if(r[C.ln]&(1<<b))m.push('<a class="ln" href="https://open.spotify.com/playlist/'+esc(ln[1])+'" target="_blank" rel="noopener" translate="no">'+esc(ln[0])+'</a>')});
  if(r[C.f])m.push('<span class="nw"><span>added</span> <span>'+day(r[C.f])+'</span></span>');
  l.push('<a href="https://open.spotify.com/track/'+esc(sp)+'" target="_blank" rel="noopener">spotify ↗</a>');
  if(r[C.bp])l.push('<a href="https://www.beatport.com/track/'+esc(r[C.bp])+'" target="_blank" rel="noopener">beatport ↗</a>');
  if(r[C.dz])l.push('<a href="https://www.deezer.com/track/'+esc(r[C.dz])+'" target="_blank" rel="noopener">deezer ↗</a>');
  (r[C.ar]||[]).forEach(function(a){var s=D.artists[a];if(s)l.push('<a href="'+esc(s[1])+'"><span translate="no">'+esc(s[0])+'</span>&nbsp;→</a>')});
  if(r[C.h]){var s=D.sets[r[C.h][0]];if(s)l.push('<a href="'+esc(s[1]+(r[C.h][1]?'#'+r[C.h][1]:''))+'" title="'+esc(s[0])+'">heard in a set →</a>')}
  return '<li class="mz-row" data-i="'+i+'"><span class="mz-i" aria-hidden="true">'+('0'+n).slice(-2)+'</span><div class="mz-b">'+
    '<div class="mz-tt" translate="no">'+esc(r[C.t])+'</div><div class="mz-ar" translate="no">'+esc(r[C.a])+'</div>'+
    (m.length?'<div class="mz-m">'+m.join('<i aria-hidden="true"> · </i>')+'</div>':'')+
    '<div class="mz-l">'+l.join('')+'</div></div></li>';
}
function readLine(p){
  var bits=[];
  p.moods.forEach(function(id){var c=chip(id);if(c)bits.push('<span class="pill">'+esc(c.en)+'</span>')});
  p.gw.forEach(function(g){bits.push('<span class="pill" translate="no">'+esc(g)+'</span>')});
  if(p.bpm)bits.push('<span class="pill" translate="no">'+p.bpm[0]+'–'+p.bpm[1]+' bpm</span>');
  var ix=nameIndex();
  p.artists.forEach(function(a){bits.push('<span class="pill"><span>like</span> <span translate="no">'+esc(ix.an[a]||a)+'</span></span>')});
  p.labels.forEach(function(l){bits.push('<span class="pill" translate="no">'+esc(ix.ln[l]||l)+'</span>')});
  return bits.length?'<p class="mz-read"><span>reading it as</span> '+bits.join(' ')+'</p>':'';
}
function say(t){var m=document.getElementById('mz-msg');if(m)m.textContent=t}
function hearts(){
  if(!window.gmxCrate||!gmxCrate.heart)return;
  [].slice.call(res.querySelectorAll('.mz-row')).forEach(function(li){
    var r=D.rows[+li.getAttribute('data-i')],links={spotify:'https://open.spotify.com/track/'+r[C.sp]};
    if(r[C.bp])links.beatport='https://www.beatport.com/track/'+r[C.bp];
    li.appendChild(gmxCrate.heart({kind:'track',id:'sp:'+r[C.sp],title:r[C.a]+' - '+r[C.t],sub:r[C.l]||'',links:links,artist:r[C.a],label:r[C.l]||''},r[C.a]+' - '+r[C.t]));
  });
}
function render(st){
  cur=st;paintChips();
  if(!st.mood&&input.value!==st.q)input.value=st.q||'';
  var c=candidates(st),h='';
  if(c.state==='never'){
    res.innerHTML='<div class="mz-empty"><p>no dubstep, riddim or brostep here, ever. try one of these:</p>'+suggest(['late-night','get-bumpy'])+'</div>';live.textContent='';return;
  }
  if(c.state==='none'){
    res.innerHTML='<div class="mz-empty"><p>nothing in our playlists matches that yet. try one of these:</p>'+suggest(['late-night','at-the-beach','vibes'])+'</div>';live.textContent='';return;
  }
  var list=pick(c,st.seed);
  var count=list.length+' tracks · picked from '+c.size.toLocaleString('en-US');
  /* a heading role, not an h2: gmx-read.css restyles every .wrap h2 as a section rule */
  h+='<div class="mz-head">'+(st.mood?'<div class="mz-t" role="heading" aria-level="2">'+esc(c.title)+'</div>':'<div class="mz-t mz-q" role="heading" aria-level="2" translate="no">“'+esc(c.title)+'”</div>')+
     (c.desc?'<p class="mz-d">'+esc(c.desc)+'</p>':'')+(c.read?readLine(c.read):'')+
     (st.auto?'<p class="mz-auto">picked for the hour. tap another mood or type your own.</p>':'')+
     c.relaxed.map(function(x){return '<p class="mz-auto">loosened the '+x+' to fill the list.</p>'}).join('')+
     '<p class="mz-n">'+count+'</p></div>'+
     '<div class="mz-tools"><button type="button" class="lc" data-act="shuffle">shuffle</button><button type="button" class="lc" data-act="copy">copy the spotify links</button><button type="button" class="lc" data-act="share">share this list</button></div>'+
     '<p class="mz-msg" id="mz-msg" role="status"></p>'+
     '<ol class="mz-list">'+list.map(function(i,n){return row(i,n+1)}).join('')+'</ol>'+
     (c.size>list.length?'<div class="mz-foot"><button type="button" class="lc" data-act="shuffle">shuffle again</button></div>':'');
  res.innerHTML=h;res.setAttribute('data-list',list.join(','));
  live.textContent=count;
  hearts();
}

/* ---- the address hash ---- */
function readHash(){
  var h=location.hash.replace(/^#/,''),o={};if(!h)return null;
  h.split('&').forEach(function(kv){var k=kv.indexOf('=');if(k>0){try{o[kv.slice(0,k)]=decodeURIComponent(kv.slice(k+1).replace(/\+/g,' '))}catch(e){}}});
  var seed=parseInt(o.s,10);seed=seed>0&&seed<1e9?seed:newSeed();
  if(o.mood&&chip(o.mood))return {mood:o.mood,q:'',seed:seed};
  if(o.q&&o.q.trim())return {mood:null,q:o.q.trim().slice(0,120),seed:seed};
  return null;
}
function hashOf(st){return '#'+(st.mood?'mood='+encodeURIComponent(st.mood):'q='+encodeURIComponent(st.q))+'&s='+st.seed}
function go(st,push){
  try{history[push?'pushState':'replaceState'](null,'',location.pathname+location.search+hashOf(st))}catch(e){}
  render(st);
}
/* no hash: a mood for the hour it is where the visitor is */
function byHour(){var h=new Date().getHours();return h>=5&&h<10?'morning':h>=10&&h<17?'vibes':h>=17&&h<20?'at-the-beach':h>=20&&h<23?'get-bumpy':'late-night'}
function auto(){var id=byHour(),c=chip(id);if(!c||!poolOf(c).length)id='vibes';return {mood:id,q:'',seed:newSeed(),auto:true}}
function start(){
  if(metaEl)metaEl.textContent=D.count.toLocaleString('en-US')+' tracks · built '+D.generated;
  render(readHash()||auto());
}
function boot(){
  res.innerHTML='<p class="mz-state">loading the catalog…</p>';
  load().then(start,function(){
    res.innerHTML='<div class="mz-empty"><p>the catalog did not load. check your connection and try again.</p><div class="mz-sug"><button type="button" class="lc" data-act="retry">try again</button></div></div>';
  });
}

/* ---- the controls ---- */
function copy(text,ok){
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(function(){say(ok)},function(){say('copy is not available here.')});
  else say('copy is not available here.');
}
root.addEventListener('click',function(e){
  var b=e.target.closest('[data-mood],[data-act]');if(!b||!root.contains(b))return;
  var act=b.getAttribute('data-act');
  if(b.hasAttribute('data-mood')){input.value='';go({mood:b.getAttribute('data-mood'),q:'',seed:newSeed()},true);return}
  if(act==='retry'){boot();return}
  if(!cur)return;
  if(act==='shuffle'){go({mood:cur.mood,q:cur.q,seed:newSeed()},false);var t=res.querySelector('.mz-head');if(t&&b.closest('.mz-foot'))t.scrollIntoView({block:'start'});return}
  if(act==='copy'){var ids=(res.getAttribute('data-list')||'').split(',').filter(Boolean);
    copy(ids.map(function(i){return 'https://open.spotify.com/track/'+D.rows[+i][C.sp]}).join('\n'),'copied. open a playlist in the spotify desktop app and paste them in.');return}
  if(act==='share'){
    if(navigator.share){navigator.share({title:document.title,url:location.href}).catch(function(){});return}
    copy(location.href,'link copied.');return}
});
form.addEventListener('submit',function(e){
  e.preventDefault();var q=input.value.trim().slice(0,120);
  if(!q){input.focus();return}
  load().then(function(){go({mood:null,q:q,seed:newSeed()},true)},function(){});
});
window.addEventListener('popstate',function(){if(D)render(readHash()||auto())});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
