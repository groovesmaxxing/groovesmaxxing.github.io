/* groovesmaxxing language switch (2026-11-01). vanilla, no dependencies, nothing leaves the browser.
   gmx-nav.js loads this on every page. it paints the language circle into the header row (.gmx-hdr, painted by
   gmx-account.js) before the chip, remembers the pick per visitor in localStorage (gmx-lang) and sets <html lang>.
   phase 1 swaps the site's own words only: tabs, header, headings, labels, buttons, pills, dates, taglines.
   the words live in one file per language (/gmx-lang-es.js), loaded only for a visitor who picked it.
   a string is swapped only on an exact, case-sensitive match, one " · " segment at a time, with emoji and arrows
   at either end kept as they are. anything not in the dictionary stays as written, which is what keeps artist,
   label and venue names, bios and tracklist rows in english. a new language is a row in LANGS and a dictionary.
   english is the source: going back restores every original string in place, no reload. */
(function(){
'use strict';
if(window.gmxLang)return;
/* [code, <html lang>, the circle's label in its own language] */
var LANGS=[['en','en','language: english, tap for español'],['es','es-MX','idioma: español, toca para english']];
/* the dictionary files, tagged like every shared script: change the file, change its tag here, then this file's tag */
var FILES={es:'/gmx-lang-es.js?v=8'};
var KEY='gmx-lang',ATTRS=['aria-label','placeholder','title','alt'];
var SKIP='script,style,textarea,code,pre,svg,[translate="no"],.notranslate,.gmx-lang';
var html=document.documentElement,SRC=html.getAttribute('lang')||'en';
var cur='en',dict=null,btn=null,mo=null,texts=new Map(),attrs=new Map();
try{var v=localStorage.getItem(KEY);if(row(v))cur=v}catch(e){}
function row(c){for(var i=0;i<LANGS.length;i++)if(LANGS[i][0]===c)return LANGS[i];return null}
function next(){for(var i=0;i<LANGS.length;i++)if(LANGS[i][0]===cur)return LANGS[(i+1)%LANGS.length][0];return 'en'}
function has(o,k){return o&&Object.prototype.hasOwnProperty.call(o,k)}

/* ---- the translator ---- */
var rules=[];
function compile(){rules=(dict.rules||[]).map(function(r){return [new RegExp('^'+r[0]+'$'),r[1]]})}
/* a rule template takes $1..$9 as matched and ~1..~9 looked up in the terms (months, days) */
function fill(t,m){return t.replace(/([$~])(\d)/g,function(_,k,n){var g=m[+n]||'';return k==='~'?(has(dict.terms,g)?dict.terms[g]:has(dict.words,g)?dict.words[g]:g):g})}
function one(s,ctx){
  if(ctx&&dict.scoped)for(var i=0;i<dict.scoped.length;i++){var sc=dict.scoped[i];if(has(sc[1],s)&&ctx.closest(sc[0]))return sc[1][s]}
  if(has(dict.words,s))return dict.words[s];
  for(var j=0;j<rules.length;j++){var m=rules[j][0].exec(s);if(m)return fill(rules[j][1],m)}
  return null;
}
var EDGE=/^([^\p{L}\p{N}#@&(]*)([\s\S]*?)([^\p{L}\p{N}.!?)'"%…:]*)$/u;
function seg(s,ctx){
  var t=one(s,ctx);if(t!==null)return t;
  var e=EDGE.exec(s);
  if(e&&e[2]&&(e[1]||e[3])){t=one(e[2],ctx);if(t!==null)return e[1]+t+e[3]}
  if(s.indexOf(' · ')>0){var p=s.split(' · '),hit=false;p=p.map(function(x){var y=seg(x,ctx);if(y!==x)hit=true;return y});if(hit)return p.join(' · ')}
  return s;
}
function tr(s,ctx){
  if(!dict||!s)return s;
  var m=/^(\s*)([\s\S]*?)(\s*)$/.exec(s);if(!m[2])return s;
  var t=seg(m[2].replace(/\s+/g,' '),ctx);
  return t===m[2].replace(/\s+/g,' ')?s:m[1]+t+m[3];
}

/* ---- the page: originals are kept so english comes back exactly ---- */
function skipped(el){return !el||!el.closest||!!el.closest(SKIP)}
function text(n){
  var r=texts.get(n),v=n.data;
  if(r&&v===r[1])return;                      /* our own write */
  var t=tr(v,n.parentElement);
  if(t!==v){texts.set(n,[v,t]);n.data=t}else if(r)texts.delete(n);
}
function attr(el,a){
  var v=el.getAttribute(a);if(v===null)return;
  var m=attrs.get(el)||{},r=m[a];
  if(r&&v===r[1])return;
  var t=tr(v,el);
  if(t!==v){m[a]=[v,t];attrs.set(el,m);el.setAttribute(a,t)}
}
function walk(root){
  if(root.nodeType===3){if(!skipped(root.parentElement))text(root);return}
  if(root.nodeType!==1||skipped(root))return;
  var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){return skipped(n.parentElement)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}}),n;
  while((n=w.nextNode()))text(n);
  var els=[root].concat([].slice.call(root.querySelectorAll('['+ATTRS.join('],[')+']')));
  els.forEach(function(el){if(!skipped(el))ATTRS.forEach(function(a){if(el.hasAttribute(a))attr(el,a)})});
}
function watch(){
  if(mo||!window.MutationObserver)return;
  mo=new MutationObserver(function(list){
    mo.disconnect();
    list.forEach(function(r){
      if(r.type==='childList')r.addedNodes.forEach(walk);
      else if(r.type==='characterData'){if(!skipped(r.target.parentElement))text(r.target)}
      else if(!skipped(r.target))attr(r.target,r.attributeName);
    });
    mo.takeRecords();observe();
  });
  observe();
}
function observe(){mo.observe(html,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS})}
function restore(){
  if(mo){mo.disconnect();mo=null}
  texts.forEach(function(r,n){if(n.data===r[1])n.data=r[0]});texts.clear();
  attrs.forEach(function(m,el){for(var a in m)if(el.getAttribute(a)===m[a][1])el.setAttribute(a,m[a][0])});attrs.clear();
}

