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

/* the device id: minted once, kept on the phone. letters, digits, dash, underscore, 32 long. */
function deviceId(){return gmxAccount.device()}
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
function setSession(t){gmxAccount.set(t)}
var meCache=null;
function tick(ms){try{if(navigator.vibrate)navigator.vibrate(ms||30)}catch(e){}}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
/* a link or cover is used only when it is https, http or a path on this site. anything with another
   scheme (javascript:, data:) from a store record, a lookup or a server field becomes nothing. */
function safeUrl(u){u=String(u==null?'':u).trim();if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(/^\/\//.test(u))return '';return u.split(/[\/?#]/)[0].indexOf(':')<0?u:''}
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
    if(!on&&act<.002){raf=0;idle();return}
    var jv=Math.min(.3,lv); vs+=(jv-vs)*ease(.3);
    sp+=((on?140+vs*900:0)-sp)*ease(.05); ang=(ang+sp*dt)%360;
    paint(act,look(on?(now-ts0)/1000:0),now/1000,vs,jv,fr%2===0,false);
    raf=requestAnimationFrame(frame);
  }
  if(!window.MutationObserver)return;
  new MutationObserver(function(){
    if(still()){hold();return}
    if(!raf&&live()){last=0;raf=requestAnimationFrame(frame)}
  }).observe(stage,{attributes:true,attributeFilter:['class']});
})();

