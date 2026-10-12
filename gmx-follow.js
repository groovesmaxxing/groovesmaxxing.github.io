/* groovesmaxxing follow-along tracklists (2026-10-11). vanilla, no dependencies beyond the players' own apis.
   press play on the embedded set and the row that is playing lights up and scrolls into view. tap a
   timestamp and the player jumps there. youtube through the iframe api, soundcloud through the widget api.
   nothing loads until the page has an embed and a tracklist, and the apis load only then. */
(function(){
'use strict';
var frame=document.querySelector('.embed iframe'),rows=[].slice.call(document.querySelectorAll('table.tl tr'));
if(!frame||rows.length<2)return;
var src=frame.getAttribute('src')||'',yt=/youtube(-nocookie)?\.com\/embed\/([A-Za-z0-9_-]+)/.exec(src),sc=/w\.soundcloud\.com\/player/.test(src);
if(!yt&&!sc)return;
function secs(t){var p=t.trim().split(':').map(Number);if(p.some(isNaN))return null;return p.reduce(function(a,b){return a*60+b},0)}
var marks=rows.map(function(r){var c=r.querySelector('td.t');var a=c&&c.querySelector('a');var s=c?secs(a?a.textContent:c.textContent):null;return s==null?null:{row:r,at:s,name:(r.querySelector('td.x')||{}).textContent||''}}).filter(Boolean);
if(marks.length<2)return;
var css='tr.now td{background:rgba(255,28,2,.08)}tr.now td.t,tr.now td.t a{color:#fff}tr.now td.n{color:var(--racing,#FF1C02)}'+
 '#gmx-now{position:fixed;left:12px;right:12px;bottom:calc(74px + env(safe-area-inset-bottom));z-index:59;margin:0 auto;max-width:640px;display:none;align-items:center;gap:12px;background:rgba(11,11,13,.96);border:1px solid rgba(255,28,2,.45);border-radius:999px;padding:10px 14px 10px 16px;box-shadow:0 10px 40px rgba(0,0,0,.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-family:"Space Mono",monospace;font-size:.78rem;color:#F2F2EF}'+
 '@media (min-width:1025px){#gmx-now{bottom:20px}}#gmx-now.on{display:flex}#gmx-now .dot{width:8px;height:8px;border-radius:50%;background:#FF1C02;flex:none;animation:gmx-nowpulse 1.2s ease-in-out infinite}'+
 '@keyframes gmx-nowpulse{50%{opacity:.35}}#gmx-now .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gmx-now .nm b{color:#FF1C02;font-weight:400;margin-right:8px}'+
 '#gmx-now button{font:inherit;font-size:.72rem;letter-spacing:.08em;border:1px solid rgba(242,242,239,.2);background:transparent;color:#8A8A93;border-radius:999px;padding:6px 10px;cursor:pointer;min-height:32px}#gmx-now button[aria-pressed="true"]{color:#F2F2EF;border-color:#FF1C02}'+
 '@media (prefers-reduced-motion: reduce){#gmx-now .dot{animation:none}}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
var bar=document.createElement('div');bar.id='gmx-now';bar.setAttribute('role','status');bar.innerHTML='<span class="dot" aria-hidden="true"></span><span class="nm"></span><button type="button" id="gmx-follow" aria-pressed="true">following</button>';
document.body.appendChild(bar);
var nm=bar.querySelector('.nm'),btn=bar.querySelector('#gmx-follow'),follow=true,cur=-1,timer=null,seek=null;
btn.addEventListener('click',function(){follow=!follow;btn.setAttribute('aria-pressed',follow?'true':'false');btn.textContent=follow?'following':'follow';if(follow&&cur>=0)show(cur,true)});
function show(i,scroll){
  if(i===cur&&!scroll)return;
  marks.forEach(function(m,k){m.row.classList.toggle('now',k===i)});
  cur=i;var m=marks[i];if(!m)return;
  var n=m.row.querySelector('td.n');nm.innerHTML='<b>'+(n?n.textContent:'')+'</b>'+m.name.replace(/\s+/g,' ').trim().slice(0,90);bar.classList.add('on');
  if(follow&&scroll!==false){var r=m.row.getBoundingClientRect();if(r.top<80||r.bottom>innerHeight-120)m.row.scrollIntoView({block:'center',behavior:'smooth'})}
}
function tick(t){
  var i=-1;for(var k=0;k<marks.length;k++){if(marks[k].at<=t+0.5)i=k;else break}
  if(i>=0&&i!==cur)show(i,true);
}
rows.forEach(function(r){var a=r.querySelector('td.t a');if(!a)return;a.addEventListener('click',function(e){
  if(!seek||e.metaKey||e.ctrlKey||e.shiftKey)return;
  var s=secs(a.textContent);if(s==null)return;e.preventDefault();seek(s);
  frame.scrollIntoView({block:'center',behavior:'smooth'});
})});
function script(url,cb){var s=document.createElement('script');s.src=url;s.async=true;s.onload=cb;document.head.appendChild(s)}
if(yt){
  var id=yt[2],origin=location.origin;
  var u=new URL(frame.src);u.searchParams.set('enablejsapi','1');u.searchParams.set('origin',origin);frame.src=u.toString();
  window.onYouTubeIframeAPIReady=function(){
    var p=new YT.Player(frame,{events:{onStateChange:function(e){
      clearInterval(timer);
      if(e.data===YT.PlayerState.PLAYING){timer=setInterval(function(){try{tick(p.getCurrentTime())}catch(x){}},500);tick(p.getCurrentTime())}
    }}});
    seek=function(s){p.seekTo(s,true);p.playVideo();tick(s)};
  };
  script('https://www.youtube.com/iframe_api');
}else{
  script('https://w.soundcloud.com/player/api.js',function(){
    if(!window.SC||!SC.Widget)return;
    var w=SC.Widget(frame);
    w.bind(SC.Widget.Events.PLAY_PROGRESS,function(e){tick(e.currentPosition/1000)});
    seek=function(s){w.seekTo(s*1000);w.play();tick(s)};
  });
}
})();
