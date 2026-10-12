/* groovesmaxxing pull to refresh (2026-10-11 rework of the phase 5 one). the installed app has no browser
   bar, so a drag down from the top of a page refreshes it. three states that read as states: pull, release,
   refreshing. a rubber band on the drag, a tick at the line, a short "fresh" toast on the page that comes back.
   never while the scan page is listening or finding (window.gmxRefreshBlocked). never on a sideways swipe,
   so the carousels keep their swipe. with no signal it says so instead of failing. */
(function(){
'use strict';
var THRESH=72, MAXPULL=140, startX=null, startY=null, pulling=false, armed=false, dir=null, ui=null, label=null, ring=null, busy=false;
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function blocked(){try{return !!(window.gmxRefreshBlocked&&window.gmxRefreshBlocked())}catch(e){return false}}
function tick(ms){try{if(navigator.vibrate)navigator.vibrate(ms||15)}catch(e){}}
function mk(){
  if(ui)return ui;
  var st=document.createElement('style');
  st.textContent='#gmx-ptr{position:fixed;left:50%;top:0;transform:translate(-50%,-70px);z-index:70;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 10px;border-radius:999px;background:rgba(11,11,13,.94);border:1px solid rgba(242,242,239,.14);box-shadow:0 10px 30px rgba(0,0,0,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-family:"Space Mono",monospace;font-size:.72rem;letter-spacing:.08em;color:#8A8A93;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s}'+
   '#gmx-ptr .r{width:22px;height:22px;border-radius:50%;border:3px solid rgba(242,242,239,.18);border-top-color:#FF1C02;flex:none}'+
   '#gmx-ptr.armed{color:#F2F2EF;border-color:rgba(255,28,2,.6)}#gmx-ptr.armed .r{border-color:#FF1C02}'+
   '#gmx-ptr.busy .r{animation:gmx-ptrspin .8s linear infinite}@keyframes gmx-ptrspin{to{transform:rotate(360deg)}}'+
   '#gmx-fresh{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:70;padding:8px 14px;border-radius:999px;background:#FF1C02;color:#0B0B0D;font-family:"Space Mono",monospace;font-size:.72rem;letter-spacing:.1em;box-shadow:0 10px 30px rgba(0,0,0,.4);animation:gmx-fresh 1.8s ease forwards}'+
   '@keyframes gmx-fresh{0%{opacity:0;transform:translate(-50%,-10px)}12%{opacity:1;transform:translate(-50%,0)}80%{opacity:1}100%{opacity:0}}'+
   '@media (prefers-reduced-motion: reduce){#gmx-ptr.busy .r{animation:none}#gmx-fresh{animation:none;opacity:1}}';
  document.head.appendChild(st);
  ui=document.createElement('div');ui.id='gmx-ptr';ui.setAttribute('role','status');ui.setAttribute('aria-live','polite');
  ui.innerHTML='<span class="r" aria-hidden="true"></span><span class="l">pull to refresh</span>';
  ring=ui.querySelector('.r');label=ui.querySelector('.l');document.body.appendChild(ui);
  return ui;
}
function show(d){
  var u=mk(),p=Math.min(1,d/THRESH),ease=Math.min(MAXPULL,d*(1-d/(MAXPULL*2.6)));   /* the rubber band */
  u.style.opacity=String(Math.min(1,d/24));
  u.style.transform='translate(-50%,'+(ease*0.55-56)+'px)';
  if(!reduce)ring.style.transform='rotate('+(p*300)+'deg)';
  var on=p>=1;if(on!==armed){armed=on;u.classList.toggle('armed',on);label.textContent=on?'release to refresh':'pull to refresh';if(on)tick(15)}
}
function hide(){if(ui){ui.style.opacity='0';ui.style.transform='translate(-50%,-70px)';ui.classList.remove('armed','busy')}armed=false;pulling=false}
function go(){
  busy=true;var u=mk();u.classList.add('busy');u.classList.remove('armed');u.style.opacity='1';u.style.transform='translate(-50%,14px)';
  if(navigator.onLine===false){label.textContent='no signal, showing the saved copy';tick(30);setTimeout(function(){hide();busy=false},1400);return}
  label.textContent='refreshing';tick(20);
  try{sessionStorage.setItem('gmx_fresh','1')}catch(e){}
  var reg=('serviceWorker' in navigator)?navigator.serviceWorker.getRegistration():Promise.resolve(null);
  Promise.resolve(reg).then(function(r){if(r)return r.update()}).catch(function(){}).then(function(){location.reload()});
}
document.addEventListener('touchstart',function(e){
  if(busy||e.touches.length!==1||window.scrollY>0||blocked()){startY=null;return}
  var t=e.target;if(t.closest&&t.closest('input,textarea,select,[contenteditable],.set-viewport,.rail,.jump,[style*="overflow-x"]')){startY=null;return}
  startX=e.touches[0].clientX;startY=e.touches[0].clientY;pulling=false;armed=false;dir=null;
},{passive:true});
document.addEventListener('touchmove',function(e){
  if(startY===null)return;
  var dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY;
  if(!dir&&(Math.abs(dx)>8||Math.abs(dy)>8))dir=Math.abs(dx)>Math.abs(dy)?'x':'y';
  if(dir==='x'){startY=null;hide();return}                     /* a sideways swipe belongs to whatever is under it */
  if(dy<=0||window.scrollY>0){if(pulling)hide();return}
  pulling=true;show(dy);
},{passive:true});
function end(){if(startY===null)return;startY=null;if(pulling&&armed&&!blocked()){go();return}hide()}
document.addEventListener('touchend',end,{passive:true});
document.addEventListener('touchcancel',end,{passive:true});
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible'||!('serviceWorker' in navigator))return;
  navigator.serviceWorker.getRegistration().then(function(r){if(r)return r.update()}).catch(function(){});
});
/* the page that comes back after a refresh says so, once */
try{if(sessionStorage.getItem('gmx_fresh')){sessionStorage.removeItem('gmx_fresh');mk();var f=document.createElement('div');f.id='gmx-fresh';f.textContent='fresh';f.setAttribute('role','status');document.body.appendChild(f);setTimeout(function(){f.remove()},2200)}}catch(e){}
})();
