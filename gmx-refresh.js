/* groovesmaxxing pull to refresh (phase 5 stop 3h). the installed app has no browser bar, so a
   drag down from the top of a page reloads it: a ring shows the pull, release past the line
   reloads. never while the scan page is listening or finding (window.gmxRefreshBlocked).
   also asks the service worker to check for a new build each time the app comes back. */
(function(){
'use strict';
var THRESH=70, MAXPULL=120, startY=null, pulling=false, armed=false, ring=null;
function blocked(){try{return !!(window.gmxRefreshBlocked&&window.gmxRefreshBlocked())}catch(e){return false}}
function mk(){
  if(ring)return ring;
  ring=document.createElement('div');
  ring.setAttribute('aria-hidden','true');
  ring.style.cssText='position:fixed;left:50%;top:0;width:34px;height:34px;margin-left:-17px;border-radius:50%;border:3px solid rgba(242,242,239,.25);border-top-color:#FF1C02;background:rgba(11,11,13,.85);transform:translateY(-44px);opacity:0;z-index:70;pointer-events:none;transition:opacity .15s';
  document.body.appendChild(ring);
  return ring;
}
function show(d){
  var r=mk(), p=Math.min(1,d/THRESH);
  r.style.opacity=String(Math.min(1,d/30));
  r.style.transform='translateY('+(Math.min(d,MAXPULL)*0.6-10)+'px) rotate('+(p*360)+'deg)';
  r.style.background=p>=1?'#FF1C02':'rgba(11,11,13,.85)';
  r.style.borderTopColor=p>=1?'#F2F2EF':'#FF1C02';
}
function hide(){if(ring){ring.style.opacity='0';ring.style.transform='translateY(-44px)'}}
document.addEventListener('touchstart',function(e){
  if(e.touches.length!==1||window.scrollY>0||blocked()){startY=null;return}
  startY=e.touches[0].clientY; pulling=false; armed=false;
},{passive:true});
document.addEventListener('touchmove',function(e){
  if(startY===null)return;
  var d=e.touches[0].clientY-startY;
  if(d<=0||window.scrollY>0){if(pulling){hide();pulling=false;armed=false}return}
  pulling=true; armed=d>=THRESH; show(d);
},{passive:true});
function end(){
  if(startY===null)return;
  startY=null;
  if(pulling&&armed&&!blocked()){location.reload();return}
  hide(); pulling=false; armed=false;
}
document.addEventListener('touchend',end,{passive:true});
document.addEventListener('touchcancel',end,{passive:true});
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible'||!('serviceWorker' in navigator))return;
  navigator.serviceWorker.getRegistration().then(function(r){if(r)return r.update()}).catch(function(){});
});
})();
