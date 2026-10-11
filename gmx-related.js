/* groovesmaxxing cross-links (2026-10-11). everything the site holds on an artist, wherever that artist
   shows up. reads names-index.json and related-index.json, which the site data workflow builds from every
   page on each push. never edits the generated blocks, only adds what they miss, in the browser.
   - artist profiles: an "also on the site" box with the tracklists, heard-in sets, sets, talks and labels
     the page's own rails do not already carry
   - tracklist pages: the artist in each row becomes a link when a profile exists, label names too, and a
     "more from" box under the table. under a row, the other sets the same record turned up in (from
     tracks-index.json), and the "n open" count in the meta tag links to that set's section on /open-ids
   - the radar hub: a bold artist name becomes a link when a profile exists
   - label names in a profile's release list become links */
(function(){
'use strict';
var SPLIT=/\s+(?:b2b|b3b|vs\.?|x|and|with|feat\.?|ft\.?|\+|&|,)\s+/i;
function fold(s){return (s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,'and').replace(/\s+/g,' ').trim()}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():''}
function get(u){return fetch(u).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}
var css='.gmx-rel{border-top:1px solid var(--line,#26262b);margin-top:44px;padding-top:26px}.gmx-rel .eyebrow2{font-family:"Space Mono",monospace;font-size:.72rem;letter-spacing:.28em;color:var(--racing,#FF1C02);text-transform:uppercase;margin:0 0 14px}'+
 '.gmx-rel h3{font-family:"Space Mono",monospace;font-size:.72rem;letter-spacing:.12em;color:var(--steel,#8A8A93);text-transform:uppercase;font-weight:400;margin:18px 0 8px}.gmx-rel h3:first-of-type{margin-top:0}'+
 '.gmx-rel .row{display:flex;flex-wrap:wrap;gap:8px}.gmx-rel .row a{font-family:"Space Mono",monospace;font-size:.78rem;letter-spacing:.03em;text-decoration:none;color:#c9c9c4;border:1px solid var(--line,#26262b);border-radius:6px;padding:8px 12px;transition:border-color .15s,color .15s;max-width:100%}'+
 '.gmx-rel .row a:hover{border-color:var(--racing,#FF1C02);color:var(--racing,#FF1C02)}.gmx-rel .row a small{color:var(--steel,#8A8A93);margin-left:6px}'+
 '.gmx-rel .note{font-family:"Space Mono",monospace;font-size:.74rem;color:var(--steel,#8A8A93);line-height:1.7;margin-top:14px}'+
 'a.gmx-ar{color:inherit;text-decoration:none;border-bottom:1px solid rgba(255,28,2,.38)}a.gmx-ar:hover{color:var(--racing,#FF1C02)}'+
 '.gmx-also{display:block;font-family:"Space Mono",monospace;font-size:.7rem;letter-spacing:.03em;color:var(--steel,#8A8A93);margin-top:5px;line-height:1.8}.gmx-also a{color:#c9c9c4;text-decoration:none;border-bottom:1px solid rgba(255,28,2,.38)}.gmx-also a:hover{color:var(--racing,#FF1C02)}';
var styled=false;function style(){if(styled)return;styled=true;var s=document.createElement('style');s.textContent=css;document.head.appendChild(s)}
/* the same fold build_tracks.py uses for a row's q, so a lookup in tracks-index.json lands */
function foldT(t){t=String(t||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();t=t.replace(/\((?:extended|original|radio|club|edit|mix|remix|version|feat\.?|ft\.?)[^)]*\)/g,' ').replace(/\b(extended mix|original mix|radio edit|club mix)\b/g,' ');return t.replace(/[^a-z0-9]+/g,' ').trim()}
function box(title,parts){
  var d=document.createElement('section');d.className='gmx-rel sec';d.innerHTML='<p class="eyebrow2">'+esc(title)+'</p>'+parts.join('');return d;
}
function chips(items){return '<div class="row">'+items.map(function(i){return '<a href="'+esc(i[0])+'">'+esc(i[1])+(i[2]?'<small>'+esc(i[2])+'</small>':'')+'</a>'}).join('')+'</div>'}
function stage(items,label){
  if(!window.gmxPlayer)return '';
  var s=document.createElement('div');s.className='set-stage';s.setAttribute('data-label',label);
  var vp=document.createElement('div');vp.className='set-viewport';var rail=document.createElement('div');rail.className='set-rail';
  items.forEach(function(it){rail.appendChild(gmxPlayer.slide({id:it[0],title:it[1],cap:'',img:''}))});
  vp.appendChild(rail);s.appendChild(vp);return s;
}

/* link whole-token names inside one text node, nothing else */
function linkTokens(node,map,base){
  var t=node.nodeValue,parts=t.split(/(\s+(?:b2b|b3b|vs\.?|x|and|with|feat\.?|ft\.?|\+|&|,)\s+|\s+-\s+)/i),out=null,hit=false,i;
  for(i=0;i<parts.length;i++){
    var p=parts[i],slug=i%2===0?map[fold(p)]:null;
    if(i>0&&/\s+-\s+/.test(parts[i-1]))break;                 /* past the artist part of "artist - title" */
    if(slug){hit=true;if(!out)out=document.createDocumentFragment();var a=document.createElement('a');a.className='gmx-ar';a.href=base+slug;a.textContent=p;out.appendChild(a)}
    else if(out)out.appendChild(document.createTextNode(p));
    else if(hit)out.appendChild(document.createTextNode(p));
  }
  if(!hit)return;
  for(;i<parts.length;i++)out.appendChild(document.createTextNode(parts[i]));
  node.parentNode.replaceChild(out,node);
}

function profile(sec){
  var slug=sec.id;if(!slug)return;
  get('/related-index.json').then(function(r){
    var me=r&&r[slug];if(!me)return;
    var page=document.documentElement.innerHTML,parts=[];
    var tl=me.tl.filter(function(x){return page.indexOf(x[0])<0});
    var heard=me.in.filter(function(x){return page.indexOf(x[0])<0}).slice(0,12);
    var sets=me.sets.filter(function(x){return page.indexOf('data-yt="'+x[0]+'"')<0});
    var talks=me.talks.filter(function(x){return page.indexOf('data-yt="'+x[0]+'"')<0});
    var labs=me.lab.filter(function(x){return page.indexOf('href="'+x[0]+'"')<0});
    if(tl.length)parts.push('<h3>tagged by us</h3>'+chips(tl));
    if(heard.length)parts.push('<h3>heard in these sets</h3>'+chips(heard.map(function(x){return [x[0],x[1],x[2]>1?x[2]+' tracks':'1 track']})));
    if(labs.length)parts.push('<h3>on these labels</h3>'+chips(labs));
    if(!parts.length&&!sets.length&&!talks.length)return;
    style();
    var b=box('also on the site',parts);
    if(sets.length){var h=document.createElement('h3');h.textContent=sets.length+(sets.length>1?' more sets':' more set');b.appendChild(h);b.appendChild(stage(sets,'set'))}
    if(talks.length){var h2=document.createElement('h3');h2.textContent=talks.length+(talks.length>1?' more talks':' more talk');b.appendChild(h2);b.appendChild(stage(talks,'talk'))}
    var n=document.createElement('p');n.className='note';n.textContent='gathered from the tracklists, the sets page, the interviews page and the label pages. the profile rails above are the hand-kept ones.';b.appendChild(n);
    var links=sec.querySelector('.links');if(links)sec.insertBefore(b,links);else sec.appendChild(b);
    [].slice.call(b.querySelectorAll('.set-stage')).forEach(function(s){gmxPlayer.run(s)});
  });
  /* label names in the release list */
  var rels=[].slice.call(sec.querySelectorAll('.rel .l'));
  if(rels.length)get('/names-index.json').then(function(n){if(!n)return;rels.forEach(function(l){var t=l.firstChild;if(!t||t.nodeType!==3)return;var s=n.l[fold(t.nodeValue)];if(!s)return;var a=document.createElement('a');a.className='gmx-ar';a.href='/labels/'+s;a.textContent=t.nodeValue;l.replaceChild(a,t)})});
}

function tracklist(){
  var rows=[].slice.call(document.querySelectorAll('table.tl td.x'));if(!rows.length)return;
  get('/names-index.json').then(function(n){
    if(!n)return;style();
    rows.forEach(function(x){
      var first=x.firstChild;
      if(first&&first.nodeType===3)linkTokens(first,n.a,'/artists/');
      [].slice.call(x.querySelectorAll('.lab')).forEach(function(l){var t=l.firstChild;if(!t||t.nodeType!==3)return;var s=n.l[fold(t.nodeValue)];if(s){var a=document.createElement('a');a.className='gmx-ar';a.href='/labels/'+s;a.textContent=t.nodeValue;l.replaceChild(a,t)}});
    });
    /* more from the people on the bill */
    var h1=text(document.querySelector('h1')),heads=h1.split(SPLIT).map(function(t){return n.a[fold(t)]}).filter(Boolean);
    if(!heads.length)return;
    get('/related-index.json').then(function(r){
      if(!r)return;var here=location.pathname.replace(/\.html$/,''),parts=[];
      heads.forEach(function(s){
        var me=r[s];if(!me)return;var items=[];
        me.tl.forEach(function(x){if(x[0]!==here)items.push([x[0],x[1],'tracklist'])});
        if(me.sets.length)items.push(['/sets#'+s,me.sets.length+(me.sets.length>1?' sets':' set'),'the sets page']);
        if(me.talks.length)items.push(['/interviews#'+s,me.talks.length+(me.talks.length>1?' talks':' talk'),'in their own words']);
        items.push(['/artists/'+s,'the profile','']);
        parts.push('<h3>more from '+esc(me.n)+'</h3>'+chips(items));
      });
      if(!parts.length)return;
      var b=box('keep going',parts),t=document.querySelector('table.tl');t.parentNode.insertBefore(b,t.nextSibling);
    });
  });
}

/* under a named row: the other sets the same record turned up in, with the second that opens them there */
function alsoIn(){
  var rows=[].slice.call(document.querySelectorAll('table.tl tr'));if(!rows.length)return;
  get('/tracks-index.json').then(function(j){
    if(!j||!j.rows)return;var here=location.pathname.replace(/\.html$/,''),by={};
    j.rows.forEach(function(r){if(!r.q||r.u===here)return;(by[r.q]=by[r.q]||[]).push(r)});
    rows.forEach(function(tr){
      var x=tr.querySelector('td.x');if(!x||x.querySelector('.gmx-also'))return;
      var c=x.cloneNode(true);[].slice.call(c.querySelectorAll('.get,.thx,.gnote,.soft,.sig,.lab,.gmx-heart,.gmx-also')).forEach(function(e){e.remove()});
      var q=foldT(text(c));if(!q||q.length<6||/^id\b/.test(q))return;
      var hits=by[q];if(!hits)return;
      var seen={},items=[];hits.forEach(function(r){if(seen[r.u])return;seen[r.u]=1;items.push(r)});
      style();
      var sp=document.createElement('span');sp.className='gmx-also';
      sp.innerHTML='also in '+items.slice(0,3).map(function(r){return '<a href="'+esc(r.u)+'">'+esc(r.set)+'</a>'+(r.l?' <a href="'+esc(r.l)+'" target="_blank" rel="noopener" aria-label="play '+esc(r.set)+' from '+esc(r.at)+'">'+esc(r.at)+' ↗</a>':' at '+esc(r.at))}).join(', ')+(items.length>3?' and '+(items.length-3)+' more':'');
      var g=x.querySelector('.get');if(g)x.insertBefore(sp,g);else x.appendChild(sp);
    });
  });
}
/* the "n open" count in the meta tag links to this set's section on the open IDs board */
function openLink(){
  var tag=document.querySelector('.mast .meta .tag');if(!tag)return;
  var t=tag.firstChild;if(!t||t.nodeType!==3)return;
  var m=/(\d+) open\b/.exec(t.nodeValue);if(!m||m[1]==='0')return;
  var i=m.index,label=m[0],a=document.createElement('a');style();
  a.className='gmx-ar';a.href='/open-ids#'+location.pathname.replace(/^\/tracklists\//,'').replace(/\.html$/,'');a.textContent=label;a.title='the open IDs board';
  var frag=document.createDocumentFragment();frag.appendChild(document.createTextNode(t.nodeValue.slice(0,i)));frag.appendChild(a);frag.appendChild(document.createTextNode(t.nodeValue.slice(i+label.length)));
  t.parentNode.replaceChild(frag,t);
}
function radar(){
  var strong=[].slice.call(document.querySelectorAll('#radar strong, .ev strong, .mini strong'));if(!strong.length)return;
  get('/names-index.json').then(function(n){
    if(!n)return;style();
    strong.forEach(function(s){if(s.querySelector('a'))return;var slug=n.a[fold(text(s))];if(!slug)return;var a=document.createElement('a');a.className='gmx-ar';a.href='/artists/'+slug;while(s.firstChild)a.appendChild(s.firstChild);s.appendChild(a)});
  });
}

function start(){
  var sec=document.querySelector('section.artist[id]');
  if(sec&&location.pathname.indexOf('/artists/')===0)profile(sec);
  else if(document.querySelector('table.tl')){tracklist();alsoIn();openLink()}
  else if(document.getElementById('radar'))radar();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
