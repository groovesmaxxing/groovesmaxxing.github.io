/* gmx-scan.js: the scan page app, moved out of scan.html on 2026-10-27 (site review item 14) so the 100 KB of
   script is cached for four hours like every other shared file instead of re-downloaded with the page on
   every visit. loads synchronously at the same spot in the page it used to sit in. */
(function(){
'use strict';
/* groovesmaxxing scan (phase 5, step b). vanilla, no dependencies.
   the api base and the app key come from /gmx-config.json, never from this file. */
var CAPTURE_MS=15000, ROUNDS_MS=[5000,9000,12000], POLL_MS=350, POLL_CAP_MS=30000, HISTORY_MAX=50;
/* speed build, 2026-10-11: library rounds at 5, 9 and 12 s, the scan stops on the first sure match, the live level
   strip and the status line keep the screen honest, the card says how long it took. a 429 on any round stops the rest.
   the cap (2026-10-13): the early rounds count in a window of their own on the api, so the three rounds never eat
   into the full scans, and the full round runs against ninety an hour per phone now, not thirty. */

var POST_MS=25000, GET_MS=8000;   /* every request has a deadline, so a dead cell link never leaves the page spinning */
/* site review build, 2026-10-11: audio worklet capture, request deadlines, config retry, level checks, one poll loop */
function fx(url,opts,ms){
  opts=opts||{};
  if(!('AbortController' in window))return fetch(url,opts);
  var ac=new AbortController(), t=setTimeout(function(){ac.abort()},ms||GET_MS);
  opts.signal=ac.signal;
  return fetch(url,opts).then(function(r){clearTimeout(t);return r},function(e){clearTimeout(t);throw (e&&e.name==='AbortError')?new Error('timeout'):e});
}
/* phase 7 DECISION 9: at each of ROUNDS_MS (5, 9 and 12 s since the speed build) the page posts what it has as an
   early, library-only round and keeps listening. a LIKELY or better answer shows at once, the 15 s scan replaces it
   when it names something. since 2026-10-13 a LIKELY also turns the catalog off for the 15 s round (see identify). */
var scanSeq=0, early=null, finalDone=false, rateHit=false;
var $=function(id){return document.getElementById(id)};
var stage=$('stage'), go=$('go'), tap=$('tap'), rec=$('rec'), recword=$('recword'), count=$('count'), card=$('card'), recentlist=$('recentlist');
var stat=$('stat'), lvl=$('lvl'), stopCapture=null, timing=null, levels=[];
function say2(html){if(stat)stat.innerHTML=html}
/* the level strip (2026-10-13). it used to be drawn only when a block of mic audio landed, so whenever the audio
   stopped coming it froze where it was: through the whole catalog check after the 15 s capture (the strip stays
   on while finding), when an iphone pauses the audio for a call, a notification sound or a bluetooth switch, and
   when the worklet drops. now it runs its own frame loop while the stage is listening or finding. fresh audio draws
   the live levels. after 400 ms with no audio it eases into an idle wave that swells across the strip, and the
   first gap logs a warning. a drawing error logs once and the next frame draws the idle wave instead of stopping.
   under reduced motion the idle wave holds still. */
var lvlRaf=0, lastChunk=0, lvlMix=1, lvlPrev=0, lvlStale=true, lvlErr=0, lvlGain=1;
/* 2026-10-14: the strip draws decibels, not raw rms. an iphone hands the page the bare mic (gain control off, so
   the clip stays honest for the matcher), and music across a room arrives around 0.005 to 0.05 rms. on a straight
   line that was 2 to 6 px of the 36 px strip, which read as frozen on a real phone. -60 to -12 dB now spans the
   strip, and a slow gain lifts the loudest visible bar to about nine tenths. a quiet room stays near flat. */
function lvlNorm(v){if(!(v>0))return 0;var db=20*Math.log(v)/Math.LN10;return Math.max(0,Math.min(1,(db+60)/48))}
var lvlReduce=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
function SM(){return lvlReduce&&lvlReduce.matches?'auto':'smooth'}   /* script scrolls follow reduced motion (2026-11-09 review) */
function lvlLive(){return stage.classList.contains('listening')||stage.classList.contains('finding')}
function drawLevels(now,idleOnly){
  if(!lvl||!lvl.getContext)return;var g=lvl.getContext('2d'),W=lvl.width,H=lvl.height,n=60,w=W/n;g.clearRect(0,0,W,H);
  var still=!!(lvlReduce&&lvlReduce.matches), t=still?0:now/1000, mix=idleOnly?1:lvlMix, nv=[], peak=0, i;
  for(i=0;i<n;i++){nv[i]=idleOnly?0:lvlNorm(levels[levels.length-n+i]);if(nv[i]>peak)peak=nv[i]}
  lvlGain+=((peak>.15?Math.min(1.8,.9/peak):1)-lvlGain)*.08;
  for(i=0;i<n;i++){
    var live=Math.max(2,Math.min(H,nv[i]*lvlGain*H));
    /* a long travelling swell, left to right, never a beat */
    var idle=H*(.16+.12*Math.sin(t*1.4-i*.19)+.05*Math.sin(t*.6-i*.07));
    var h=live+(idle-live)*mix;
    g.fillStyle=i>n-4&&mix<.5?'#FF1C02':'rgba(242,242,239,.35)';g.fillRect(i*w+1,(H-h)/2,w-2,h);
  }
}
function lvlFrame(now){
  if(!lvlLive()){lvlRaf=0;lvlMix=1;return}
  var dt=lvlPrev?Math.min(.1,(now-lvlPrev)/1000):1/60;lvlPrev=now;
  var stale=!lastChunk||now-lastChunk>400||stage.classList.contains('finding');
  if(stale&&!lvlStale&&stage.classList.contains('listening'))console.warn('gmx scan: no mic audio for '+Math.round(now-lastChunk)+' ms, the level strip is idling');
  lvlStale=stale;
  if(lvlReduce&&lvlReduce.matches)lvlMix=stale?1:0;else lvlMix+=((stale?1:0)-lvlMix)*(1-Math.pow(1-.12,dt*60));
  try{drawLevels(now)}catch(e){if(!lvlErr++)console.error('gmx scan: level strip',e);try{drawLevels(now,true)}catch(x){}}
  lvlRaf=requestAnimationFrame(lvlFrame);
}
function lvlStart(){lastChunk=0;lvlMix=1;lvlStale=true;lvlPrev=0;if(!lvlRaf&&window.requestAnimationFrame)lvlRaf=requestAnimationFrame(lvlFrame)}
var rings=go.querySelectorAll('.r'), wave=go.querySelector('.wave');
var cfg=null, cfgErr=null, busy=false, heldBlob=null, heldAt=null, heldLoud=false, current=null, cancelScan=null;
/* pull to refresh (gmx-refresh.js) stays off while listening or finding */
window.gmxRefreshBlocked=function(){return busy};

/* config */
(function loadCfg(tries){
  fx('/gmx-config.json',{cache:'no-store'},GET_MS).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})
  .then(function(j){if(!j.api_base||!j.app_key)throw new Error('incomplete');cfg=j;cfgErr=null;try{localStorage.setItem('gmx_cfg',JSON.stringify(j))}catch(e){}onCfg()})
  .catch(function(e){
    cfgErr=e;
    if(!cfg){try{var c=JSON.parse(localStorage.getItem('gmx_cfg')||'null');if(c&&c.api_base&&c.app_key)cfg=c}catch(x){}}   /* the last good copy, so a flaky load still scans */
    if(tries>1)setTimeout(function(){loadCfg(tries-1)},(4-tries)*1500);
  });
})(3);

/* the device id: minted once, kept on the phone. letters, digits, dash, underscore, 32 long.
   2026-11-17 (submit flow, slice 1, final read): the page takes the id once and keeps it for as long as it is open.
   the api now refuses an answer that carries another device id than the scan it answers (403), and
   gmxAccount.device() mints a new id on every call when the phone cannot keep one (site storage blocked, or full).
   on such a phone the scan went up under one id and the answer under another, so every answer would have read
   "that scan was made on another phone". with storage that works this is the stored id, as before. */
var devOnce='';
function deviceId(){if(!devOnce)devOnce=gmxAccount.device();return devOnce}
function headers(extra){
  var h={'X-GMX-App-Key':cfg.app_key,'X-GMX-Device':deviceId()};
  var ss=sessionToken(); if(ss)h['X-GMX-Session']=ss;
  if(extra)for(var k in extra)h[k]=extra[k];
  return h;
}
/* the account (2026-10-11, shared in gmx-account.js with shell v2): sign in by email link, no password.
   the session token lives on this phone only and rides every call as X-GMX-Session, so follows, history
   and credit join the account. nothing works worse signed out: a phone follows and gets push on its own. */
function sessionToken(){return gmxAccount.token()}
function setSession(t,email){gmxAccount.set(t,email)}
var meCache=null;
function tick(ms){try{if(navigator.vibrate)navigator.vibrate(ms||30)}catch(e){}}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
/* a link or cover is used only when it is https, http or a path on this site. anything with another
   scheme (javascript:, data:) from a store record, a lookup or a server field becomes nothing. */
