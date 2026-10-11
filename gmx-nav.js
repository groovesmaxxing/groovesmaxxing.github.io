/* groovesmaxxing shared tab bar (site navigation build, 2026-10-10). vanilla, no dependencies.
   the same five tabs the tab pages carry inline (home, scan, sets, artists, more), built here for every
   page that had none: the artist and label profiles, the tracklists, the newsletter issues, the radar
   pages. does nothing on a page that already has a bar. */
(function(){
'use strict';
if(document.querySelector('.gmx-tabs'))return;
var ICON={
  home:'<path d="M3.8 11.2 12 4.4l8.2 6.8"/><path d="M6.2 9.4v10.1h11.6V9.4"/><path d="M10 19.5v-5.2h4v5.2"/>',
  scan:'<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  sets:'<circle cx="12" cy="12" r="9.2"/><path d="M10 8.6v6.8l5.4-3.4z"/>',
  artists:'<circle cx="12" cy="8.6" r="3.8"/><path d="M4.6 20.2c.9-3.8 3.9-5.8 7.4-5.8s6.5 2 7.4 5.8"/>',
  more:'<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>'
};
var TABS=[['/','home'],['/scan','scan'],['/sets','sets'],['/artists','artists'],['/more','more']];
var path=location.pathname.replace(/\.html$/,'').replace(/\/index$/,'/');
function under(p){return path===p||path.indexOf(p+'/')===0;}
function current(href){
  if(href==='/')return path==='/';
  if(href==='/sets')return under('/sets')||under('/tracklists')||path==='/interviews';
  if(href==='/artists')return under('/artists')||under('/labels')||path==='/roster'||path==='/badges';
  if(href==='/more')return under('/more')||under('/newsletter')||under('/upcoming')||path==='/events'||path==='/tours'||path==='/venues'||path==='/friday'||path==='/privacy'||path==='/terms';
  return path===href;
}
var nav=document.createElement('nav');nav.className='gmx-tabs';nav.setAttribute('aria-label','app tabs');
var ul=document.createElement('ul');
TABS.forEach(function(t){
  var li=document.createElement('li'),a=document.createElement('a');
  a.href=t[0];if(current(t[0]))a.setAttribute('aria-current','page');
  a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[t[1]]+'</svg>'+t[1];
  li.appendChild(a);ul.appendChild(li);
});
nav.appendChild(ul);
function mount(){document.body.appendChild(nav);}
if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
})();
