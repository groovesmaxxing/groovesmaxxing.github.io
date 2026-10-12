/* groovesmaxxing next up (ui build 3, 2026-10-11). the flighty and transit move: the one strip that says
   what happens next for you. home page only. reads upcoming.json (the dropping soon page as data) and
   the crate on this phone (gmx-crate.js), keeps the releases whose artist or label is in the crate,
   dated first and soonest first, then the ones that just landed, five at most, and shows the band.
   nothing in the crate, or nothing matching: the band stays hidden and the page reads as before (the
   friday block already lists the week's drops for everyone). vanilla, no dependencies beyond the crate. */
(function(){
'use strict';
var sec=document.getElementById('nextup'),list=document.getElementById('nextup-list');
if(!sec||!list||!window.fetch||!window.gmxCrate)return;
var fold=gmxCrate.fold;
function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
function days(iso){
  if(!iso)return null;var p=iso.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]),t=new Date();t.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
function when(r){
  var n=days(r.iso);
  if(n===null)return r.date||'';
  if(n<0)return r.date;if(n===0)return 'today';if(n===1)return 'tomorrow';if(n<7)return 'in '+n+' days';
  return r.date;
}
var names=gmxCrate.names();
if(!names.count)return;
fetch('/upcoming.json').then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){
  var rows=(j.rows||[]).filter(function(r){
    if(r.tier==='named, not dated')return false;
    if(r.label&&names.labels[fold(r.label)])return true;
    for(var i=0;i<r.artists.length;i++)if(names.artists[fold(r.artists[i])])return true;
    return false;
  });
  if(!rows.length)return;
  var dated=rows.filter(function(r){return r.iso&&days(r.iso)>=0}).sort(function(a,b){return a.iso<b.iso?-1:a.iso>b.iso?1:0});
  var landed=rows.filter(function(r){return !(r.iso&&days(r.iso)>=0)});
  var show=dated.concat(landed).slice(0,5);
  list.innerHTML=show.map(function(r){
    var who=r.artists.join(', ');
    return '<li><span class="d">'+esc(when(r))+'</span><span class="t"><b>'+esc(who||r.title)+'</b>'+(who?' · '+esc(r.title):'')+(r.label?' <span class="w">· '+esc(r.label)+'</span>':'')+'</span>'+
      (r.link?'<a class="go" href="'+esc(r.link)+'" target="_blank" rel="noopener">'+(days(r.iso)>0?'pre-save':'listen')+' →</a>':'')+'</li>';
  }).join('');
  var more=sec.querySelector('[data-count]');if(more)more.textContent=rows.length>show.length?'all '+rows.length+' from my crate →':'every drop from my crate →';
  sec.hidden=false;
  try{sec.dispatchEvent(new CustomEvent('gmx:nextup',{bubbles:true,detail:{shown:show.length,matched:rows.length}}))}catch(e){}
}).catch(function(){});
})();
