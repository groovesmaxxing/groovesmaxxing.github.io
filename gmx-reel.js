/* the name reels on the home page (2026-10-14). build_reels.py writes each row once, this doubles it so the
   loop is seamless and sets a speed from its width, so long and short rows drift at the same pace.
   a row holds still under a finger or the mouse (css), and the whole reel holds still for reduced motion,
   where the rows scroll by hand instead. the names are pointer shortcuts only, the "see all" links under
   each reel are the keyboard and screen reader way in. */
(function(){
var still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function go(){
  var rows=document.querySelectorAll('.reel-track');
  for(var i=0;i<rows.length;i++){
    var t=rows[i];
    if(still||t.getAttribute('data-loop'))continue;
    var kids=[].slice.call(t.children);
    kids.forEach(function(k){var c=k.cloneNode(true);c.setAttribute('aria-hidden','true');t.appendChild(c)});
    t.setAttribute('data-loop','1');
    var w=t.scrollWidth/2;
    t.style.animationDuration=Math.max(30,Math.round(w/38))+'s';
  }
  var reels=document.querySelectorAll('.reel');
  for(var j=0;j<reels.length;j++){if(!still)reels[j].classList.add('reel-on');reels[j].setAttribute('aria-hidden','true')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
})();
