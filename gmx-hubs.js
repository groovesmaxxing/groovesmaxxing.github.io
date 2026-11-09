/* groovesmaxxing hub glue (2026-11-09 web review). small additions on the hub pages whose rows are written on
   the laptop (friday.html by fridayweek.py, the picks block by pickspage.py, the calendar cards by
   calendarpage.py), done here so a rebuild keeps them. vanilla, no dependencies, nothing waits on it.
   - friday: when the newest week on the page closed more than nine days ago, one quiet line above it says the
     list is running late and points at what came out since (/upcoming#released). the freshness check F-18
     warns at the same nine days.
   - picks: artist and label names link to their pages when the site has one (names-index.json), the title
     opens a spotify search for that record, and the bare dash says it means no data yet.
   - calendar: a card whose festival also sits on the events radar links to that lineup. the events cards
     carry data-cal="<calendar card id>", so the pairing lives in one hand-written place (events.html).
   - dj support: when the last refresh is more than eight days old, the footer stops promising "refreshed every
     friday" and keeps the honest "last refresh <date>". each track row gets a share (the track, its tier, this page).
   - share goes through gmxSheet.share (gmx-sheet.js) when the page has it, else the phone's share sheet, else the
     clipboard. */
(function(){
'use strict';
if(window.__gmxHubs)return;window.__gmxHubs=1;
var MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function fold(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/\s+/g,' ').trim()}
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():''}
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function link(href,txt,cls,out){var a=el('a',cls,txt);a.href=href;if(out){a.target='_blank';a.rel='noopener'}return a}
/* one share for the site: gmx-sheet.js when it is on the page, a small fallback when it is not */
function share(o,b){
  if(window.gmxSheet&&gmxSheet.share){gmxSheet.share(o,b);return}
  var u=new URL(o.url||location.pathname,location.href).href,t=o.text||'';
  function copied(){var w=b.textContent;b.textContent='link copied';setTimeout(function(){b.textContent=w},1600)}
  function clip(){if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t?t+' '+u:u).then(copied,function(){})}
  if(navigator.share){try{navigator.share({title:'groovesMAXXING',text:t,url:u}).catch(function(e){if(!e||e.name!=='AbortError')clip()})}catch(e){clip()}return}
  clip();
}
function getJSON(u){return fetch(u,{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}
function midnight(){var t=new Date();t.setHours(0,0,0,0);return t}
function iso(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}

/* "week of oct 17 to 23, 2026", "week of sep 26 to oct 2, 2026", "week of dec 26, 2026 to jan 1, 2027" */
function weekEnd(s){
  var m=/week of ([a-z]{3}) \d{1,2}(?:, \d{4})? to (?:([a-z]{3}) )?(\d{1,2}), (\d{4})/.exec(String(s||'').toLowerCase());
  if(!m)return null;
  var mo=MON.indexOf(m[2]||m[1]);if(mo<0)return null;
  return new Date(+m[4],mo,+m[3]);
}
function friday(){
  var first=document.querySelector('article.week'),num=first&&first.querySelector('.week-head .num');
  var end=weekEnd(text(num));if(!end||document.querySelector('.gmx-late'))return;
  var late=Math.round((midnight()-end)/864e5);
  if(late<=9)return;
  var p=el('p','lede gmx-late mono');
  p.appendChild(document.createTextNode('this list is running late. what came out since: '));
  p.appendChild(link('/upcoming#released','just released →'));
  first.parentNode.insertBefore(p,first);
}

function picks(){
  var rows=[].slice.call(document.querySelectorAll('.pks tbody tr'));
  if(!rows.length)return;
  rows.forEach(function(tr){
    [].forEach.call(tr.querySelectorAll('.na'),function(s){
      if(s.getAttribute('aria-label'))return;
      s.setAttribute('title','songstats has no data for this record yet');s.setAttribute('aria-label','no data yet');
    });
    var ti=tr.querySelector('td.ti span[translate]'),ar=tr.querySelector('td.ar-t span[translate]');
    if(ti&&!ti.querySelector('a')){
      var q=(text(ar).split(',')[0]+' '+text(ti).replace(/ - (radio edit|extended mix|original mix|edit)$/i,'')).trim();
      var a=link('https://open.spotify.com/search/'+encodeURIComponent(q),text(ti),'pk-out',true);
      a.setAttribute('translate','no');ti.textContent='';ti.appendChild(a);
    }
  });
  getJSON('/names-index.json').then(function(n){
    if(!n||!n.a||!n.l)return;
    rows.forEach(function(tr){
      var ar=tr.querySelector('td.ar-t span[translate]'),la=tr.querySelector('td.la span[translate]');
      if(ar&&!ar.querySelector('a')){
        var names=text(ar).split(', '),hit=names.some(function(x){return n.a[fold(x)]});
        if(hit){
          ar.textContent='';
          names.forEach(function(x,i){
            if(i)ar.appendChild(document.createTextNode(', '));
            var s=n.a[fold(x)];ar.appendChild(s?link('/artists/'+s,x,'gmx-ar'):document.createTextNode(x));
          });
        }
      }
      if(la&&!la.querySelector('a')){var s=n.l[fold(text(la))];if(s){var t=text(la);la.textContent='';la.appendChild(link('/labels/'+s,t,'gmx-ar'))}}
    });
  });
}

function calendar(){
  var list=document.querySelectorAll('article.ev[id^="e-"]');if(!list.length)return;
  fetch('/events',{credentials:'same-origin'}).then(function(r){return r.ok?r.text():''}).then(function(h){
    if(!h)return;
    var doc=new DOMParser().parseFromString(h,'text/html'),today=iso(midnight());
    [].forEach.call(doc.querySelectorAll('.ev[id][data-cal]'),function(e){
      var end=e.getAttribute('data-end')||'';if(end&&end<today)return;
      var card=document.getElementById(e.getAttribute('data-cal')),acts=card&&card.querySelector('.acts');
      if(!acts||acts.querySelector('.gmx-radar'))return;
      acts.appendChild(link('/events#'+e.id,'the lineup on our radar →','go gmx-radar'));
    });
  }).catch(function(){});
}

function djsupport(){
  [].forEach.call(document.querySelectorAll('.wrap > .ev'),function(ev){
    var h=ev.querySelector('h3');if(!h||ev.querySelector('.gmx-rowshare'))return;
    var sm=h.querySelector('small'),ti='',pill=ev.querySelector('.pills .pill');
    for(var c=h.firstChild;c;c=c.nextSibling)if(c.nodeType===3)ti+=c.nodeValue;
    ti=ti.replace(/\s+/g,' ').trim();
    var b=el('button','gmx-rowshare','share');b.type='button';b.setAttribute('aria-label','share '+ti);
    b.addEventListener('click',function(){share({text:[ti+(sm?' · '+text(sm):''),text(pill)].filter(Boolean).join(' · '),url:'/dj-support'+(ev.id?'#'+ev.id:'')},b)});
    (ev.querySelector('.pills')||ev).appendChild(b);
  });
  if(!document.getElementById('gmx-hubs-css')){var st=el('style');st.id='gmx-hubs-css';st.textContent='.gmx-rowshare{position:relative;background:none;border:0;padding:0 2px;margin-left:4px;font:inherit;font-family:Space Mono,monospace;font-size:12px;color:var(--racing);text-decoration:underline;text-underline-offset:3px;cursor:pointer;min-height:24px}.gmx-rowshare::before{content:"";position:absolute;inset:-10px -6px}';document.head.appendChild(st)}
  var f=document.querySelector('footer');if(!f)return;
  for(var n=f.firstChild;n;n=n.nextSibling){
    if(n.nodeType!==3)continue;
    var m=/last refresh (\d{1,2}) ([a-z]{3}) (\d{4})/.exec(n.nodeValue),mo=m?MON.indexOf(m[2]):-1;
    if(mo<0)continue;
    if(Math.round((midnight()-new Date(+m[3],mo,+m[1]))/864e5)>8)n.nodeValue=n.nodeValue.replace(' · refreshed every friday','');
    return;
  }
}

function start(){
  var p=location.pathname.replace(/\.html$/,'').replace(/\/$/,'');
  if(p==='/friday')friday();
  else if(p==='/picks')picks();
  else if(p==='/calendar')calendar();
  else if(p==='/dj-support')djsupport();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