function startScan(){
  if(busy)return;
  if(!cfg){showCard(errCard(cfgErr?'the app config did not load. pull down to refresh and try again.':'still loading, one second.'));return}
  if(!canCapture()){
    showCard(errCard("this browser can't record audio. on iphone use safari, on android use chrome, then add the app to your home screen."));return;
  }
  busy=true; card.classList.remove('on'); current=null; dropBlob(); scanSeq++; early=null; finalDone=false; rateHit=false;
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
      var m= name==='NotAllowedError'||name==='SecurityError' ? (/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'the mic is blocked. open iphone settings, find safari (under apps on newer iphones), set microphone to ask or allow, then try again.' : 'the mic is blocked. allow the microphone for groovesmaxxing.com in your browser settings and try again.')
           : name==='NotFoundError' ? 'no microphone found on this device.'
           : (err&&err.message==='quiet') ? 'the mic barely heard anything. get closer to the speaker and scan again.'
           : 'the clip did not record. try again.';
      showCard(errCard(m)); reset(); return;
    }
    heldBlob=blob; identify(blob);
  }
}
function reset(){busy=false;cancelScan=null;stopCapture=null;go.removeAttribute('aria-disabled');go.classList.remove('busy');stage.classList.remove('listening','finding');tap.innerHTML='tap to <b>scan</b>';go.setAttribute('aria-label','scan what is playing');if(!auto)wakeOff();try{onReset()}catch(e){}}
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
   a CONFIRMED answer ends the scan at once. a LIKELY one shows and the scan keeps going for the catalogs. */
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
    round.answer=(at/1000)+' s: '+(cand.tier==='CONFIRMED'?'sure':'close')+', '+who;
    early={job_id:j.job_id,recognition_id:r.recognition_id||j.job_id,card:{kind:'match',candidate:cand},seconds:Math.round((Date.now()-timing.t0)/100)/10,timing:timing};
    if(!timing.first)timing.first=Date.now()-timing.t0;
    current=early; tick(40);
    if(cand.tier==='CONFIRMED'){
      /* done: stop the mic, skip the catalogs, keep the clip we have for corrections and the set hint */
      finalDone=true; heldBlob=blob; if(stopCapture)stopCapture();
      current.hint_ref=current.recognition_id; current.in_set=r.in_set||null; current.loud=heldLoud;
      var keep=!!(window.gmxClips&&gmxClips.on()&&heldBlob);
      if(keep)gmxClips.put({id:current.job_id,t:Date.now(),blob:heldBlob,recognition_id:current.recognition_id,kind:'match'}).catch(function(){});
      say2('got it at <b>'+(at/1000)+' s</b>');
      showCard(resultCard(current)); remember(current,keep); reset(); return;
    }
    say2('close at <b>'+(at/1000)+' s</b>, still listening for a sure one');
    showCard('<p class="kw" id="earlynote">still listening</p>'+resultCard(early));
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
  say2('checking the catalogs');
  if(!early)showCard('<div class="skel" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i></div>');
  var sentAt=null,finalRound={at:CAPTURE_MS,post:0,wait:0,answer:'…'};if(timing)timing.rounds.push(finalRound);
  var fd=new FormData(); fd.append('audio',blob,'clip.'+extOf(blob)); fd.append('source','mic');
  var began=Date.now();
  /* catalog off after an early likely (2026-10-13): when an early round already came back LIKELY, the 15 s round
     asks the api to skip the paid catalog call (X-GMX-Catalog: off). the library, the hash index and the set match
     still run on the full clip, so the likely can still rise to a sure one; only the ACRCloud and AudD spend is
     saved. the header goes on no other path. an api without the matching guard refuses the header, as a 401 or as
     a failed preflight that the browser reports as a network error, and either answer re-posts once without the
     header so the scan goes on as before. a stalled upload (timeout) is not retried. */
  function post(withHeader){
    return fx(cfg.api_base+'/identify',{method:'POST',headers:headers(withHeader?{'X-GMX-Catalog':'off'}:null),body:fd},POST_MS)
    .then(function(r){
      if(withHeader&&r.status===401)return post(false);
      sentAt=Date.now();finalRound.post=sentAt-began;
      if(r.status===429)throw new Error('rate');
      if(r.status===401)throw new Error('key');
      if(r.status>=500)throw new Error('server');
      if(!r.ok)throw new Error('http '+r.status);
      if(withHeader)finalRound.catalog='off'; /* stamped only once the api took the post, so a refused round never reads catalog off (2026-10-13) */
      return r.json();
    },function(e){
      if(withHeader&&!(e&&e.message==='timeout'))return post(false);
      throw e;
    });
  }
  post(earlyLikely())
  .then(function(job){return pollJob(job.job_id)})
  .then(function(j){
    var r=j.result||{}, c=r.card||{kind:'none'};
    finalRound.wait=Date.now()-(sentAt||began);finalRound.answer='15 s: '+(c.kind==='match'?'match':c.kind==='guess'?'a guess':'nothing');
    if(finalDone)return;
    finalDone=true; say2('');
    /* the 15 s scan replaces the early card when it names something, else the early card stays */
    if(c.kind!=='match'&&early)current=early;
    else current={job_id:j.job_id,recognition_id:r.recognition_id||j.job_id,card:c,seconds:Math.round((Date.now()-timing.t0)/100)/10,timing:timing};
    if(current.timing&&!current.timing.first&&c.kind==='match')current.timing.first=Date.now()-timing.t0;
    /* the set hint answers for the 15 s scan, the one the set match ran on, even under an early card */
    current.hint_ref=r.recognition_id||j.job_id;
    /* the set this clip sits in, when the server already knows it and the set is public */
    current.in_set=r.in_set||null;
    current.loud=heldLoud;
    /* keep my clips (DECISION 12): the switch under more, the clip stays on this phone */
    var keep=!!(window.gmxClips&&gmxClips.on()&&heldBlob);
    if(keep)gmxClips.put({id:current.job_id,t:Date.now(),blob:heldBlob,recognition_id:current.recognition_id,kind:c.kind}).catch(function(){});
    showCard(resultCard(current)); remember(current,keep); reset();
  })
  .catch(function(e){
    if(finalDone)return;
    finalDone=true; say2('');
    if(early){current=early;current.loud=heldLoud;showCard(resultCard(current));remember(current,false);reset();return}
    var m=e&&e.message||'';
    if(m==='rate')rateHit=true;
    var netErr=!/^(rate|slow|key|failed|server|http )/.test(m);
    if(netErr&&draining){var d=draining;draining=null;drainFailed=true;showCard(errCard('still no signal for the clip from '+when(d.t)+'. it stays on this phone, we try again when you are back online.'));reset();return}
    if(netErr&&heldBlob&&!draining){queueClip(heldBlob);return}
    var text= m==='rate' ? 'too many scans this hour on this phone. try again in a bit.'
            : m==='slow' ? 'took too long. the recognizer did not answer in 30 seconds. try again.'
            : m==='key' ? 'the app key was refused. pull down to refresh and try again.'
            : m==='failed' ? 'the recognizer choked on that clip. try again.'
            : m==='server' ? 'the recognizer answered but is failing on its end. give it a minute and try again.'
            : m==='timeout' ? 'the upload stalled. check your signal and try again.'
            : 'could not reach the recognizer. check your signal and try again.';
    showCard(errCard(text)); reset();
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
function showCard(html){card.innerHTML=html;card.classList.add('on');try{var said=cardSays();if(said)announce(said)}catch(e){}card.scrollIntoView({behavior:'smooth',block:'nearest'});if(current&&current.card&&current.card.candidate&&html.indexOf('earlynote')<0||html.indexOf('earlynote')>-1)try{enrich(current)}catch(e){}try{decorate(html.indexOf('earlynote')>-1?early:current)}catch(e){}}
/* the crate heart and the label link (crate loop build, 2026-10-11). the heart saves the match on this phone
   like a tracklist row would, with whatever store links the card has at tap time, so a link that arrives
   later from enrich() still makes it in. the label line links to our label page when there is one. */
var namesIdx=null;
function namesIndex(){return namesIdx||(namesIdx=fx('/names-index.json',{},GET_MS).then(function(r){return r.ok?r.json():null}).catch(function(){return null}))}
function crateItem(cand){
  var nm=nameOf(cand)||{artist:'',title:''},links={};
  [].slice.call(card.querySelectorAll('#storerow a.btn:not(.find)')).forEach(function(a){var h=a.href||'';if(/open\.spotify\.com/.test(h))links.spotify=h;else if(/music\.apple\.com/.test(h))links.apple=h;else if(/beatport\.com/.test(h)&&!/search/.test(h))links.beatport=h;else if(/soundcloud\.com/.test(h)&&!/search/.test(h))links.soundcloud=h});
  var who=nm.artist||((card.querySelector('.sub')||{}).textContent||'').trim();
  var shown=nm.lib?((card.querySelector('h2')||{}).textContent||'').trim():'';
  var title=(who?who+' - ':'')+(shown||nm.title||'unnamed library entry');
  return {kind:'track',id:'scan:'+(foldT(who+' '+nm.title)||cand.library_id||'id'),title:title,sub:[cand.label||'',cand.status||'','found with the scan'].filter(Boolean).join(' · '),url:'/scan',links:links,artist:who,label:cand.label||''};
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
function errCard(text){return '<p class="kw"><b>hm.</b></p><h2>that did not work.</h2><p class="note">'+esc(text)+'</p><div class="row"><button class="btn red" data-act="again">scan again</button></div>'}

/* a refsync library entry (a reference clip the laptop contributed from an id upload) carries its file name and
   notes as the title and "refsync <poster>" as the artist. the card shows the caption as the title, nobody as the
   artist, and where it came from as a note, instead of printing the raw line. */
function libName(a,t){
  a=String(a||'');t=String(t||'');
  if(!(/^refsync\b/i.test(a)||/\bcaption:\s*/i.test(t)||/\bposted by\b/i.test(t)))return null;
  var cap=(t.match(/caption:\s*(.+?)\s*$/i)||[])[1]||'';
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
  return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="r" cx="50" cy="50" r="43.33"/><circle class="r" cx="50" cy="50" r="31.67"/><circle class="r" cx="50" cy="50" r="20"/><circle class="dot" cx="50" cy="50" r="7.51"/></svg>';
}
function artBlock(c){
  // the cover comes only from a store record (a released track). an unreleased ID has no cover to show,
  // so it carries the groovesmaxxing mark, the rings and the wave, with the word under it (G-MO, 2026-10-11).
  // a released track with no cover yet draws the plain rings until enrich() finds one.
  var a=safeUrl(c.artwork_url);
  if(a)return '<div class="art"><img src="'+esc(a)+'" alt="" loading="lazy" data-rings="1"></div>';
  if(c.released===false||(c.status&&c.status!=='out now'))return '<div class="art unrel" data-done="1">'+logoMark()+'<span class="ulbl">unreleased</span></div>';
  return '<div class="art">'+ringsMark()+'</div>';
}
function logoMark(){
  return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="r" cx="50" cy="50" r="43.33"/><circle class="r" cx="50" cy="50" r="31.67"/><circle class="r" cx="50" cy="50" r="20"/><circle class="dot" cx="50" cy="50" r="7.51"/>'+
    '<polyline class="wave" points="2.5,50 12.5,50 20,36.54 28.33,59.54 36.67,43.54 45,54.38 50,48.5 55,55.21 63.33,41.71 71.67,61.88 80,34.75 87.5,50 97.5,50"/></svg>';
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
function storeRow(c){
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
  out+='<div class="row"><button class="btn red" data-act="listen">listen again</button></div>';
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
    else{named=((lib||cand.status!=='out now')?'from our library of sets':'from the catalog')+(cand.status==='unreleased'?' · unreleased':cand.status==='out now'?' · out now':'');namedState='done'}
    if(cand.accepted_name){conf='a person confirmed this name';confState='done'}
    else{conf='waiting on you: that’s right, or it’s actually… two phones or the artist close it';confState=head==='ID'?'next':'now'}
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
function markSent(verdict){
  var p=$('path');if(!p)return;var li=p.lastElementChild;if(!li)return;
  li.className='st-done';
  li.querySelector('.nt').textContent=verdict==='confirm'?'your word is in. a second phone, a tracklist row or the artist closes it.':'your fix is in the queue. a second phone or a reviewer closes it, and the next scan shows it.';
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
    out+='<h3>right?</h3><div class="row"><button class="btn red" data-act="confirm">that\'s right</button><button class="btn" data-act="correct">it\'s actually...</button></div>';
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
    out+=(other?'<details class="guess"><summary class="kw">the catalog heard something else</summary>':'<div class="guess"><p class="kw">closest guess</p>')+'<p class="nm">'+(g?esc(g.artist)+(g.artist&&g.title?' - ':'')+esc(g.title):'an unnamed library entry')+'</p><p class="pc">'+sureLine(cand)+'</p><div id="hear"></div>';
    out+='<div class="row"><button class="btn" data-act="confirm">that\'s right</button><button class="btn" data-act="correct">it\'s actually...</button></div>'+(other?'</details>':'</div>');
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
function artRemember(k,v){try{var c=artCache();c[k]=v;var ks=Object.keys(c);while(ks.length>120){delete c[ks.shift()]}localStorage.setItem(ART_KEY,JSON.stringify(c))}catch(e){}}
function foldT(t){t=String(t||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase();t=t.replace(/\((?:extended|original|radio|club|edit|mix|remix|version|feat\.?|ft\.?)[^)]*\)/g,' ').replace(/\b(extended mix|original mix|radio edit|club mix)\b/g,' ');return t.replace(/[^a-z0-9]+/g,' ').trim()}
function jsonp(url,ms){return new Promise(function(res,rej){var cb='gmxcb'+Date.now()+Math.floor(Math.random()*1e4),sc=document.createElement('script'),t=setTimeout(function(){done();rej(new Error('timeout'))},ms||6000);
  function done(){clearTimeout(t);delete window[cb];if(sc.parentNode)sc.parentNode.removeChild(sc)}
  window[cb]=function(d){done();res(d)};sc.src=url+(url.indexOf('?')>-1?'&':'?')+'callback='+cb;sc.onerror=function(){done();rej(new Error('jsonp'))};document.head.appendChild(sc)})}
function tracks(){return tracksIdx?Promise.resolve(tracksIdx):fx('/tracks-index.json',{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(j){tracksIdx=j;return j}).catch(function(){return null})}
function sameTrack(q,row){return q&&row.q&&(row.q===q||(q.length>12&&(row.q.indexOf(q)>-1||q.indexOf(row.q)>-1)))}
function enrich(cur){
  var c=cur&&cur.card&&cur.card.candidate; if(!c)return;
  var nm=nameOf(c); if(!nm||!(nm.title||nm.artist))return;
  var artist=nm.artist||'', title=nm.title||'', q=foldT(artist+' '+title), key=q||foldT(title);
  var cardEl=card, art=cardEl.querySelector('.art'), store=cardEl.querySelector('#storerow'), hearEl=cardEl.querySelector('#hear');
  var l=c.store_links||{};
  /* an unreleased card carries no link to the song, ever (G-MO, 2026-09-27): no store button, no store cover, no store
     search. the same title on a released original must not leak its links onto an edit that is not out. */
  var unreleased=c.released===false||(c.status&&c.status!=='out now');
  function setArt(url){url=safeUrl(url);if(!art||!url||art.getAttribute('data-done'))return;art.setAttribute('data-done','1');var img=document.createElement('img');img.alt='';img.loading='lazy';img.onload=function(){img.classList.add('in');art.classList.add('found')};img.onerror=function(){img.remove()};img.src=url;art.innerHTML='';art.appendChild(img)}
  function addBtn(href,label,cls){href=safeUrl(href);if(!store||!href||store.querySelector('a[href="'+href+'"]'))return;var a=document.createElement('a');a.className='btn'+(cls?' '+cls:'');a.href=href;a.target='_blank';a.rel='noopener';a.textContent=label;var share=store.querySelector('[data-act="share"]');store.insertBefore(a,share||null);titleLink()}
  function titleLink(){
    var h=cardEl.querySelector('h2');if(!h||h.querySelector('a'))return;
    var best=['open.spotify.com','music.apple.com','deezer.com','soundcloud.com','beatport.com'].map(function(d){var a=store&&store.querySelector('a.btn:not(.find)[href*="'+d+'"]');return a&&a.href}).filter(Boolean)[0];
    if(!best)return;var a=document.createElement('a');a.className='listen';a.href=best;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','listen to '+h.textContent);a.textContent=h.textContent;h.innerHTML='';h.appendChild(a);
  }
  titleLink();
  var cached=artCache()[key];
  if(cached){if(cached.img&&!c.artwork_url)setArt(cached.img);if(cached.ap)addBtn(cached.ap,'apple music');if(cached.dz)addBtn(cached.dz,'deezer');if(cached.sp&&!l.spotify)addBtn(cached.sp,'spotify')}
  /* 1. our own tracklists: a verified spotify link, and the sets where it was played */
  tracks().then(function(j){
    if(!j)return;var hits=j.rows.filter(function(r){return sameTrack(q,r)||(title&&foldT(title).length>8&&r.q.indexOf(foldT(title))>-1&&(!artist||r.q.indexOf(foldT(artist).split(' ')[0])>-1))}).slice(0,6);
    if(!hits.length)return;
    var sp=hits.map(function(r){return r.links&&r.links.sp}).filter(Boolean)[0];
    if(sp&&!l.spotify&&!unreleased){addBtn(sp,'spotify');artRemember(key,Object.assign(artCache()[key]||{},{sp:sp}))}
    /* no artist on the card, but our tracklists name the record: take their name whole, artist and the full title
       with its edit credit (G-MO, 2026-10-11: "Whisper To Me (Assaf Michael & Reef Kopel Edit)", not just the
       caption), say so, and link the profile when there is one. the most played name across the sets wins. */
    if(!artist&&!cardEl.querySelector('.sub')){
      var count={};hits.forEach(function(r){var n=String(r.n||'').trim();if(n&&n.indexOf(' - ')>0&&!/^id\s*-/i.test(n))count[n]=(count[n]||0)+1});
      var full=Object.keys(count).sort(function(a,b){return count[b]-count[a]||b.length-a.length})[0];
      if(full){
        var who=full.split(' - ')[0].trim(),ttlName=full.split(' - ').slice(1).join(' - ').trim();
        var h2=cardEl.querySelector('h2'),sub=document.createElement('p');sub.className='sub';sub.textContent=who;
        if(h2){if(nm.lib&&ttlName&&foldT(ttlName).indexOf(foldT(title))>-1){h2.textContent=ttlName;h2.classList.toggle('long',ttlName.length>42)}h2.insertAdjacentElement('afterend',sub)}
        var t=cardEl.querySelector('.ttl');if(t&&/no artist named yet/.test(t.textContent))t.textContent=t.textContent.replace('no artist named yet','named in our tracklists');
        checkArtistPage(who);
      }
    }
    if(hearEl&&!hearEl.children.length){
      hearEl.innerHTML='<h3>hear it in</h3><ul class="heard hear">'+hits.map(function(r){var rl=safeUrl(r.l),ru=safeUrl(r.u);var play=rl?'<a href="'+esc(rl)+'" target="_blank" rel="noopener">play from '+esc(r.at)+' ↗</a>':esc(r.at);return '<li><a href="'+esc(ru)+'">'+esc(r.set)+'<small>'+esc(r.n)+(r.lab?' · '+esc(r.lab):'')+'</small></a><span class="at">'+play+'</span></li>'}).join('')+'</ul>';
    }
  });
  if(unreleased||(c.artwork_url&&l.spotify&&l.apple))return;
  /* 2. spotify's embed service gives the cover for a spotify link, no key needed */
  var viaSpotify=l.spotify?fx('https://open.spotify.com/oembed?url='+encodeURIComponent(l.spotify),{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.thumbnail_url&&!c.artwork_url){setArt(j.thumbnail_url);artRemember(key,Object.assign(artCache()[key]||{},{img:j.thumbnail_url}))}}).catch(function(){}):Promise.resolve();
  /* 3. apple's public search: the cover at 600px and the apple music link, matched on the folded name */
  if(!(cached&&cached.ap)&&(artist||title)){
    fx('https://itunes.apple.com/search?media=music&entity=song&limit=6&term='+encodeURIComponent((artist+' '+title).trim()),{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(j){
      var hit=(j&&j.results||[]).filter(function(x){var fq=foldT((x.artistName||'')+' '+(x.trackName||''));return fq===q||(q.length>12&&(fq.indexOf(foldT(title))>-1&&fq.indexOf(foldT(artist).split(' ')[0])>-1))})[0];
      if(!hit)return;var img=(hit.artworkUrl100||'').replace(/100x100bb/,'600x600bb');
      if(img&&!c.artwork_url)setArt(img);if(hit.trackViewUrl&&!l.apple)addBtn(hit.trackViewUrl,'apple music');
      artRemember(key,Object.assign(artCache()[key]||{},{img:img||undefined,ap:hit.trackViewUrl}));
    }).catch(function(){});
  }
  /* 4. deezer, through jsonp since its api has no cors */
  if(!(cached&&cached.dz)&&(artist||title)){
    jsonp('https://api.deezer.com/search?limit=5&output=jsonp&q='+encodeURIComponent((artist+' '+title).trim()),6000).then(function(j){
      var hit=(j&&j.data||[]).filter(function(x){var fq=foldT((x.artist&&x.artist.name||'')+' '+(x.title||''));return fq===q||(q.length>12&&fq.indexOf(foldT(title))>-1)})[0];
      if(!hit)return;addBtn(hit.link,'deezer');if(hit.album&&hit.album.cover_big&&!c.artwork_url)setArt(hit.album.cover_big);
      artRemember(key,Object.assign(artCache()[key]||{},{dz:hit.link}));
    }).catch(function(){});
  }
  /* 5. last resort when a released track has no real link: a search on each store */
  viaSpotify.then(function(){setTimeout(function(){
    if(!store||c.status!=='out now')return;var qs=encodeURIComponent((artist+' '+title).trim());
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
function correctionForm(){
  return '<form class="form" id="cform" autocomplete="off"><label for="c-artist">artist</label><input id="c-artist" name="artist_claim" maxlength="255">'+
    '<label for="c-title">title</label><input id="c-title" name="title_claim" maxlength="512">'+
    '<label for="c-url">a link that proves it (optional)</label><input id="c-url" name="source_url" inputmode="url" maxlength="1024" placeholder="https://">'+
    '<label for="c-ig">your instagram (optional)</label><input id="c-ig" name="ig_handle" maxlength="64" placeholder="@">'+
    '<label for="c-note">anything else</label><textarea id="c-note" name="note" maxlength="1000"></textarea>'+
    '<div class="hp" aria-hidden="true"><label for="c-web">website</label><input id="c-web" name="website" tabindex="-1" autocomplete="off"></div>'+
    '<div class="row"><button class="btn red" type="submit">send the fix</button><button class="btn ghost" type="button" data-act="closeform">never mind</button></div>'+
    (sessionToken()?'':'<p class="smeta">get credit for this: <a href="#you">sign in</a> and your handle goes on the IDs you help name.</p>')+'</form>';
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
function showShared(){var p=$('shared');if(!p)return;if(sharedLink){p.textContent='set link ready. scan, then tag it under the result.';p.hidden=false}else{p.hidden=true}}
(function(){
  try{
    var q=new URLSearchParams(location.search), all=[q.get('url'),q.get('text'),q.get('title')].join(' '), m=all.match(/https:\/\/[^\s]+/);
    if(m&&/(^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be|soundcloud\.com)\/)/i.test(m[0])){sharedLink=m[0];history.replaceState(null,'',location.pathname)}
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
  var b=ev.target.closest('[data-act]'); if(!b)return;
  var act=b.getAttribute('data-act');
  if(act==='where'){openWhere();return}
  if(act==='again'){card.classList.remove('on');card.innerHTML='';dropBlob();current=null;window.scrollTo({top:0,behavior:'smooth'});return}
if(act==='listen'){card.classList.remove('on');card.innerHTML='';dropBlob();current=null;window.scrollTo({top:0,behavior:'smooth'});startScan();return}
  if(act==='share'){share();return}
  if(act==='confirm'){sendCorrection({verdict:'confirm'});return}
  if(act==='follow'){followNow(b);return}
  if(act==='correct'){var f=$('cform');if(f){f.classList.add('on');$('c-artist').focus()}return}
  if(act==='help'){var h=$('hform');if(h){h.classList.add('on');$('h-venue').focus()}return}
  if(act==='closeform'){var fm=b.closest('form');if(fm)fm.classList.remove('on');return}
});
card.addEventListener('submit',function(ev){
  ev.preventDefault();
  var f=ev.target;
  if(f.id==='cform'){
    var a=f.artist_claim.value.trim(), t=f.title_claim.value.trim();
    if(!a&&!t){say('an artist or a title, at least one.');return}
    sendCorrection({verdict:'correct',artist_claim:a||null,title_claim:t||null,source_url:f.source_url.value.trim()||null,
      ig_handle:f.ig_handle.value.trim()||null,note:f.note.value.trim()||null,website:f.website.value||''});
  }else if(f.id==='hform'){
    sendHelp(f);
  }else if(f.id==='wform'){
    sendHint(f);
  }
});
function sendCorrection(body){
  if(!current){say('nothing to answer for.');return}
  body.recognition_id=current.recognition_id;
  say('sending');
  fx(cfg.api_base+'/corrections',{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify(body)},POST_MS)
  .then(function(r){
    if(r.status===409){say('this phone already answered for this one.');return}
    if(r.status===429){say('too many this hour, try later.');return}
    if(!r.ok)throw new Error(r.status);
    say(body.verdict==='confirm'?'logged. appreciate you.':'logged, we will check it. appreciate you.',true);
    markSent(body.verdict);
    var f=$('cform');if(f)f.classList.remove('on');
  }).catch(function(){say('did not send. check your signal and try again.')});
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
function share(){
  if(!current||!current.card.candidate)return;
  var c=current.card.candidate, nm=nameOf(c), l=c.store_links||{};
  var text=(nm?(nm.artist?nm.artist+' - ':'')+nm.title:'an unreleased ID')+' · found with the groovesmaxxing scan';
  var url=l.spotify||l.apple||l.beatport_search||'https://groovesmaxxing.com/scan';
  if(navigator.share){navigator.share({title:'groovesMAXXING',text:text,url:url}).catch(function(){});return}
  if(navigator.clipboard){navigator.clipboard.writeText(text+' '+url).then(function(){say('copied.',true)}).catch(function(){})}
}

/* history, on the phone only */
function loadHistory(){try{return JSON.parse(localStorage.getItem('gmx_history')||'[]')}catch(e){return []}}
function remember(cur,keep){
  var c=cur.card, cand=c.candidate, nm=cand?nameOf(cand):null;
  var row={t:draining?draining.t:Date.now(),kind:c.kind,artist:nm?nm.artist:'',title:nm?nm.title:'',score:cand?cand.shown_score:0,status:cand?cand.status:'',id:cur.job_id,rid:cur.recognition_id,clip:!!keep,secs:cur.timing&&cur.timing.first?Math.round(cur.timing.first/100)/10:null};
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
function renderHistory(){
  var h=loadHistory();
  if(!h.length){recentlist.innerHTML='<li class="none">nothing scanned yet.</li>';return}
  recentlist.innerHTML=h.map(function(r){
    var who;
    if(r.kind==='match')who='<span data-artist="'+esc(r.artist||'')+'">'+esc(r.artist||'ID')+'</span><small>'+esc(r.title||'unnamed library entry')+' · '+pct(r.score)+(r.secs?' · '+r.secs+' s':'')+'</small>';
    else if(r.kind==='guess')who='no match<small>closest guess: '+esc((r.artist?r.artist+' - ':'')+r.title)+(r.score==null?' · possible match':' · '+pct(r.score))+'</small>';
    else who='no match<small>nothing yet</small>';
    if(r.sent&&r.sent.status)who+='<small>not kept, the app refused it ('+esc(String(r.sent.status))+(r.sent.detail?': '+esc(r.sent.detail):'')+')</small>';
    var acts='', btns='';
    if(r.clip&&r.id)btns='<button class="btn" data-clip="again" data-id="'+esc(r.id)+'">scan again</button>'+(r.kind!=='match'?'<button class="btn" data-clip="help" data-id="'+esc(r.id)+'">help us find it</button>':'');
    /* E6c: a no-match row can follow only the clip it kept (r.kept, set by markRow when a keep lands) */
    if(r.rid&&r.status!=='out now'&&(r.kind==='match'||r.kind==='guess'||r.kept))btns+='<button class="btn ghost" data-follow="'+esc(r.rid)+'">tell me when it drops</button>';
    if(btns)acts='<span class="acts">'+btns+'<span class="msg" role="status"></span></span>';
    return '<li><span class="who">'+who+'</span><span class="when">'+when(r.t)+'</span>'+acts+'</li>';
  }).join('');
  linkHistoryArtists();
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
      busy=true; card.classList.remove('on'); current=null; heldBlob=rec.blob; heldAt=new Date(rec.t).toISOString(); heldLoud=false;
      scanSeq++; early=null; finalDone=false; rateHit=false; timing={t0:Date.now(),rounds:[],first:null};
      go.classList.add('busy'); window.scrollTo({top:0,behavior:'smooth'}); identify(rec.blob); return;
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
        if(!pushed&&!sessionToken()){var ye=$('y-email');if(ye){try{ye.scrollIntoView({block:'center',behavior:'smooth'})}catch(e){ye.scrollIntoView()}setTimeout(function(){ye.focus()},400)}}
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
    gmxAccount.finish(tok).then(function(r){
      if(r.status===410){youNote('that link is used up or too old. ask for a new one.');return}
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(j){setSession(j.session);meCache=null;renderYou();justIn=true;ensurePush()});
    }).catch(function(){youNote('could not finish signing in. check your signal and try the link again.')});
  }
  renderYou(); loadFollows(); resumeWait();
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
  gmxAccount.code(f.dataset.email,code).then(function(r){
    if(r.status===410){m.textContent='that code is wrong, used or too old. ask for a new one.';return}
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(j){setSession(j.session);meCache=null;renderYou();justIn=true;loadFollows();ensurePush()});
  }).catch(function(){m.textContent='did not send. check your signal.'});
}
/* the link wait (the ticket, the poll, the reload) lives in gmx-account.js now */
function signedInByLink(){meCache=null;renderYou();justIn=true;loadFollows();ensurePush()}
function waitForLink(ticket,minutes){gmxAccount.waitForLink(ticket,minutes,signedInByLink)}
function resumeWait(){gmxAccount.resumeWait(signedInByLink)}
var justIn=false, pushNow='', setupWas=null;
/* the chip beside the auto button moved to the header of every page (gmx-account.js, shell v2) */
/* roles (2026-10-12): the badge word for User.role, the cache of the highest verified row */
var ROLE_WORD={verified_artist:'verified artist',verified_label:'verified label',verified_venue:'verified venue',team:'team'};
function renderYou(){
  var box=$('youbody'); if(!box||!cfg)return;
  if(!sessionToken()){
    box.innerHTML='<p class="smeta">sign in to get told by email when an ID you scanned comes out, keep your scans across phones, and put your name on the IDs you help with.</p>'+
      '<form class="form on" id="yform" autocomplete="off"><label for="y-email">email</label><input id="y-email" name="email" type="email" inputmode="email" maxlength="320" required>'+
      '<div class="row"><button class="btn red" type="submit">send me a sign-in link</button><span class="msg" role="status" id="youmsg"></span></div></form>';
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
  gmxAccount.me(true).then(function(me){
    if(!me){renderYou();return}
    meCache=me;paint(me);
  }).catch(function(){box.innerHTML='<p class="smeta">signed in, but the recognizer did not answer. <button class="btn ghost" type="button" data-you="out">sign out</button></p>'});
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
      var nm=f.url&&f.state==='notified'?'<a href="'+esc(f.url)+'" target="_blank" rel="noopener">'+esc(f.name||'an ID')+'</a>':esc(f.name||'an ID');
      return '<li><span class="who">'+nm+'<small>'+st+'</small></span>'+(f.state==='open'?'<span class="acts"><button class="btn ghost" data-unfollow="'+esc(f.follow_id)+'">stop</button></span>':'<span class="when">'+when(new Date(f.released||f.created_at).getTime())+'</span>')+'</li>';
    }).join('');
  }).catch(function(){});
}
document.addEventListener('submit',function(ev){
  var f=ev.target;
  if(f.id==='yform'){
    ev.preventDefault(); var email=$('y-email').value.trim(); if(!email||!cfg)return; youNote('sending');
    gmxAccount.start(email).then(function(r){
      if(r.status===429){youNote('too many links for that address this hour.');return}
      if(r.status===422){youNote('that does not look like an email address.');return}
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(j){
        youNote(j.mail_sent?'sent. type the six digits from the mail here, or tap its link anywhere.':'the mail could not go out right now. try again later.',j.mail_sent);
        if(j.mail_sent){showCodeForm(email);if(j.pending)waitForLink(j.pending,j.minutes||20)}
      });
    }).catch(function(){youNote('did not send. check your signal and try again.')});
  }else if(f.id==='cform2'){
    ev.preventDefault(); sendCode(f);
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
    var who=r.kind==='pending'?'kept, no signal<small>matched when you are back online</small>':r.name?(r.kind==='guess'?'<span>maybe '+esc(r.name)+'</span>':'<span>'+esc(r.name)+'</span>')+'<small>'+(r.kind==='guess'?'closest guess':pct(r.score))+(r.n>1?' · heard '+r.n+' times':'')+'</small>':'nothing named<small>no match</small>';
    return '<li><span class="who">'+who+'</span><span class="when">+'+fmtOffset(r.off)+'</span></li>';
  }).join(''):'<li class="none">listening. the first result lands here.</li>';
}
$('sessiontools').addEventListener('click',function(e){
  var b=e.target.closest('[data-s]');if(!b)return;var s=loadSession();
  if(b.getAttribute('data-s')==='clear'){if(s.rows.length&&!confirm('clear tonight\'s list on this phone?'))return;saveSession({start:auto?Date.now():0,rows:[]});renderSession();sessionmsg.textContent='cleared.';return}
  var lines=s.rows.filter(function(r){return r.name}).map(function(r){return fmtOffset(r.off)+'  '+(r.kind==='guess'?'? ':'')+r.name});
  if(!lines.length){sessionmsg.textContent='nothing named yet.';return}
  var txt='tonight with groovesmaxxing · '+fmtClock(s.start)+'\n'+lines.join('\n')+'\nhttps://groovesmaxxing.com/scan';
  if(navigator.clipboard)navigator.clipboard.writeText(txt).then(function(){sessionmsg.textContent='copied, '+lines.length+' lines.'},function(){sessionmsg.textContent='could not copy.'});else sessionmsg.textContent='copy is not available here.';
});
/* the offline queue */
function queueClip(blob){
  var rec={id:'q'+Date.now()+Math.floor(Math.random()*1000),t:Date.now(),blob:blob,kind:'pending',heard_at:heldAt||new Date().toISOString()};
  var store=window.gmxClips?gmxClips.put(rec):Promise.reject(new Error('no store'));
  store.then(function(){
    sessionAdd({t:rec.t,kind:'pending',name:''});
    showCard('<p class="kw"><b>kept.</b></p><h2>no signal, no problem.</h2><p class="note">the clip stays on this phone and gets matched the moment you are back online. nothing is sent until then.</p><div class="row"><button class="btn red" data-act="again">scan again</button></div>');
    renderPending();
  },function(){
    showCard(errCard('could not reach the recognizer, and could not keep the clip on this phone either. try again when you have signal.'));
  });
  heldBlob=null;reset();
}
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
    busy=true;card.classList.remove('on');current=null;heldBlob=rec.blob;heldAt=rec.heard_at||new Date(rec.t).toISOString();heldLoud=false;
    scanSeq++;early=null;finalDone=false;rateHit=false;timing={t0:Date.now(),rounds:[],first:null};
    go.classList.add('busy');say2('matching a clip from '+when(rec.t));renderPending();
    identify(rec.blob);
  });
}
window.addEventListener('online',function(){renderPending();setTimeout(drain,1500)});
window.addEventListener('offline',renderPending);
renderAuto();renderSession();renderPending();
if(navigator.onLine)setTimeout(drain,2500);
window.gmxSession={start:autoStart,stop:autoStop,drain:drain,queue:queueClip,session:loadSession};
window.gmxPath={block:pathBlock,sent:markSent};   /* the site check renders the four steps from a made-up result */
window.gmxScanDemo=function(res){current=res;showCard(resultCard(res))};
(function(){var hb=document.getElementById('howbtn'),box=document.getElementById('howbox'),hc=document.getElementById('howclose');if(!hb||!box||!box.showModal){if(hb)hb.style.display='none';return}hb.addEventListener('click',function(){box.showModal()});hc.addEventListener('click',function(){box.close()});box.addEventListener('click',function(e){if(e.target===box)box.close()});})();
})();
