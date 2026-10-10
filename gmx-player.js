/* groovesmaxxing shared youtube stage (site navigation build, 2026-10-10). vanilla, no dependencies.
   one player for every set and talk on the site: full width, prev and next arrows, a counter, the dots,
   swipe on touch, arrow keys, nothing loads until you tap, youtube-nocookie embeds.
   home page: upgrades the two pools in place. data-window keeps the weekly seven, data-auto the slow advance,
   and one slide marked data-featured keeps the first slot (the one hand pick per carousel).
   artist and label pages: reads the generated rails (the sets:start and interviews:start blocks, and the
   old iframe grids) as data and builds the stage right after them. the generated markup is never edited,
   only hidden, so the laptop scripts can keep rewriting it. */
(function(){
'use strict';
if(window.__gmxPlayer)return;window.__gmxPlayer=1;
var STILL=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var PLAY='<span class="set-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';
var PREV='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
var NEXT='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():'';}
function ytId(src){var m=/\/embed\/([A-Za-z0-9_-]{6,})/.exec(src||'');return m?m[1]:'';}

/* the facade: a thumbnail and the play button. the real player loads only on tap */
function facade(item){
  var b=el('button','set-facade');b.type='button';
  b.setAttribute('data-yt',item.id);b.setAttribute('data-title',item.title);b.setAttribute('aria-label','play '+item.title);
  var img=el('img');img.alt='';img.loading='lazy';
  img.src=item.img||('https://img.youtube.com/vi/'+item.id+'/hqdefault.jpg');
  img.onerror=function(){img.onerror=null;img.src='https://img.youtube.com/vi/'+item.id+'/hqdefault.jpg';};
  b.appendChild(img);b.insertAdjacentHTML('beforeend',PLAY);
  return b;
}
function slide(item){
  var s=el('div','set-slide');s.appendChild(facade(item));
  var m=el('div','set-meta'),t=el('span','t');t.textContent=item.title;m.appendChild(t);
  if(item.cap&&item.cap.toLowerCase()!==item.title.toLowerCase()){var c=el('span','mono');c.textContent=item.cap;m.appendChild(c);}
  s.appendChild(m);return s;
}

/* wire one stage: the rail, the arrows, the counter, the dots, swipe, keys, tap to load */
function run(stage){
  if(stage.__gmx)return;stage.__gmx=1;
  var rail=stage.querySelector('.set-rail'),vp=stage.querySelector('.set-viewport');
  if(!rail||!vp)return;
  stage.classList.add('gmx-stage');
  var pool=[].slice.call(rail.children).filter(function(c){return c.classList.contains('set-slide');});
  var win=parseInt(stage.getAttribute('data-window')||'0',10)||0;
  var auto=parseInt(stage.getAttribute('data-auto')||'0',10)||0;
  var label=stage.getAttribute('data-label')||'set';
  /* one featured slot: a slide marked data-featured always leads, the rest follow in their own order */
  var feat=pool.filter(function(s){return s.hasAttribute('data-featured');}).slice(0,1);
  if(feat.length){rail.insertBefore(feat[0],rail.firstChild);pool=feat.concat(pool.filter(function(s){return s!==feat[0];}));}
  if(win&&pool.length>win){
    /* the weekly window: the same seven for everyone all week, a new seven on monday. a featured slide keeps slot one */
    var rest=pool.slice(feat.length),room=win-feat.length;
    var d0=new Date(),t=new Date(Date.UTC(d0.getFullYear(),d0.getMonth(),d0.getDate())),dn=t.getUTCDay()||7;
    t.setUTCDate(t.getUTCDate()+4-dn);
    var wk=Math.ceil(((t-Date.UTC(t.getUTCFullYear(),0,1))/864e5+1)/7);
    var start=(wk%Math.max(1,Math.floor(rest.length/room)))*room;
    for(var p=0;p<rest.length;p++){rest[p].hidden=!(p>=start&&p<start+room);}
    if(feat.length)feat[0].hidden=false;
  }
  var slides=pool.filter(function(s){return !s.hidden;});
  if(!slides.length)return;
  var dots=stage.querySelector('.set-dots');
  if(!dots){dots=el('div','set-dots');stage.appendChild(dots);}
  var ctl=el('div','set-ctl');
  var prev=el('button','set-arrow prev',PREV);prev.type='button';prev.setAttribute('aria-label','previous '+label);
  var next=el('button','set-arrow next',NEXT);next.type='button';next.setAttribute('aria-label','next '+label);
  var count=el('span','set-count');count.setAttribute('aria-live','polite');
  ctl.appendChild(prev);ctl.appendChild(count);ctl.appendChild(next);
  stage.insertBefore(ctl,dots);
  dots.innerHTML='';
  var db=[];
  for(var q=0;q<slides.length;q++){var b=el('button');b.type='button';b.setAttribute('aria-label',label+' '+(q+1)+' of '+slides.length);dots.appendChild(b);db.push(b);}
  if(slides.length<2){ctl.hidden=true;dots.hidden=true;}
  var i=0,timer=null,locked=false,swiped=0;
  function stop(s){var f=s.querySelector('.video-frame');if(f&&f.__facade)f.parentNode.replaceChild(f.__facade,f);}
  function go(n){
    var from=slides[i];i=(n+slides.length)%slides.length;
    if(from!==slides[i])stop(from);                          /* leaving a slide stops its player */
    rail.style.transform='translateX('+(-i*100)+'%)';
    for(var k=0;k<db.length;k++)db[k].setAttribute('aria-current',k===i?'true':'false');
    count.textContent=(i+1)+' of '+slides.length;
  }
  function pause(){clearInterval(timer);timer=null;}
  function play(){pause();if(!auto||locked||STILL)return;timer=setInterval(function(){go(i+1);},auto);}
  function lock(){locked=true;pause();}
  prev.addEventListener('click',function(){lock();go(i-1);});
  next.addEventListener('click',function(){lock();go(i+1);});
  db.forEach(function(b,k){b.addEventListener('click',function(){lock();go(k);});});
  stage.addEventListener('pointerenter',pause);
  stage.addEventListener('pointerleave',play);
  stage.addEventListener('focusin',lock);
  stage.addEventListener('keydown',function(e){
    if(e.key==='ArrowLeft'){lock();go(i-1);e.preventDefault();}
    else if(e.key==='ArrowRight'){lock();go(i+1);e.preventDefault();}
  });
  /* swipe: a sideways drag on the picture moves one slide, a vertical drag still scrolls the page */
  var sx=null,sy=null;
  vp.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse')return;sx=e.clientX;sy=e.clientY;},{passive:true});
  vp.addEventListener('pointerup',function(e){
    if(sx===null)return;var dx=e.clientX-sx,dy=e.clientY-sy;sx=sy=null;
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){swiped=Date.now();lock();go(dx<0?i+1:i-1);}
  });
  vp.addEventListener('pointercancel',function(){sx=sy=null;});
  /* tap to load the real player */
  stage.addEventListener('click',function(e){
    var b=e.target.closest?e.target.closest('.set-facade'):null;
    if(!b||!stage.contains(b))return;
    if(Date.now()-swiped<400)return;
    lock();
    var fr=document.createElement('iframe');
    fr.src='https://www.youtube-nocookie.com/embed/'+b.getAttribute('data-yt')+'?autoplay=1';
    fr.title=b.getAttribute('data-title')||'';fr.loading='lazy';fr.allowFullscreen=true;
    fr.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    var w=el('div','video-frame');w.appendChild(fr);w.__facade=b;
    b.parentNode.replaceChild(w,b);
  });
  go(0);play();
}

/* build a stage next to a generated rail and hide the rail */
function build(c,items,label){
  if(!items.length)return;
  var stage=el('div','set-stage');stage.setAttribute('data-label',label);
  var vp=el('div','set-viewport'),rail=el('div','set-rail');
  items.forEach(function(it){rail.appendChild(slide(it));});
  vp.appendChild(rail);stage.appendChild(vp);
  c.parentNode.insertBefore(stage,c.nextSibling);
  c.hidden=true;c.style.display='none';c.setAttribute('aria-hidden','true');
  run(stage);
}
function labelFor(c){
  var hint=(c.id||'')+' '+(c.previousElementSibling?text(c.previousElementSibling):'');
  return /pod|interview|talk|own words/i.test(hint)?'talk':'set';
}
/* the generated rails: facade buttons with data-yt, grouped by the strip they sit in */
function fromButtons(){
  var seen=[];
  [].slice.call(document.querySelectorAll('button[data-yt]')).forEach(function(b){
    if(b.closest('.set-stage'))return;
    var c=b.closest('[style*="overflow-x"]')||b.parentElement;
    if(!c||seen.indexOf(c)>-1)return;seen.push(c);
    var items=[].slice.call(c.querySelectorAll('button[data-yt]')).map(function(x){
      var img=x.querySelector('img'),wrap=x.parentElement!==c?x.parentElement:null,cap='';
      if(wrap)[].slice.call(wrap.children).forEach(function(k){if(k!==x)cap+=' '+text(k);});
      return {id:x.getAttribute('data-yt'),title:x.getAttribute('data-title')||text(x)||'set',img:img?img.getAttribute('src'):'',cap:cap.trim()};
    }).filter(function(it){return it.id;});
    build(c,items,labelFor(c));
  });
}
/* the old grids of plain iframes (one page still has one) */
function fromFrames(){
  var seen=[];
  [].slice.call(document.querySelectorAll('iframe[src*="youtube.com/embed/"],iframe[src*="youtube-nocookie.com/embed/"]')).forEach(function(f){
    if(f.closest('.set-stage'))return;
    var card=f.closest('.setcard')||f.parentElement,c=card.parentElement;
    if(!c||seen.indexOf(c)>-1)return;seen.push(c);
    var items=[].slice.call(c.querySelectorAll('iframe')).map(function(x){
      var cd=x.closest('.setcard')||x.parentElement,cap=cd.querySelector('.setcap,figcaption,p');
      return {id:ytId(x.getAttribute('src')),title:x.getAttribute('title')||text(cap)||'set',img:'',cap:text(cap)};
    }).filter(function(it){return it.id;});
    build(c,items,labelFor(c));
  });
}
function start(){
  [].slice.call(document.querySelectorAll('.set-stage')).forEach(run);
  fromButtons();fromFrames();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