function safeUrl(u){u=String(u==null?'':u).trim();if(!u||/[\\\u0000-\u001f\u007f]/.test(u))return '';if(/^https?:\/\/[^\/]/i.test(u))return u;if(/^\/\//.test(u))return '';return u.split(/[\/?#]/)[0].indexOf(':')<0?u:''}
function cleanLinks(o){var r={};Object.keys(o||{}).forEach(function(k){var u=safeUrl(o[k]);if(u)r[k]=u});return r}
function pct(n){return Math.round(Number(n)||0)+'%'}
function slug(s){
  s=String(s||'').toLowerCase().replace(/[øØ]/g,'o');
  try{s=s.normalize('NFKD').replace(/[̀-ͯ]/g,'')}catch(e){}
  return s.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

/* recording: raw pcm off the web audio graph, written here as a 16 kHz mono 16-bit wav.
   no MediaRecorder: safari's fragmented mp4 cost the recognizer a decode step and the library
   engines want plain pcm anyway (phase 5 stop 3h, DECISION 11). 15 s is about 480 KB (phase 7 DECISION 8). */
var OUT_RATE=16000;
function canCapture(){return !!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&(window.AudioContext||window.webkitAudioContext))}
function extOf(blob){var t=blob&&blob.type||'';return t.indexOf('wav')>=0?'wav':t.indexOf('mp4')>=0?'m4a':t.indexOf('ogg')>=0?'ogg':'webm'}
function wavBlob(chunks,inRate){
  var n=0,i; for(i=0;i<chunks.length;i++)n+=chunks[i].length;
  var all=new Float32Array(n), o=0; for(i=0;i<chunks.length;i++){all.set(chunks[i],o);o+=chunks[i].length}
  var ratio=inRate/OUT_RATE, outN=Math.floor(n/ratio), pcm=new Int16Array(outN);
  /* two passes of a butterworth low-pass at 6.8 kHz (fourth order in all) before the drop, so cymbals and
     hats do not fold back into the band the fingerprint reads. then the mean of the samples each output covers. */
  if(ratio>1.05){lowpass(all,inRate,6800);lowpass(all,inRate,6800);}
  for(var k=0;k<outN;k++){
    var a=Math.floor(k*ratio), b=Math.min(n,Math.floor((k+1)*ratio)), s=0, c=0;
    for(var j=a;j<b;j++){s+=all[j];c++}
    var v=c?s/c:0; v=v<-1?-1:v>1?1:v; pcm[k]=v<0?v*32768:v*32767;
  }
  var buf=new ArrayBuffer(44+pcm.length*2), dv=new DataView(buf);
  function str(p,t){for(var q=0;q<t.length;q++)dv.setUint8(p+q,t.charCodeAt(q))}
  str(0,'RIFF'); dv.setUint32(4,36+pcm.length*2,true); str(8,'WAVE'); str(12,'fmt '); dv.setUint32(16,16,true);
  dv.setUint16(20,1,true); dv.setUint16(22,1,true); dv.setUint32(24,OUT_RATE,true); dv.setUint32(28,OUT_RATE*2,true);
  dv.setUint16(32,2,true); dv.setUint16(34,16,true); str(36,'data'); dv.setUint32(40,pcm.length*2,true);
  new Int16Array(buf,44).set(pcm);
  return new Blob([buf],{type:'audio/wav'});
}
function lowpass(x,rate,fc){
  var w=Math.tan(Math.PI*fc/rate), k=w*w, q=Math.SQRT1_2, norm=1/(1+w/q+k);
  var b0=k*norm, b1=2*b0, b2=b0, a1=2*(k-1)*norm, a2=(1-w/q+k)*norm, x1=0,x2=0,y1=0,y2=0;
  for(var i=0;i<x.length;i++){var xi=x[i], y=b0*xi+b1*x1+b2*x2-a1*y1-a2*y2; x2=x1;x1=xi;y2=y1;y1=y;x[i]=y;}
}
/* the scan button is a spinning record (S2, approved 2026-10-12). idle is the markup, the landing
   page mark exactly. while the stage is listening or finding, act eases to 1: the record fills in,
   spins with the mic level and steps through three looks every 1.6 s from the start of the scan.
   the loop runs only while scanning or easing out. reduced motion gets look 1, still. */
var lv=0;
function setLevel(v){lv=v>0?v:0}
function clearLevel(){lv=0}
(function(){
  var svg=go.querySelector('svg'), dot=go.querySelector('.dot'), NS='http://www.w3.org/2000/svg';
  var R=[255,28,2],N=[11,11,13],W=[242,242,239],S=[180,180,175];
  var LOOK=[{fill:R,line:W,edge:N},{fill:N,line:R,edge:W},{fill:S,line:N,edge:R}];
  var ZIG0=wave.getAttribute('points'), ZIG=ZIG0.trim().split(/\s+/).map(function(p){return p.split(',').map(Number)});
  var reduce=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  var p=null, act=0, ang=0, sp=0, vs=0, ts0=0, last=0, fr=0, raf=0, wasOn=false;
  function live(){return stage.classList.contains('listening')||stage.classList.contains('finding')}
  function still(){return !!(reduce&&reduce.matches)}
  function lerp(a,b,u){return a.map(function(x,i){return x+(b[i]-x)*u})}
  function rgb(a,al){a=a.map(Math.round);return al==null?'rgb('+a.join(',')+')':'rgba('+a.join(',')+','+al+')'}
  function look(t){var T=t/1.6,i=Math.floor(T),f=T-i,u=f<.8?0:(f-.8)/.2;u=u*u*(3-2*u);
    var a=LOOK[i%3],b=LOOK[(i+1)%3];return {fill:lerp(a.fill,b.fill,u),line:lerp(a.line,b.line,u),edge:lerp(a.edge,b.edge,u)}}
  function el(tag,at,parent,before){var e=document.createElementNS(NS,tag);for(var k in at)e.setAttribute(k,at[k]);parent.insertBefore(e,before||null);return e}
  /* the record parts are drawn on the first scan, slotted around the idle mark: disc and grooves under
     the rings, a dark edge under each ring and the wave, the spindle hole over the dot, the arc on top. */
  function build(){
    var d=el('defs',{},svg,svg.firstChild), lg=el('linearGradient',{id:'gv-sh',x1:0,y1:0,x2:1,y2:0},d);
    [[0,0],[.5,.5],[1,0]].forEach(function(s){el('stop',{offset:s[0],'stop-color':'#fff','stop-opacity':s[1]},lg)});
    el('circle',{cx:120,cy:120,r:110},el('clipPath',{id:'gv-c'},d));
    el('feGaussianBlur',{stdDeviation:6},el('filter',{id:'gv-b',x:'-30%',y:'-30%',width:'160%',height:'160%'},d));
    var f=el('filter',{id:'gv-e',x:'-20%',y:'-60%',width:'140%',height:'220%'},d), m;
    el('feGaussianBlur',{'in':'SourceGraphic',stdDeviation:2.6,result:'b'},f); m=el('feMerge',{},f);
    ['b','b','SourceGraphic'].forEach(function(x){el('feMergeNode',{'in':x},m)});
    var o={}, first=rings[0];
    o.disc=el('circle',{cx:120,cy:120,r:110},svg,first);
    o.spin=el('g',{'clip-path':'url(#gv-c)',fill:'none'},svg,first);
    for(var r=30;r<108;r+=3.2){if(Math.abs(r-48)<3||Math.abs(r-76)<3||Math.abs(r-104)<3)continue;el('circle',{cx:120,cy:120,r:r.toFixed(1),'stroke-width':.7,opacity:.35},o.spin)}
    var sh=el('g',{filter:'url(#gv-b)',opacity:.55,stroke:'none'},o.spin);
    el('path',{d:'M120 120 L120 4 A116 116 0 0 1 178 20 Z',fill:'url(#gv-sh)'},sh);
    el('path',{d:'M120 120 L120 236 A116 116 0 0 1 62 220 Z',fill:'url(#gv-sh)'},sh);
    o.rk=[].map.call(rings,function(c){return el('circle',{cx:120,cy:120,r:c.getAttribute('r'),fill:'none','stroke-width':9.4},svg,c)});
    o.hole=el('circle',{cx:120,cy:120,r:4.5,fill:'#0B0B0D'},svg,wave);
    o.wk=el('polyline',{fill:'none','stroke-width':11.4,'stroke-linecap':'round','stroke-linejoin':'round'},svg,wave);
    o.eg=el('g',{filter:'url(#gv-e)'},svg);
    o.arc=el('polyline',{fill:'none',stroke:'#fff','stroke-width':1.6,'stroke-linejoin':'round'},o.eg);
    o.b1=el('polyline',{fill:'none',stroke:'#FFF6F2','stroke-width':3.2,'stroke-linecap':'round',pathLength:100,'stroke-dasharray':'7 93'},o.eg);
    o.b2=el('polyline',{fill:'none',stroke:'#FF6A4D','stroke-width':2.4,'stroke-linecap':'round',pathLength:100,'stroke-dasharray':'5 95'},o.eg);
    return o;
  }
  /* A is how far into the record, c the look, v the eased level, jv the raw level for the arc jitter */
  function paint(A,c,t,v,jv,arcs,calm){
    if(!p)p=build();
    var edge=rgb(c.edge), i;
    p.disc.style.fill=rgb(c.fill); p.disc.style.opacity=A;
    p.spin.style.stroke=edge; p.spin.style.opacity=A; p.spin.setAttribute('transform','rotate('+ang.toFixed(1)+' 120 120)');
    for(i=0;i<rings.length;i++){p.rk[i].style.stroke=edge;p.rk[i].style.opacity=A;rings[i].style.stroke=rgb(lerp(R,c.line,A))}
    dot.style.fill=rgb(lerp(R,c.edge,A)); dot.setAttribute('r',(18+8*A).toFixed(2)); p.hole.style.opacity=A;
    svg.style.filter='drop-shadow(0 0 '+(14+6*A).toFixed(1)+'px '+rgb(lerp(R,c.fill,A),.45)+')';
    var beat=.5+.5*Math.sin(t*Math.PI*2/6);
    var P=calm?ZIG:ZIG.map(function(q,i){if(i<2||i>ZIG.length-3)return q;
      var k=(.8+.22*Math.sin(t*1.7-i*.62)+.08*beat)*(1+Math.min(.5,v*2.5));return [q[0],120+(q[1]-120)*(1+(k-1)*A)]});
    var pts=P.map(function(q){return q[0].toFixed(1)+','+q[1].toFixed(1)}).join(' ');
    wave.setAttribute('points',pts); wave.style.stroke=rgb(lerp(W,c.line,A));
    p.wk.setAttribute('points',pts); p.wk.style.stroke=edge; p.wk.style.opacity=A;
    p.eg.style.opacity=calm?0:A; if(calm)return;
    p.b1.setAttribute('points',pts); p.b2.setAttribute('points',pts);
    p.b1.setAttribute('stroke-dashoffset',(100-(t/1.1%1)*100).toFixed(2)); p.b2.setAttribute('stroke-dashoffset',(100-((t+.6)/1.7%1)*100).toFixed(2));
    if(!arcs)return;
    var arc=[];
    for(i=0;i<P.length-1;i++){var a=P[i],b=P[i+1],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,n=Math.max(2,Math.round(L/6));
      for(var k=0;k<n;k++){var u=k/n,j=k===0?0:(Math.random()-.5)*5.5*(.6+jv*4);arc.push((a[0]+dx*u+nx*j).toFixed(1)+','+(a[1]+dy*u+ny*j).toFixed(1))}}
    arc.push(P[P.length-1].join(',')); p.arc.setAttribute('points',arc.join(' ')); p.arc.style.opacity=(.45+Math.random()*.55).toFixed(2);
  }
  /* back to the markup: inline colours cleared so the stylesheet's idle mark shows, the extras hidden */
  function idle(){
    act=0; sp=0; vs=0; wasOn=false;
    for(var i=0;i<rings.length;i++)rings[i].style.stroke='';
    dot.style.fill=''; dot.setAttribute('r','18'); wave.style.stroke=''; wave.setAttribute('points',ZIG0); svg.style.filter='';
    if(p)[p.disc,p.spin,p.hole,p.wk,p.eg].concat(p.rk).forEach(function(e){e.style.opacity=0});
  }
  function hold(){ang=0; if(live())paint(1,LOOK[0],0,0,0,false,true); else idle()}
  /* a throw inside a frame used to end the loop for good: raf stayed set, so the observer below never restarted it
     and the record sat frozen until a reload, with nothing logged. now it logs once, drops to the idle mark and
     the next class change starts it again. */
  var fails=0;
  function frame(now){
    try{step(now)}catch(e){raf=0;if(!fails++)console.error('gmx scan: button motion',e);try{idle()}catch(x){}}
  }
  function step(now){
    if(still()){raf=0;hold();return}
    var on=live(), dt=last?Math.min(.1,(now-last)/1000):1/60; last=now; fr++;
    if(on&&!wasOn)ts0=now; wasOn=on;
    function ease(k){return 1-Math.pow(1-k,dt*60)}
    act+=((on?1:0)-act)*ease(.06);
    if(!on&&act<.002){raf=0;idle();rouse();return}
    var jv=Math.min(.3,lv); vs+=(jv-vs)*ease(.3);
    sp+=((on?140+vs*900:0)-sp)*ease(.05); ang=(ang+sp*dt)%360;
    paint(act,look(on?(now-ts0)/1000:0),now/1000,vs,jv,fr%2===0,false);
    raf=requestAnimationFrame(frame);
  }
  /* 2026-11-06: the resting mark breathes like the landing page's living logo (index.html, logo 10a2): one rolling
     wave through the ribbon's strands and the white wave, and the dot swelling on a slow 6 s beat. it runs only at
     rest, on screen and in a visible tab; a scan's own frame loop owns the mark while listening or finding, and
     reduced motion keeps the mark still. */
  var rib=[].slice.call(go.querySelectorAll('.ribbon polyline')).concat([wave]);
  var RB=rib.map(function(e){return e.getAttribute('points').trim().split(/\s+/).map(function(q){return q.split(',').map(Number)})});
  var iraf=0, it0=0, seen=true;
  function rest(){rib.forEach(function(e,j){e.setAttribute('points',RB[j].map(function(q){return q.join(',')}).join(' '))});dot.setAttribute('r','18')}
  function breathe(now){
    if(raf||live()||still()||document.hidden||!seen){iraf=0;if(!raf&&!live())rest();return}
    var t=(now-it0)/1000, beat=.5+.5*Math.sin(t*Math.PI*2/6);
    var ks=RB[0].map(function(_,i){return .8+.22*Math.sin(t*1.7-i*.62)+.08*beat});
    rib.forEach(function(e,j){var B=RB[j];e.setAttribute('points',B.map(function(q,i){return (i<2||i>B.length-3)?q[0]+','+q[1]:q[0]+','+(120+(q[1]-120)*ks[i]).toFixed(1)}).join(' '))});
    dot.setAttribute('r',(18+2.5*beat).toFixed(2));
    iraf=requestAnimationFrame(breathe);
  }
  function rouse(){if(!iraf&&!raf&&!live()&&!still()&&!document.hidden&&seen&&window.requestAnimationFrame){if(!it0)it0=performance.now();iraf=requestAnimationFrame(breathe)}}
  document.addEventListener('visibilitychange',rouse);
  if(window.IntersectionObserver)new IntersectionObserver(function(es){seen=es[es.length-1].isIntersecting;rouse()}).observe(go);
  if(reduce&&reduce.addEventListener)reduce.addEventListener('change',function(){if(still())rest();rouse()});
  rouse();
  if(!window.MutationObserver)return;
  new MutationObserver(function(){
    if(still()){hold();return}
    if(!raf&&live()){last=0;raf=requestAnimationFrame(frame)}
    rouse();
  }).observe(stage,{attributes:true,attributeFilter:['class']});
})();

/* 2026-11-17 (submit flow, slice 1): the answer follows the clip. a new scan used to drop the card before it and
   with it the only way to answer for it, so a name typed under the next card landed on that card's scan (the
   welcome to the jungle scan: the library ID was caught first, the name went to the catalog guess 17 s later).
   when a card leaves for a new scan the page now keeps lastLib, the scan it showed, but only when that card had a
   library clip behind it (fingerprint_id), at LIKELY or CONFIRMED, with no name (no accepted_name, no named_by).
   the name form on a later card with no library clip offers it as one chip for LAST_OFFER_MS, pressed by default
   for LAST_DEFAULT_MS. a named library clip at LIKELY or better clears it: the room moved on to a known record.
   scanLive is true while the clip under scan came off the mic just now. a kept clip scanned again or a clip
   drained from the offline queue is another moment's audio, so its card neither offers the chip nor is kept.
   answeredRids holds the scans this phone answered since the page loaded, so nothing is offered twice. */
var LAST_OFFER_MS=180000, LAST_DEFAULT_MS=90000, NAME_ROW_MS=86400000;
var lastLib=null, scanLive=false, answeredRids=Object.create(null), cardSeq=-1, cardKey=null;
function clipNamed(c){return !!(c&&(c.accepted_name||c.named_by))}
function unnamedLib(c){return !!(c&&c.fingerprint_id&&!clipNamed(c))}
function sureTier(c){return !!(c&&(c.tier==='LIKELY'||c.tier==='CONFIRMED'))}
/* the headline the card showed for this candidate, the same reading resultCard uses */
function cardHead(c){var nm=nameOf(c),lib=!!(nm&&nm.lib);return (!lib&&c.headline)||(nm?(nm.title||nm.artist):'ID')||'ID'}
function nextLast(prev,cur,live,now){
  var c=cur&&cur.card&&cur.card.candidate;
  if(!c)return prev;
  if(live&&cur.recognition_id&&unnamedLib(c)&&sureTier(c))return {rid:cur.recognition_id,key:candKey(c),t:cur.at||now,head:cardHead(c),ut:uploadTitle(c)||undefined};   /* ut: see prevFill */
  if(c.fingerprint_id&&sureTier(c))return null;
  return prev;
}
function keepLast(){lastLib=nextLast(lastLib,current,scanLive,Date.now())}
/* 2026-11-17 (slice 1 review): a card can also be replaced inside one scan by a card for another recording: a
   later early round or the 15 s answer names something else (swapsOut). the card leaving is kept like any other,
   so an unnamed ID the early round caught can still be answered through the chip under the card that took its
   place. two cards are the same recording only when both have a key and the keys are equal. */
function sameKey(a,b){return a!=null&&a===b}
function swapsOut(old,cand){return !!old&&!sameKey(old.key,cand?candKey(cand):null)}
function keepSwapped(old){lastLib=nextLast(lastLib,old,scanLive,Date.now())}
/* the chip: only under a card with no library clip of its own, only for a live scan, never for a scan this phone
   already answered. null means no chip */
function prevOffer(cand,last,now,live){
  if(!last||!live||!cand||cand.fingerprint_id||answeredRids[last.rid])return null;
  var age=now-last.t;
  if(!(age>=0&&age<LAST_OFFER_MS))return null;
  return {age:age,pressed:age<LAST_DEFAULT_MS};
}
function ageWord(ms){var s=Math.max(1,Math.round(ms/1000));return s<60?s+' s':Math.floor(s/60)+' min'}
function prevHint(on){return on?'your answer goes to that ID. tap it off to answer this scan.':'tap it if your answer is about that ID, not this scan.'}
function prevChipHtml(o,last){
  return '<div class="row"><button class="btn'+(o.pressed?' on':'')+'" type="button" data-prev="1" aria-pressed="'+(o.pressed?'true':'false')+'">about the ID we caught '+ageWord(o.age)+' ago (in our library, unnamed)</button></div>'+
    (last.head&&last.head!=='ID'?'<p class="note">it showed as <b translate="no">'+esc(last.head)+'</b></p>':'')+
    '<p class="note" id="cprevhint">'+prevHint(o.pressed)+'</p>';
}
function prevPressed(){var b=card.querySelector('#cform [data-prev]');return !!(b&&b.getAttribute('aria-pressed')==='true')}
function togglePrev(b){
  var on=b.getAttribute('aria-pressed')!=='true';
  b.setAttribute('aria-pressed',on?'true':'false');b.classList.toggle('on',on);
  var h=$('cprevhint');if(h)h.textContent=prevHint(on);
  prevFill(on);
}
/* 2026-11-17 (final read): while the chip is pressed the answer is about the ID caught before, and when that card
   showed a title that came in with its clip (lastLib.ut, the chip's "it showed as" line) the title box starts
   with it, the way the form under that card would have: nobody should have to retype "Welcome To The Jungle".
   only the title, never an artist, and only into an empty box. data-prevpre on the form holds what the chip put
   there. tapping the chip off takes the title out again when nobody touched it, so a title the person never
   typed is not sent as this card's own answer. once the person changed or cleared it the chip leaves the box
   alone for good. */
function prevFill(on){
  var f=$('cform'), ti=$('c-title'); if(!f||!ti)return;
  var had=f.getAttribute('data-prevpre'), ut=(lastLib&&lastLib.ut)||'';
  if(!on){if(had!=null&&ti.value===had){ti.value='';f.removeAttribute('data-prevpre')}return}
  if(ut&&!ti.value&&had==null){ti.value=ut;f.setAttribute('data-prevpre',ut)}
}
/* 2026-11-17 (submit flow, slice 1): the early round and the 15 s round can be two recognitions of one clip, and
   the answer used to sit on the early one while the set hint sat on the 15 s one. when the early card stays and
   the 15 s recognition's own top candidate is the same recording at LIKELY or better, the answer, the follow and
   the history row bind to the 15 s recognition. never after this phone already answered on the early one. */
function boundRid(e,r){
  var top=r&&(r.answer||(r.alternates||[])[0])||null, rid=r&&r.recognition_id;
  if(!rid||!top||!e.key||answeredRids[e.recognition_id])return e.recognition_id;
  return candKey(top)===e.key&&sureTier(top)?rid:e.recognition_id;
}
/* 2026-11-17 (final read): the answered mark is kept per recognition id, and one scan can draw the same recording
   under several of them (the 5, 9 and 12 s rounds, then the 15 s one). answeredRid gives the early card's
   recognition when this phone already answered on it and the card replacing it is the same recording (same
   candKey), else nothing. the new card keeps that id, so it is drawn as answered (answeredOn), the row in recent
   scans carries the answer, and a second send meets the api's own "already answered". */
function answeredRid(e,cand){
  return e&&cand&&e.recognition_id&&answeredRids[e.recognition_id]&&sameKey(e.key,candKey(cand))?e.recognition_id:'';
}
/* the mark this phone left on the scan a card is for, or null */
function answeredOn(cur){return (cur&&cur.recognition_id&&answeredRids[cur.recognition_id])||null}
/* where an answer on this card's own scan lands: on a library clip, and on one that already showed a record's name */
function cardWhere(cand){var clip=!!(cand&&cand.fingerprint_id);return {clip:clip,named:clip&&!noName(cand)}}

function startScan(){
  if(busy)return;
  if(!cfg){showCard(errCard(cfgErr?'the app config did not load. pull down to refresh and try again.':'still loading, one second.'));return}
  if(!canCapture()){
    showCard(errCard("this browser can't record audio. on iphone use safari, on android use chrome, then add the app to your home screen."));return;
  }
  busy=true; card.classList.remove('on'); keepLast(); scanLive=true; current=null; dropBlob(); scanSeq++; early=null; finalDone=false; rateHit=false;
  /* the screen stays awake from the tap until the card is final or the scan is cancelled (2026-10-13): a phone that
     dims at ten seconds used to cut the clip short on the lock. reset() lets it go, auto mode keeps its own. */
  wakeOn();
  var seq=scanSeq, nextRound=0;
  timing={t0:Date.now(),rounds:[],first:null};levels=[];say2('listening');
  stage.classList.add('listening'); go.classList.add('busy'); recword.textContent='listening'; count.textContent=String(Math.round(CAPTURE_MS/1000)); lvlStart(); announce('listening');
  tap.innerHTML='tap to <b>stop</b>'; go.setAttribute('aria-label','stop listening');
  var chunks=[], got=0, need=0, t0=0, timer=null, stream=null, ctx=null, node=null, sink=null, stopped=false, cancelled=false, sq=0, clipped=0;
  /* the screen locking mid-scan suspends the audio graph on iphone and the clip ends short. say so instead of guessing. */
  function onHide(){if(document.hidden&&!stopped){stopped=true;cancelled=true;scanSeq++;cleanup();reset();showCard(errCard('the screen went off mid-scan, so the clip stopped short. keep the phone awake and scan again.'));}}
  document.addEventListener('visibilitychange',onHide);
  /* the context is made inside the tap, so ios lets it run. */
  try{ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){ctx=null}
  /* a second tap while listening throws the clip away and goes back to tap to scan. */
  cancelScan=function(){ if(cancelled||stopped)return; cancelled=true; stopped=true; scanSeq++; tick(20); cleanup(); reset(); };
  /* a sure match from an early round ends the scan right there */
  stopCapture=function(){ if(stopped)return; stopped=true; heldLoud=got>0&&clipped/got>0.02; cleanup(); };
  function done(){
    if(stopped)return; stopped=true;
    var rate=ctx.sampleRate;
    if(got<=rate*2)return finishCapture(new Error('silent'));
    var rms=Math.sqrt(sq/got);
    if(rms<0.004)return finishCapture(new Error('quiet'));           /* about the noise floor of a phone mic in a quiet room */
    /* a clipped clip goes up anyway (2026-10-13): more than two percent of samples at the rail used to be refused as
       too loud, and by a club speaker that was most of them. the card carries a note that the answer may be rough. */
    heldLoud=clipped/got>0.02;
    finishCapture(null,wavBlob(chunks,rate));
  }
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false})
  .then(function(st){
    stream=st;
    if(cancelled){cleanup();reset();return}
    if(!ctx)throw new Error('audio');
    return (ctx.state==='suspended'?ctx.resume():Promise.resolve()).then(function(){
      if(cancelled){cleanup();reset();return}
      /* an iphone call, a notification sound or a bluetooth switch can pause the graph mid-scan ('interrupted' on
         safari). log it and ask for it back. the strip idles meanwhile and the 15 s deadline below still ends the scan. */
      ctx.onstatechange=function(){if(stopped||!ctx||ctx.state==='running'||ctx.state==='closed')return;console.warn('gmx scan: audio '+ctx.state+' mid-scan');try{ctx.resume().catch(function(e){console.warn('gmx scan: audio resume',e)})}catch(e){}};
      var src=ctx.createMediaStreamSource(st);
      need=Math.round(ctx.sampleRate*CAPTURE_MS/1000);
      function onChunk(inp){
        if(stopped)return;
        if(!t0){ t0=Date.now(); heldAt=new Date().toISOString(); tick(30);
          timer=setInterval(function(){count.textContent=String(Math.max(0,Math.ceil((CAPTURE_MS-(Date.now()-t0))/1000)))},100);
        }
        var take=Math.min(inp.length,need-got); if(take<=0)return;
        chunks.push(new Float32Array(inp.subarray(0,take))); got+=take;
        while(!rateHit&&nextRound<ROUNDS_MS.length&&got>=Math.round(ctx.sampleRate*ROUNDS_MS[nextRound]/1000)){var at=ROUNDS_MS[nextRound++];try{earlyIdentify(wavBlob(chunks,ctx.sampleRate),seq,at)}catch(e){}}
        var sum=0; for(var i=0;i<take;i++){var v=inp[i]; sum+=v*v; if(v>0.985||v<-0.985)clipped++;} sq+=sum; var rms=Math.sqrt(sum/take); setLevel(lvlNorm(rms)*.3); levels.push(rms); if(levels.length>120)levels.shift(); lastChunk=performance.now();
        if(got>=need)setTimeout(done,0);
      }
      /* a muted gain keeps the graph alive: a node that reaches no output is never pulled */
      sink=ctx.createGain(); sink.gain.value=0; sink.connect(ctx.destination);
      function legacy(){
        stage.setAttribute('data-cap','legacy');
        node=(ctx.createScriptProcessor||ctx.createJavaScriptNode).call(ctx,4096,1,1);
        node.onaudioprocess=function(ev){onChunk(ev.inputBuffer.getChannelData(0))};
        src.connect(node); node.connect(sink);
      }
      /* the worklet runs off the main thread. ScriptProcessorNode is deprecated and stays as the fallback. */
      var wl=ctx.audioWorklet&&window.AudioWorkletNode?ctx.audioWorklet.addModule('/gmx-capture-worklet.js').then(function(){
        if(stopped)return;
        node=new AudioWorkletNode(ctx,'gmx-capture',{numberOfInputs:1,numberOfOutputs:1,channelCount:1});
        stage.setAttribute('data-cap','worklet');
        node.port.onmessage=function(ev){onChunk(ev.data)};
        src.connect(node); node.connect(sink);
      }):Promise.reject(new Error('no worklet'));
      wl.catch(function(){if(!stopped)legacy()});
      setTimeout(done,CAPTURE_MS+4000);
    });
  }).catch(function(e){if(cancelled){cleanup();reset();return}finishCapture(e)});

  function cleanup(){
    if(timer)clearInterval(timer);
    document.removeEventListener('visibilitychange',onHide);
    try{if(node){if(node.port){node.port.onmessage=null;node.port.close()}node.onaudioprocess=null;node.disconnect()}if(sink)sink.disconnect()}catch(e){}
    if(stream)stream.getTracks().forEach(function(t){t.stop()});
    if(ctx){ctx.onstatechange=null;if(ctx.close)ctx.close().catch(function(){})}
    clearLevel(); stage.classList.remove('listening');
  }
  function finishCapture(err,blob){
    if(cancelled)return;
    cleanup(); tick(30);
    if(err||!blob||blob.size<2000){
      var name=err&&err.name?err.name:'';
      if(auto&&(name==='NotAllowedError'||name==='SecurityError'))autoStop('auto stopped: this phone wants a tap before each scan');
      var m= name==='NotAllowedError'||name==='SecurityError' ? (/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'the mic is blocked. open iphone settings, find safari (under apps on newer iphones), set microphone to ask or allow, then try again.' : /Android/.test(navigator.userAgent) ? 'the mic is blocked. tap the icon left of the address, open permissions, allow the microphone, then try again.' : 'the mic is blocked. click the icon left of the address, allow the microphone for groovesmaxxing.com, then try again.')
           : name==='NotFoundError' ? 'no microphone found on this device.'
           : (err&&err.message==='quiet') ? 'the mic barely heard anything. get closer to the speaker and scan again.'
           : 'the clip did not record. try again.';
      /* a blocked or missing mic (2026-11-09 review): say where the rest of the site works without one */
      var noMic=name==='NotAllowedError'||name==='SecurityError'||name==='NotFoundError';
      showCard(errCard(m)+(noMic?'<p class="note">no mic? these work without one: <a href="/sets">sets</a> · <a href="/tracklists/">tracklists</a> · <a href="/open-ids">open IDs</a></p>':'')); reset(); return;
    }
    heldBlob=blob; identify(blob);
  }
}
function reset(){say2('');busy=false;cancelScan=null;stopCapture=null;go.removeAttribute('aria-disabled');go.classList.remove('busy');stage.classList.remove('listening','finding');tap.innerHTML='tap to <b>scan</b>';go.setAttribute('aria-label','scan what is playing');if(!auto)wakeOff();try{onReset()}catch(e){}}
function dropBlob(){heldBlob=null;heldAt=null;heldLoud=false}

/* identify and poll */
/* the poll cap (2026-10-13): POLL_CAP_MS runs from the moment the POST answered with a job id, not from the start of
   the upload, so a slow cell upload no longer eats the wait. past the cap the job gets one last look before the page
   says it took too long, so a job that finished while the last tick was in flight still renders its card. every GET
   keeps its own deadline (GET_MS). */
function pollJob(jobId){
  var began=Date.now(), last=false;
  return new Promise(function(res,rej){
    (function poll(){
      if(Date.now()-began>POLL_CAP_MS){if(last)return rej(new Error('slow'));last=true}
      fx(cfg.api_base+'/jobs/'+encodeURIComponent(jobId),{headers:headers()},GET_MS)
      .then(function(r){if(r.status>=500)throw new Error('server');if(!r.ok)throw new Error('http '+r.status);return r.json()})
      .then(function(j){ if(j.state==='done')return res(j); if(j.state==='failed')return rej(new Error('failed')); if(last)return rej(new Error('slow')); setTimeout(poll,POLL_MS); })
      .catch(function(e){ if(last)rej(e); else setTimeout(poll,POLL_MS); });
    })();
  });
}
/* the early rounds: library only on the server, never a catalog call. quiet on any failure.
   a CONFIRMED answer ends the scan at once. a LIKELY one shows and the scan keeps going for the catalogs.
   2026-11-06 (architect pass item 5): two early rounds naming the same recording at least AGREE_GAP_MS apart
   end the scan too, the card keeping the server's own tier word. the windows overlap (each round re-sends the
   capture from the start), so agreement is not a second signal and never relabels a likely as sure. the
   10-03 venue probe: an 8 s LIKELY was right 5 of 5, and the 3 that came back the same at 15 s were all right. */
