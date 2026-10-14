/* the "more" expander (2026-10-14). one component for every page, styles in gmx-read.css.
   opt in with a data attribute, nothing collapses on its own:
     data-more                 a block of text. over 3 lines it clips to 3 with a "more" button
     data-more="items"         a list or grid. over 6 children it shows 6 with a "more (n)" button
     data-more="fold"          the whole block hides behind one button, named by data-more-label
   options: data-more-lines="4", data-more-items="8", data-more-label="the story",
            data-more-media="(max-width:640px)" collapses only while that media query matches.
   the button is a real <button> with aria-expanded and aria-controls, so tab, enter and space work. */
(function(){
var uid=0;
function id(el){if(!el.id)el.id='gmx-more-'+(++uid);return el.id}
function btn(el,label){
  var b=el.__gmxMoreBtn;
  if(!b){
    b=document.createElement('button');b.type='button';b.className='gmx-more-btn';
    b.setAttribute('aria-controls',id(el));
    b.addEventListener('click',function(){set(el,b.getAttribute('aria-expanded')!=='true')});
    el.__gmxMoreBtn=b;
  }
  b.__label=label;
  if(!b.parentNode){
    var mode=el.getAttribute('data-more');
    if(mode==='fold')el.parentNode.insertBefore(b,el);else el.parentNode.insertBefore(b,el.nextSibling);
  }
  return b;
}
function set(el,open){
  var b=el.__gmxMoreBtn,mode=el.getAttribute('data-more')||'text';
  if(!b)return;
  b.setAttribute('aria-expanded',open?'true':'false');
  el.classList.toggle('gmx-more-open',open);
  if(mode==='fold'){el.hidden=!open;b.textContent=(open?'hide ':'')+b.__label;return}
  if(mode==='items'){
    var kids=el.children,n=+el.getAttribute('data-more-items')||6;
    for(var i=n;i<kids.length;i++){if(open)kids[i].removeAttribute('data-more-hide');else kids[i].setAttribute('data-more-hide','')}
    b.textContent=open?'less':'more ('+(kids.length-n)+')';return;
  }
  el.classList.toggle('gmx-more-clip',!open);
  b.textContent=open?'less':'more';
}
function off(el){
  var b=el.__gmxMoreBtn;
  if(b&&b.parentNode)b.parentNode.removeChild(b);
  el.classList.remove('gmx-more-clip','gmx-more-open');
  if(el.getAttribute('data-more')==='fold')el.hidden=false;
  var kids=el.children;for(var i=0;i<kids.length;i++)kids[i].removeAttribute('data-more-hide');
}
function apply(el){
  var q=el.getAttribute('data-more-media');
  if(q&&window.matchMedia&&!matchMedia(q).matches){off(el);return}
  var mode=el.getAttribute('data-more')||'text';
  if(el.__gmxMoreBtn&&el.__gmxMoreBtn.parentNode)return;
  if(mode==='fold'){btn(el,el.getAttribute('data-more-label')||'more');set(el,false);return}
  if(mode==='items'){
    var n=+el.getAttribute('data-more-items')||6;
    if(el.children.length<=n+1){off(el);return}
    btn(el,'more');set(el,false);return;
  }
  var lines=+el.getAttribute('data-more-lines')||3;
  el.style.setProperty('--more-lines',lines);
  var lh=parseFloat(getComputedStyle(el).lineHeight)||parseFloat(getComputedStyle(el).fontSize)*1.5;
  if(el.scrollHeight<=lh*(lines+1)+2){off(el);return}
  btn(el,'more');set(el,false);
}
function all(){var l=document.querySelectorAll('[data-more]');for(var i=0;i<l.length;i++)apply(l[i])}
var t;
function soon(){clearTimeout(t);t=setTimeout(all,150)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',all);else all();
window.addEventListener('resize',soon);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(all);
window.gmxMore={refresh:all};
})();