/* ---- switching ---- */
function load(c,done){
  if(window.gmxLangDict&&gmxLangDict[c])return done(gmxLangDict[c]);
  var s=document.createElement('script');s.src=FILES[c];
  s.onload=function(){done(window.gmxLangDict&&gmxLangDict[c])};
  s.onerror=function(){done(null)};
  document.head.appendChild(s);
}
function apply(c){
  html.setAttribute('lang',c==='en'?SRC:row(c)[1]);
  paint();
  if(c==='en'){restore();dict=null;return}
  load(c,function(d){
    if(cur!==c)return;
    if(!d){html.setAttribute('lang',SRC);return}   /* offline or missing: the page stays in english */
    if(dict!==d){restore();dict=d;compile()}
    walk(html);watch();
  });
}
function set(c){
  if(!row(c)||c===cur)return;
  cur=c;try{localStorage.setItem(KEY,c)}catch(e){}
  apply(c);
}

/* ---- the circle ---- */
var CSS='.gmx-lang{flex:none;position:relative;z-index:3;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:40px;height:40px;padding:0;margin:0;border-radius:50%;border:1px solid rgba(242,242,239,.18);background:rgba(11,11,13,.8);color:#8A8A93;font:600 .74rem/1 "Space Mono",monospace;letter-spacing:.04em;text-transform:lowercase;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
 '.gmx-lang:hover,.gmx-lang:focus-visible{color:#FF1C02;border-color:#FF1C02;outline:none}'+
 '.gmx-lang.fixed{position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:60}'+
 '.hero > .gmx-lang.left{position:absolute;top:calc(16px + env(safe-area-inset-top));left:16px;z-index:2}';
function paint(){
  if(!btn)return;
  btn.textContent=cur;
  btn.setAttribute('aria-label',row(cur)[2]);btn.title=row(cur)[2];
}
function mount(){
  var st=document.createElement('style');st.id='gmx-lang-css';st.textContent=CSS;document.head.appendChild(st);
  btn=document.createElement('button');btn.type='button';btn.className='gmx-lang';btn.setAttribute('translate','no');
  btn.addEventListener('click',function(){set(next())});
  paint();
  /* into the header row before the chip, the way the halloween toggle went in. a page with no header row after
     six seconds gets the circle fixed at the top right, out of the thumb zone. the homepage floats its row over the
     hero logo: under 1025px the circle takes the empty top left there instead, so a long chip (iniciar sesión)
     never pushes it onto the rings. */
  function place(){
    var r=document.querySelector('.gmx-hdr');if(!r)return false;
    if(r.classList.contains('float')&&window.matchMedia&&matchMedia('(max-width:1024px)').matches){btn.className+=' left';r.parentNode.appendChild(btn);return true}
    r.insertBefore(btn,r.querySelector('.gmx-chip'));return true;
  }
  if(place())return;
  var o=window.MutationObserver?new MutationObserver(function(){if(place()){o.disconnect();clearTimeout(t)}}):null;
  if(o)o.observe(document.body,{childList:true,subtree:true});
  var t=setTimeout(function(){if(o)o.disconnect();if(!btn.parentNode){btn.className+=' fixed';document.body.appendChild(btn)}},6000);
}

window.gmxLang={get:function(){return cur},set:set,tr:function(s){return tr(s,null)}};
if(cur!=='en')html.setAttribute('lang',row(cur)[1]);
function start(){if(document.querySelector('meta[http-equiv="refresh"]'))return;mount();if(cur!=='en')apply(cur)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