var AGREE_GAP_MS=4000;
function candKey(c){var nm=nameOf(c);return c.fingerprint_id||c.library_entry_id||(nm&&(nm.artist||'')+'|'+(nm.title||''))||null}
function earlyIdentify(blob,seq,at){
  var fd=new FormData(); fd.append('audio',blob,'clip.wav'); fd.append('source','mic');
  var began=Date.now(), sent=null, round={at:at,post:0,wait:0,answer:'…'};
  if(timing)timing.rounds.push(round);
  say2('matching at <b>'+(at/1000)+' s</b>'+(timing.rounds.length>1?' · '+timing.rounds.slice(0,-1).map(function(r){return r.answer}).join(', '):''));
  fx(cfg.api_base+'/identify',{method:'POST',headers:headers({'X-GMX-Round':'early'}),body:fd},POST_MS)
  .then(function(r){sent=Date.now();round.post=sent-began;if(r.status===429){rateHit=true;throw new Error('rate')}if(!r.ok)throw new Error('http '+r.status);return r.json()})
  .then(function(job){return pollJob(job.job_id)})
  .then(function(j){
    round.wait=Date.now()-(sent||began);
    if(seq!==scanSeq||finalDone)return;
    var r=j.result||{}, c=r.card||{}, cand=c.candidate;
    if(!cand||(cand.tier!=='LIKELY'&&cand.tier!=='CONFIRMED')){round.answer=(at/1000)+' s: nothing yet';say2('matching · '+timing.rounds.map(function(x){return x.answer}).join(' · '));return}
    var nm=nameOf(cand),who=nm?(nm.title||nm.artist):'a library entry';
    var key=candKey(cand), prev=early, same=!!(key&&prev&&prev.key===key), firstAt=same?prev.firstAt:at;
    var agreed=cand.tier==='LIKELY'&&same&&Math.abs(at-firstAt)>=AGREE_GAP_MS;
    round.answer=(at/1000)+' s: '+(cand.tier==='CONFIRMED'?'sure':(agreed?'close again':'close'))+', '+who;
    if(swapsOut(prev,cand))keepSwapped(prev);   /* 2026-11-17: this round named another recording than the early card on screen */
    /* 2026-11-17 (final read): each round is a recognition of its own, so an answer given on the 5 s card was
       forgotten when the 9 s round of the same recording redrew it: the buttons were back, the sent line was gone
       and a second tap filed a second row. when this phone already answered on the early card and this round names
       the same recording, the card keeps the recognition that was answered (answeredRid, the rule boundRid has
       for the 15 s round). the set hint still goes to this round's own recognition. */
    var rid=r.recognition_id||j.job_id;
    early={job_id:j.job_id,recognition_id:answeredRid(prev,cand)||rid,card:{kind:'match',candidate:cand},seconds:Math.round((Date.now()-timing.t0)/100)/10,timing:timing,key:key,firstAt:firstAt,at:Date.now()};
    if(!timing.first)timing.first=Date.now()-timing.t0;
    current=early; tick(40);
    if(cand.tier==='CONFIRMED'||agreed){
      /* done: stop the mic, skip the catalogs, keep the clip we have for corrections and the set hint.
         agreed: two rounds named it, so the 15 s post would only re-ask the library (it goes catalog off after
         a likely) on the same audio; the card keeps the likely word */
      if(agreed)timing.agreed={first:firstAt,again:at};
      finalDone=true; heldBlob=blob; if(stopCapture)stopCapture();
      current.hint_ref=rid; current.in_set=r.in_set||null; current.loud=heldLoud;
      var keep=!!(window.gmxClips&&gmxClips.on()&&heldBlob);
      if(keep)gmxClips.put({id:current.job_id,t:Date.now(),blob:heldBlob,recognition_id:current.recognition_id,kind:'match'}).catch(function(){});
      say2(agreed?'close twice, at <b>'+(Math.min(firstAt,at)/1000)+' s</b> and <b>'+(Math.max(firstAt,at)/1000)+' s</b>':'got it at <b>'+(at/1000)+' s</b>');
      redraw(resultCard(current)); remember(current,keep); reset(); return;
    }
    say2('close at <b>'+(at/1000)+' s</b>, still listening for a sure one');
    redraw('<p class="kw" id="earlynote">still listening</p>'+resultCard(early));
  }).catch(function(e){
    /* a 429 means this phone spent its early rounds for the hour (their own window on the api, ninety since
       2026-10-13). no more rounds this scan, the final clip still goes. */
    var capped=e&&e.message==='rate';
    round.answer=(at/1000)+' s: '+(capped?'hourly cap':'no answer');
    if(capped&&seq===scanSeq&&!finalDone)say2('this phone hit the hourly scan cap, one last try at 15 s');
  });
}
/* the best early card so far is a likely one. a sure one ends the scan before the 15 s round is ever posted */
function earlyLikely(){var c=early&&early.card&&early.card.candidate;return !!(c&&(c.tier==='LIKELY'||c.tier==='CONFIRMED'))}
function identify(blob){
  if(finalDone)return;
  if(!navigator.onLine&&!draining){queueClip(blob);return}
  cancelScan=null; go.setAttribute('aria-disabled','true'); go.setAttribute('aria-label','finding it, one moment'); stage.classList.add('finding'); recword.textContent='finding it'; count.textContent=''; announce('finding it');
  /* a clip auto kept with no signal stays library only when it drains later, after auto has stopped (2026-11-09 review 2) */
  var lib=!!(auto||(draining&&draining.auto));
  say2(lib?'checking our library':'checking the catalogs');
  if(!early)showCard('<div class="skel" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i></div>');
  var sentAt=null,finalRound={at:CAPTURE_MS,post:0,wait:0,answer:'…'};if(timing)timing.rounds.push(finalRound);
  var fd=new FormData(); fd.append('audio',blob,'clip.'+extOf(blob)); fd.append('source','mic');
  var began=Date.now();
  /* catalog off after an early likely (2026-10-13): when an early round already came back LIKELY, the 15 s round
     asks the api to skip the paid catalog call (X-GMX-Catalog: off). the library, the hash index and the set match
     still run on the full clip, so the likely can still rise to a sure one; only the ACRCloud and AudD spend is
     saved. the header goes on no other path. an api without the matching guard refuses the header, as a 401 or as
     a failed preflight that the browser reports as a network error, and either answer re-posts once without the
     header so the scan goes on as before. a stalled upload (timeout) is retried once with the same header (2026-11-09).
     auto (2026-11-06): every scan while auto runs is library only too, so a phone left on through a set, or many
     of them, never spends the catalogs. a tap with auto off still checks them. */
  var retried=false;
  function post(withHeader){
    return fx(cfg.api_base+'/identify',{method:'POST',headers:headers(withHeader?{'X-GMX-Catalog':'off'}:null),body:fd},POST_MS)
    .then(function(r){
      if(withHeader&&r.status===401&&!lib)return post(false);   /* auto never falls back to the catalogs */
      sentAt=Date.now();finalRound.post=sentAt-began;
      if(r.status===429)throw new Error('rate');
      if(r.status===401)throw new Error('key');
      if(r.status>=500)throw new Error('server');
      if(!r.ok)throw new Error('http '+r.status);
      if(withHeader)finalRound.catalog='off'; /* stamped only once the api took the post, so a refused round never reads catalog off (2026-10-13) */
      return r.json();
    },function(e){
      if(withHeader&&!(e&&e.message==='timeout')){
        if(!lib)return post(false);
        if(!retried&&navigator.onLine){retried=true;return post(true)}   /* auto: one more try, header kept */
      }
      /* a stalled upload on a slow club link (2026-11-09 review): one more try on its own while the phone is online, never filed as no signal.
         the first post may have reached the api and started a job (a slow 202 on the downlink), and the api has no repeat key yet,
         so the retry goes library only (X-GMX-Catalog: off): the catalogs are never paid twice for one clip */
      if(e&&e.message==='timeout'&&!retried&&navigator.onLine){retried=true;say2('slow upload, trying once more');return post(true);}
      throw e;
    });
  }
  post(lib||earlyLikely())
  .then(function(job){return pollJob(job.job_id)})
  .then(function(j){
    var r=j.result||{}, c=r.card||{kind:'none'};
    finalRound.wait=Date.now()-(sentAt||began);finalRound.answer='15 s: '+(c.kind==='match'?'match':c.kind==='guess'?'a guess':'nothing');
    if(finalDone)return;
    finalDone=true; say2('');
    /* the 15 s scan replaces the early card when it names something, else the early card stays */
    if(c.kind!=='match'&&early){current=early;current.recognition_id=boundRid(early,r)}   /* 2026-11-17: see boundRid */
    else{
      if(swapsOut(early,c.candidate))keepSwapped(early);   /* 2026-11-17: the 15 s answer is another recording than the early card it replaces */
      /* 2026-11-17 (final read): the 15 s match of the recording this phone already answered on the early card
         stays on the answered recognition too (answeredRid). hint_ref below is still the 15 s one */
      current={job_id:j.job_id,recognition_id:answeredRid(early,c.candidate)||r.recognition_id||j.job_id,card:c,seconds:Math.round((Date.now()-timing.t0)/100)/10,timing:timing,at:Date.now()};
    }
    if(current.timing&&!current.timing.first&&c.kind==='match')current.timing.first=Date.now()-timing.t0;
    /* the set hint answers for the 15 s scan, the one the set match ran on, even under an early card */
    current.hint_ref=r.recognition_id||j.job_id;
    /* the set this clip sits in, when the server already knows it and the set is public */
    current.in_set=r.in_set||null;
    current.loud=heldLoud;
    /* keep my clips (DECISION 12): the switch under more, the clip stays on this phone */
    var keep=!!(window.gmxClips&&gmxClips.on()&&heldBlob);
    if(keep)gmxClips.put({id:current.job_id,t:Date.now(),blob:heldBlob,recognition_id:current.recognition_id,kind:c.kind}).catch(function(){});
    redraw(resultCard(current)); remember(current,keep); reset();
  })
  .catch(function(e){
    if(finalDone)return;
    finalDone=true; say2('');
    if(early){current=early;current.loud=heldLoud;redraw(resultCard(current));remember(current,false);reset();return}
    var m=e&&e.message||'';
    if(m==='rate')rateHit=true;
    var netErr=m==='timeout'?!navigator.onLine:!/^(rate|slow|key|failed|server|http )/.test(m);
    if((netErr||m==='timeout')&&draining){var d=draining;draining=null;drainFailed=true;showCard(errCard('still no signal for the clip from '+when(d.t)+'. it stays on this phone, we try again on our own in a bit.'));reset();laterDrain();return}
    if(netErr&&heldBlob&&!draining){queueClip(heldBlob);return}
    var text= m==='rate' ? 'too many scans this hour on this phone. try again in a bit.'
            : m==='slow' ? 'took too long. the recognizer did not answer in 30 seconds. try again.'
            : m==='key' ? 'the app key was refused. pull down to refresh and try again.'
            : m==='failed' ? 'the recognizer choked on that clip. try again.'
            : m==='server' ? 'the recognizer answered but is failing on its end. give it a minute and try again.'
            : m==='timeout' ? 'the upload stalled. check your signal and try again.'
            : 'could not reach the recognizer. check your signal and try again.';
    showCard(errCard(text,!!heldBlob&&/^(slow|failed|server|timeout)$/.test(m))); reset();
  });
}

/* cards */
/* a cover that fails to load gives way to the rings (error events do not bubble, so this captures) */
card.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&t.hasAttribute('data-rings')&&t.parentNode)t.parentNode.innerHTML=ringsMark()},true);
/* the live line a screen reader hears (2026-10-13): listening, finding it, then the card's headline */
function announce(t){var l=$('scanlive');if(!l)return;l.textContent='';setTimeout(function(){l.textContent=t},60)}
function cardSays(){
  var h=card.querySelector('h2');if(!h)return '';
  var kw=card.querySelector('.kw'),sub=card.querySelector('.sub,.ttl,.note');
  return [kw&&kw.textContent,h.textContent,sub&&sub.textContent].filter(Boolean).join('. ').replace(/\s+/g,' ').trim();
}
/* the recording the card being drawn is for: the early card's while the scan still listens, else the current one's. null for a card with no candidate */
function shownKey(html){var s=html.indexOf('earlynote')>-1?early:current, c=s&&s.card&&s.card.candidate;return c?candKey(c):null}
function showCard(html){cardSeq=scanSeq;try{cardKey=shownKey(html)}catch(e){cardKey=null}card.innerHTML=html;card.classList.add('on');try{var said=cardSays();if(said)announce(said)}catch(e){}card.scrollIntoView({behavior:SM(),block:'nearest'});if(current&&current.card&&current.card.candidate&&html.indexOf('earlynote')<0||html.indexOf('earlynote')>-1)try{enrich(current)}catch(e){}try{decorate(html.indexOf('earlynote')>-1?early:current)}catch(e){}}
/* 2026-11-17 (submit flow, slice 1): a card that redraws inside one scan keeps what was typed. the early card is
   live while the scan still runs, and the next round or the 15 s answer used to replace the whole card and wipe a
   half-typed name about nine seconds in. redraw() takes each form's open state and field values before the swap
   and puts them back after, with the where chip and the cursor. only inside one scan (cardSeq is the scan the
   card on screen was drawn for): a new scan starts clean. a title the page filled in itself and the person never
   touched is not carried over, the new card fills its own.
   2026-11-17 (slice 1 review): the name form is carried only onto a card for the same recording (cardKey, the
   key of the card on screen, against the key of the card that replaces it). the early card can be an unnamed ID
   and the 15 s answer a different record; a name typed under the first came back open under the second and the
   send filed it on the second one's scan as that card's own answer. when the recording changed the name form
   starts closed and empty, as it did before this build, and the card that left is kept for the chip (swapsOut).
   the where form and the help form are about the scan, not the recording, and come back as before. */
function formsState(){
  if(cardSeq!==scanSeq||!card.classList.contains('on'))return null;
  var st={forms:{},chip:hintChip,focus:null,key:cardKey}, fs=card.querySelectorAll('form[id]'), i, j;
  for(i=0;i<fs.length;i++){
    var f=fs[i], els=f.querySelectorAll('input[name],textarea[name]'), vals={}, pv=f.querySelector('[data-prev]');
    for(j=0;j<els.length;j++)vals[els[j].name]=els[j].value;
    st.forms[f.id]={on:f.classList.contains('on'),vals:vals,pre:f.getAttribute('data-pre'),ppre:f.getAttribute('data-prevpre'),prev:pv?pv.getAttribute('aria-pressed'):null};
  }
  var ae=document.activeElement;
  if(ae&&ae.id&&card.contains(ae)){st.focus={id:ae.id};try{st.focus.a=ae.selectionStart;st.focus.b=ae.selectionEnd}catch(e){}}
  return st;
}
function formsRestore(st){
  if(!st)return;
  var moved=!sameKey(st.key,cardKey);
  Object.keys(st.forms).forEach(function(id){
    var s=st.forms[id], f=$(id); if(!f||!card.contains(f))return;
    if(id==='cform'&&moved)return;   /* another recording: what was typed was about the card that left */
    Object.keys(s.vals).forEach(function(k){
      var el=f.querySelector('[name="'+k+'"]'), v=s.vals[k];
      if(!el||!v)return;
      if(k==='title_claim'&&((s.pre!=null&&v===s.pre)||(s.ppre!=null&&v===s.ppre)))return;
      el.value=v;
    });
    /* 2026-11-17 (final read): a title the page filled in and the person then cleared or changed stays theirs.
       the redraw used to see an empty title box and fill the title in again without a word, and the send posted
       a title the person had removed. the mark goes onto the new form, and openForm and prevFill fill nothing
       into a form that carries it. an untouched title carries no mark: the new card fills its own */
    if(id==='cform'){
      var tv=s.vals.title_claim||'';
      if(s.pre!=null&&tv!==s.pre)f.setAttribute('data-pre',s.pre);
      if(s.ppre!=null&&tv!==s.ppre)f.setAttribute('data-prevpre',s.ppre);
    }
    if(!s.on)return;
    if(id==='cform'){
      openForm(true);
      var pv=f.querySelector('[data-prev]');
      if(pv&&s.prev!=null&&pv.getAttribute('aria-pressed')!==s.prev)togglePrev(pv);
    }else f.classList.add('on');
    if(id==='wform'&&st.chip)pickChip(st.chip);
  });
  if(st.focus){var el=$(st.focus.id);if(el&&card.contains(el)&&!(moved&&/^c-/.test(st.focus.id))){try{el.focus();if(st.focus.a!=null)el.setSelectionRange(st.focus.a,st.focus.b)}catch(e){}}}
}
function redraw(html){var st=null;try{st=formsState()}catch(e){}showCard(html);try{formsRestore(st)}catch(e){}}
/* the crate heart and the label link (crate loop build, 2026-10-11). the heart saves the match on this phone
   like a tracklist row would, with whatever store links the card has at tap time, so a link that arrives
   later from enrich() still makes it in. the label line links to our label page when there is one. */
var namesIdx=null;
function namesIndex(){return namesIdx||(namesIdx=fx('/names-index.json',{},GET_MS).then(function(r){return r.ok?r.json():null}).catch(function(){return null}))}
function crateItem(cand){
  var nm=nameOf(cand)||{artist:'',title:''},links={};
  if(!isUnreleased(cand))[].slice.call(card.querySelectorAll('#storerow a.btn:not(.find)')).forEach(function(a){var h=a.href||'';if(/open\.spotify\.com/.test(h))links.spotify=h;else if(/music\.apple\.com/.test(h))links.apple=h;else if(/beatport\.com/.test(h)&&!/search/.test(h))links.beatport=h;else if(/soundcloud\.com/.test(h)&&!/search/.test(h))links.soundcloud=h});
  var who=nm.artist||((card.querySelector('.sub')||{}).textContent||'').trim();
  var shown=nm.lib?((card.querySelector('h2')||{}).textContent||'').trim():'';
  var title=(who?who+' - ':'')+(shown||nm.title||'unnamed library entry');
  /* the mark rides in sub as well: gmx-account.js norm() drops unknown keys on a signed-in sync, and /crate reads the word */
  var un=isUnreleased(cand);
  return {kind:'track',id:'scan:'+(foldT(who+' '+nm.title)||cand.library_id||'id'),title:title,sub:[cand.label||'',cand.status||'',unrelWord(un,cand.status),'found with the scan'].filter(Boolean).join(' · '),url:'/scan',links:links,artist:who,label:cand.label||'',unreleased:un||undefined};
}
function decorate(cur){
  var c=cur&&cur.card&&cur.card.candidate; if(!c||cur.card.kind!=='match')return;
  var store=card.querySelector('#storerow');
  if(store&&window.gmxCrate&&!store.querySelector('.gmx-heart')){
    var nm=nameOf(c),label=nm?((nm.artist?nm.artist+' - ':'')+nm.title):'this match';
    store.insertBefore(gmxCrate.heart(function(){return crateItem(c)},label),store.querySelector('[data-act="share"]')||null);
  }
  var lab=card.querySelector('p.lab');
  if(lab&&c.label&&!lab.querySelector('a'))namesIndex().then(function(n){
    var key=String(c.label).normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,'and').replace(/\s+/g,' ').trim(),sl=n&&n.l&&n.l[key];
    if(!sl||lab.querySelector('a'))return;
    lab.innerHTML='<a class="sublink" href="/labels/'+esc(sl)+'">'+esc(c.label)+'</a>'+(c.release_date?' · '+esc(c.release_date):'');
  });
}
/* 2026-11-06 (architect pass item 8): resend offers the clip already recorded, for a failure on our
   side, so a slow or failing recognizer does not cost the moment. never for the hourly cap or a refused key. */
function errCard(text,resend){return '<p class="kw"><b>hm.</b></p><h2>that did not work.</h2><p class="note">'+esc(text)+'</p><div class="row">'+(resend?'<button class="btn red" data-act="resend">try this clip again</button><button class="btn ghost" data-act="again">scan again</button>':'<button class="btn red" data-act="again">scan again</button>')+'</div>'}

/* a refsync library entry (a reference clip the laptop contributed from an id upload) carries its file name and
   notes as the title and "refsync <poster>" as the artist. the card shows the caption as the title, nobody as the
   artist, and where it came from as a note, instead of printing the raw line. */
/* 2026-11-17 (submit flow, slice 1): the caption is read the way the recognizer reads it (app/core/naming.py,
   reference_caption and refsync_name, same day), rule for rule. the old reading ran to the end of the line, so a
   title came out with its ". set_time: 1:16:25" tail and the research note in brackets.
   the set_time tail goes first. then each outermost round bracket is judged whole: a research note goes (a list
   with a comma or a semicolon, a label like "G-MO ear: ...", a recognizer's own word in front, or 41 characters
   and up), a version or a credit stays ("(Maccabi Edit)", "(feat. A, B)", "(unreleased)"), and a square bracket
   always stays. what is left is a title only up to 120 characters and with no link in it. a literal "ID" artist in
   front is dropped ("ID - Welcome To The Jungle" reads "Welcome To The Jungle"), and a caption that is only ID
   words ("ID - ID") is no name. an "Artist - Title" caption stays whole as the title: the page never splits an
   artist out of it. this is only the fallback for a raw reference line; the recognizer's own title leads.
   2026-11-17 (final read): brought back in line with the recognizer's reader as it stands after its own fix round.
   the page had drifted on three families and the recognizer had gained rules of its own since:
   - no name only when the caption says ID and nothing else (capIdOnly, the recognizer's is_id_only). the page still
     took any caption made of the placeholder words, or of no letters, for no name, so "1977", "Soon", "Song 2" and
     "Untitled" read ID here and a title there.
   - a closing bracket with nothing open stays ("Night Drive :)) later"), except right after a note that was taken
     out. the page dropped every one.
   - set_time is read in lower case only and has to start a word ("Reset_time: now" keeps its line).
   - a long bracket that ends on a version word is a version, not a note.
   - "ID's" and "I.D." are the word ID, and "ID: Something" loses its ID like "ID - Something" does.
   - a caption of punctuation alone is no name, and neither is what is left of "ID - (open)".
   - words, word edges and white space are read the way python reads them (a letter or a digit in any script is
     part of a word), and lengths count characters, not utf-16 halves. */
var CAP_SPACE='\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
/* a pattern written with @W for the characters of a word, @L for letters, @D for digits and @S for white space,
   each inside a class. a browser too old for \p falls back to plain ascii */
function capRe(src,flags){
  src=src.replace(/@S/g,CAP_SPACE);
  try{return new RegExp(src.replace(/@W/g,'\\p{L}\\p{N}_').replace(/@L/g,'\\p{L}\\p{Nl}\\p{No}').replace(/@D/g,'\\p{Nd}'),(flags||'')+'u')}
  catch(e){return new RegExp(src.replace(/@W/g,'A-Za-z0-9_').replace(/@L/g,'A-Za-z').replace(/@D/g,'0-9'),flags||'')}
}
var CAP_VERSION=capRe('^(?:[^,;]{0,39}[^,;@W])?(?:remix|edit|mix|rework|dub|version|bootleg|flip|vip|cut|refix)[@S]*$','i'),
  CAP_VERSION_END=capRe('(?:^|[^@W])(?:remix|edit|mix|rework|dub|version|bootleg|flip|vip|cut|refix)[@S]*$','i'),
  CAP_CREDIT=capRe('^(?:(?:feat|ft|featuring|prod)(?![@W])|w/)','i'),
  CAP_NOTE_LIST=capRe('[,;]|:[@S]'),
  CAP_NOTE_WORDS=capRe('^(?:novelty[@S]+[@D]|(?:acr|shazam|1001tl|g-mo)(?![@W]))','i');
var CAP_JUNK=capRe('https?://|www\\.|^[@S]*(?:dm(?![@W])|out now(?![@W])|link in bio|full (?:file|track|version)(?![@W]))','i');
var CAP_PLACEHOLDER=' id ids unreleased unknown untitled track tracks tba tbc new song edit mix remix vip dub extended original free download dl premiere vol volume pt part pack snippet preview clip forthcoming soon ';
/* letters in any script */
var CAP_WORD=capRe('[@L]+','g');
/* CAP_MARKS: nothing but punctuation, spaces and maths signs ("???", "()", "-", "|") */
var CAP_MARKS=(function(){try{return new RegExp('^[\\p{P}\\p{Z}\\p{C}\\p{Sm}\\p{Sk}]*$','u')}catch(e){return /^[\x00-\x23\x25-\x2f\x3a-\x40\x5b-\x60\x7b-\xa1\u2000-\u206f]*$/}})(),
  CAP_ID_SPELLED=capRe('(^|[^@W])(?:I\\.D\\.?(?![@W])|ID[\'\u2019]s(?![@W]))','gi'),
  CAP_ID_COLON=capRe('^[@S]*(?:ID|I\\.D\\.?)[@S]*:[@S]+(?=[^@S])','i'),
  CAP_DASH=capRe('[@S]+[-\u2013\u2014][@S]+'),
  CAP_SET_TIME=capRe('(?:\\.?[@S]+|\\.|^|([^@W]))set_time:[\\s\\S]*$'),
  CAP_LINE=capRe('caption:[@S]*([\\s\\S]+?)[@S]*$','i'),
  CAP_TRIM=capRe('^[@S]+|[@S]+$','g'), CAP_RUN=capRe('[@S]+','g');
