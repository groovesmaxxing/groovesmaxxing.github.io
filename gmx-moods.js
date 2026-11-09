/* groovesmaxxing mood picker (2026-11-04). vanilla, no dependencies, nothing leaves the browser.
   moods.html loads this. it fetches /moods-index.json once: his four lane playlists (good vibe juice, bumpy,
   waaavy, wen playa), released tracks only, one version per song, written by moodindex.py on the laptop. the
   page paints the mood chips, reads a typed mood (english or spanish, a genre, a tempo, an artist or a label we
   play) and builds a list of up to 30 tracks with listen links built from ids the catalog already holds.
   the mood, the typed words and the shuffle seed sit in the address hash (#mood=late-night&s=123 or
   #q=sunday%20morning&s=123), so a shared link rebuilds the same list. the hash never reaches a server.
   the page's own words go through gmx-lang.js (the moods page block in gmx-lang-es.js, scoped to .mzp).
   track, artist and label names carry translate="no". hearts come from gmx-crate.js when it is on the page.
   v2 (2026-11-06), the when chips: a second chip row under the moods (daytime, night, late, from D.when), one on
   at a time, tap it again to clear, kept in the hash as when=<id> (#mood=late-night&when=late&s=7). with one on,
   a set card sits above the list: up to three sets from D.setcards tagged for that hour, ranked by how many of
   their released tracklist rows sit in the mood's pool (ov), whether the dj has a track in it (djp), a tracklist
   (tl) and a 60 to 180 minute length, ties broken by the list's seed. a row heard in a set of that hour shows a
   badge in place of its heard-in link. the track list itself is the same with or without a when chip. the payload
   keys are when, txt, setcards and a slot id as the third element of each sets entry. the new words ship in both
   languages in the payload, not in gmx-lang-es.js: the new nodes carry translate="no" so the dictionary pass
   leaves them alone, and they repaint in the other language when gmx-lang.js changes <html lang>.
   v3 (2026-11-07), discovery rows and the daily playlists: a fresh chip tap (a tap, a hash with a mood and no s=,
   the mood for the hour) is seeded by the local date (dateSeed, YYYYMMDD), so everyone gets the same list that day
   and moodplaylists.py writes that same list to the chip's Spotify playlist at 00:20. shuffle still rolls a random
   seed. a row with C.dc = 1 is a discovery row (one of our artists, in no lane): at most 10 in a 30-row list, the
   overflow skipped like the per-artist cap, and it shows a small "new to us" marker (D.txt.disc). a chip with pl
   (its playlist id) shows a playlist button in the tools row while that chip is on.
   v4 (2026-11-07), the visual pass: mood tiles with the playlist covers (tileBtn), the when chips as one switch,
   the playlist as the one big button with shuffle, copy and share as icons, and two-line rows with the track's
   cover (C.art, a 24-hex image hash from moodart.py) that open on tap for the label, sound, dates and links.
   the list itself (candidates, pick, the seeds, the hash) is unchanged, so moodplaylists.py still matches it. */