function capTrim(s){return String(s||'').replace(CAP_TRIM,'')}
/* one space between words, none at the ends */
function capFlat(s){return capTrim(String(s||'').replace(CAP_RUN,' '))}
function capLen(s){return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'_').length}
/* the text with every bracket taken out, innermost first */
function capBare(s){s=String(s||'');while(/[(\[][^()\[\]]*[)\]]/.test(s))s=s.replace(/[(\[][^()\[\]]*[)\]]/g,' ');return s}
function capNote(inner){
  var b=capFlat(capBare(inner));
  if(!b||CAP_VERSION.test(b)||CAP_VERSION.test(b.replace(/,/g,' &'))||CAP_CREDIT.test(b))return false;
  if(CAP_NOTE_LIST.test(b)||CAP_NOTE_WORDS.test(b))return true;
  if(CAP_VERSION_END.test(b))return false;   /* a long version name, not a note */
  return capLen(b)>=41;
}
/* a note the line cut before its closing bracket runs to the end and is judged the same way. the closing bracket a
   ":)" inside a note leaves behind goes with the note; any other closing bracket with nothing open stays */
function capStrip(s){
  s=String(s||'');
  var out='', i=0, n=s.length;
  while(i<n){
    var ch=s.charAt(i);
    if(ch!=='('&&ch!=='['){out+=ch;i++;continue}
    var depth=0, k=i;
    for(;k<n;k++){var c=s.charAt(k);if(c==='('||c==='[')depth++;else if(c===')'||c===']'){depth--;if(depth===0)break}}
    var closed=k<n, whole=closed?s.slice(i,k+1):s.slice(i);
    i=closed?k+1:n;
    if(ch==='('&&capNote(closed?whole.slice(1,-1):whole.slice(1))){while(i<n&&(s.charAt(i)===')'||s.charAt(i)===']'))i++}
    else out+=whole;
  }
  return out;
}
/* "ID's" and "I.D." written as ID, for the tests that look for the word */
function capIdSpelled(s){return String(s||'').replace(CAP_ID_SPELLED,'$1ID')}
/* does the text say ID and nothing else? its brackets set aside, it holds the word ID (or IDs) and no word outside
   the placeholder list: "ID", "ID - ID", "ID (Extended Mix)", "Unreleased ID 3". "1977", "Soon" and "Song 2" are titles */
function capIdOnly(t){
  var w=capIdSpelled(capBare(t)).toLowerCase().match(CAP_WORD)||[], id=false;
  for(var i=0;i<w.length;i++){if(CAP_PLACEHOLDER.indexOf(' '+w[i]+' ')<0)return false;if(w[i]==='id'||w[i]==='ids')id=true}
  return id;
}
function libCaption(t){
  var m=CAP_LINE.exec(capTrim(t)), raw=m?capTrim(m[1]):'';
  if(!raw||raw.indexOf('\n')>-1)return '';
  var cap=capTrim(capFlat(capStrip(raw.replace(CAP_SET_TIME,function(all,keep){return keep||''}))).replace(/^\|+/,''));
  if(!cap||capLen(cap)>120||CAP_JUNK.test(cap)||CAP_MARKS.test(cap))return '';
  /* the ID in front goes: "ID: Something", "ID - Something", "I.D. - Something" */
  var idOff=false, colon=CAP_ID_COLON.exec(cap);
  if(colon){cap=capTrim(cap.slice(colon[0].length));idOff=true}
  var dash=CAP_DASH.exec(cap);
  if(dash&&capTrim(capIdSpelled(cap.slice(0,dash.index))).toLowerCase()==='id'){cap=capTrim(cap.slice(dash.index+dash[0].length));idOff=true}
  if(idOff&&CAP_MARKS.test(capBare(cap)))return '';   /* "ID - (open)": nothing outside the bracket is left */
  return !cap||CAP_MARKS.test(cap)||capIdOnly(cap)?'':cap;
}
function libName(a,t){
  a=String(a||'');t=String(t||'');
  if(!(/^refsync\b/i.test(a)||/\bcaption:\s*/i.test(t)||/\bposted by\b/i.test(t)))return null;
  var cap=libCaption(t);
  var poster=(t.match(/posted by\s+(.+?)\.(?:\s|$)/i)||[])[1]||a.replace(/^refsync\s*/i,'');
  var d=t.match(/\b(20\d{2})(\d{2})(\d{2})\b/),when=d?d[1]+'-'+d[2]+'-'+d[3]:'';
  return {artist:'',title:cap||'ID',lib:true,note:'an id from '+(poster?'a '+poster.trim()+' upload':'an upload')+(when?' ('+when+')':'')+', no artist named yet'};
}
function nameOf(c){
  var a=c.artist_claim, t=c.title_claim;
  var lib=libName(a,t); if(lib)return lib;
  if(a&&t)return {artist:a,title:t};
  if(t)return {artist:'',title:t};
  if(a)return {artist:a,title:''};
  return null;
}
function ringsMark(){
  return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43.33" fill="none" stroke="#8A8A93" stroke-width="3.5"/><circle cx="50" cy="50" r="43.33" fill="none" stroke="#FF1C02" stroke-width="2.08"/><circle cx="50" cy="50" r="31.67" fill="none" stroke="#8A8A93" stroke-width="3.5"/><circle cx="50" cy="50" r="31.67" fill="none" stroke="#FF1C02" stroke-width="2.08"/><circle cx="50" cy="50" r="20" fill="none" stroke="#8A8A93" stroke-width="3.5"/><circle cx="50" cy="50" r="20" fill="none" stroke="#FF1C02" stroke-width="2.08"/><circle cx="50" cy="50" r="8.21" fill="#8A8A93"/><circle cx="50" cy="50" r="7.5" fill="#FF1C02"/></svg>';
}
function artBlock(c){
  // the cover comes only from a store record (a released track). an unreleased ID has no cover to show,
  // so it carries the groovesmaxxing mark, the rings and the wave, with the word under it (G-MO, 2026-10-11).
  // a released track with no cover yet draws the plain rings until enrich() finds one.
  if(isUnreleased(c))return '<div class="art unrel" data-done="1">'+logoMark()+'<span class="ulbl">unreleased</span></div>';
  var a=safeUrl(c.artwork_url);
  if(a)return '<div class="art"><img src="'+esc(a)+'" alt="" loading="lazy" data-rings="1"></div>';
  return '<div class="art">'+ringsMark()+'</div>';
}
function logoMark(){
  return '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><filter id="gmx-ca-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.17"/></filter><mask id="gmx-ca-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><polygon points="2.5,50 12.5,50 20,35 28.33,37.5 36.67,40 45,42.5 50,47.5 55,42.5 63.33,40 71.67,37.5 80,35 87.5,50 97.5,50 97.5,50 87.5,50 80,65 71.67,62.5 63.33,60 55,57.5 50,52.5 45,57.5 36.67,60 28.33,62.5 20,65 12.5,50 2.5,50" fill="#000"/></mask></defs><circle cx="50" cy="50" r="43.33" fill="none" stroke="#8A8A93" stroke-width="3.5" mask="url(#gmx-ca-cut)"/><circle cx="50" cy="50" r="43.33" fill="none" stroke="#FF1C02" stroke-width="2.08" mask="url(#gmx-ca-cut)"/><circle cx="50" cy="50" r="31.67" fill="none" stroke="#8A8A93" stroke-width="3.5" mask="url(#gmx-ca-cut)"/><circle cx="50" cy="50" r="31.67" fill="none" stroke="#FF1C02" stroke-width="2.08" mask="url(#gmx-ca-cut)"/><circle cx="50" cy="50" r="20" fill="none" stroke="#8A8A93" stroke-width="3.5" mask="url(#gmx-ca-cut)"/><circle cx="50" cy="50" r="20" fill="none" stroke="#FF1C02" stroke-width="2.08" mask="url(#gmx-ca-cut)"/><circle cx="50" cy="50" r="8.21" fill="#8A8A93" mask="url(#gmx-ca-cut)"/><circle cx="50" cy="50" r="7.5" fill="#FF1C02" mask="url(#gmx-ca-cut)"/><g filter="url(#gmx-ca-glow)" opacity=".9"><polyline points="2.5,50 12.5,50 20,35 28.33,62.5 36.67,40 45,57.5 50,47.5 55,57.5 63.33,40 71.67,62.5 80,35 87.5,50 97.5,50" fill="none" stroke="#FFFFFF" stroke-width="3.33" stroke-linecap="round" stroke-linejoin="round"/></g><polyline points="2.5,50 12.5,50 20,65 28.33,37.5 36.67,60 45,42.5 50,52.5 55,42.5 63.33,60 71.67,37.5 80,65 87.5,50 97.5,50" fill="none" stroke="#FF1C02" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,62.5 28.33,39.58 36.67,58.33 45,43.75 50,52.08 55,43.75 63.33,58.33 71.67,39.58 80,62.5 87.5,50 97.5,50" fill="none" stroke="#FF5E4B" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,60 28.33,41.67 36.67,56.67 45,45 50,51.67 55,45 63.33,56.67 71.67,41.67 80,60 87.5,50 97.5,50" fill="none" stroke="#FF7969" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,57.5 28.33,43.75 36.67,55 45,46.25 50,51.25 55,46.25 63.33,55 71.67,43.75 80,57.5 87.5,50 97.5,50" fill="none" stroke="#FF8E80" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,55 28.33,45.83 36.67,53.33 45,47.5 50,50.83 55,47.5 63.33,53.33 71.67,45.83 80,55 87.5,50 97.5,50" fill="none" stroke="#FF9F94" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,52.5 28.33,47.92 36.67,51.67 45,48.75 50,50.42 55,48.75 63.33,51.67 71.67,47.92 80,52.5 87.5,50 97.5,50" fill="none" stroke="#FFAFA5" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,50 28.33,50 36.67,50 45,50 50,50 55,50 63.33,50 71.67,50 80,50 87.5,50 97.5,50" fill="none" stroke="#FFBDB5" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,47.5 28.33,52.08 36.67,48.33 45,51.25 50,49.58 55,51.25 63.33,48.33 71.67,52.08 80,47.5 87.5,50 97.5,50" fill="none" stroke="#FFC9C3" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,45 28.33,54.17 36.67,46.67 45,52.5 50,49.17 55,52.5 63.33,46.67 71.67,54.17 80,45 87.5,50 97.5,50" fill="none" stroke="#FFD5D1" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,42.5 28.33,56.25 36.67,45 45,53.75 50,48.75 55,53.75 63.33,45 71.67,56.25 80,42.5 87.5,50 97.5,50" fill="none" stroke="#FFE1DD" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,40 28.33,58.33 36.67,43.33 45,55 50,48.33 55,55 63.33,43.33 71.67,58.33 80,40 87.5,50 97.5,50" fill="none" stroke="#FFEBE9" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,37.5 28.33,60.42 36.67,41.67 45,56.25 50,47.92 55,56.25 63.33,41.67 71.67,60.42 80,37.5 87.5,50 97.5,50" fill="none" stroke="#FFF5F4" stroke-width="0.88" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2.5,50 12.5,50 20,35 28.33,62.5 36.67,40 45,57.5 50,47.5 55,57.5 63.33,40 71.67,62.5 80,35 87.5,50 97.5,50" fill="none" stroke="#FFFFFF" stroke-width="1.83" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function sureLine(c){
  if(c.confidence_line)return esc(c.confidence_line);
  if(c.shown_score==null)return esc(c.word||'possible match');
  return (c.word==='very likely'?'very likely':'our best guess')+', '+pct(c.shown_score);
}
function statusPill(s){
  var cls=s==='out now'?'out':s==='unreleased'?'unr':'';
  return '<span class="pill '+cls+'">'+esc(s||'ID')+'</span>';
}
/* an unreleased track never carries a link to the song (G-MO, 2026-09-27): no store button, no store cover, no
   store search, no linked title, no song share url. every path that builds one asks this first, whatever the
   server sent in store_links. links to a set (page_url, deep_link, the hear it in rows) are allowed. */
function isUnreleased(c){return !!c&&(c.released===false||!!(c.status&&c.status!=='out now'))}
/* the word a crate heart's sub carries for an unreleased track, unless its status already says unreleased or ID */
function unrelWord(un,status){return un&&status!=='unreleased'&&status!=='ID'?'unreleased':''}
function storeRow(c){
  if(isUnreleased(c))return '';
  var l=cleanLinks(c.store_links), out='';
  if(l.spotify)out+='<a class="btn" href="'+esc(l.spotify)+'" target="_blank" rel="noopener">spotify</a>';
  if(l.apple)out+='<a class="btn" href="'+esc(l.apple)+'" target="_blank" rel="noopener">apple music</a>';
  if(l.beatport_search)out+='<a class="btn" href="'+esc(l.beatport_search)+'" target="_blank" rel="noopener">beatport</a>';
  return out;
}
function heardRows(c){
  var h=c.heard_in||[]; if(!h.length)return '';
  var out='<h3>heard in</h3><ul class="heard">';
  h.slice(0,5).forEach(function(r){
    var pu=safeUrl(r.page_url), dl=safeUrl(r.deep_link);
    out+='<li>'+(pu?'<a href="'+esc(pu)+'">'+esc(r.set_title)+'</a>':esc(r.set_title))+'<span class="at">'+(dl?'<a href="'+esc(dl)+'" target="_blank" rel="noopener">'+esc(r.at)+'</a>':esc(r.at))+'</span></li>';
  });
  return out+'</ul>';
}
/* the card reads the track (recognizer packet 7, 2026-10-28; the wording is DECISION 11, approved 2026-10-28 as
   written): three lines from fields the recognizer sends as data. other_sets is every place the recording was
   heard, folded by set and second with how many people heard it there (placements, sightings and our own
   tracklist rows), so it replaces the heard-in list when present. the sets line counts sets other than the one
   this scan sits in, and shows from two up, since the approved sentence is plural. the eta line shows on an
   unreleased track only. the named-by line maps the recognizer's named_by kind to the five approved phrases and
   says nothing for any other kind. */
var NAMED_BY={artist:'named by the artist',label:'named by the label',catalog:'named from the release',tracklist:'named from a tracklist',owner:'named by groovesmaxxing'};
function trackRows(c,cur){
  if(!c||!c.track_id)return '';
  var out='', sets=c.other_sets||[];
  var n=c.sets_count||0, here=cur&&cur.in_set&&cur.in_set.set_title;
  if(here&&sets.some(function(r){return r.set_title===here}))n-=1;
  if(n>=2)out+='<p class="ttl">also played in '+n+' other sets</p>';
  if(c.status==='unreleased')out+='<p class="ttl">'+(c.release_date?'due out '+esc(c.release_date):'release date not known yet')+'</p>';
  if(c.named_by&&NAMED_BY[c.named_by])out+='<p class="ttl">'+NAMED_BY[c.named_by]+'</p>';
  if(sets.length){
    out+='<h3>heard in</h3><ul class="heard">';
    sets.slice(0,5).forEach(function(r){
      var pu=safeUrl(r.page_url), dl=safeUrl(r.deep_link);
      out+='<li>'+(pu?'<a href="'+esc(pu)+'">'+esc(r.set_title)+'</a>':esc(r.set_title))+'<span class="at">'+(dl?'<a href="'+esc(dl)+'" target="_blank" rel="noopener">'+esc(r.at)+'</a>':esc(r.at))+(r.people>1?' ('+esc(r.people)+')':'')+'</span></li>';
    });
    out+='</ul>';
  }
  return out;
}
/* "you're listening to": the set and the spot, straight from the scan, no typing. it only
   comes back for a set that already has its page here or sits on the dj's, label's, venue's
   or festival's own channel. */
/* the recognizer placed the clip in a set we have a tracklist for, and the row playing at that second is named:
   that row leads the card (2026-10-11, the woop woop scan), with the catalog's closest guess kept below it.
   an "ID - ID" row or a set with no page gives nothing here and the card reads as before. */
function placedHead(cur){
  var s=cur.in_set; if(!s||!s.row)return '';
  var parts=String(s.row).split(' - '),who=parts.length>1?parts[0].trim():'',ttl=(parts.length>1?parts.slice(1).join(' - '):s.row).trim();
  var unrel=/\(unreleased\)/i.test(ttl);
  var out='<p class="kw"><b>on the tracklist</b></p>';
  if(unrel)out+='<div class="art unrel" data-done="1">'+logoMark()+'<span class="ulbl">unreleased</span></div>';
  out+='<h2'+(ttl.length>42?' class="long"':'')+'>'+esc(ttl)+'</h2>';
  if(who&&!/^id$/i.test(who))out+='<p class="sub">'+esc(who)+'</p>';
  out+='<p class="ttl">the recognizer placed this clip in '+esc(s.set_title)+(s.row_at?' and our tracklist calls '+esc(s.row_at)+' this':'')+'. not a fingerprint match on its own.</p>';
  out+='<div class="row"><button class="btn red" data-act="listen">listen again</button><button class="btn" data-act="share">share</button></div>';
  if(who&&!/^id$/i.test(who))checkArtistPage(who);
  return out;
}
/* does the catalog's guess name the same track as the tracklist row ("artist - title")? titles compared
   through foldT, so a mix name or an accent is not a difference. an unnamed guess never matches */
function guessMatchesRow(g,row){
  if(!g||!g.title||!row)return false;
  var parts=String(row).split(' - '),ra=parts.length>1?parts[0]:'',rt=parts.length>1?parts.slice(1).join(' - '):row;
  if(foldT(g.title)!==foldT(rt))return false;
  var ga=foldT(g.artist),fa=foldT(ra);
  return !ga||!fa||fa==='id'||ga.indexOf(fa)>-1||fa.indexOf(ga)>-1;
}
function inSetRows(cur){
  var s=cur.in_set; if(!s||!s.set_title)return '';
  s=Object.assign({},s,{page_url:safeUrl(s.page_url),deep_link:safeUrl(s.deep_link)});
  var name=s.page_url?'<a href="'+esc(s.page_url)+'">'+esc(s.set_title)+'</a>':(s.deep_link?'<a href="'+esc(s.deep_link)+'" target="_blank" rel="noopener">'+esc(s.set_title)+'</a>':esc(s.set_title));
  var at=s.deep_link?'<a href="'+esc(s.deep_link)+'" target="_blank" rel="noopener">around '+esc(s.at)+'</a>':'around '+esc(s.at);
  /* the tracklist's own call at that spot, so a row fixed by ear shows up here too. none on an ID row */
  var row=s.row?'<li><span>on the tracklist: <b>'+esc(s.row)+'</b></span><span class="at">from '+esc(s.row_at||s.at)+'</span></li>':'';
  return '<h3>you\'re listening to</h3><ul class="heard"><li>'+name+'<span class="at">'+at+'</span></li>'+row+'</ul>';
}
/* what happens next (ui build 4, 2026-10-11, the flighty move): four steps under every result, the one that
   is live lit. heard, named, placed, confirmed. a result the recognizer is sure of is named and waits on a
   person; a guess or a blank waits on a name; a set placement fills the third step; a human confirmation
   fills the last. after the phone answers, the last step says what closes it. */
function pathStep(state,label,note){return '<li class="st-'+state+'"><span class="dot" aria-hidden="true"></span><span class="lb">'+label+'</span><span class="nt">'+note+'</span></li>'}
function pathBlock(cur){
  var c=cur.card, cand=c.candidate, t=cur.timing, s=cur.in_set, nm=cand?nameOf(cand):null;
  var secs=function(ms){return (Math.round(ms/100)/10)+' s'};
  var heard=t&&t.first?'found in '+secs(t.first)+(t.rounds&&t.rounds.length>1?' · '+t.rounds.length+' rounds':''):(t?'listening':'just now');
  var named,namedState,conf,confState;
  if(c.kind==='match'&&cand){
    var lib=!!(nm&&nm.lib),head=(!lib&&cand.headline)||(nm?(nm.title||nm.artist):'ID');
    if(head==='ID'){named='in our library, no name yet';namedState='now'}
    else if(cand.title_from==='upload'&&!clipNamed(cand)){named='in our library. the title came in with the clip, not a name yet';namedState='now'}   /* 2026-11-17: a title that came in with the clip (the upload's own, or its tracklist row) does not light the step as done */
    else{named=((lib||cand.status!=='out now')?'from our library of sets':'from the catalog')+(cand.status==='unreleased'?' · unreleased':cand.status==='out now'?' · out now':'');namedState='done'}
    /* 2026-11-17 (submit flow, slice 1): the line says what the ladder does. one phone never names anything, a
       reviewer checks it. it used to say that phones alone close it */
    if(cand.accepted_name){conf='a person confirmed this name';confState='done'}
    else if(answerKind('match',cand)==='name'){conf='waiting on a name. know it? name it below. a reviewer checks it.';confState=namedState==='now'?'next':'now'}
    else{conf='waiting on you: that’s right, or it’s actually… a reviewer checks it. one phone alone never names anything.';confState=head==='ID'?'next':'now'}
    /* 2026-11-17 (final read): a card redrawn for a scan this phone already answered keeps the line markSent wrote */
    var ans=answeredOn(cur);
    if(ans){conf=ans.v?sentLine(ans.v,cardWhere(cand)):'you answered this one';confState='done'}
  }else if(c.kind==='guess'&&cand){
    named='a guess at '+pct(cand.shown_score)+', under our bar';namedState='now';
    conf='nothing to confirm until it has a name';confState='next';
  }else{
    named='nothing yet';namedState='now';
    conf='nothing to confirm until it has a name';confState='next';
  }
  var placed,placedState;
  if(s&&s.set_title){placed='in '+esc(s.set_title)+(s.at?' around '+esc(s.at):'')+(s.row?' · the tracklist calls it '+esc(s.row):'');placedState='done'}
  else{placed='not placed in a set yet. “where are you hearing this?” helps.';placedState='next'}
  return '<h3>what happens next</h3><ol class="path" id="path">'+pathStep('done','heard',esc(heard))+pathStep(namedState,'named',esc(named))+pathStep(placedState,'placed',placed)+pathStep(confState,'confirmed',conf)+'</ol>';
}
/* 2026-11-17 (submit flow, slice 1): after a send the last step says where the answer stands, read from the
   candidate it was posted against: on a library clip (fingerprint_id) it sits on that clip and a reviewer checks
   it, with no clip it is a lead and nothing more. the old lines promised that another phone would close it and
   that the name would show on the scan after, which no single answer does. where is {clip, named}; a call
   without it reads as a lead. */
function sentLine(verdict,where){
  var clip=!!(where&&where.clip), named=!!(where&&where.named);
  if(verdict==='confirm')return clip?'your word is in. a reviewer checks it.':'your word is in, as a lead. this scan matched nothing in our library yet.';
  if(!clip)return 'logged as a lead. this scan matched nothing in our library yet.';
  return named?'on the record in our library. a reviewer checks it.':'on the ID in our library. a reviewer checks it.';
}
function markSent(verdict,where){
  var p=$('path');if(!p)return;var li=p.lastElementChild;if(!li)return;
  li.className='st-done';
  li.querySelector('.nt').textContent=sentLine(verdict,where);
}
/* 2026-11-17 (submit flow, slice 1): "that's right" shows only where there is a name to agree with. an unnamed
   library clip (no accepted_name and no named_by, whatever the headline reads: ID, or the upload's own title)
   gets one button that opens the name form. a NO MATCH guess at a named record keeps "it's actually..." alone.
   a POSSIBLE or better guess at a named record keeps both, as before.
   2026-11-17 (slice 1 review): "no accepted_name and no named_by" alone was the wrong test for the button. about
   a third of the library (546 of 1740 clips that day) shows a real title on the card with neither field: a claim
   an admin let in, or an engine guess of 70 and up. those cards lost "that's right" under a headline that named
   a record. so the one button is for a library card with nothing shown to agree with (noName): the headline
   reads ID, or the title is only the upload's own (title_from, or a raw reference line the page read itself).
   every other library card that shows a title keeps both buttons, as it had before this build. the chip and the
   row button still go by unnamedLib. */
function noName(c){
  if(!unnamedLib(c))return false;
  var nm=nameOf(c);
  return cardHead(c)==='ID'||c.title_from==='upload'||!!(nm&&nm.lib);
}
function answerKind(kind,cand){
  if(!cand)return 'none';
  var nm=nameOf(cand), shown=!!(nm&&(nm.title||nm.artist)&&!(nm.lib&&nm.title==='ID'));
  if(cand.fingerprint_id?noName(cand):!shown)return 'name';
  if(kind==='guess'&&cand.tier==='NO MATCH')return 'fix';
  return 'both';
}
function answerRow(kind,cand){
  var k=answerKind(kind,cand), m=kind==='match';
  if(k==='none')return '';
  if(k==='name')return (m?'<h3>know it?</h3>':'')+'<div class="row"><button class="btn'+(m?' red':'')+'" data-act="correct">'+(m?'name it':'know it? name it')+'</button></div>';
  return (m?'<h3>right?</h3>':'')+'<div class="row">'+(k==='both'?'<button class="btn'+(m?' red':'')+'" data-act="confirm">that\'s right</button>':'')+'<button class="btn" data-act="correct">it\'s actually...</button></div>';
}
function resultCard(cur){
  var c=cur.card, cand=c.candidate, out='';
  if(c.kind==='match'&&cand){
    var nm=nameOf(cand);
    out+=artBlock(cand);
    var lib=!!(nm&&nm.lib);
    var head=(!lib&&cand.headline)||(nm?(nm.title||nm.artist):'ID'), sub=(!lib&&cand.headline)?cand.subline:(nm&&nm.title?nm.artist:'');
    out+='<h2'+(head.length>42?' class="long"':'')+'>'+esc(head)+'</h2>';
    if(sub)out+='<p class="sub">'+esc(sub)+'</p>';
    if(lib&&head!=='ID')out+='<p class="ttl">'+esc(nm.note)+'</p>';
    /* 2026-11-17 (submit flow, slice 1): a title read off the clip's own upload is a lead, not a name. the card says so */
    /* 2026-11-17 (final read): title_from "upload" also marks a set cut whose caption is its tracklist row, where no
       upload named the track, so the line no longer says the upload calls it this. it says what is true of both */
    if(cand.title_from==='upload'&&head!=='ID')out+='<p class="note">the title came in with the clip. not confirmed.</p>';
    if(head==='ID'){
      var h0=(cand.heard_in||[])[0];
      out+='<p class="ttl">'+(h0?'heard in '+esc(h0.set_title)+' at '+esc(h0.at):'in our library, still unnamed')+'</p>';
    }
    if(cand.label&&cand.status==='out now')out+='<p class="lab">'+esc(cand.label)+(cand.release_date?' · '+esc(cand.release_date):'')+'</p>';
    out+='<p class="sure">'+sureLine(cand)+'</p>';
    out+=statusPill(cand.status);
    out+=trackRows(cand,cur);
    var links=storeRow(cand);
    out+='<div class="row" id="storerow">'+links+'<button class="btn" data-act="share">share</button></div>';
    out+='<div class="row" id="artistrow"></div>';
    out+=inSetRows(cur);
    out+=(cand.other_sets&&cand.other_sets.length)?'':heardRows(cand);
    out+='<div id="hear"></div>';
    out+=pathBlock(cur);
    out+=answeredOn(cur)?'':answerRow('match',cand);   /* 2026-11-17 (final read): answered already, nothing is offered twice */
    out+=correctionForm();
    out+=followRow(cand);
    if(sub)checkArtistPage(sub);else if(nm&&nm.artist)checkArtistPage(nm.artist);
  }else if(c.kind==='guess'&&cand){
    var g=nameOf(cand), placed=placedHead(cur);
    /* the tracklist already named the row at this spot: a guess under the bar that names something else
       folds away under its own line, the tracklist leads (G-MO, 2026-10-13). one that agrees shows as before */
    var other=!!placed&&!guessMatchesRow(g,cur.in_set.row);
    out+=placed||'<p class="kw"><b>no match</b></p><h2>nothing we\'re sure of.</h2><div class="row"><button class="btn red" data-act="listen">listen again</button></div><p class="note">best on a drop or a vocal.</p>';
    out+=inSetRows(cur);
    out+=(other?'<details class="guess"><summary class="kw">the catalog heard something else</summary>':'<div class="guess"><p class="kw">closest guess</p>')+'<p class="nm">'+(g?esc(g.artist)+(g.artist&&g.title?' - ':'')+esc(g.title):'an unnamed library entry')+'</p>'+(cand.title_from==='upload'&&g&&g.title?'<p class="pc">the title came in with the clip. not confirmed.</p>':'')+'<p class="pc">'+sureLine(cand)+'</p><div id="hear"></div>';
    out+=answerRow('guess',cand)+(other?'</details>':'</div>');
    out+=correctionForm();
    out+=followRow(cand);
    out+=pathBlock(cur);
    out+='<h3>help us find it?</h3><div class="row"><button class="btn" data-act="help">help us find it?</button><button class="btn ghost" data-act="again">no thanks, scan again</button></div>';
    out+=helpForm();
  }else{
    out+=placedHead(cur)||'<p class="kw"><b>no match</b></p><h2>nothing yet.</h2><div class="row"><button class="btn red" data-act="listen">listen again</button></div><p class="note">best on a drop or a vocal.</p>';
    out+=inSetRows(cur);
    out+=pathBlock(cur);
    out+='<h3>help us find it?</h3><div class="row"><button class="btn" data-act="help">help us find it?</button><button class="btn ghost" data-act="again">no thanks, scan again</button></div>';
    out+=helpForm();
    /* E6c (2026-10-28): a "nothing yet" card has nothing to follow until the clip is kept. the api kept the
       closest library entry's fingerprint on a NO MATCH row and "tell me when it drops" followed a record at
       18 (two live follows did). the slot fills after the keep lands (followAfterKeep), never before */
    out+='<div id="followslot"></div>';
  }
  /* the clip hit the rail for more than two percent of its samples (2026-10-13): it went up anyway, the card says so */
  if(cur.loud)out+='<p class="note">that one was loud and the clip clipped, so the answer may be rough.</p>';
  out+=timingLine(cur);
  out+=whereBlock();
  out+='<div class="msg" id="cardmsg" role="status"></div>';
  if(c.kind==='match')out+='<div class="row"><button class="btn ghost" data-act="again">scan again</button></div>';
  return out;
}
/* the card fills itself in (2026-10-11): when the server sends no cover or no store links, the phone asks
   spotify's embed service (with a spotify link) or apple's public search (with a name) for the cover and the
   apple link, deezer for a deezer link, and our own tracklists for a verified spotify link. "hear it in" lists
   the sets on the site where that track was played, with the link that opens the set at that second.
   everything is cached on the phone. nothing here identifies audio, it only dresses a result. */
var ART_KEY='gmx_art', tracksIdx=null;
function artCache(){try{return JSON.parse(localStorage.getItem(ART_KEY)||'{}')}catch(e){return {}}}
function artRemember(k,v,cand){if(!cand||isUnreleased(cand))return;try{var c=artCache();c[k]=v;var ks=Object.keys(c);while(ks.length>120){delete c[ks.shift()]}localStorage.setItem(ART_KEY,JSON.stringify(c))}catch(e){}}
function foldT(t){t=String(t||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase();t=t.replace(/\((?:extended|original|radio|club|edit|mix|remix|version|feat\.?|ft\.?)[^)]*\)/g,' ').replace(/\b(extended mix|original mix|radio edit|club mix)\b/g,' ');return t.replace(/[^a-z0-9]+/g,' ').trim()}
function jsonp(url,ms){return new Promise(function(res,rej){var cb='gmxcb'+Date.now()+Math.floor(Math.random()*1e4),sc=document.createElement('script'),t=setTimeout(function(){done();rej(new Error('timeout'))},ms||6000);
  function done(){clearTimeout(t);delete window[cb];if(sc.parentNode)sc.parentNode.removeChild(sc)}
  window[cb]=function(d){done();res(d)};sc.src=url+(url.indexOf('?')>-1?'&':'?')+'callback='+cb;sc.onerror=function(){done();rej(new Error('jsonp'))};document.head.appendChild(sc)})}