(function(){
'use strict';
var root=document.getElementById('mz');if(!root)return;
var chipsEl=document.getElementById('mz-chips'),res=document.getElementById('mz-res'),form=document.getElementById('mz-ask'),
    input=document.getElementById('mz-q'),live=document.getElementById('mz-live'),metaEl=document.getElementById('mz-meta'),
    whenEl=document.getElementById('mz-when');
var D=null,loading=null,names=null,cur=null,MOOD={},GW={},NEVER=[],ALL=[];
var N=30,PER_ARTIST=2,PER_FILL=3,PRIMARY=6;
var C={sp:0,t:1,a:2,l:3,g:4,ag:5,b:6,k:7,ln:8,f:9,r:10,bp:11,dz:12,ar:13,h:14,dc:15,art:16},MAX_DISC=10;
var STOP={};('a an the and or for to of in on at with my me i some music songs song tracks track playlist mix mood moods vibe something '+
  'give want need please like que el la los las un una unos unas de del y o para por con mi musica cancion canciones algo dame quiero tracks rolas').split(' ').forEach(function(w){STOP[w]=1});
var MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
/* the same fold as moodindex.py: letters NFKD leaves alone first (JØRD -> jord, DA$ON -> dason), then accents
   off, lowercase, anything not a letter or digit is a space */
function fold(s){return String(s||'').replace(/[øØ]/g,'o').replace(/[æÆ]/g,'ae').replace(/ß/g,'ss').replace(/[đĐ]/g,'d').replace(/[łŁ]/g,'l').replace(/\$/g,'s').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function normLabel(s){
  s=String(s||'').toLowerCase().split(/\s+\/\s+contains|,?\s+a division of/)[0].replace(/\(.*?\)/g,' ');
  return fold(s.replace(/\b(records|recordings|records limited|music|musique|ltd|llc|inc|limited)\b\.?/g,' '));
}
function rng(seed){var a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function newSeed(){return 1+Math.floor(Math.random()*99999)}
/* the day's seed: today's date as YYYYMMDD in Denver, the laptop's zone, because moodplaylists.py writes the day's
   list to the chip's spotify playlist at 00:20 there with its own date (dt.date.today()). a visitor in madrid or
   tokyo used to seed with their own date and get a list the playlist did not hold. keep the two in step
   (web review 2026-11-09, cr-pages-3). the visitor's own date is the fallback where Intl has no zone data */
function dateSeed(){
  try{var p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),o={};
    p.forEach(function(x){o[x.type]=x.value});if(o.year&&o.month&&o.day)return +o.year*10000+ +o.month*100+ +o.day}catch(e){}
  var d=new Date();return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function daysSince(iso){var p=iso.split('-');return Math.floor((Date.now()-new Date(+p[0],p[1]-1,+p[2]).getTime())/864e5)}
function chip(id){for(var i=0;i<D.chips.length;i++)if(D.chips[i].id===id)return D.chips[i];return null}
/* the when chips and the set card: their words come from the payload ({en,es}), read in the language <html lang>
   says at paint time (es and es-MX are spanish) */
function lang(){return /^es\b/i.test(document.documentElement.getAttribute('lang')||'')?'es':'en'}
function word(o){return o?o[lang()]||o.en||'':''}
function T(k){return word(D.txt&&D.txt[k])}
function whenOf(id){var w=D.when||[];for(var i=0;i<w.length;i++)if(w[i].id===id)return w[i];return null}
function hasWhen(){return !!(D&&D.when&&D.when.length&&D.txt)}
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
/* every artist and label name in the catalog, folded, to the rows that carry it. raw keeps each artist name as
   typed (lowercase), so a short or symbol name (&ME, Oi, MØ) is found whole. t is the song titles, folded */
function nameIndex(){
  if(names)return names;
  names={a:{},l:{},an:{},ln:{},raw:{},t:{}};
  D.rows.forEach(function(r,i){
    r[C.a].split(', ').forEach(function(n){var f=fold(n);if(f.length<2||/^\d+$/.test(f))return;(names.a[f]=names.a[f]||[]).push(i);names.an[f]=n;names.raw[n.toLowerCase().trim()]=f});
    var l=normLabel(r[C.l]);if(l.length>=3){(names.l[l]=names.l[l]||[]).push(i);if(!names.ln[l])names.ln[l]=r[C.l]}
    var tt=fold(r[C.t].split(' - ')[0].replace(/\s*[(\[][^)\]]*[)\]]/g,''));if(tt.length>=4)(names.t[tt]=names.t[tt]||[]).push(i);
  });
  return names;
}

/* ---- reading what was typed ---- */
function parse(q){
  var raw=String(q||'').toLowerCase().slice(0,120),p={moods:[],genres:[],gw:[],bpm:null,artists:[],labels:[],titles:[],never:null};
  var ix=nameIndex();
  function add(list,v){if(list.indexOf(v)<0)list.push(v)}
  var m=raw.match(/\b(\d{2,3})\s*(?:-|–|—|to|a)\s*(\d{2,3})(?:\s*bpm)?\b/);
  if(m&&+m[1]>=60&&+m[2]<=200){p.bpm=[Math.min(+m[1],+m[2]),Math.max(+m[1],+m[2])];raw=raw.replace(m[0],' ')}
  else{m=raw.match(/\b(\d{2,3})\s*bpm\b/)||raw.match(/(?:^|\s)(\d{3})(?=\s|$)/);
    if(m&&+m[1]>=70&&+m[1]<=180){p.bpm=[+m[1]-3,+m[1]+3];raw=raw.replace(m[0],' ')}}
  /* a short or symbol name typed whole (&ME, Oi, AB, MØ) is that artist, before any word is read */
  var whole=raw.trim(),wf=fold(whole);
  if(wf&&!MOOD[wf]&&!GW[wf]){var hit=ix.raw[whole]||(wf.length<3&&ix.a[wf]?wf:null);if(hit&&ix.a[hit]){add(p.artists,hit);return p}}
  /* fq is what the never guard reads: the words left once the names are taken out (The Temper Trap is not trap) */
  var fq=' '+wf+' ',toks=wf.split(' ').filter(Boolean),rest=[],restAll=[],i=0;
  function took(ph){fq=fq.replace(' '+ph+' ',' ')}
  while(i<toks.length){
    var tk=0;
    for(var k=Math.min(4,toks.length-i);k>=1&&!tk;k--){
      var ph=toks.slice(i,i+k).join(' ');
      if(MOOD[ph]){add(p.moods,MOOD[ph]);tk=k}
      else if(GW[ph]){GW[ph].forEach(function(g){add(p.genres,g)});add(p.gw,ph);tk=k}
      else if(ph.length>=3&&!STOP[ph]&&ix.a[ph]){add(p.artists,ph);took(ph);tk=k}
      else if(ph.length>=3&&!STOP[ph]&&ix.l[ph]){add(p.labels,ph);took(ph);tk=k}
    }
    if(tk)i+=tk;else{restAll.push(toks[i]);if(!STOP[toks[i]])rest.push(toks[i]);i++}
  }
  /* a song title from the catalog, the whole query or what is left beside an artist ('adriatique catch the light'):
     it stands for its artist, the song itself first. before the part-name step, so 'catch the light' is the
     Adriatique song, not the Catch & Release label. a mood or genre word in the query keeps the chip reading */
  var tq=restAll.join(' ');
  if(tq.length>=4&&(!hasFacet(p)||(p.artists.length&&!p.moods.length&&!p.genres.length))&&NEVER.indexOf(tq)<0&&ix.t[tq]&&ix.t[tq].length<=4){
    ix.t[tq].forEach(function(r){add(p.titles,r);add(p.artists,lead(r))});
    return p;
  }
  /* what is left: a name typed in part (lake, magician, crosstown). a whole-word run inside one to three artist
     names counts, or else inside one to three labels for the whole leftover, one label for a single word */
  var left=rest.join(' ');
  function within(keys,ph){return keys.filter(function(nm){return (' '+nm+' ').indexOf(' '+ph+' ')>-1})}
  function partial(ph,maxLabels){
    if(ph.length<4||NEVER.indexOf(ph)>-1)return false;
    var hits=within(Object.keys(ix.a),ph);
    if(hits.length&&hits.length<=3){hits.forEach(function(h){add(p.artists,h)});took(ph);return true}
    hits=within(Object.keys(ix.l),ph);
    if(hits.length&&hits.length<=maxLabels){hits.forEach(function(h){add(p.labels,h)});took(ph);return true}
    return false;
  }
  if(left&&!partial(left,3))rest.forEach(function(t){partial(t,1)});
  for(var n=0;n<NEVER.length;n++)if(fq.indexOf(' '+NEVER[n]+' ')>-1){p.never=NEVER[n];return p}
  return p;
}
function hasFacet(p){return p.moods.length||p.genres.length||p.bpm||p.artists.length||p.labels.length}

/* ---- the pool for a pick ---- */
function candidates(st){
  var out={title:'',desc:'',read:null,primary:[],pin:[],pool:[],size:0,relaxed:[],state:''};
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
    out.primary=prim;out.pin=p.titles.slice();out.pool=sec;out.size=prim.length+sec.length;
  }else{out.pool=list;out.size=list.length}
  if(!out.size)out.state='none';
  return out;
}

/* ---- the pick: a seeded shuffle that leans on the rank, two per artist at most (three in a small pool),
   never the same one back to back unless one artist is all that is left ---- */
function spread(l,head){
  /* keeps the order, but no lead artist twice in a row. an artist holding more than half of what is left goes now,
     or it would end up back to back at the end */
  var left=l.slice(),o=(head||[]).slice();
  while(left.length){
    var prev=o.length?lead(o[o.length-1]):null,cnt={},top=null,k=-1,j;
    left.forEach(function(i){var a=lead(i);cnt[a]=(cnt[a]||0)+1;if(top===null||cnt[a]>cnt[top])top=a});
    if(top!==prev&&cnt[top]*2>left.length)for(j=0;j<left.length;j++)if(lead(left[j])===top){k=j;break}
    if(k<0)for(j=0;j<left.length;j++)if(lead(left[j])!==prev){k=j;break}
    o.push(left.splice(k<0?0:k,1)[0]);
  }
  return o;
}
function pick(cand,seed){
  var R=rng(seed),pool=cand.pool,H=Math.max(24,pool.length/5),per={},out=[];
  var prim=cand.primary.slice(),pin={};
  for(var j=prim.length-1;j>0;j--){var x=Math.floor(R()*(j+1)),t=prim[j];prim[j]=prim[x];prim[x]=t}
  /* a typed song title: that song leads */
  cand.pin.forEach(function(i){pin[i]=1});
  prim=cand.pin.concat(prim.filter(function(i){return !pin[i]})).slice(0,PRIMARY);
  /* discovery rows (C.dc): at most MAX_DISC in the list, the overflow is skipped like the per-artist cap */
  var dn=0;prim.forEach(function(i){if(D.rows[i][C.dc]===1)dn++});
  var keyed=pool.map(function(i,pos){return [i,Math.pow(R(),1+pos/H)]}).sort(function(a,b){return b[1]-a[1]});
  var rest=[],skipped=[];
  for(var k=0;k<keyed.length&&rest.length<N-prim.length;k++){var i=keyed[k][0],a=lead(i),dc=D.rows[i][C.dc]===1;
    if((per[a]||0)>=PER_ARTIST||(dc&&dn>=MAX_DISC)){skipped.push(i);continue}per[a]=(per[a]||0)+1;if(dc)dn++;rest.push(i)}
  /* a small pool (spooky, one label) would come out thin under the cap: what was skipped fills in, three per
     artist at most. the list can come out shorter than 30, and the count line says so */
  for(var f=0;f<skipped.length&&rest.length<N-prim.length;f++){var a2=lead(skipped[f]),dc2=D.rows[skipped[f]][C.dc]===1;
    if((per[a2]||0)<PER_FILL&&!(dc2&&dn>=MAX_DISC)){per[a2]=(per[a2]||0)+1;if(dc2)dn++;rest.push(skipped[f])}}
  /* the asked-for artist every third row, the rest around it */
  var pi=0,ri=0;
  while(pi<prim.length||ri<rest.length){if(pi<prim.length&&(out.length%3===0||ri>=rest.length))out.push(prim[pi++]);else out.push(rest[ri++])}
  return pin[out[0]]?spread(out.slice(1),[out[0]]):spread(out);
}

/* ---- painting ---- */
function chipBtn(c,on){return '<button type="button" class="lc" data-mood="'+esc(c.id)+'" aria-pressed="'+(on?'true':'false')+'">'+esc(c.en)+'</button>'}
/* v4 (2026-11-07), the visual pass: the moods are tiles carrying the daily playlist's cover (TILES lists the ones
   with art in /media/covers/moods/), a mood without art (spooky) is a type tile. its name is the button's label */
var TILES={'vibes':1,'at-the-beach':1,'morning':1,'late-night':1,'get-bumpy':1,'chill':1,'fresh':1};
function tileBtn(c,on){
  var nm=lang()==='es'?c.es||c.en:c.en;
  return '<button type="button" class="tile'+(TILES[c.id]?'':' tx')+'" data-mood="'+esc(c.id)+'" aria-pressed="'+(on?'true':'false')+'" aria-label="'+esc(nm)+'" translate="no">'+
    (TILES[c.id]?'<img src="/media/covers/moods/'+esc(c.id)+'.jpg" alt="" width="112" height="112" decoding="async">':'<span>'+esc(nm)+'</span>')+'</button>';
}
function paintChips(){
  var a=document.activeElement,keep=a&&chipsEl.contains(a)?a.getAttribute('data-mood'):null;
  chipsEl.innerHTML=D.chips.filter(function(c){return inSeason(c)&&poolOf(c).length}).map(function(c){return tileBtn(c,cur&&cur.mood===c.id)}).join('');
  if(keep){var b=chipsEl.querySelector('[data-mood="'+keep+'"]');if(b)b.focus({preventScroll:true})}
  /* the picked tile slides into view in the swipe row, without moving the page */
  var on=chipsEl.querySelector('[aria-pressed="true"]');
  if(on&&chipsEl.scrollWidth>chipsEl.clientWidth){var tr=on.getBoundingClientRect(),cr=chipsEl.getBoundingClientRect();
    if(tr.left<cr.left||tr.right>cr.right)chipsEl.scrollLeft+=tr.left-cr.left-(cr.width-tr.width)/2}
}
var WHEN_ICO={day:'☀',night:'☾',late:'✦'};
function paintWhen(){
  if(!whenEl)return;
  if(!hasWhen()){whenEl.hidden=true;return}
  var a=document.activeElement,keep=a&&whenEl.contains(a)?a.getAttribute('data-when'):null;
  whenEl.setAttribute('aria-label',T('when_label'));
  whenEl.innerHTML=D.when.map(function(w){var on=cur&&cur.when===w.id;
    return '<button type="button" class="sg" data-when="'+esc(w.id)+'" aria-pressed="'+(on?'true':'false')+'" title="'+esc(word(w.d))+'">'+
      (WHEN_ICO[w.id]?'<span aria-hidden="true">'+WHEN_ICO[w.id]+'</span> ':'')+esc(word(w))+'</button>'}).join('');
  whenEl.hidden=false;
  if(keep){var b=whenEl.querySelector('[data-when="'+keep+'"]');if(b)b.focus({preventScroll:true})}
}
/* the set card: the sets tagged for the hour, the ones that play the mood first. the mood is the chip that is on,
   or the first mood read from what was typed */
function setRow(s){
  var m=[],a=(s.ar||[]).length?D.artists[s.ar[0]]:null,yt=/^https?:/.test(s.u||'');
  if(s.dj)m.push(a?'<a href="'+esc(a[1])+'">'+esc(s.dj)+'</a>':'<span>'+esc(s.dj)+'</span>');
  if(s.min>0)m.push('<span class="nb">'+s.min+' '+esc(T('min'))+'</span>');
  if(s.flag==='open_to_close')m.push('<span class="nb fl">'+esc(T('open_to_close'))+'</span>');
  if(s.tl)m.push('<a class="nb" href="'+esc(s.u)+'">'+esc(T('tracklist'))+' →</a>');
  return '<li class="mz-sr"><a class="mz-st" href="'+esc(s.u)+'"'+(yt?' target="_blank" rel="noopener"':'')+'>'+esc(s.t)+(yt?' ↗':'')+'</a>'+
    (m.length?'<div class="mz-sm">'+m.join('')+'</div>':'')+'</li>';
}
function setCard(st,c){
  if(!st.when||!hasWhen()||!D.setcards||!whenOf(st.when))return '';
  var mood=st.mood||(c&&c.read&&c.read.moods.length?c.read.moods[0]:null),R=rng(st.seed),list=[];
  D.setcards.forEach(function(s){if(s.slot===st.when)list.push(s)});
  if(!list.length)return '<div class="mz-set mz-set-0" translate="no"><p class="mz-set-none">'+esc(T('set_none'))+'</p></div>';
  var keyed=list.map(function(s){
    var sc=(mood?3*((s.ov&&s.ov[mood])||0)+((s.djp||[]).indexOf(mood)>-1?2:0):0)+(s.tl?1:0)+(s.min>=60&&s.min<=180?1:0);
    return [s,sc,R()]}).sort(function(a,b){return b[1]-a[1]||b[2]-a[2]});
  return '<div class="mz-set" translate="no" role="group" aria-label="'+esc(T('set_head'))+'"><p class="mz-set-h">'+esc(T('set_head'))+'</p>'+
    '<p class="mz-set-s">'+esc(T('set_sub').replace('{n}',list.length.toLocaleString(lang()==='es'?'es-MX':'en-US')))+'</p>'+
    '<ol class="mz-set-l">'+keyed.slice(0,3).map(function(k){return setRow(k[0])}).join('')+'</ol></div>';
}
/* the chip's daily playlist on spotify (D.chips[i].pl): today's seed is the list the playlist holds */
/* v4: the playlist is the one big button. today's list is the playlist, so it says play on spotify; a shuffled
   list says which playlist it opens, since the playlist holds today's list, not this one */
function TX(k,en){return (D.txt&&D.txt[k]&&T(k))||en}
function plBtn(st){
  var c=st.mood&&!st.q?chip(st.mood):null;if(!c||!c.pl||!D.txt||!D.txt.pl_today)return '';
  var t=st.seed===dateSeed()?TX('play','play on spotify'):TX('pl_short','today’s playlist');
  return '<a class="mz-play" href="https://open.spotify.com/playlist/'+esc(c.pl)+'" target="_blank" rel="noopener" translate="no">'+ICO.play+'<span>'+esc(t)+'</span></a>';
}
var ICO={
  play:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  shuffle:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  copy:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
  share:'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>',
  chev:'<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
};
function icoBtn(act,k,en){var t=TX(k,en);return '<button type="button" class="mz-ib" data-act="'+act+'" aria-label="'+esc(t)+'" title="'+esc(t)+'" translate="no">'+ICO[act]+'</button>'}
/* the lanes as their emoji in the closed row (good vibe juice, bumpy, waaavy, wen playa, the D.lanes order) */
var LANE_EMO=['🧃','🚧','🌊','🌴'];
/* the row's cover from its art hash (C.art): 64 px, 300 px for a dense screen. no hash, a drawn record */
function art(h){
  if(!h)return '<span class="mz-art mz-art0" aria-hidden="true"></span>';
  var u='https://i.scdn.co/image/ab67616d';
  return '<img class="mz-art" src="'+u+'00004851'+esc(h)+'" srcset="'+u+'00004851'+esc(h)+' 1x, '+u+'00001e02'+esc(h)+' 2x" alt="" width="52" height="52" loading="lazy" decoding="async">';
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
  if(r[C.h]){var s=D.sets[r[C.h][0]],w=s&&cur&&cur.when&&s[2]===cur.when&&hasWhen()?whenOf(cur.when):null;
    /* a when chip on and this set tagged for that hour: the badge takes the place of the heard-in link */
    if(w)l.push('<a class="mz-bdg" href="'+esc(s[1]+(r[C.h][1]?'#'+r[C.h][1]:''))+'" title="'+esc(s[0])+'" translate="no">'+esc(T('badge').replace('{slot}',word(w)))+'</a>');
    else if(s)l.push('<a href="'+esc(s[1]+(r[C.h][1]?'#'+r[C.h][1]:''))+'" title="'+esc(s[0])+'">heard in a set →</a>')}
  /* v4: a closed row is the cover, the title and the artists, the lanes as emoji and a 🎧 when it was heard in a set.
     the row is a button: it opens the label, sound and dates line and the links under it */
  var emo=[],names=[];D.lanes.forEach(function(ln,b){if(r[C.ln]&(1<<b)){emo.push(LANE_EMO[b]||'');names.push(ln[0])}});
  if(r[C.h])emo.push('🎧');
  var nw=r[C.dc]===1&&D.txt&&D.txt.disc?'<span class="mz-new" translate="no">'+esc(T('disc'))+'</span>':'';
  return '<li class="mz-row" data-i="'+i+'"><button type="button" class="mz-rb" aria-expanded="false" aria-controls="mz-x'+n+'" aria-label="'+esc(r[C.t]+', '+r[C.a])+'">'+
    art(r[C.art])+'<span class="mz-b"><span class="mz-tt" translate="no">'+esc(r[C.t])+'</span><span class="mz-ar" translate="no">'+esc(r[C.a])+'</span>'+nw+'</span>'+
    '<span class="mz-em" aria-hidden="true" title="'+esc(names.join(', '))+'">'+emo.join('')+'</span></button>'+
    '<div class="mz-x" id="mz-x'+n+'" hidden>'+(m.length?'<div class="mz-m">'+m.join('<i aria-hidden="true"> · </i>')+'</div>':'')+
    '<div class="mz-l">'+l.join('')+'</div></div></li>';
}
function readLine(p){
  var bits=[];
  p.moods.forEach(function(id){var c=chip(id);if(c)bits.push('<span class="pill">'+esc(c.en)+'</span>')});
  p.gw.forEach(function(g){bits.push('<span class="pill" translate="no">'+esc(g)+'</span>')});
  if(p.bpm)bits.push('<span class="pill" translate="no">'+p.bpm[0]+'–'+p.bpm[1]+' bpm</span>');
  var ix=nameIndex();
  p.titles.forEach(function(i){bits.push('<span class="pill" translate="no">“'+esc(D.rows[i][C.t])+'”</span>')});
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
/* a repaint replaces the button that had focus: it goes back to the same control (or the chip just picked), so
   the next tab does not start over at the top of the page */
function refocus(act){
  if(!act)return;
  var t=act==='mood'?chipsEl.querySelector('[aria-pressed="true"]'):res.querySelector('.mz-tools [data-act="'+act+'"]')||res.querySelector('[data-act="'+act+'"]');
  if(t)t.focus({preventScroll:true});
}
/* the same words twice in a row are read again: the live region is emptied first */
var liveT=0;
function announce(t){clearTimeout(liveT);live.textContent='';liveT=setTimeout(function(){live.textContent=t},60)}
function render(st,quiet){
  var fe=document.activeElement,act=fe&&res.contains(fe)?(fe.getAttribute('data-act')||(fe.hasAttribute('data-mood')?'mood':null)):null;
  cur=st;paintChips();paintWhen();
  if(!st.mood&&input.value!==st.q)input.value=st.q||'';
  var c=candidates(st),h=setCard(st,c),msg;
  if(c.state==='never'){
    msg='no dubstep, riddim or brostep here, ever. try one of these:';
    res.innerHTML=h+'<div class="mz-empty"><p>'+msg+'</p>'+suggest(['late-night','get-bumpy'])+'</div>';if(!quiet)announce(msg);refocus(act);return;
  }
  if(c.state==='none'){
    msg='nothing in our playlists matches that yet. try one of these:';
    res.innerHTML=h+'<div class="mz-empty"><p>'+msg+'</p>'+suggest(['late-night','at-the-beach','vibes'])+'</div>';if(!quiet)announce(msg);refocus(act);return;
  }
  var list=pick(c,st.seed);
  var count=list.length+' tracks · picked from '+c.size.toLocaleString('en-US');
  /* a heading role, not an h2: gmx-read.css restyles every .wrap h2 as a section rule */
  h+='<div class="mz-head">'+(st.mood?'<div class="mz-t" role="heading" aria-level="2">'+esc(c.title)+'</div>':'<div class="mz-t mz-q" role="heading" aria-level="2" translate="no">“'+esc(c.title)+'”</div>')+
     (c.desc?'<p class="mz-d">'+esc(c.desc)+'</p>':'')+(c.read?readLine(c.read):'')+
     c.relaxed.map(function(x){return '<p class="mz-auto">loosened the '+x+' to fill the list.</p>'}).join('')+
     '<p class="mz-n">'+count+'</p></div>'+
     /* v4: one big button (the playlist, or copy the links for a typed list), the rest as icons */
     (function(){var pl=plBtn(st);
       return '<div class="mz-tools">'+(pl||'<button type="button" class="mz-play" data-act="copy">'+ICO.copy+'<span>copy the spotify links</span></button>')+
         icoBtn('shuffle','a_shuffle','shuffle')+(pl?icoBtn('copy','a_copy','copy the spotify links'):'')+icoBtn('share','a_share','share this list')+'</div>'})()+
     '<p class="mz-msg" id="mz-msg" role="status"></p>'+
     '<ol class="mz-list">'+list.map(function(i,n){return row(i,n+1)}).join('')+'</ol>'+
     (c.size>list.length?'<div class="mz-foot"><button type="button" class="lc" data-act="shuffle">shuffle again</button></div>':'');
  res.innerHTML=h;res.setAttribute('data-list',list.join(','));
  if(!quiet)announce(count);
  hearts();
  refocus(act);
}
/* on a phone the list starts below the fold: after a tap or a typed mood, bring its head into view */
function reveal(){
  var t=res.querySelector('.mz-set,.mz-head,.mz-empty');if(!t)return;
  var r=t.getBoundingClientRect();
  if(r.top>innerHeight*.6||r.top<0)t.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

/* ---- the address hash ---- */
function readHash(){
  var h=location.hash.replace(/^#/,''),o={};if(!h)return null;
  h.split('&').forEach(function(kv){var k=kv.indexOf('=');if(k>0){try{o[kv.slice(0,k)]=decodeURIComponent(kv.slice(k+1).replace(/\+/g,' '))}catch(e){}}});
  /* no s= : a mood (or the mood for the hour) gets the day's seed, typed words a random one */
  var seed=parseInt(o.s,10);seed=seed>0&&seed<1e9?seed:(o.q&&o.q.trim()&&!o.mood?newSeed():dateSeed());
  var wh=o.when&&whenOf(o.when)?o.when:null;
  if(o.mood&&chip(o.mood))return {mood:o.mood,q:'',seed:seed,when:wh};
  if(o.q&&o.q.trim())return {mood:null,q:o.q.trim().slice(0,120),seed:seed,when:wh};
  /* a when with no mood: the mood for the hour, as with no hash */
  if(wh){var st=auto();st.seed=seed;st.when=wh;return st}
  return null;
}
function hashOf(st){return '#'+(st.mood?'mood='+encodeURIComponent(st.mood):'q='+encodeURIComponent(st.q))+(st.when?'&when='+encodeURIComponent(st.when):'')+'&s='+st.seed}
function go(st,push){
  try{history[push?'pushState':'replaceState'](null,'',location.pathname+location.search+hashOf(st))}catch(e){}
  render(st);
}
/* no hash: a mood for the hour it is where the visitor is */
function byHour(){var h=new Date().getHours();return h>=5&&h<10?'morning':h>=10&&h<17?'vibes':h>=17&&h<20?'at-the-beach':h>=20&&h<23?'get-bumpy':'late-night'}
function auto(){var id=byHour(),c=chip(id);if(!c||!poolOf(c).length)id='vibes';return {mood:id,q:'',seed:dateSeed(),auto:true}}
function start(){
  if(metaEl)metaEl.textContent=(D.count||D.rows.length).toLocaleString('en-US')+' tracks · built '+D.generated;
  render(readHash()||auto());
}
var lastLang=lang();
if(window.MutationObserver)new MutationObserver(function(){var l=lang();if(l===lastLang)return;lastLang=l;if(cur&&hasWhen())render(cur,true)})
  .observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
function boot(){
  res.innerHTML='<p class="mz-state">loading the catalog…</p>';
  /* .catch, not a second then() argument: a throw in start() or render() lands here too (web review, cr-pages-8) */
  load().then(start).catch(function(e){
    if(e)try{console.error('gmx moods',e)}catch(x){}
    res.innerHTML='<div class="mz-empty"><p>the catalog did not load. check your connection and try again.</p><div class="mz-sug"><button type="button" class="lc" data-act="retry">try again</button></div></div>';
  });
}

/* ---- the controls ---- */
function copy(text,ok){
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(function(){say(ok)},function(){say('copy is not available here.')});
  else say('copy is not available here.');
}
root.addEventListener('click',function(e){
  /* v4: a row opens and closes in place */
  var rb=e.target.closest('.mz-rb');
  if(rb&&root.contains(rb)){var x=document.getElementById(rb.getAttribute('aria-controls')),open=rb.getAttribute('aria-expanded')!=='true';
    rb.setAttribute('aria-expanded',open?'true':'false');if(x)x.hidden=!open;rb.parentNode.classList.toggle('open',open);return}
  var b=e.target.closest('[data-mood],[data-act],[data-when]');if(!b||!root.contains(b))return;
  var act=b.getAttribute('data-act');
  if(b.hasAttribute('data-mood')){input.value='';go({mood:b.getAttribute('data-mood'),q:'',seed:dateSeed(),when:cur?cur.when:null},true);reveal();return}
  /* a when chip keeps the list (same mood, words and seed): only the card and the badges change. tap again to clear */
  if(b.hasAttribute('data-when')){if(!cur)return;var wid=b.getAttribute('data-when');
    go({mood:cur.mood,q:cur.q,seed:cur.seed,auto:cur.auto,when:cur.when===wid?null:wid},true);return}
  if(act==='retry'){boot();return}
  if(!cur)return;
  if(act==='shuffle'){go({mood:cur.mood,q:cur.q,seed:newSeed(),when:cur.when},false);var t=res.querySelector('.mz-head');if(t&&b.closest('.mz-foot'))t.scrollIntoView({block:'start'});return}
  if(act==='copy'){var ids=(res.getAttribute('data-list')||'').split(',').filter(Boolean);
    copy(ids.map(function(i){return 'https://open.spotify.com/track/'+D.rows[+i][C.sp]}).join('\n'),'copied. open a playlist in the spotify desktop app and paste them in.');return}
  if(act==='share'){
    /* the list on screen: its hash even when the visitor landed on the hour's mood (no hash yet), and its own name,
       not the page title. the shared sheet (gmx-sheet.js) when it is there, else the phone's share or the clipboard */
    var u=location.origin+'/moods'+hashOf(cur),t=res.querySelector('.mz-t'),txt=(t?t.textContent.trim()+' · ':'')+'house by mood on groovesMAXXING';
    if(window.gmxSheet&&typeof gmxSheet.share==='function'){gmxSheet.share({text:txt,url:u},b);return}
    if(navigator.share){navigator.share({title:'groovesMAXXING',text:txt,url:u}).catch(function(e){if(e&&e.name!=='AbortError')copy(u,'link copied.')});return}
    copy(u,'link copied.');return}
});
form.addEventListener('submit',function(e){
  e.preventDefault();var q=input.value.trim().slice(0,120);
  if(!q){input.focus();return}
  /* a phone keyboard closes so the list can show. a keyboard user keeps the focus in the box */
  load().then(function(){go({mood:null,q:q,seed:newSeed(),when:cur?cur.when:null},true);if(matchMedia('(pointer: coarse)').matches)input.blur();reveal()},function(){});
});
/* back or forward: the box shows what the restored list was built from (empty for a mood chip) */
window.addEventListener('popstate',function(){if(!D)return;var st=readHash()||auto();input.value=st.q||'';render(st)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