function tracks(){return tracksIdx?Promise.resolve(tracksIdx):fx('/tracks-index.json',{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(j){tracksIdx=j;return j}).catch(function(){return null})}
function sameTrack(q,row){return q&&row.q&&(row.q===q||(q.length>12&&(row.q.indexOf(q)>-1||q.indexOf(row.q)>-1)))}
/* the artist our tracklists give a title, for a card that has none (2026-11-17, see fromTracklists). a named row
   from the card's own set wins and is marked own; otherwise the most played name across the sets, as a lead */
function setPath(u){return String(u||'').replace(/^https?:\/\/[^\/]+/i,'').replace(/[?#].*$/,'').replace(/\.html$/i,'').replace(/\/+$/,'').toLowerCase()}
function inOwnSet(r,cur){var s=cur&&cur.in_set,a=s?setPath(s.page_url):'',b=r?setPath(r.u):'';return !!(a&&b&&a===b)}
function tracklistArtist(hits,cur){
  function named(r){var n=String(r.n||'').trim();return n&&n.indexOf(' - ')>0&&!/^id\s*-/i.test(n)?n:''}
  var own=(hits||[]).filter(function(r){return named(r)&&inOwnSet(r,cur)})[0], full='';
  if(own)full=named(own);
  else{var count={};(hits||[]).forEach(function(r){var n=named(r);if(n)count[n]=(count[n]||0)+1});full=Object.keys(count).sort(function(a,b){return count[b]-count[a]||b.length-a.length})[0]||''}
  if(!full)return null;
  return {own:!!own,who:full.split(' - ')[0].trim(),title:full.split(' - ').slice(1).join(' - ').trim()};
}
function enrich(cur){
  var c=cur&&cur.card&&cur.card.candidate; if(!c)return;
  var nm=nameOf(c); if(!nm||!(nm.title||nm.artist))return;
  var artist=nm.artist||'', title=nm.title||'', q=foldT(artist+' '+title), key=q||foldT(title);
  var cardEl=card, art=cardEl.querySelector('.art'), store=cardEl.querySelector('#storerow'), hearEl=cardEl.querySelector('#hear'), h2El=cardEl.querySelector('h2');
  var l=c.store_links||{};
  /* every late answer works on the card this call started on, never on whatever card shows now: the nodes are taken
     here, and a callback whose node left the page (a new card replaced it) does nothing. otherwise a released card's
     slow store answer lands on the unreleased card that followed it and links its title to the old song. */
  /* an unreleased card carries no link to the song, ever (G-MO, 2026-09-27): no store button, no store cover, no store
     search. the same title on a released original must not leak its links onto an edit that is not out: foldT drops
     "(extended mix)", so the original and the edit share one gmx_art key. an unreleased card returns before the cache
     read, any addBtn and any titleLink, and only fills "hear it in" (set links) from our tracklists. */
  var unreleased=isUnreleased(c);
  function setArt(url){url=safeUrl(url);if(unreleased||!art||!art.isConnected||!url||art.getAttribute('data-done'))return;art.setAttribute('data-done','1');var img=document.createElement('img');img.alt='';img.loading='lazy';img.onload=function(){img.classList.add('in');art.classList.add('found')};img.onerror=function(){img.remove()};img.src=url;art.innerHTML='';art.appendChild(img)}
  function addBtn(href,label,cls){if(unreleased||!store||!store.isConnected)return;href=safeUrl(href);if(!store||!href||store.querySelector('a[href="'+href+'"]'))return;var a=document.createElement('a');a.className='btn'+(cls?' '+cls:'');a.href=href;a.target='_blank';a.rel='noopener';a.textContent=label;var share=store.querySelector('[data-act="share"]');store.insertBefore(a,share||null);titleLink()}
  function titleLink(){
    if(unreleased)return;
    var h=h2El;if(!h||!h.isConnected||h.querySelector('a'))return;
    var best=['open.spotify.com','music.apple.com','deezer.com','soundcloud.com','beatport.com'].map(function(d){var a=store&&store.querySelector('a.btn:not(.find)[href*="'+d+'"]');return a&&a.href}).filter(Boolean)[0];
    if(!best)return;var a=document.createElement('a');a.className='listen';a.href=best;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','listen to '+h.textContent);a.textContent=h.textContent;h.innerHTML='';h.appendChild(a);
  }
  if(unreleased){fromTracklists();return}
  titleLink();
  var cached=artCache()[key];
  if(cached){if(cached.img&&!c.artwork_url)setArt(cached.img);if(cached.ap)addBtn(cached.ap,'apple music');if(cached.dz)addBtn(cached.dz,'deezer');if(cached.sp&&!l.spotify)addBtn(cached.sp,'spotify')}
  fromTracklists();
  /* 1. our own tracklists: a verified spotify link, and the sets where it was played */
  function fromTracklists(){tracks().then(function(j){
    if(!j||!h2El||!h2El.isConnected)return;var hits=j.rows.filter(function(r){return sameTrack(q,r)||(title&&foldT(title).length>8&&r.q.indexOf(foldT(title))>-1&&(!artist||r.q.indexOf(foldT(artist).split(' ')[0])>-1))}).slice(0,6);
    if(!hits.length)return;
    var sp=hits.map(function(r){return r.links&&r.links.sp}).filter(Boolean)[0];
    if(sp&&!l.spotify&&!unreleased){addBtn(sp,'spotify');artRemember(key,Object.assign(artCache()[key]||{},{sp:sp}),c)}
    /* no artist on the card, but our tracklists name the record: take their name whole, artist and the full title
       with its edit credit (G-MO, 2026-10-11: "Whisper To Me (Assaf Michael & Reef Kopel Edit)", not just the
       caption), say so, and link the profile when there is one. the most played name across the sets wins. */
    /* 2026-11-17 (submit flow, slice 1): with no artist on the card every row here matched on the title alone, and
       a title is not proof of who made it (two records share a title all the time). so the tracklists' artist is
       worded as a lead under the headline and never becomes the artist line or a profile link. the one exception
       is a row from the card's own set, the set this scan was placed in (in_set.page_url against the row's page):
       there the tracklist is talking about this very spot, and the card takes the name as it did before. only on
       the match layout: a guess card has no headline of its own to hang an artist on. */
    if(!artist&&title&&!(nm.lib&&title==='ID')&&cur.card.kind==='match'&&!cardEl.querySelector('.sub')&&!cardEl.querySelector('#tlead')){
      var lead=tracklistArtist(hits,cur);
      if(lead&&lead.own){
        var who=lead.who,ttlName=lead.title;
        var h2=h2El,sub=document.createElement('p');sub.className='sub';sub.textContent=who;
        if(h2){if(nm.lib&&ttlName&&foldT(ttlName).indexOf(foldT(title))>-1){h2.textContent=ttlName;h2.classList.toggle('long',ttlName.length>42)}h2.insertAdjacentElement('afterend',sub)}
        var t=cardEl.querySelector('.ttl');if(t&&/no artist named yet/.test(t.textContent))t.textContent=t.textContent.replace('no artist named yet','named in our tracklists');
        checkArtistPage(who);
      }else if(lead&&h2El){
        var lp=document.createElement('p'),lb=document.createElement('b');lp.className='note';lp.id='tlead';
        lp.appendChild(document.createTextNode('our tracklists list a record with this title by '));
        lb.setAttribute('translate','no');lb.textContent=lead.who;lp.appendChild(lb);
        var sure=cardEl.querySelector('.sure');
        if(sure&&sure.parentNode)sure.parentNode.insertBefore(lp,sure);else h2El.insertAdjacentElement('afterend',lp);
      }
    }
    if(hearEl&&!hearEl.children.length){
      hearEl.innerHTML='<h3>hear it in</h3><ul class="heard hear">'+hits.map(function(r){var rl=safeUrl(r.l),ru=safeUrl(r.u);var play=rl?'<a href="'+esc(rl)+'" target="_blank" rel="noopener">play from '+esc(r.at)+' ↗</a>':esc(r.at);return '<li><a href="'+esc(ru)+'">'+esc(r.set)+'<small>'+esc(r.n)+(r.lab?' · '+esc(r.lab):'')+'</small></a><span class="at">'+play+'</span></li>'}).join('')+'</ul>';
    }
  });}
  if(unreleased||(c.artwork_url&&l.spotify&&l.apple))return;
  /* 2. spotify's embed service gives the cover for a spotify link, no key needed */
  var viaSpotify=l.spotify?fx('https://open.spotify.com/oembed?url='+encodeURIComponent(l.spotify),{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.thumbnail_url&&!c.artwork_url){setArt(j.thumbnail_url);artRemember(key,Object.assign(artCache()[key]||{},{img:j.thumbnail_url}),c)}}).catch(function(){}):Promise.resolve();
  /* 3. apple's public search: the cover at 600px and the apple music link, matched on the folded name */
  if(!(cached&&cached.ap)&&(artist||title)){
    fx('https://itunes.apple.com/search?media=music&entity=song&limit=6&term='+encodeURIComponent((artist+' '+title).trim()),{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(j){
      var hit=(j&&j.results||[]).filter(function(x){var fq=foldT((x.artistName||'')+' '+(x.trackName||''));return fq===q||(q.length>12&&(fq.indexOf(foldT(title))>-1&&fq.indexOf(foldT(artist).split(' ')[0])>-1))})[0];
      if(!hit)return;var img=(hit.artworkUrl100||'').replace(/100x100bb/,'600x600bb');
      if(img&&!c.artwork_url)setArt(img);if(hit.trackViewUrl&&!l.apple)addBtn(hit.trackViewUrl,'apple music');
      artRemember(key,Object.assign(artCache()[key]||{},{img:img||undefined,ap:hit.trackViewUrl}),c);
    }).catch(function(){});
  }
  /* 4. deezer, through jsonp since its api has no cors */
  if(!(cached&&cached.dz)&&(artist||title)){
    jsonp('https://api.deezer.com/search?limit=5&output=jsonp&q='+encodeURIComponent((artist+' '+title).trim()),6000).then(function(j){
      var hit=(j&&j.data||[]).filter(function(x){var fq=foldT((x.artist&&x.artist.name||'')+' '+(x.title||''));return fq===q||(q.length>12&&fq.indexOf(foldT(title))>-1)})[0];
      if(!hit)return;addBtn(hit.link,'deezer');if(hit.album&&hit.album.cover_big&&!c.artwork_url)setArt(hit.album.cover_big);
      artRemember(key,Object.assign(artCache()[key]||{},{dz:hit.link}),c);
    }).catch(function(){});
  }
  /* 5. last resort when a released track has no real link: a search on each store */
  viaSpotify.then(function(){setTimeout(function(){
    if(!store||!store.isConnected||c.status!=='out now')return;var qs=encodeURIComponent((artist+' '+title).trim());
    if(!store.querySelector('a[href*="open.spotify.com"]'))addBtn('https://open.spotify.com/search/'+qs,'find on spotify','find');
    if(!store.querySelector('a[href*="soundcloud.com"]'))addBtn('https://soundcloud.com/search?q='+qs,'find on soundcloud','find');
    if(!store.querySelector('a[href*="beatport.com"]')&&!l.beatport_search)addBtn('https://www.beatport.com/search?q='+qs,'find on beatport','find');
  },2500)});
}
function timingLine(cur){
  var t=cur.timing;if(!t||!t.rounds.length)return '';
  var secs=function(ms){return (Math.round(ms/100)/10)+' s'};
  var found=t.first?'<b>found in '+secs(t.first)+'</b>':'<b>'+secs(Date.now()-t.t0)+' end to end</b>';
  var parts=t.rounds.filter(function(r){return r.post||r.wait}).map(function(r){return (r.at/1000)+' s: up '+secs(r.post)+', match '+secs(r.wait)+(r.catalog==='off'?', catalog off':'')});
  return '<p class="timing">'+found+(parts.length?' · '+parts.join(' · '):'')+'</p>';
}
/* the name fields, shared by the card's form (ids c-...) and the form under a row in recent scans (ids n-...) */
function nameFields(p){
  return '<label for="'+p+'-artist">artist</label><input id="'+p+'-artist" name="artist_claim" maxlength="255">'+
    '<label for="'+p+'-title">title</label><input id="'+p+'-title" name="title_claim" maxlength="512">'+
    '<label for="'+p+'-url">a link that proves it (optional)</label><input id="'+p+'-url" name="source_url" inputmode="url" maxlength="1024" placeholder="https://">'+
    '<label for="'+p+'-ig">your instagram (optional)</label><input id="'+p+'-ig" name="ig_handle" maxlength="64" placeholder="@">'+
    '<label for="'+p+'-note">anything else</label><textarea id="'+p+'-note" name="note" maxlength="1000"></textarea>'+
    '<div class="hp" aria-hidden="true"><label for="'+p+'-web">website</label><input id="'+p+'-web" name="website" tabindex="-1" autocomplete="off"></div>';
}
function correctionForm(){
  return '<form class="form" id="cform" autocomplete="off"><div id="cprev"></div>'+nameFields('c')+
    '<div class="row"><button class="btn red" type="submit">send the fix</button><button class="btn ghost" type="button" data-act="closeform">never mind</button></div>'+
    (sessionToken()?'':'<p class="smeta">get credit for this: <a href="#you">sign in</a> and your handle goes on the IDs you help name.</p>')+'</form>';
}
/* 2026-11-17 (submit flow, slice 1): opening the name form. the chip for the scan before is drawn here, at the
   tap, so its age and its default are true at that moment (see prevOffer). on a card whose title was read off the
   upload the title box starts with that title and the cursor waits in the artist box: the title is on the card
   already, the artist is the part nobody has. the artist is never filled in for anyone. quiet (a redraw putting
   an open form back) leaves the cursor alone. */
function uploadTitle(c){var t=String((c&&(c.title_claim||c.headline))||'').trim();return c&&c.title_from==='upload'&&t&&t!=='ID'?t:''}
function openForm(quiet){
  var f=$('cform'); if(!f)return;
  var c=current&&current.card&&current.card.candidate, was=f.classList.contains('on');
  f.classList.add('on');
  if(!was){
    var slot=$('cprev'), o=prevOffer(c,lastLib,Date.now(),scanLive);
    if(slot)slot.innerHTML=o?prevChipHtml(o,lastLib):'';
    /* 2026-11-17 (final read): the title is filled in once per card. data-pre already on the form means it was
       filled before and the person changed or cleared it (formsRestore carries the mark over a redraw), so it
       is not filled in again */
    var ti=$('c-title'), ut=uploadTitle(c);
    if(ti&&ut&&!ti.value&&f.getAttribute('data-pre')==null){ti.value=ut;f.setAttribute('data-pre',ut)}
    prevFill(!!(o&&o.pressed));
  }
  if(!quiet){var a=$('c-artist');if(a)a.focus()}
}
function helpForm(){
  return '<form class="form" id="hform" autocomplete="off"><label for="h-venue">venue or event</label><input id="h-venue" name="venue_claim" maxlength="255">'+
    '<label for="h-dj">who was playing</label><input id="h-dj" name="dj_claim" maxlength="255">'+
    '<label for="h-city">city</label><input id="h-city" name="city_claim" maxlength="255">'+
    '<label for="h-note">anything else</label><textarea id="h-note" name="note" maxlength="1000"></textarea>'+
    '<div class="row"><button class="btn red" type="submit">keep the clip</button><button class="btn ghost" type="button" data-act="closeform">never mind</button></div></form>';
}
/* "where are you hearing this?" (phase 8 step 5, design DECISIONS 3, C and D): one optional
   tap under any result, never before it. a set chip can carry the link and an @handle, and
   re-sends this clip once so the server can find the spot in the set. the tap is the consent.
   the server matches it and deletes it. nothing here publishes anything. */
var HINT_CHIPS=[['youtube_set','youtube set'],['soundcloud_set','soundcloud set'],['club','club'],['radio','radio'],['other','other']];
var hintChip=null, sharedLink=null;
function isSetChip(ch){return ch==='youtube_set'||ch==='soundcloud_set'}
function whereBlock(){
  var chips=HINT_CHIPS.map(function(c){return '<button class="btn" type="button" data-chip="'+c[0]+'" aria-pressed="false">'+c[1]+'</button>'}).join('');
  return '<div class="where"><div class="row"><button class="btn ghost" data-act="where">where are you hearing this?</button></div>'+
    '<form class="form" id="wform" autocomplete="off"><div class="row" id="wchips">'+chips+'</div>'+
    '<div id="wset" hidden><label for="w-link">the set\'s link</label><input id="w-link" name="link" inputmode="url" maxlength="1024" placeholder="https://">'+
    '<label for="w-handle">@handle for credit (optional)</label><input id="w-handle" name="handle" maxlength="31" placeholder="@">'+
    '<p class="note">we send this clip once more to find the spot in the set, then delete it.</p></div>'+
    '<div class="row"><button class="btn red" type="submit">send</button><button class="btn ghost" type="button" data-act="closeform">never mind</button></div></form></div>';
}
function pickChip(ch){
  hintChip=ch;
  var bs=card.querySelectorAll('[data-chip]');
  for(var i=0;i<bs.length;i++){var on=bs[i].getAttribute('data-chip')===ch;bs[i].classList.toggle('on',on);bs[i].setAttribute('aria-pressed',on?'true':'false')}
  var w=$('wset'); if(w)w.hidden=!isSetChip(ch);
  if(isSetChip(ch)&&$('w-link')&&!$('w-link').value)$('w-link').focus();
}
function openWhere(){
  var f=$('wform'); if(!f)return;
  f.classList.add('on'); hintChip=null;
  var known=current&&current.in_set&&current.in_set.deep_link;   /* the scan already found the set: only the @ is left */
  var pre=sharedLink||known;
  if(pre){ $('w-link').value=pre; pickChip(/soundcloud\.com/i.test(pre)?'soundcloud_set':'youtube_set') }
}
function sendHint(f){
  if(!current){say('nothing to tag.');return}
  if(!hintChip){say('pick one first.');return}
  var set=isSetChip(hintChip), link=set?f.link.value.trim():'', handle=set?f.handle.value.trim():'';
  if(link&&!/^https:\/\//i.test(link)){say('paste the whole link, starting with https://');return}
  var fd=new FormData();
  fd.append('recognition_id',current.hint_ref||current.recognition_id); fd.append('chip',hintChip);
  if(link)fd.append('link',link); if(handle)fd.append('handle',handle);
  /* the clip goes once more only when the scan did not already place itself in a set */
  if(set&&heldBlob&&!current.in_set)fd.append('audio',heldBlob,'clip.'+extOf(heldBlob));
  say('sending');
  fx(cfg.api_base+'/set-hint',{method:'POST',headers:headers(),body:fd},POST_MS)
  .then(function(r){
    if(r.status===409){say('this phone already tagged that scan.');return}
    if(r.status===410){say('that scan is too old to tag. scan again.');return}
    if(r.status===422){say('that link did not look right. a youtube or soundcloud set, starting with https://');return}
    if(r.status===429){say('too many this hour, try later.');return}
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(j){
      var s=j.status;
      say(s==='placed'||s==='already_placed'?'got it. that helps us tag the set. appreciate you.'
        :s==='not_in_index'||s==='no_audio'?'got it. we will look at that set. appreciate you.'
        :s==='no_match'?'got it. we could not line it up with that set this time. appreciate you anyway.'
        :'noted. appreciate you.',true);
      f.classList.remove('on'); sharedLink=null; showShared();
    });
  }).catch(function(){say('did not send. check your signal and try again.')});
}
/* android: "share to groovesMAXXING" from youtube or soundcloud lands here as ?text= or ?url=.
   the link waits on this phone until the next result. iphone can't share into a web app, so
   there it's paste. */
var sharedNone=false;
function showShared(){var p=$('shared');if(!p)return;if(sharedLink){p.textContent='set link ready. scan, then tag it under the result.';p.hidden=false}else if(sharedNone){sharedNone=false;p.textContent='only youtube and soundcloud set links can be tagged for now.';p.hidden=false}else{p.hidden=true}}
(function(){
  try{
    /* the share target (2026-11-09 review): every https link in the share is read, the first youtube or soundcloud one
       wins, trailing punctuation and quotes are cut off. a share with no set link says so instead of going quiet */
    var q=new URLSearchParams(location.search), all=[q.get('url'),q.get('text'),q.get('title')].join(' ');
    var links=(all.match(/https:\/\/[^\s"'<>]+/g)||[]).map(function(u){return u.replace(/[)\].,;:!?]+$/,'')});
    var hit=links.filter(function(u){return /^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be|soundcloud\.com)\//i.test(u)})[0];
    if(hit){sharedLink=hit;history.replaceState(null,'',location.pathname)}
    else if(all.trim()){sharedNone=true;history.replaceState(null,'',location.pathname)}
  }catch(e){}
  showShared();
})();
var slugIndex=null;
function checkArtistPage(artist){
  var s=slug(artist); if(!s)return;
  function show(){
    var row=$('artistrow');if(row)row.innerHTML='<a class="btn" href="/artists/'+s+'">'+esc(artist)+' on groovesmaxxing →</a>';
    /* the artist line itself becomes the link to the profile */
    var sub=card.querySelector('.sub');if(sub&&!sub.querySelector('a')){var a=document.createElement('a');a.href='/artists/'+s;a.className='sublink';a.textContent=sub.textContent;sub.innerHTML='';sub.appendChild(a)}
  }
  function probe(){fx('/artists/'+s+'.html',{method:'HEAD'},GET_MS).then(function(r){if(r.ok)show()}).catch(function(){})}
  var idx=slugIndex||(slugIndex=fx('/artists-index.json',{},GET_MS).then(function(r){return r.ok?r.json():null}).catch(function(){return null}));
  idx.then(function(j){ if(j&&j.slugs){ if(j.slugs.indexOf(s)>-1)show(); } else probe(); });   /* no index on this build: the old probe */
}
function say(text,ok){var m=$('cardmsg');if(!m)return;m.textContent=text;m.className='msg'+(ok?' ok':'')}

/* actions */
card.addEventListener('click',function(ev){
  var ch=ev.target.closest('[data-chip]'); if(ch){pickChip(ch.getAttribute('data-chip'));return}
  var pv=ev.target.closest('[data-prev]'); if(pv){togglePrev(pv);return}
  var b=ev.target.closest('[data-act]'); if(!b)return;
  var act=b.getAttribute('data-act');
  if(act==='where'){openWhere();return}
  if(act==='again'){card.classList.remove('on');card.innerHTML='';dropBlob();keepLast();current=null;window.scrollTo({top:0,behavior:SM()});return}
  if(act==='resend'){
    /* the same clip as a new post, the way a kept clip's scan again posts it (recentlist below) */
    if(busy)return; if(!heldBlob){showCard(errCard('the clip is gone. scan again.'));return}
    busy=true; card.classList.remove('on'); current=null;
    scanSeq++; early=null; finalDone=false; rateHit=false; timing={t0:Date.now(),rounds:[],first:null};
    go.classList.add('busy'); window.scrollTo({top:0,behavior:SM()}); identify(heldBlob); return;
  }
if(act==='listen'){card.classList.remove('on');card.innerHTML='';dropBlob();keepLast();current=null;window.scrollTo({top:0,behavior:SM()});startScan();return}
  if(act==='share'){share();return}
  if(act==='confirm'){sendCorrection({verdict:'confirm'});return}
  if(act==='follow'){followNow(b);return}
  if(act==='correct'){openForm();return}
  if(act==='help'){var h=$('hform');if(h){h.classList.add('on');$('h-venue').focus()}return}
  if(act==='closeform'){var fm=b.closest('form');if(fm)fm.classList.remove('on');return}
});
card.addEventListener('submit',function(ev){
  ev.preventDefault();
  var f=ev.target;
  if(f.id==='cform'){
    var body=answerBody(f);
    if(typeof body==='string'){say(body);return}
    sendCorrection(body);
  }else if(f.id==='hform'){
    sendHelp(f);
  }else if(f.id==='wform'){
    sendHint(f);
  }
});
/* 2026-11-17 (submit flow, slice 1): one reader and one poster for a name, used by the card's form and by the
   form under a row in recent scans. the reader checks what the phone can check before anything is sent: an artist
   or a title, and a link that starts with http:// or https:// (the api refuses any other, and that used to come
   back as "check your signal"). a string back from answerBody is the line to show, an object is the body.
   the poster turns the api's answer into a code and answerLine into one of the page's own lines: a refusal is the
   app saying no, never the network, and the page never prints the api's words. only a dead link, a timeout or a
   5xx keeps the signal line. a 422 is read just far enough to tell a link problem from a handle problem. */
function answerBody(f){
  var a=f.artist_claim.value.trim(), t=f.title_claim.value.trim(), link=f.source_url.value.trim();
  if(!a&&!t)return 'an artist or a title, at least one.';
  if(link&&!/^https?:\/\//i.test(link))return 'that link needs https://';
  /* 2026-11-17 (final read): a keyboard that capitalises the first letter writes "Https://". the check above lets
     it through and the api's does not (it reads the scheme in lower case only), so the scheme goes up in lower case */
  link=link.replace(/^https?:\/\//i,function(m){return m.toLowerCase()});
  return {verdict:'correct',artist_claim:a||null,title_claim:t||null,source_url:link||null,
    ig_handle:f.ig_handle.value.trim()||null,note:f.note.value.trim()||null,website:f.website.value||''};
}
var ANSWER_LINES={dup:'this phone already answered for this one.',rate:'too many this hour, try later.',phone:'that scan was made on another phone.',
  gone:'that scan is gone. scan again.',link:'that link needs https://',handle:'that instagram handle does not look right.',
  typed:'the app did not take that. check what you typed.',net:'did not send. check your signal and try again.'};
function answerLine(code){return ANSWER_LINES[code]||ANSWER_LINES.net}
function refusalCode(r){
  var s=r.status;
  if(s===409)return 'dup';
  if(s===429)return 'rate';
  if(s===403)return 'phone';
  if(s===404)return 'gone';
  if(s!==422)return 'net';
  return r.json().then(function(j){
    var d=j&&j.detail, t=typeof d==='string'?d:JSON.stringify(d||'');
    return /source_url/.test(t)?'link':/ig_handle/.test(t)?'handle':'typed';
  },function(){return 'typed'});
}
function postAnswer(body,done){
  if(!cfg){done('net');return}
  fx(cfg.api_base+'/corrections',{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify(body)},POST_MS)
  .then(function(r){return r.ok?'ok':refusalCode(r)})
  .then(function(code){return code},function(){return 'net'})
  .then(done);
}
/* what the phone said, kept short for the row in recent scans */
function answerSays(body){var a=body.artist_claim||'',t=body.title_claim||'';return (a&&t?a+' - '+t:(t||a)).slice(0,160)}
/* the answer's target, worked out before the post (2026-11-17). prev is lastLib when the chip is pressed: the
   body then carries that scan's id and for_previous_scan, the flag the api reads to keep such an answer from ever
   being accepted on its own. "that's right" is always about the card on screen. where feeds sentLine. */
function answerTarget(body,cur,prev){
  var cand=cur&&cur.card&&cur.card.candidate||null;
  if(prev&&body.verdict==='correct'){
    body.recognition_id=prev.rid; body.for_previous_scan=true;
    return {rid:prev.rid,prev:true,clip:true,named:false};
  }
  body.recognition_id=cur.recognition_id;
  /* named: the card showed a record's name, not ID and not just the upload's title (noName), so the line after
     the send never says "the ID" about a card that named a record (2026-11-17, slice 1 review) */
  var w=cardWhere(cand);
  return {rid:cur.recognition_id,prev:false,clip:w.clip,named:w.named};
}
function sendCorrection(body){
  if(!current){say('nothing to answer for.');return}
  var cur=current, seq=scanSeq, to=answerTarget(body,cur,prevPressed()?lastLib:null);
  say('sending');
  postAnswer(body,function(code){
    if(code==='dup')markAnswered(to.rid,null);
    else if(code==='ok')markAnswered(to.rid,body);
    if(current!==cur&&seq!==scanSeq)return;   /* another scan took the card while this was in the air */
    /* the chip goes once its scan is answered, or the api says that scan cannot be answered from this phone */
    if(to.prev&&/^(ok|dup|phone|gone)$/.test(code)){if(lastLib&&lastLib.rid===to.rid)lastLib=null;var slot=$('cprev');if(slot)slot.innerHTML='';prevFill(false)}
    if(code!=='ok'){say(answerLine(code));return}
    if(to.prev){
      say('logged on the ID we caught before. a reviewer checks it. appreciate you.',true);
    }else{
      say(body.verdict==='confirm'?'logged. appreciate you.':'logged, we will check it. appreciate you.',true);
      if(current===cur)markSent(body.verdict,to);
    }
    var f=$('cform');if(f)f.classList.remove('on');
  });
}
/* an answered scan is marked on its row in recent scans and remembered for this visit, so the chip and the row's
   own button are not offered for it again. body is null for a 409: the phone answered it before, what it said is
   not known here. a scan answered on its early card has no row yet; remember() picks the mark up from answeredRids. */
function markAnswered(rid,body){
  if(!rid)return;
  var a={at:Date.now()};
  if(body){a.v=body.verdict;var says=body.verdict==='correct'?answerSays(body):'';if(says)a.says=says}
  if(!answeredRids[rid]||body)answeredRids[rid]=a;
  var h=loadHistory(), hit=false;
  for(var i=0;i<h.length;i++){if(h[i].rid===rid&&(!h[i].answered||body)){h[i].answered=answeredRids[rid];hit=true}}
  if(!hit)return;
  try{localStorage.setItem('gmx_history',JSON.stringify(h))}catch(e){}
  renderHistory();
}
function sendHelp(f){
  if(!current||!heldBlob){say('the clip is gone, scan again first.');return}
  var ext=extOf(heldBlob);
  var fd=new FormData();
  fd.append('kind','mic_capture_optin'); fd.append('door','user'); fd.append('audio',heldBlob,'clip.'+ext);
  fd.append('recognition_id',current.recognition_id); if(heldAt)fd.append('heard_at',heldAt);
  ['venue_claim','dj_claim','city_claim','note'].forEach(function(k){var v=f[k].value.trim();if(v)fd.append(k,v)});
  say('keeping it');
  var jid=current.job_id;
  fx(cfg.api_base+'/contribute',{method:'POST',headers:headers(),body:fd},POST_MS)
  .then(function(r){
    if(r.status===429){say('too many this hour, try later.');return}
    if(r.status>=400&&r.status<500)return refusal(r).then(function(x){say(refusedLine(x));markRow(jid,x)});
    if(!r.ok)throw new Error(r.status);
    say('kept. we keep hunting. gone the day we find it, or after 12 months.',true);
    markRow(jid,null); f.classList.remove('on'); dropBlob(); followAfterKeep(jid);
  }).catch(function(){say('did not send. check your signal and try again.')});
}
/* a refused keep (2026-10-16, the club space test): every keep came back 422 from 10-11 to 10-16 because the page
   sent no door, and the page said "check your signal", so it read as bad reception and nobody looked. a 4xx is the
   app saying no, not the network: the line names the status and the api's reason, the clip stays held so a fixed
   page or a second try can still send it, and the row in the list carries the status and the reason. a 5xx or a
   dead link keeps the retry wording. */
function refusal(r){
  return r.json().then(function(j){
    var d=j&&j.detail;
    if(Array.isArray(d))d=d.map(function(x){return (x&&x.msg)||''}).join('; ');
    else if(d&&typeof d==='object')d=d.message||'';
    return String(d||'');
  },function(){return ''}).then(function(d){return {status:r.status,detail:d.slice(0,160)}});
}
function refusedLine(x){return 'the app refused it ('+x.status+(x.detail?': '+x.detail:'')+'). the clip stays on this phone.'}
/* the status rides on the scan's row: x is {status,detail} for a refusal, null clears it once a send lands */
function markRow(id,x,quiet){
  if(!id)return;
  var h=loadHistory();
  for(var i=0;i<h.length;i++){if(h[i].id===id){if(x)h[i].sent={status:x.status,detail:x.detail,at:Date.now()};else{delete h[i].sent;h[i].kept=true}break}}
  try{localStorage.setItem('gmx_history',JSON.stringify(h))}catch(e){}
  if(!quiet)renderHistory();   /* the row's own buttons pass quiet, so the note they are writing is not wiped */
}
/* the share (2026-11-09 review): our own tracklist page leads when the scan found one, then the record's own
   store page, then /scan. never a store search page. a card led by the tracklist row shares that row. */
function absUrl(u){u=safeUrl(u);if(!u)return '';return /^https?:\/\//i.test(u)?u:'https://groovesmaxxing.com'+(u.charAt(0)==='/'?'':'/')+u}
function share(){
  if(!current||!current.card)return;
  var k=current.card.kind, c=current.card.candidate||null, s=current.in_set||null, nm=c?nameOf(c):null, l=c?cleanLinks(c.store_links):{};
  var h0=c?((c.other_sets||[])[0]||(c.heard_in||[])[0]||null):null;
  var row=s&&s.row&&!/^\s*id\s*-\s*id\s*$/i.test(s.row)?String(s.row):'';
  var what=(k==='match'&&nm&&(nm.title||nm.artist))?(nm.artist&&nm.title?nm.artist+' - ':(nm.artist||''))+(nm.title||''):(row||'an unreleased ID');
  var at=(s&&s.set_title)?' · heard in '+s.set_title+(s.at?' at '+s.at:''):(h0&&h0.set_title?' · heard in '+h0.set_title+(h0.at?' at '+h0.at:''):'');
  var text=what+at+' · found with the groovesMAXXING scan';
  var url=absUrl(s&&s.page_url)||absUrl(h0&&h0.page_url)||(k==='match'?(l.spotify||l.apple):'')||'https://groovesmaxxing.com/scan';
  if(isUnreleased(c))url='https://groovesmaxxing.com/scan';   /* an unreleased track shares the scan page only, never the song */
  if(window.gmxSheet&&typeof gmxSheet.share==='function'){gmxSheet.share({title:'groovesMAXXING',text:text,url:url});return}
  if(navigator.share){navigator.share({title:'groovesMAXXING',text:text,url:url}).catch(function(){});return}
  if(navigator.clipboard){navigator.clipboard.writeText(text+' '+url).then(function(){say('copied.',true)},function(){say(url)});return}
  say(url);
}

/* history, on the phone only */
function loadHistory(){try{return JSON.parse(localStorage.getItem('gmx_history')||'[]')}catch(e){return []}}
function remember(cur,keep){
  var c=cur.card, cand=c.candidate, nm=cand?nameOf(cand):null;
  var row={t:draining?draining.t:Date.now(),kind:c.kind,artist:nm?nm.artist:'',title:nm?nm.title:'',score:cand&&cand.shown_score!=null?cand.shown_score:null,status:cand?cand.status:'',unreleased:isUnreleased(cand)||undefined,id:cur.job_id,rid:cur.recognition_id,clip:!!keep,secs:cur.timing&&cur.timing.first?Math.round(cur.timing.first/100)/10:null};
  /* 2026-11-17 (submit flow, slice 1): what the row needs to offer "name it" later: a library clip was behind the
     scan (fp), at which tier, and it had no name (unnamed). answered is set by markAnswered. a row from before
     this build has none of them and gets no button. */
  if(cand){if(cand.fingerprint_id)row.fp=1;if(cand.tier)row.tier=cand.tier;if(unnamedLib(cand))row.unnamed=1}
  if(cur.recognition_id&&answeredRids[cur.recognition_id])row.answered=answeredRids[cur.recognition_id];
  var h=loadHistory(); h.unshift(row); h=h.slice(0,HISTORY_MAX);
  try{localStorage.setItem('gmx_history',JSON.stringify(h))}catch(e){}
  renderHistory();
  onScanEnd(cur,row);
}
function when(t){
  var d=new Date(t), n=new Date(), s=(n-d)/1000;
  if(s<60)return 'just now'; if(s<3600)return Math.floor(s/60)+' min ago'; if(s<86400)return Math.floor(s/3600)+' h ago';
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}).toLowerCase();
}
/* 2026-11-17 (submit flow, slice 1): a scan can be answered after its card is gone. a row that was an unnamed
   library match at LIKELY or CONFIRMED, not answered yet and under a day old, carries a "name it" button that
   opens the name form under it (openRowForm). an answered row says what this phone answered. the button shows
   nothing but its own two words: the row above it is what the card already showed. */
function rowNameable(r,now){
  return !!(r&&r.rid&&r.fp&&r.unnamed&&(r.tier==='LIKELY'||r.tier==='CONFIRMED')&&!r.answered&&!answeredRids[r.rid]&&now-r.t>=0&&now-r.t<NAME_ROW_MS);
}
function answeredLine(a){
  if(!a)return '';
  if(a.v==='correct'&&a.says)return '<small>you answered: <span translate="no">'+esc(a.says)+'</span></small>';
  return '<small>'+(a.v==='confirm'?'you said that’s right':'you answered this one')+'</small>';
}
function historyRow(rid){var h=loadHistory();for(var i=0;i<h.length;i++){if(h[i].rid===rid)return h[i]}return null}
function renderHistory(){
  var h=loadHistory();
  var mn=$('micnote');if(mn)mn.hidden=!!h.length;   /* the mic line shows until the first scan lands */
  if(!h.length){recentlist.innerHTML='<li class="none">nothing scanned yet.</li>';return}
  var open=null;try{open=rowFormState()}catch(e){}
  recentlist.innerHTML=h.map(function(r,i){
    var who;
    if(r.kind==='match')who='<span data-artist="'+esc(r.artist||'')+'">'+esc(r.artist||'ID')+'</span><small>'+esc(r.title||'unnamed library entry')+(r.score==null?'':' · '+pct(r.score))+(r.secs?' · '+r.secs+' s':'')+'</small>';
    else if(r.kind==='guess')who='no match<small>closest guess: '+esc((r.artist?r.artist+' - ':'')+r.title)+(r.score==null?' · possible match':' · '+pct(r.score))+'</small>';
    else who='no match<small>nothing yet</small>';
    if(r.sent&&r.sent.status)who+='<small>not kept, the app refused it ('+esc(String(r.sent.status))+(r.sent.detail?': '+esc(r.sent.detail):'')+')</small>';
    who+=answeredLine(r.answered||(r.rid&&answeredRids[r.rid]));
    var acts='', btns='';
    if(rowNameable(r,Date.now()))btns+='<button class="btn" data-name="'+esc(r.rid)+'">name it</button>';
    if(r.clip&&r.id)btns+='<button class="btn" data-clip="again" data-id="'+esc(r.id)+'">scan again</button>'+(r.kind!=='match'?'<button class="btn" data-clip="help" data-id="'+esc(r.id)+'">help us find it</button>':'');
    /* E6c: a no-match row can follow only the clip it kept (r.kept, set by markRow when a keep lands) */
    if(r.rid&&r.status!=='out now'&&(r.kind==='match'||r.kind==='guess'||r.kept))btns+='<button class="btn ghost" data-follow="'+esc(r.rid)+'">tell me when it drops</button>';
    /* a named match finds its way back the next day (2026-11-09 review): a search for it, and the crate heart below */
    if(r.kind==='match'&&r.title)btns+='<a class="btn ghost" href="/search?q='+encodeURIComponent(foldT((r.artist?r.artist+' ':'')+r.title)||r.title)+'">find it</a>';
    if(btns||(r.kind==='match'&&r.title))acts='<span class="acts"'+(r.kind==='match'&&r.title?' data-hi="'+i+'"':'')+'>'+btns+'<span class="msg" role="status"></span></span>';
    return '<li'+(r.rid?' data-rid="'+esc(r.rid)+'"':'')+'><span class="who">'+who+'</span><span class="when">'+when(r.t)+'</span>'+acts+'</li>';
  }).join('');
  heartHistory(h);
  linkHistoryArtists();
  try{rowFormRestore(open)}catch(e){}
}
/* the name form under a row. one at a time; a second tap on the same button closes it. the list is redrawn
   whenever a scan lands, so an open form and what was typed in it are put back after each redraw. */
function rowLi(rid){var ls=recentlist.querySelectorAll('li[data-rid]');for(var i=0;i<ls.length;i++){if(ls[i].getAttribute('data-rid')===rid)return ls[i]}return null}
function rowNote(rid,text,ok){var li=rowLi(rid),m=li&&li.querySelector('.acts .msg');if(m){m.textContent=text;m.className='msg'+(ok?' ok':'')}}
function openRowForm(rid,quiet){
  var old=$('nform');
  if(old){var same=old.getAttribute('data-rid')===rid;old.parentNode.removeChild(old);if(same&&!quiet)return null}
  var li=rowLi(rid); if(!li||!rowNameable(historyRow(rid),Date.now()))return null;
  var f=document.createElement('form');
  f.className='form on'; f.id='nform'; f.setAttribute('autocomplete','off'); f.setAttribute('data-rid',rid); f.style.flexBasis='100%';
  f.innerHTML=nameFields('n')+'<div class="row"><button class="btn red" type="submit">send the name</button><button class="btn ghost" type="button" data-nclose="1">never mind</button></div><div class="msg" role="status"></div>';
  li.appendChild(f);
  if(!quiet){var a=$('n-artist');if(a)a.focus()}
  return f;
}
function rowFormState(){
  var f=$('nform'); if(!f)return null;
  var els=f.querySelectorAll('input[name],textarea[name]'), vals={}, ae=document.activeElement;
  for(var i=0;i<els.length;i++)vals[els[i].name]=els[i].value;
  return {rid:f.getAttribute('data-rid'),vals:vals,focus:ae&&ae.id&&f.contains(ae)?ae.id:''};
}
function rowFormRestore(st){
  if(!st||!st.rid)return;
  var f=openRowForm(st.rid,true); if(!f)return;
  Object.keys(st.vals).forEach(function(k){var el=f.querySelector('[name="'+k+'"]');if(el&&st.vals[k])el.value=st.vals[k]});
  if(st.focus){var el=$(st.focus);if(el)try{el.focus()}catch(e){}}
}
function sendRowAnswer(f){
  var rid=f.getAttribute('data-rid'), m=f.querySelector('.msg');
  var note=function(t,ok){if(m){m.textContent=t;m.className='msg'+(ok?' ok':'')}};
  if(f.getAttribute('data-busy'))return;
  var body=answerBody(f);
  if(typeof body==='string'){note(body);return}
  /* the row's scan is an earlier one than the card on screen, unless the card on screen is that very scan */
  body.recognition_id=rid; body.for_previous_scan=!(current&&current.recognition_id===rid);
  f.setAttribute('data-busy','1'); note('sending');
  postAnswer(body,function(code){
    f.removeAttribute('data-busy');
    if(code==='dup'){markAnswered(rid,null);rowNote(rid,answerLine(code));return}
    if(code!=='ok'){note(answerLine(code));return}
    markAnswered(rid,body);   /* redraws the list: the row now reads "you answered: ..." and the form is gone */
    rowNote(rid,sentLine('correct',{clip:true,named:false}),true);
  });
}
recentlist.addEventListener('click',function(ev){
  var b=ev.target.closest('[data-name]'); if(b){openRowForm(b.getAttribute('data-name'));return}
  var x=ev.target.closest('[data-nclose]'); if(x){var f=x.closest('form');if(f&&f.parentNode)f.parentNode.removeChild(f)}
});
recentlist.addEventListener('submit',function(ev){
  var f=ev.target; if(!f||f.id!=='nform')return;
  ev.preventDefault(); sendRowAnswer(f);
});
/* the same crate id the live card's heart uses, so a song hearted at the club shows as hearted here */
function heartHistory(h){
  if(!window.gmxCrate||!gmxCrate.heart)return;
  [].slice.call(recentlist.querySelectorAll('[data-hi]')).forEach(function(a){
    var r=h[+a.getAttribute('data-hi')];if(!r||!r.title)return;
    var who=r.artist||'',title=(who?who+' - ':'')+r.title,un=!!r.unreleased||!!(r.status&&r.status!=='out now');
    a.insertBefore(gmxCrate.heart({kind:'track',id:'scan:'+(foldT(who+' '+r.title)||'id'),title:title,sub:[r.status||'',unrelWord(un,r.status),'found with the scan'].filter(Boolean).join(' · '),url:'/scan',links:{},artist:who,label:'',unreleased:un||undefined},title),a.firstChild);
  });
}
function linkHistoryArtists(){
  var spans=[].slice.call(recentlist.querySelectorAll('[data-artist]')).filter(function(x){return x.getAttribute('data-artist')});if(!spans.length)return;
  var idx=slugIndex||(slugIndex=fx('/artists-index.json',{},GET_MS).then(function(r){return r.ok?r.json():null}).catch(function(){return null}));
  idx.then(function(j){if(!j||!j.slugs)return;spans.forEach(function(x){var s=slug(x.getAttribute('data-artist'));if(j.slugs.indexOf(s)<0)return;var a=document.createElement('a');a.href='/artists/'+s;a.className='sublink';a.textContent=x.textContent;x.innerHTML='';x.appendChild(a)})});
}
renderHistory();
/* a kept clip's two buttons. scan again posts the clip as a new scan. help us find it sends
   it once with the result it came from (mic_capture_optin), no form: the row's own result is
   the context. nothing here plays the clip. */
recentlist.addEventListener('click',function(ev){
  var b=ev.target.closest('[data-clip]'); if(!b||!window.gmxClips)return;
  var act=b.getAttribute('data-clip'), id=b.getAttribute('data-id'), m=b.parentNode.querySelector('.msg');
  var note=function(t,ok){if(m){m.textContent=t;m.className='msg'+(ok?' ok':'')}};
  if(busy){note('one at a time.');return}
  gmxClips.get(id).then(function(rec){
    if(!rec||!rec.blob){note('that clip is gone.');return}
    if(act==='again'){
      busy=true; card.classList.remove('on'); keepLast(); scanLive=false; current=null; heldBlob=rec.blob; heldAt=new Date(rec.t).toISOString(); heldLoud=false;   /* a kept clip is another moment's audio: see scanLive */
      scanSeq++; early=null; finalDone=false; rateHit=false; timing={t0:Date.now(),rounds:[],first:null};
      go.classList.add('busy'); window.scrollTo({top:0,behavior:SM()}); identify(rec.blob); return;
    }
    if(act==='help'){
      if(!rec.recognition_id){note('nothing to attach it to.');return}
      var fd=new FormData(); fd.append('kind','mic_capture_optin'); fd.append('door','user'); fd.append('audio',rec.blob,'clip.'+extOf(rec.blob));
      fd.append('recognition_id',rec.recognition_id); fd.append('heard_at',new Date(rec.t).toISOString());
      note('sending');
      fx(cfg.api_base+'/contribute',{method:'POST',headers:headers(),body:fd},POST_MS).then(function(r){
        if(r.status===429){note('too many this hour, try later.');return}
        if(r.status===409){note('already sent.');return}
        if(r.status>=400&&r.status<500)return refusal(r).then(function(x){markRow(id,x,true);note(refusedLine(x))});
        if(!r.ok)throw new Error(r.status);
        markRow(id,null,true); note('kept. we keep hunting.',true);
      }).catch(function(){note('did not send. check your signal.')});
    }
  }).catch(function(){note('that clip is gone.')});
});
go.addEventListener('click',function(){if(busy){if(auto)autoStop('stopped');if(cancelScan)cancelScan();return}startScan()});

/* ---- auto scan and the offline queue (set mode build, 2026-10-11) ----
   auto: tap once at the start of a set. the phone scans on its own every eight minutes (twenty when the
   hourly cap bites), keeps the screen awake, and every result lands in tonight's list with its offset from
   the start, a personal tracklist of the night. a tap on the rings or the auto button stops it. after a lock
   screen or a reload auto waits for a tap again, since the mic needs a gesture on the phones that matter.
   offline: a clip recorded with no signal, or one whose upload never reached the recognizer, stays on this
   phone as a pending clip and is matched the moment the phone is back online, oldest first, one at a time.
   nothing here leaves the phone until it is online. */
var AUTO_KEY='gmx_auto', SESSION_KEY='gmx_tonight', AUTO_GAP_MS=8*60000, AUTO_GAP_CAPPED_MS=20*60000, SESSION_MAX_AGE=12*3600000;
var auto=false, autoTimer=null, autoNext=0, autoTick=null, autoNote='', wake=null, draining=null, drainFailed=false, drainDone=false;
var autobar=$('autobar'), pendingbar=$('pendingbar'), sessionEl=$('session'), sessionlist=$('sessionlist'), sessionmeta=$('sessionmeta'), sessionmsg=$('sessionmsg');
function loadSession(){try{var s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(s&&s.rows)return s}catch(e){}return {start:0,rows:[]}}
function saveSession(s){try{localStorage.setItem(SESSION_KEY,JSON.stringify(s))}catch(e){}}
function fmtOffset(ms){var t=Math.max(0,Math.round(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;return (h?h+':'+('0'+m).slice(-2):String(m))+':'+('0'+x).slice(-2)}
function fmtClock(t){try{return new Date(t).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}).toLowerCase()}catch(e){return ''}}
/* the screen stays on while auto runs, and from 2026-10-13 through every tap scan too, where the browser allows it.
   the lock api may be missing, refuse, or throw (an old webview, a battery setting), and none of that may touch the
   scan, so every call is wrapped. wakeWant remembers whether a lock is still wanted when a slow request lands after
   the scan already ended, so it is let go at once instead of holding the screen. */
var wakeWant=false;
function wakeOn(){
  wakeWant=true; if(wake)return;
  try{
    if(!navigator.wakeLock||!navigator.wakeLock.request)return;
    navigator.wakeLock.request('screen').then(function(w){
      if(!wakeWant||wake){try{w.release()}catch(e){}return}
      wake=w; w.addEventListener('release',function(){if(wake===w)wake=null});
    }).catch(function(){});
  }catch(e){}
}
function wakeOff(){wakeWant=false;if(wake){var w=wake;wake=null;try{w.release()}catch(e){}}}
document.addEventListener('visibilitychange',function(){if(!document.hidden&&auto)wakeOn()});
function autoStart(){
  var s=loadSession();if(!s.start||Date.now()-s.start>SESSION_MAX_AGE){s={start:Date.now(),rows:[]};saveSession(s)}
  auto=true;autoNote='';try{localStorage.setItem(AUTO_KEY,'1')}catch(e){}
  wakeOn();renderAuto();renderSession();tick(40);
  if(!busy)startScan();
}
function autoStop(note){
  auto=false;autoNote=note||'';clearTimeout(autoTimer);autoTimer=null;autoNext=0;clearInterval(autoTick);autoTick=null;wakeOff();
  try{localStorage.setItem(AUTO_KEY,'0')}catch(e){}
  renderAuto();
}
function autoSchedule(ms){
  clearTimeout(autoTimer);autoNext=Date.now()+ms;
  autoTimer=setTimeout(function(){autoTimer=null;if(!auto)return;if(busy||document.hidden){autoSchedule(30000);return}startScan()},ms);
  renderAuto();
}
function onReset(){
  if(draining){var ok=drainDone;drainDone=false;draining=null;renderPending();if(ok)setTimeout(drain,600)}
  else if(drainFailed){drainFailed=false;renderPending()}
  if(auto&&!autoTimer&&!busy)autoSchedule(rateHit?AUTO_GAP_CAPPED_MS:AUTO_GAP_MS);
}
function renderAuto(){
  if(!autobar)return;
  var resumable=false;try{resumable=!auto&&localStorage.getItem(AUTO_KEY)==='1'&&loadSession().start&&Date.now()-loadSession().start<SESSION_MAX_AGE}catch(e){}
  var h='<button class="btn'+(auto?' on':'')+'" type="button" id="autobtn" aria-pressed="'+(auto?'true':'false')+'">'+(auto?'auto on · tap to stop':(resumable?'resume auto':'auto · for a set'))+'</button>';
  if(auto)h+='<span class="next" id="autonext"></span><button class="btn ghost" type="button" id="autonow">scan now</button>';
  if(autoNote)h+='<span class="note">'+esc(autoNote)+'</span>';
  autobar.innerHTML=h;
  clearInterval(autoTick);autoTick=null;
  if(auto){var paint=function(){var el=$('autonext');if(!el)return;if(busy)el.innerHTML='scanning';else if(autoNext)el.innerHTML='next in <b>'+fmtOffset(autoNext-Date.now())+'</b>';else el.innerHTML=''};paint();autoTick=setInterval(paint,1000)}
}
autobar.addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  if(b.id==='autobtn'){if(auto)autoStop('stopped');else autoStart();return}
  if(b.id==='autonow'){if(!busy){clearTimeout(autoTimer);autoTimer=null;startScan()}}
});
/* tonight: every result while a session is open, with its offset from the start. a repeat of the last row counts up instead of repeating. */
/* ---- tell me when it drops (the follow control, reworded by DECISION 11 on 2026-10-28), and the account (2026-10-11) ---- */
function followRow(cand){
  if(cand&&cand.status==='out now')return '';
  var what=cand&&cand.library_entry_id&&!(cand.artist_claim&&cand.title_claim)?'tell me when it gets a name':'tell me when it drops';
  return '<div class="row" id="followrow"><button class="btn" data-act="follow">'+what+'</button></div>';
}
/* E6c: the "nothing yet" card gets its follow button only once the keep landed (sendHelp), and only while the
   card still shows the scan the keep belongs to. the kept clip is what the follow waits on: when it lands in
   the library the api moves the follow to the entry (a follow is not a name, the two-signal rule holds) */
function followAfterKeep(jid){
  var slot=$('followslot'); if(!slot||!current||current.job_id!==jid)return;
  slot.innerHTML=followRow(null);
}
/* push lives in gmx-account.js now */
function ensurePush(){return gmxAccount.ensurePush()}
function followNow(btn,rid,note){
  note=note||say; rid=rid||(current&&current.recognition_id);
  if(!rid){note('nothing to follow yet.');return}
  btn.disabled=true; note('one moment');
  ensurePush().then(function(pushed){
    return fx(cfg.api_base+'/follow',{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({recognition_id:rid})},POST_MS).then(function(r){
      if(r.status===409)return r.json().then(function(j){var d=String(j.detail||'');note(d.indexOf('already out')>-1?'that one is already out.':'keep the clip first (help us find it), then tap again.');btn.disabled=false});
      if(r.status===404){note('that scan is gone from the recognizer.');return}
      if(r.status===429){note('too many this hour, try later.');btn.disabled=false;return}
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(f){
        var how=pushed?'this phone gets a push':(sessionToken()?'you get an email':'turn on notifications, or sign in below for email');
        note((f.until==='named'?'we will tell you when it gets a name, and when it comes out. ':'we will tell you when it comes out. ')+how+'.',true);
        btn.textContent='following'; if(meCache){meCache.follows++;meCache.followed=(meCache.followed||0)+1;renderSetup()} loadFollows(); pushState();
        /* accounts design, moment 2 (2026-10-13): no push on this phone and nobody signed in means the word has nowhere to go. the email box is right below */
        if(!pushed&&!sessionToken()){var ye=$('y-email');if(ye){try{ye.scrollIntoView({block:'center',behavior:SM()})}catch(e){ye.scrollIntoView()}setTimeout(function(){ye.focus()},400)}}
      });
    });
  }).catch(function(){note('did not send. check your signal and try again.');btn.disabled=false});
}
recentlist.addEventListener('click',function(ev){
  var b=ev.target.closest('[data-follow]'); if(!b)return;
  var m=b.parentNode.querySelector('.msg');
  followNow(b,b.getAttribute('data-follow'),function(t,ok){if(m){m.textContent=t;m.className='msg'+(ok?' ok':'')}});
});
function onCfg(){
  var q=new URLSearchParams(location.search), tok=q.get('signin');
  if(tok){
    history.replaceState(null,'',location.pathname);
    /* contract C1 (2026-11-09): gmx-account.js decides own link, foreign link or another account, no new tap */
    if(typeof gmxAccount.openLink==='function'){
      gmxAccount.openLink(tok,function(state){
        if(state==='gone'){youNote('that link is used up or too old. ask for a new one.');return}
        if(state==='error'){youNote('could not finish signing in. check your signal and try the link again.');return}
        if(state==='limited'){youNote('too many sign-in tries from here. wait a few minutes, then tap the link again.');return}
        meCache=null;
        if(state==='in'){renderYou();justIn=true;loadFollows();ensurePush();return}
        if(state==='foreign'||state==='switched'){renderYou();loadFollows();return}
        renderYou();
      });
    }else gmxAccount.finish(tok).then(function(r){
      if(r.status===410){youNote('that link is used up or too old. ask for a new one.');return}
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(j){setSession(j.session);meCache=null;renderYou();justIn=true;ensurePush()});
    }).catch(function(){youNote('could not finish signing in. check your signal and try the link again.')});
  }
  renderYou(); loadFollows(); resumeWait();
  /* a session that appears or goes outside this page's own flows (the "not you? sign out" line, a switch, another tab
     signing in or out, the link opened in a new tab while this one waits) repaints the account block and the follows.
     the flows that already repaint set paintedTok first, so nothing is fetched twice */
  if(gmxAccount.on)gmxAccount.on(function(w){
    if(w!=='session')return;
    setTimeout(function(){if((sessionToken()||'')===paintedTok)return;meCache=null;renderYou();loadFollows()},0);
  });
}
function youNote(t,ok){var m=$('youmsg');if(m){m.textContent=t;m.className='msg'+(ok?' ok':'')}}
/* the code from the mail, typed here: no browser hand-off, which the gmail app on android cannot do */
function showCodeForm(email){
  var f=$('yform'); if(!f||$('cform2'))return;
  var c=document.createElement('form'); c.className='form on'; c.id='cform2'; c.setAttribute('autocomplete','one-time-code');
  c.innerHTML='<label for="y-code">the six digits from the mail</label><input id="y-code" name="code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="one-time-code" placeholder="000 000">'+
    '<div class="row"><button class="btn red" type="submit">sign in with the code</button><span class="msg" role="status" id="codemsg"></span></div>';
  c.dataset.email=email; f.parentNode.insertBefore(c,f.nextSibling); $('y-code').focus();
}
function sendCode(f){
  var m=$('codemsg'), code=($('y-code').value||'').replace(/\D/g,'');
  if(code.length!==6){m.textContent='six digits.';return}
  m.textContent='checking';
  var sb=f.querySelector('[type=submit]'); f.dataset.busy='1'; if(sb)sb.disabled=true;
  gmxAccount.code(f.dataset.email,code).then(function(r){
    /* the api caps wrong tries per address (sec-auth-v1, 2026-11-09): past the cap every code is spent, the link still works */
    if(r.status===429){m.textContent='too many tries. tap the link in the mail, or ask for a new code later.';return}
    if(r.status===410){m.textContent='that code is wrong, used or too old. ask for a new one.';return}
    if(r.status===401||r.status===403){m.textContent='that code did not work. ask for a new one.';return}
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(j){setSession(j.session,j.email);meCache=null;renderYou();justIn=true;loadFollows();ensurePush()});
  }).catch(function(e){m.textContent=gmxAccount.failLine?gmxAccount.failLine(e,'did not send. check your signal.'):'did not send. check your signal.'}).then(function(){delete f.dataset.busy;if(sb)sb.disabled=false});
}
/* the link wait (the ticket, the poll, the reload) lives in gmx-account.js now */
function signedInByLink(){meCache=null;renderYou();justIn=true;loadFollows();ensurePush()}
function waitForLink(ticket,minutes){gmxAccount.waitForLink(ticket,minutes,signedInByLink)}
function resumeWait(){gmxAccount.resumeWait(signedInByLink)}
var justIn=false, pushNow='', setupWas=null;
/* the chip beside the auto button moved to the header of every page (gmx-account.js, shell v2) */
/* roles (2026-10-12): the badge word for User.role, the cache of the highest verified row */
var ROLE_WORD={verified_artist:'verified artist',verified_label:'verified label',verified_venue:'verified venue',team:'team'};
var paintedTok=null;
function renderYou(){
  var box=$('youbody'); if(!box||!cfg)return;
  paintedTok=sessionToken()||'';
  if(!sessionToken()){
    box.innerHTML='<p class="smeta">sign in to get told by email when an ID you scanned comes out, keep your scans across phones, and put your name on the IDs you help with.</p>'+
      '<form class="form on" id="yform" autocomplete="off"><label for="y-email">email</label><input id="y-email" name="email" type="email" inputmode="email" maxlength="320" required>'+
      '<div class="row"><button class="btn red" type="submit">send me a sign-in link</button><span class="msg" role="status" id="youmsg"></span></div><p class="legal">your email is only for this. <a href="/privacy">privacy</a> · <a href="/terms">terms</a></p></form>';
    renderAuto();
    return;
  }
  var paint=function(me){
    box.innerHTML='<div class="prof">'+(me.handle?'<span class="at">@'+esc(me.handle)+'</span>':'<span class="at none">no handle yet</span>')+
      '<small>'+esc(me.email)+(ROLE_WORD[me.role]?' · '+ROLE_WORD[me.role]:'')+'</small>'+
      (me.handle?'<button class="chg" type="button" data-you="handle">change</button>':'')+'</div>'+
      '<p class="stat" id="youstat"></p>'+
      '<div id="hbox" hidden></div>'+
      '<ol class="setup" id="setup" hidden></ol>'+
      '<div class="tools"><button class="btn ghost" type="button" data-you="push" id="pushbtn" hidden>turn on notifications</button><button class="btn ghost" type="button" data-you="out">sign out</button><span class="msg" role="status" id="youmsg"></span></div>'+
      '<ul id="otherlist"></ul>';
    if(justIn){justIn=false;youNote('you are in.',true)}
    paintStat(); renderSetup(); renderAuto(); loadServerHistory(); pushState();
  };
  if(meCache){paint(meCache);return}
  var down=function(){box.innerHTML='<p class="smeta">signed in, but the recognizer did not answer. <button class="btn ghost" type="button" data-you="out">sign out</button></p>'};
  gmxAccount.me(true).then(function(me){
    /* null with the token still set is a 5xx, a 429 or no signal: say so and ask again once, never loop (each /me spends the scan budget) */
    if(!me){
      var tok=sessionToken(); if(!tok){renderYou();return}
      down();
      if(renderYou.retryTok!==tok){renderYou.retryTok=tok;setTimeout(function(){if(sessionToken()===tok&&!meCache)renderYou()},6000)}
      return;
    }
    meCache=me;paint(me);
  }).catch(down);
}
/* where this phone stands on push: permission, and a live subscription behind it */
function pushKnown(){return gmxAccount.pushState()}
function pushState(){pushKnown().then(function(st){pushNow=st;paintStat();renderSetup()})}
function paintStat(){
  var el=$('youstat'),me=meCache; if(!el||!me)return;
  var w={on:'notifications <b>on</b>',off:'notifications <b>off</b>, email instead',blocked:'notifications <b>blocked</b> here, email instead',none:'no push in this browser, email instead',allowed:'notifications <b>allowed</b>, not registered'}[pushNow]||'notifications: checking';
  el.innerHTML=w+' · <b>'+me.follows+'</b> following · <b>'+me.devices+'</b> '+(me.devices===1?'device':'devices');
}
function pushSkipped(){try{return localStorage.getItem('gmx_push_skip')==='1'}catch(e){return false}}
/* three steps, shown until all three are done, then the block is just the profile */
function renderSetup(){
  var me=meCache,box=$('setup'),pb=$('pushbtn'); if(!me||!box||!pushNow)return;
  var pushDone=pushNow==='on'||me.push_subscriptions>0||pushSkipped();
  var cannot=pushNow==='none'||pushNow==='blocked';
  var steps=[
    {done:!!me.handle,t:'pick your handle',p:'the name shown as credit on IDs you help name. 2 to 30 letters, digits, dots or underscores, yours alone.',
     form:'<form class="form on" id="hform2" data-first="1" autocomplete="off"><label for="y-handle">handle</label><input id="y-handle" name="handle" maxlength="30" placeholder="yourname" required><div class="row"><button class="btn" type="submit">that is me</button><span class="msg" role="status" id="hmsg"></span></div></form>'},
    {done:pushDone,t:'turn on notifications',p:pushNow==='none'?'this browser cannot push. on iphone, add the app to the home screen first. alerts go by email either way.':pushNow==='blocked'?'blocked for this site in the browser settings. alerts go by email either way.':'a push to this phone when an ID you follow gets a name or comes out. email otherwise.',
     form:'<div class="row">'+(cannot?'':'<button class="btn" type="button" data-you="push">turn on</button>')+'<button class="btn ghost" type="button" data-you="skip">email is fine</button></div>'},
    {done:(me.followed||me.follows)>0,t:'follow your first ID',p:'tap "tell me when it drops" on a scan, in the card or in recent scans, and it lands here.',form:''}
  ];
  var left=steps.filter(function(x){return !x.done}).length;
  if(!left){if(setupWas===false)youNote('you are set.',true);setupWas=true;box.hidden=true;box.innerHTML='';if(pb)pb.hidden=!(pushNow==='off'||pushNow==='allowed');return}
  setupWas=false; if(pb)pb.hidden=true;
  box.innerHTML=steps.map(function(x){return '<li'+(x.done?' class="done"':'')+'><span class="t">'+x.t+'</span>'+(x.done?'':'<p>'+x.p+'</p>'+x.form)+'</li>'}).join('');
  box.hidden=false;
}
function hNote(t,ok){var m=$('hmsg');if(m){m.textContent=t;m.className='msg'+(ok?' ok':'')}}
function showHandleForm(){
  var hb=$('hbox'); if(!hb||!meCache)return;
  hb.innerHTML='<form class="form on" id="hform2" autocomplete="off"><label for="y-handle">new handle</label><input id="y-handle" name="handle" maxlength="30" value="'+esc(meCache.handle||'')+'"><div class="row"><button class="btn" type="submit">save</button><button class="btn ghost" type="button" data-you="hcancel">cancel</button><span class="msg" role="status" id="hmsg"></span></div></form>';
  hb.hidden=false; try{$('y-handle').focus()}catch(e){}
}
/* scans from the account's other phones, the ones this phone has no row for */
function loadServerHistory(){
  var ul=$('otherlist'); if(!ul||!sessionToken())return;
  fx(cfg.api_base+'/me/history?limit=60',{headers:headers()},GET_MS).then(function(r){return r.ok?r.json():[]}).then(function(rows){
    var mine={}; loadHistory().forEach(function(r){if(r.id)mine[r.id]=1});
    var other=rows.filter(function(r){return !r.this_device&&!mine[r.job_id]});
    if(!other.length){ul.innerHTML='';return}
    ul.innerHTML='<li class="none">from your other phones</li>'+other.slice(0,25).map(function(r){
      var name=r.kind==='match'?esc(r.artist||'ID')+'<small>'+esc(r.title||'unnamed library entry')+(r.status?' · '+esc(r.status):'')+'</small>':r.kind==='guess'?'no match<small>closest guess: '+esc((r.artist?r.artist+' - ':'')+(r.title||''))+'</small>':'no match<small>'+esc(r.in_set||'nothing yet')+'</small>';
      return '<li><span class="who">'+name+'</span><span class="when">'+when(new Date(r.at).getTime())+'</span></li>';
    }).join('');
  }).catch(function(){});
}
function loadFollows(){
  var ul=$('followlist'); if(!ul||!cfg)return;
  fx(cfg.api_base+'/follows',{headers:headers()},GET_MS).then(function(r){return r.ok?r.json():[]}).then(function(rows){
    rows=rows.filter(function(f){return f.state!=='cancelled'});
    ul.hidden=false;
    if(!rows.length){ul.innerHTML='<li class="none">waiting on nothing yet. tap "tell me when it drops" on a scan and it lands here.</li>';return}
    ul.innerHTML='<li class="none">waiting on</li>'+rows.slice(0,30).map(function(f){
      var st=f.state==='notified'?'out now':f.named?'named, waiting for the release':f.until==='named'?'waiting for a name':'waiting for the release';
      var fu=safeUrl(f.url);
      var nm=fu&&f.state==='notified'?'<a href="'+esc(fu)+'" target="_blank" rel="noopener">'+esc(f.name||'an ID')+'</a>':esc(f.name||'an ID');
      return '<li><span class="who">'+nm+'<small>'+st+'</small></span>'+(f.state==='open'?'<span class="acts"><button class="btn ghost" data-unfollow="'+esc(f.follow_id)+'">stop</button></span>':'<span class="when">'+when(new Date(f.released||f.created_at).getTime())+'</span>')+'</li>';
    }).join('');
  }).catch(function(){});
}
document.addEventListener('submit',function(ev){
  var f=ev.target;
  if(f.id==='yform'){
    ev.preventDefault(); var email=$('y-email').value.trim(); if(!email||!cfg||f.dataset.busy)return; youNote('sending');
    var sb=f.querySelector('[type=submit]'); f.dataset.busy='1'; if(sb)sb.disabled=true;
    gmxAccount.start(email).then(function(r){
      if(r.status===429)return gmxAccount.startLimit?gmxAccount.startLimit(r).then(function(t){youNote(t)}):youNote('too many links for that address this hour.');
      if(r.status===422){youNote('that does not look like an email address.');return}
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(j){
        youNote(j.mail_sent?'sent. type the six digits from the mail here, or tap its link anywhere.':'the mail could not go out right now. try again later.',j.mail_sent);
        if(j.mail_sent){showCodeForm(email);if(j.pending)waitForLink(j.pending,j.minutes||20)}
      });
    }).catch(function(){youNote('did not send. check your signal and try again.')}).then(function(){delete f.dataset.busy;if(sb)sb.disabled=false});
  }else if(f.id==='cform2'){
    ev.preventDefault(); if(!f.dataset.busy)sendCode(f);
  }else if(f.id==='hform2'){
    ev.preventDefault(); var hv=$('y-handle').value.trim();
    if(!hv&&f.getAttribute('data-first')){hNote('type a name first');return}
    hNote('saving');
    gmxAccount.setHandle(hv||null).then(function(r){
      if(r.status===422||r.status===409)return r.json().then(function(j){hNote(String(j.detail||'that handle will not do'))});
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(me){meCache=me;renderYou();youNote(me.handle?'you are @'+me.handle+'.':'handle cleared.',true)});
    }).catch(function(){hNote('did not save. check your signal.')});
  }
});
document.addEventListener('click',function(ev){
  var y=ev.target.closest('[data-you]');
  if(y){
    if(y.getAttribute('data-you')==='out'){gmxAccount.signout();meCache=null;renderYou();loadFollows();return}
    if(y.getAttribute('data-you')==='push'){y.disabled=true;gmxAccount.ensurePush({test:true}).then(function(ok){youNote(ok?'this phone gets notified. a test just went out.':gmxAccount.pushLine(gmxAccount.pushWhy()),ok);y.disabled=false;pushState()});return}
    if(y.getAttribute('data-you')==='skip'){try{localStorage.setItem('gmx_push_skip','1')}catch(e){}renderSetup();return}
    if(y.getAttribute('data-you')==='handle'){showHandleForm();return}
    if(y.getAttribute('data-you')==='hcancel'){var hb=$('hbox');if(hb){hb.hidden=true;hb.innerHTML=''}return}
  }
  var u=ev.target.closest('[data-unfollow]');
  if(u){u.disabled=true;fx(cfg.api_base+'/unfollow',{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({follow_id:u.getAttribute('data-unfollow')})},POST_MS).then(function(){meCache=null;renderYou();loadFollows()}).catch(function(){u.disabled=false})}
});
function onScanEnd(cur,row){
  var d=draining;
  if(d){drainDone=true;gmxClips.del(d.id).catch(function(){});}
  var name=(row.artist?row.artist+' - ':'')+(row.title||'');
  if(row.kind!=='match'&&row.kind!=='guess')name='';
  sessionAdd({t:row.t,kind:row.kind,name:name,score:row.score},d?d.t:null);
}
/* a row in tonight's list. a kept clip lands as pending and is replaced by its match when it drains. */
function sessionAdd(r,replaceT){
  var s=loadSession();if(!s.start)return;
  if(Date.now()-s.start>SESSION_MAX_AGE&&!auto)return;
  if(replaceT){for(var i=0;i<s.rows.length;i++){if(s.rows[i].kind==='pending'&&s.rows[i].t===replaceT){s.rows[i]={t:replaceT,off:replaceT-s.start,kind:r.kind,name:r.name,score:r.score,n:1};saveSession(s);renderSession();return}}}
  var last=s.rows[s.rows.length-1];
  if(r.name&&last&&last.name===r.name){last.n=(last.n||1)+1}
  else s.rows.push({t:r.t,off:r.t-s.start,kind:r.kind,name:r.name||'',score:r.score,n:1});
  saveSession(s);renderSession();
}
function renderSession(){
  var s=loadSession();if(!sessionEl)return;
  var show=(s.start&&s.rows.length)||auto;
  sessionEl.hidden=!show;if(!show)return;
  var named=s.rows.filter(function(r){return r.name&&r.kind==='match'}).length;
  sessionmeta.textContent='started '+fmtClock(s.start)+' · '+s.rows.length+(s.rows.length===1?' scan':' scans')+' · '+named+' named';
  sessionlist.innerHTML=s.rows.length?s.rows.map(function(r){
    var who=r.kind==='pending'?'kept, no signal<small>matched when you are back online</small>':r.name?(r.kind==='guess'?'<span>maybe '+esc(r.name)+'</span>':'<span>'+esc(r.name)+'</span>')+'<small>'+(r.kind==='guess'?'closest guess':r.score==null?'match':pct(r.score))+(r.n>1?' · heard '+r.n+' times':'')+'</small>':'nothing named<small>no match</small>';
    return '<li><span class="who">'+who+'</span><span class="when">+'+fmtOffset(r.off)+'</span></li>';
  }).join(''):'<li class="none">listening. the first result lands here.</li>';
}
$('sessiontools').addEventListener('click',function(e){
  var b=e.target.closest('[data-s]');if(!b)return;var s=loadSession();
  if(b.getAttribute('data-s')==='clear'){if(s.rows.length&&!confirm('clear tonight\'s list on this phone?'))return;saveSession({start:auto?Date.now():0,rows:[]});renderSession();sessionmsg.textContent='cleared.';return}
  var lines=s.rows.filter(function(r){return r.name}).map(function(r){return fmtOffset(r.off)+'  '+(r.kind==='guess'?'? ':'')+r.name});
  if(!lines.length){sessionmsg.textContent='nothing named yet.';return}
  var txt='tonight with groovesMAXXING · '+fmtClock(s.start)+'\n'+lines.join('\n')+'\nhttps://groovesmaxxing.com/scan';
  if(navigator.clipboard)navigator.clipboard.writeText(txt).then(function(){sessionmsg.textContent='copied, '+lines.length+' lines.'},function(){sessionmsg.textContent='could not copy.'});else sessionmsg.textContent='copy is not available here.';
});
/* the offline queue */
function queueClip(blob){
  var rec={id:'q'+Date.now()+Math.floor(Math.random()*1000),t:Date.now(),blob:blob,kind:'pending',heard_at:heldAt||new Date().toISOString(),auto:!!auto};
  var store=window.gmxClips?gmxClips.put(rec):Promise.reject(new Error('no store'));
  store.then(function(){
    sessionAdd({t:rec.t,kind:'pending',name:''});
    showCard('<p class="kw"><b>kept.</b></p><h2>no signal, no problem.</h2><p class="note">the clip stays on this phone and gets matched the moment you are back online. nothing is sent until then.</p><div class="row"><button class="btn red" data-act="again">scan again</button></div>');
    renderPending();
  },function(){
    showCard(errCard('could not reach the recognizer, and could not keep the clip on this phone either. try again when you have signal.'));
  });
  heldBlob=null;reset();laterDrain();
}
/* a phone that never went offline never fires 'online' (2026-11-09 review): a waiting clip gets a few tries on a timer too */
var drainTries=0;
function laterDrain(){if(drainTries>=4)return;drainTries++;setTimeout(function(){if(!navigator.onLine)return;if(busy||(card.classList.contains('on')&&(current||card.querySelector('[data-act="resend"]')))){laterDrain();return}drain()},20000*drainTries)}   /* a result being read, a scan under way, or a stalled card that still offers its clip again is never wiped by a timed try */
function pendingList(){return window.gmxClips?gmxClips.list().then(function(rows){return rows.filter(function(r){return r.kind==='pending'&&r.blob}).sort(function(a,b){return a.t-b.t})}).catch(function(){return []}):Promise.resolve([])}
function renderPending(){
  if(!pendingbar)return;
  pendingList().then(function(p){
    pendingbar.hidden=!p.length;if(!p.length)return;
    var on=navigator.onLine;
    pendingbar.innerHTML='<span><b>'+p.length+'</b> '+(p.length===1?'clip':'clips')+' waiting for signal'+(on?'':' · offline')+'</span>'+(on?'<button class="btn" type="button" id="drainbtn">'+(busy?'matching…':'match now')+'</button>':'');
    var b=$('drainbtn');if(b)b.addEventListener('click',function(){drain()});
  });
}
function drain(){
  if(busy||draining||!navigator.onLine||!window.gmxClips||!cfg)return;
  pendingList().then(function(p){
    if(!p.length){renderPending();return}
    var rec=p[0];draining=rec;drainDone=false;drainFailed=false;
    busy=true;card.classList.remove('on');keepLast();scanLive=false;current=null;heldBlob=rec.blob;heldAt=rec.heard_at||new Date(rec.t).toISOString();heldLoud=false;
    scanSeq++;early=null;finalDone=false;rateHit=false;timing={t0:Date.now(),rounds:[],first:null};
    go.classList.add('busy');say2('matching a clip from '+when(rec.t));renderPending();
    identify(rec.blob);
  });
}
window.addEventListener('online',function(){drainTries=0;renderPending();setTimeout(drain,1500)});
window.addEventListener('offline',renderPending);
renderAuto();renderSession();renderPending();
if(navigator.onLine)setTimeout(drain,2500);
window.gmxSession={start:autoStart,stop:autoStop,drain:drain,queue:queueClip,session:loadSession};
window.gmxPath={block:pathBlock,sent:markSent};   /* the site check renders the four steps from a made-up result */
window.gmxScanDemo=function(res){current=res;showCard(resultCard(res))};
(function(){var hb=document.getElementById('howbtn'),box=document.getElementById('howbox'),hc=document.getElementById('howclose');if(!hb||!box||!box.showModal){if(hb)hb.style.display='none';return}hb.addEventListener('click',function(){box.showModal()});hc.addEventListener('click',function(){box.close()});box.addEventListener('click',function(e){if(e.target===box)box.close()});})();
})();
