/* groovesmaxxing bottom sheet (ui build 2, 2026-10-11). vanilla, no dependencies beyond gmx-crate.js
   for the crate and follow state. the airbnb and mobbin move: one "…" next to every heart and follow
   pill opens a sheet from the bottom of the phone (a small panel on a wide screen) with everything you
   can do with that thing, instead of a scatter of small links.
     a set (stage slide or sets-page card): play, crate, follow the artist when the card names one with
       a profile, the tracklist when the card links one, open on youtube, share (the site's tracklist when
       there is one, else the youtube link), scan. a talk card says "share this talk".
     a tracklist row: play from here (only when the row can seek), crate, the artists in the row, the store
       links the row carries, share the second (the site's own row, /tracklists/<set>#tNN), "i know this
       one" on an open row, scan. rows get id="tNN" here, and a #tNN in the address scrolls to the row.
     an artist or label profile: follow, share, every verified link the page lists, scan.
   one share for the whole site (web review 2026-11-09, contract C2): gmxSheet.share({title, text, url})
   tries the phone's share sheet, then the clipboard, then a small sheet that holds the link selected so
   it can be copied by hand. every page with a canonical url gets one round share icon in the header row
   (drawn by gmx-account.js, a tap calls sharePage here, 2026-11-09; tracklists keep only "copy the list" in their mast), and the cards that have their own address (festivals on /calendar, badges,
   open IDs) get their own share. escape, the backdrop or the close button shut the sheet and hand focus
   back, and tab stays inside it while it is open. nothing here is stored. */
(function(){
'use strict';
if(window.__gmxSheet)return;window.__gmxSheet=1;
var MAIL='groovesmaxxing@gmail.com',IG='https://www.instagram.com/groovesmaxxing/',BRAND='groovesMAXXING';
/* what a tracklist row carries besides its name: store links, credits, notes, label, the buttons, and the
   "also in …" line gmx-related.js adds under a row. gmx-crate.js keeps its own copy of this list. */
var NOISE='.get,.thx,.gnote,.soft,.sig,.lab,.gmx-heart,.gmx-more,.gmx-also,.gmx-ishare';
/* hubs whose og:title is written for search more than for a friend */
var PAGE_TEXT={'/friday':'fresh grooves friday: the full weekly drop','/badges':'every badge, every artist'};
/* every shared link names the live site, whatever host the page was opened on (the github.io mirror, a preview) */
var SITE='https://groovesmaxxing.com';
var I={
  play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  heart:'<path d="M12 20.3s-7.2-4.6-9.2-9.1C1.4 7.9 3.4 4.8 6.6 4.8c1.9 0 3.4 1.1 4.2 2.4h2.4c.8-1.3 2.3-2.4 4.2-2.4 3.2 0 5.2 3.1 3.8 6.4-2 4.5-9.2 9.1-9.2 9.1z"/>',
  person:'<circle cx="12" cy="8.6" r="3.8"/><path d="M4.6 20.2c.9-3.8 3.9-5.8 7.4-5.8s6.5 2 7.4 5.8"/>',
  list:'<path d="M5 7h14M5 12h14M5 17h9"/>',
  link:'<path d="M10.1 13.9a4.2 4.2 0 0 0 6 0l2.6-2.6a4.24 4.24 0 0 0-6-6l-1.3 1.3"/><path d="M13.9 10.1a4.2 4.2 0 0 0-6 0l-2.6 2.6a4.24 4.24 0 0 0 6 6l1.3-1.3"/>',
  share:'<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v7h14v-7"/>',
  scan:'<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  mail:'<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  tag:'<path d="M20 12.5 12.5 20 4 11.5V4h7.5z"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/>'
};
function svg(k){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(I[k]||I.link)+'</svg>'}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():''}
/* an element's words with a <br> read as a space ("fresh grooves<br>friday." is "fresh grooves friday.") */
function words(n){if(!n)return '';var c=n.cloneNode(true);[].slice.call(c.querySelectorAll('br')).forEach(function(b){b.replaceWith(' ')});return text(c)}
function path(){return location.pathname.replace(/\.html$/,'')}
/* a link on this site, read from its href whatever form it takes (/artists/x, ../artists/x, absolute) */
function sitePath(href){if(!href)return null;var u;try{u=new URL(href,location.href)}catch(e){return null}return u.origin===location.origin||/(^|\.)groovesmaxxing\.com$/.test(u.hostname)?u.pathname.replace(/\.html$/,''):null}
/* the page's clean address: its canonical path (no .html, no query), on this origin */
function canonPath(){var c=document.querySelector('link[rel="canonical"]'),p=c&&sitePath(c.getAttribute('href'));return p||path()}
function cleanUrl(url){
  var u;try{u=new URL(url||location.href,location.href)}catch(e){return String(url||'')}
  if(u.origin===location.origin||/(^|\.)groovesmaxxing\.com$/.test(u.hostname))return SITE+u.pathname.replace(/\.html$/,'').replace(/\/index$/,'/')+u.search+u.hash;
  return u.href;
}
var sheet,panel,opener,toastT,toastEl;
function focusables(){return [].slice.call(panel.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function(e){return e.offsetParent!==null||e===document.activeElement})}
function build(){
  sheet=document.createElement('div');sheet.className='gmx-sheet';sheet.hidden=true;
  sheet.innerHTML='<div class="gmx-sheet-back" data-close></div><div class="gmx-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="gmx-sheet-title"><div class="gmx-sheet-grip" aria-hidden="true"></div><div class="gmx-sheet-head"><div class="gmx-sheet-tx"><p class="gmx-sheet-title" id="gmx-sheet-title"></p><p class="gmx-sheet-sub"></p></div><button type="button" class="gmx-sheet-x" data-close aria-label="close">×</button></div><div class="gmx-sheet-acts"></div></div>';
  document.body.appendChild(sheet);panel=sheet.querySelector('.gmx-sheet-panel');
  sheet.addEventListener('click',function(e){if(e.target.closest('[data-close]'))close()});
  document.addEventListener('keydown',function(e){
    if(!sheet||sheet.hidden)return;
    if(e.key==='Escape'){e.preventDefault();close();return}
    /* aria-modal says the page behind is out of reach, so tab and shift+tab wrap inside the panel */
    if(e.key==='Tab'){
      var f=focusables();if(!f.length){e.preventDefault();return}
      var first=f[0],last=f[f.length-1],a=document.activeElement,inside=panel.contains(a);
      if(e.shiftKey&&(a===first||!inside)){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&(a===last||!inside)){e.preventDefault();first.focus()}
    }
  });
}
/* one toast on the body, outside the sheet, so a button on the page (share, copy the list) can speak while the sheet is shut */
function toast(msg){var t=toastEl;if(!t){t=toastEl=document.createElement('div');t.className='gmx-sheet-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t)}t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on')},1800)}
function open(model,from){
  if(!sheet)build();
  opener=from||document.activeElement;
  sheet.querySelector('.gmx-sheet-title').textContent=model.title||'';
  var sub=sheet.querySelector('.gmx-sheet-sub');sub.textContent=model.sub||'';sub.hidden=!model.sub;
  var acts=sheet.querySelector('.gmx-sheet-acts');acts.innerHTML='';
  var field=null;
  if(model.field!=null){
    var many=String(model.field).indexOf('\n')>-1;
    field=document.createElement(many?'textarea':'input');if(many)field.rows=8;else field.type='text';
    field.readOnly=true;field.className='gmx-sheet-field';field.value=model.field;field.setAttribute('aria-label',model.title||'link');
    field.addEventListener('focus',function(){try{field.select()}catch(e){}});
    acts.appendChild(field);
  }
  (model.actions||[]).forEach(function(a){
    if(!a)return;
    var el=document.createElement(a.href?'a':'button');el.className='gmx-sheet-act'+(a.pressed?' on':'');
    if(a.href){el.href=a.href;if(a.external){el.target='_blank';el.rel='noopener'}}else el.type='button';
    el.innerHTML=svg(a.icon)+'<span class="l">'+esc(a.label)+'</span>'+(a.note?'<span class="n">'+esc(a.note)+'</span>':'')+(a.external?'<span class="n" aria-hidden="true">↗</span>':'');
    if(a.onClick)el.addEventListener('click',function(e){var keep=a.onClick(e,el);if(keep!==true)close()});
    else if(a.href&&!a.external)el.addEventListener('click',function(){close()});
    acts.appendChild(el);
  });
  sheet.hidden=false;document.documentElement.classList.add('gmx-sheet-open');
  var first=field||acts.querySelector('.gmx-sheet-act');setTimeout(function(){(first||sheet.querySelector('.gmx-sheet-x')).focus();if(field)try{field.select()}catch(e){}},30);
}
function close(){
  if(!sheet||sheet.hidden)return;
  sheet.hidden=true;document.documentElement.classList.remove('gmx-sheet-open');
  if(opener&&opener.focus&&document.contains(opener))try{opener.focus()}catch(e){}
}
/* the last resort: no share sheet and no clipboard, so the link sits selected in a sheet of its own until it is copied by hand */
function copySheet(u,from){setTimeout(function(){open({title:'copy this link',sub:'press and hold, then copy',field:u,actions:[]},from)},0)}
/* the one share: {title, text, url}. title defaults to the brand, url to this page's canonical address */
function shareNow(o,from){
  o=o||{};
  var u=cleanUrl(o.url||canonPath()),t=String(o.text||'').trim(),ti=o.title||BRAND;
  if(t&&window.gmxLang&&gmxLang.get&&gmxLang.tr&&gmxLang.get()!=='en')t=gmxLang.tr(t);
  from=from||document.activeElement;
  function viaClipboard(){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      /* no share sheet means no title shown, so the brand rides in the words unless they already name it */
      var said=(t&&!/groovesMAXXING/i.test(t)?t+' · '+ti:t||ti)+' '+u;
      navigator.clipboard.writeText(said).then(function(){toast('link copied')},function(){copySheet(u,from)});
    }else copySheet(u,from);
  }
  if(navigator.share){
    var d={title:ti,url:u};if(t)d.text=t;
    try{navigator.share(d).catch(function(e){if(!e||e.name!=='AbortError')viaClipboard()})}catch(e){viaClipboard()}
    return;
  }
  viaClipboard();
}
function share(o){return function(e,el){shareNow(o,el)}}
function crateAct(heart){
  if(!heart)return null;
  var on=heart.getAttribute('aria-pressed')==='true';
  return {icon:'heart',label:on?'in your crate, tap to take out':'add to my crate',pressed:on,onClick:function(){heart.click()}};
}
function followAct(name,slug,kind){
  if(!window.gmxCrate||!slug)return null;
  kind=kind||'artist';var item={kind:kind,id:kind+':'+slug,title:name,url:'/'+kind+'s/'+slug};item[kind]=name;
  var on=gmxCrate.has(item.id);
  return {icon:'person',label:(on?'following ':'follow ')+name,note:on?'tap to stop':'',pressed:on,onClick:function(){gmxCrate.toggle(item)}};
}
/* an artist or label link in any form: /artists/x, ../artists/x or the full address */
function slugOf(href){var p=sitePath(href),m=p&&/^\/(artists|labels)\/([a-z0-9-]+)$/.exec(p);return m?{kind:m[1].slice(0,-1),slug:m[2]}:null}
function firstSite(root,sel,re){var a=[].slice.call(root.querySelectorAll(sel));for(var i=0;i<a.length;i++){var p=sitePath(a[i].getAttribute('href'));if(p&&re.test(p))return {a:a[i],path:p}}return null}
/* a set: stage slide or sets-page card */
function setModel(s){
  var f=s.querySelector('[data-yt]')||s.querySelector('.video-frame'),id=f&&(f.getAttribute('data-yt')||(f.__facade&&f.__facade.getAttribute('data-yt')));if(!id)return null;
  var title=(f.getAttribute&&f.getAttribute('data-title'))||(f.__facade&&f.__facade.getAttribute('data-title'))||text(s.querySelector('.t'))||'set';
  var sub=text(s.querySelector('.set-meta .mono, .m')).replace(/\s*·\s*tracklist\s*↗?\s*$/,''),url='https://www.youtube.com/watch?v='+id;
  var prof=document.querySelector('section.artist:not(.label)[id]'),who=prof?{name:text(prof.querySelector('h1.aname')),slug:prof.id}:null;
  var al=firstSite(s,'a[href*="artists/"]',/^\/artists\/[a-z0-9-]+$/);if(!who&&al){var p=slugOf(al.path);if(p)who={name:text(al.a)||p.slug,slug:p.slug}}
  var tl=firstSite(s,'a[href*="tracklists/"]',/^\/tracklists\/[^\/]+$/);
  /* talks are not sets: the talk stages say so, and so do the interviews page and a profile's talks rail */
  var st=s.closest('[data-label]'),talk=(st&&st.getAttribute('data-label')==='talk')||/^\/interviews/.test(location.pathname)||!!s.closest('#talks, #pods');
  var acts=[
    {icon:'play',label:'play',onClick:function(){var b=s.querySelector('.set-facade');if(b)b.click();else{var w=s.querySelector('.video-frame');if(w)w.scrollIntoView({block:'center'})}}},
    crateAct(s.querySelector('.gmx-heart')),
    who&&!prof?followAct(who.name,who.slug):null,
    tl?{icon:'list',label:'the tracklist',href:tl.path}:null,
    {icon:'link',label:'open on youtube',href:url,external:true},
    /* the site's own tracklist when the set has one, so the friend lands on the timestamped list; else youtube */
    {icon:'share',label:talk?'share this talk':'share this set',onClick:share({text:title+(tl?' · the tracklist on '+BRAND:''),url:tl?tl.path:url})},
    {icon:'scan',label:'scan what is playing',href:'/scan'}
  ];
  return {title:title,sub:sub,actions:acts};
}
/* a tracklist page: the set's name (h1 + the first piece of the sub line) and a row's bare name */
function setNameOf(){var h1=words(document.querySelector('h1')),sub=text(document.querySelector('.mast .sub'));return h1+(sub?' · '+sub.split(' · ')[0]:'')}
function rowName(x){var c=x.cloneNode(true);[].slice.call(c.querySelectorAll(NOISE)).forEach(function(e){e.remove()});return text(c)}
function tlRows(){var out=[];[].slice.call(document.querySelectorAll('table.tl tr')).forEach(function(r){var x=r.querySelector('td.x');if(!x||!isSetRow(r))return;var at=text(r.querySelector('td.t'));out.push((at?at+' ':'')+rowName(x))});return out}
/* the whole list as plain text: the set's name, one line per row, a blank line, the page */
function listText(rows){rows=rows||tlRows();return [setNameOf()].concat(rows,['',SITE+canonPath()]).join('\n')}
/* no clipboard, or it said no: the list sits in a sheet of its own, lines kept, to copy by hand (2026-11-09) */
function copyList(e){
  var rows=tlRows(),t=listText(rows),from=(e&&e.currentTarget)||document.activeElement;
  var byHand=function(){setTimeout(function(){open({title:'copy the list',sub:'press and hold, then copy',field:t,actions:[]},from)},0)};
  if(!navigator.clipboard||!navigator.clipboard.writeText){byHand();return}
  navigator.clipboard.writeText(t).then(function(){toast('copied, '+rows.length+' lines')},byHand);
}
/* a row of a set's tracklist, not a row of the tracklists hub (those link a whole set and carry no number) */
function isSetRow(r){return !!r.querySelector('td.x')&&!r.querySelector('a.hrow')&&!!r.querySelector('td.n, td.t')}
function rowNum(r){var n=text(r.querySelector('td.n'));return /^\d{1,4}$/.test(n)?n:''}
/* a tracklist row */
function rowModel(r){
  var x=r.querySelector('td.x');if(!x)return null;
  var name=rowName(x),n=rowNum(r),ta=r.querySelector('td.t a'),at=text(r.querySelector('td.t')),open=r.classList.contains('open')||/^ID\s*-\s*ID\b/i.test(name);
  var setName=setNameOf();
  var deep=ta?ta.getAttribute('href'):null,here=canonPath()+(n?'#t'+n:'');
  var acts=[
    /* only when the row can seek: the four spotify-embed pages carry stamps with no link */
    at&&ta?{icon:'play',label:'play from '+at,onClick:function(){if(document.querySelector('.embed iframe')){ta.click();return}if(deep)window.open(deep,'_blank','noopener')}}:null,
    crateAct(x.querySelector('.gmx-heart'))
  ];
  var seen={};
  [].slice.call(x.querySelectorAll('a.ar, a.gmx-ar')).forEach(function(a){if(a.closest('.gmx-also'))return;var p=slugOf(a.getAttribute('href'));if(!p||seen[p.kind+p.slug])return;seen[p.kind+p.slug]=1;acts.push({icon:p.kind==='label'?'tag':'person',label:text(a),href:'/'+p.kind+'s/'+p.slug})});
  [].slice.call(x.querySelectorAll('.get a')).forEach(function(a){
    /* a "not out yet, follow <artist>" note links the profile: one row for that artist, not a second one marked external */
    var p=slugOf(a.getAttribute('href'));if(p){if(!seen[p.kind+p.slug]){seen[p.kind+p.slug]=1;acts.push({icon:p.kind==='label'?'tag':'person',label:text(a),href:'/'+p.kind+'s/'+p.slug})}return}
    var l=text(a).replace(/\s*[⌕↗]\s*$/,'');if(l)acts.push({icon:'link',label:l,href:a.getAttribute('href'),external:true})});
  /* the site's own row, which opens the tracklist at that line; the youtube moment stays one tap away under "play from" */
  var shareText=open?'an open ID'+(at?' at '+at:'')+' in '+setName+', know it?':name+(at?' · at '+at:'')+' in '+setName;
  acts.push({icon:'share',label:'share this second',onClick:share({text:shareText,url:here})});
  if(open){
    acts.push({icon:'mail',label:'i know this one',href:'mailto:'+MAIL+'?subject='+encodeURIComponent((at?'ID at '+at:'open ID')+' in '+setName)+'&body='+encodeURIComponent('i know the ID'+(at?' at '+at:'')+(n?' (track '+n+')':'')+' in '+setName+'.\n\nit is: \n\nhow i know: \n\n'+location.origin+here),external:true});
    acts.push({icon:'link',label:'no mail app? tell us on instagram',href:IG,external:true});
  }
  acts.push({icon:'scan',label:'scan what is playing',href:'/scan'});
  return {title:open?(at?'ID at '+at:'open ID'):name,sub:setName+(at&&!open?' · '+at:''),actions:acts};
}
/* an artist or label profile: share sits right under follow, so it shows without scrolling the sheet */
function profileModel(sec){
  var name=text(sec.querySelector('h1.aname')),kind=sec.classList.contains('label')?'label':'artist';
  var acts=[];
  var pill=sec.querySelector('.gmx-follow');
  if(pill){var on=pill.getAttribute('aria-pressed')==='true';acts.push({icon:'person',label:on?'following, tap to stop':'follow '+name,pressed:on,onClick:function(){pill.click()}})}
  acts.push({icon:'share',label:'share this page',onClick:share({text:name+' on '+BRAND,url:canonPath()})});
  [].slice.call(sec.querySelectorAll('.links a[href]')).forEach(function(a){var l=(a.getAttribute('aria-label')||a.getAttribute('title')||text(a)).replace(/\s*[↗→]\s*$/,'');if(l)acts.push({icon:'link',label:l,href:a.getAttribute('href'),external:/^https?:/.test(a.getAttribute('href'))})});
  var claim=document.querySelector('.gmx-claim-row:not(.mine) .gmx-claim');  /* "this is me" lives here now (site review item 9) */
  if(claim)acts.push({icon:'person',label:kind==='label'?'run this label? claim the page':'this is me: claim this page',onClick:function(){claim.click()}});
  acts.push({icon:'scan',label:'scan what is playing',href:'/scan'});
  return {title:name,sub:kind==='label'?'label':'artist',actions:acts};
}
function more(label,model){
  var b=document.createElement('button');b.type='button';b.className='gmx-more';b.setAttribute('aria-label','more for '+label);b.setAttribute('aria-haspopup','dialog');b.title='more';
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>';
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var m=model();if(m)open(m,b)});
  return b;
}
/* a small round share icon for a card that has its own address */
function ishare(label,o,cls){
  var b=document.createElement('button');b.type='button';b.className='gmx-more gmx-ishare'+(cls?' '+cls:'');b.setAttribute('aria-label',label);b.title='share';b.innerHTML=svg('share');
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();shareNow(typeof o==='function'?o():o,b)});
  return b;
}
/* the page's share words: a <meta name="gmx-share"> when the page has one, else its og:title without the brand */
function pageText(){
  var m=document.querySelector('meta[name="gmx-share"]');if(m&&m.content)return m.content;
  if(PAGE_TEXT[canonPath()])return PAGE_TEXT[canonPath()];
  var og=document.querySelector('meta[property="og:title"]'),t=(og&&og.content)||document.title||'';
  t=t.replace(/\s*[·|–-]\s*groovesmaxxing\s*$/i,'').replace(/^groovesmaxxing\s*[·|–-]\s*/i,'').trim();
  /* a newsletter issue: "fresh grooves friday 015: <the issue's headline>" */
  var iss=/^\/newsletter\/fgf-\d+$/.test(canonPath())?words(document.querySelector('h1')):'';
  if(iss&&t.toLowerCase().indexOf(iss.toLowerCase())<0)t=t+': '+iss;
  return t;
}
/* the page's share words: a profile says "<name> on groovesMAXXING", a tracklist names the set, the rest read pageText() */
function headText(){
  var sec=document.querySelector('section.artist[id]');if(sec&&sec.querySelector('h1.aname'))return text(sec.querySelector('h1.aname'))+' on '+BRAND;
  if(document.querySelector('.mast .meta')&&[].slice.call(document.querySelectorAll('table.tl tr')).some(isSetRow))return setNameOf();
  return pageText();
}
/* the page share (2026-11-09: it was a pill under the h1, now a round icon in the header row). gmx-account.js builds the
   icon with the row, so it is there from the row's first paint, and decides which pages get one; a tap lands here */
function sharePage(from){shareNow({text:headText(),url:canonPath()},from)}
/* the other copy of canonPath and the NOSHARE list (which pages get the icon) lives in gmx-account.js: change both together */
/* cards with their own address get their own share */
function itemShares(){
  /* the festival calendar: each card is /calendar#e-<festival>-<year> */
  [].slice.call(document.querySelectorAll('article.ev[id][data-n]')).forEach(function(ev){
    var acts=ev.querySelector('.acts');if(!acts||acts.querySelector('.gmx-ishare-txt'))return;
    var b=document.createElement('button');b.type='button';b.className='gmx-ishare-txt';b.textContent='share';b.setAttribute('aria-label','share '+ev.getAttribute('data-n'));
    b.addEventListener('click',function(){
      /* "Midburn 2026 · Nov 2–7 · Negev desert · Sde Boker · Israel": the date is the card's first words, before the kind and status chips */
      var n=ev.getAttribute('data-n'),ed=ev.getAttribute('data-ed')||'',dt=ev.querySelector('.date'),f=dt&&dt.firstChild,when=f&&f.nodeType===3?f.nodeValue.replace(/\s+/g,' ').trim():'';
      shareNow({text:[n+(/^\d{4}$/.test(ed)?' '+ed:''),when,ev.getAttribute('data-place')].filter(Boolean).join(' · '),url:'/calendar#'+ev.id},b);
    });
    acts.appendChild(b);
  });
  /* the badge map: each badge is /badges#<badge> */
  if(/^\/badges$/.test(path()))[].slice.call(document.querySelectorAll('section.bsec[id]')).forEach(function(sec){
    var h=sec.querySelector('.letterhead');if(!h||h.querySelector('.gmx-ishare'))return;
    var name=text(h).replace(/\s*·\s*\d+\s*$/,'');
    h.appendChild(ishare('share this badge',{text:name+' · the badges on '+BRAND,url:'/badges#'+sec.id},'gmx-ishare-sm'));
  });
  /* gaining dj support: each track gets an address of its own (#dj-<title>), so the row share gmx-hubs.js draws
     can send /dj-support#dj-… and a shared link lands on the track (hit() below scrolls to it) */
  if(/^\/dj-support$/.test(path()))[].slice.call(document.querySelectorAll('.wrap > .ev')).forEach(function(ev){
    if(ev.id)return;var h=ev.querySelector('h3');if(!h)return;
    var c=h.cloneNode(true),sm=c.querySelector('small');if(sm)sm.remove();
    var slug=text(c).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(slug&&!document.getElementById('dj-'+slug)){ev.id='dj-'+slug;ev.classList.add('gmx-rid')}
  });
  /* the open IDs board: each row shares its line in the tracklist (/tracklists/<set>#tNN) and gets an id here,
     unless the board already draws its own share button on the row */
  [].slice.call(document.querySelectorAll('section.oset[id] .orow')).forEach(function(r){
    if(r.querySelector('.gmx-ishare, .oshare, [data-share]'))return;   /* the board's own share (open-ids.html) wins */
    var set=r.closest('section.oset'),nm=set.querySelector('.oh a.nm'),tn=text(r.querySelector('.tn')),at=text(r.querySelector('.at')).replace(/\s*↗\s*$/,'');
    if(!/^\d{1,4}$/.test(tn))return;
    if(!r.id)r.id=set.id+'-t'+tn;
    var tl=nm&&sitePath(nm.getAttribute('href'));
    var setName=text(nm)+(text(set.querySelector('.oh .wh'))?' · '+text(set.querySelector('.oh .wh')).split(' · ')[0]:'');
    r.appendChild(ishare('share this ID',{text:'an open ID'+(at?' at '+at:'')+' in '+setName+', know it?',url:(tl||'/open-ids')+(tl?'#t'+tn:'#'+r.id)},'gmx-ishare-sm'));
  });
}
/* a #tNN (or a dj support #dj-…) in the address: those ids are given at runtime, so the browser's own jump
   misses; do it here once they exist */
var jumped='';
function hit(){
  var m=/^#([a-z0-9-]{1,120})$/i.exec(location.hash);if(!m||jumped===location.hash)return;
  var r=document.getElementById(m[1]);if(!r||!(r.closest('table.tl')&&/^t\d+$/.test(m[1])||r.classList.contains('gmx-rid')))return;
  jumped=location.hash;
  r.scrollIntoView({block:'center'});
  [].slice.call(document.querySelectorAll('.gmx-hit')).forEach(function(x){x.classList.remove('gmx-hit')});
  r.classList.add('gmx-hit');
}
/* a profile player or reel with no title gets a plain link to its source right under it (pt-artists-2,
   2026-11-09): when the embed is blocked or slow, the music is still one tap away. a link, no handler */
function srcLink(box,href,label){var n=box.nextElementSibling;if(n&&n.classList&&n.classList.contains('gmx-src'))return;var a=document.createElement('a');a.className='gmx-src';a.href=href;a.target='_blank';a.rel='noopener';a.textContent=label;box.parentNode.insertBefore(a,box.nextSibling)}
function srcLinkFor(box,src){
  var m,u;if(!src||!box.parentNode)return;
  if((m=/open\.spotify\.com\/embed\/(playlist|album|track|artist)\/([A-Za-z0-9]+)/.exec(src))){srcLink(box,'https://open.spotify.com/'+m[1]+'/'+m[2],'open on spotify ↗');return}
  if((m=/w\.soundcloud\.com\/player\/\?(?:.*&)?url=([^&]+)/.exec(src))){try{u=decodeURIComponent(m[1])}catch(e){return}if(/^https?:\/\/(www\.|m\.)?soundcloud\.com\//.test(u))srcLink(box,u.replace(/^http:/,'https:'),'open on soundcloud ↗');return}
  if((m=/^https:\/\/www\.instagram\.com\/reel\/([A-Za-z0-9_-]+)\/embed/.exec(src)))srcLink(box,'https://www.instagram.com/reel/'+m[1]+'/','watch on instagram ↗');
}
function wire(root){
  root=root||document;
  [].slice.call(root.querySelectorAll('.set-slide .gmx-heart, .card .gmx-heart')).forEach(function(h){
    if(h.nextElementSibling&&h.nextElementSibling.classList.contains('gmx-more'))return;
    var s=h.closest('.set-slide, .card');if(!s)return;
    h.parentNode.insertBefore(more(text(s.querySelector('.t'))||'this set',function(){return setModel(s)}),h.nextSibling);
  });
  [].slice.call(root.querySelectorAll('table.tl tr')).forEach(function(r){
    if(!isSetRow(r))return;
    var nn=rowNum(r);if(nn&&!r.id)r.id='t'+nn;
    var x=r.querySelector('td.x');if(x.querySelector('.gmx-more'))return;
    var h=x.querySelector('.gmx-heart'),open=r.classList.contains('open');
    if(!h&&!open)return;
    var b=more(h?h.getAttribute('aria-label').replace(/^[^:]*:\s*/,''):'this ID',function(){return rowModel(r)});
    if(h)h.parentNode.insertBefore(b,h.nextSibling);else x.appendChild(b);
  });
  var sec=document.querySelector('section.artist[id]');
  if(sec&&!sec.querySelector('.meta .gmx-more')){var pill=sec.querySelector('.meta .gmx-follow');if(pill){var mb=more(text(sec.querySelector('h1.aname')),function(){return profileModel(sec)});pill.parentNode.insertBefore(mb,pill.nextSibling)}}
  /* a profile's page share is the round icon in the header row now (gmx-account.js), so the meta row keeps follow and "…" */
  /* a tracklist page: copy the list, from the mast, so the installed app needs no address bar. the page share is the round
     header icon only (G-MO, 2026-11-10): it sends the same words (headText gives setNameOf here) and the same canonical url */
  var meta=document.querySelector('.mast .meta'),setRows=[].slice.call(document.querySelectorAll('table.tl tr')).some(isSetRow);
  if(meta&&setRows&&!document.querySelector('.gmx-tlact')){
    var cb=tlAct('copy','list','copy the list');
    cb.addEventListener('click',copyList);
    meta.appendChild(cb);
  }
  /* a playlist card: share the playlist's own spotify or soundcloud link */
  [].slice.call(document.querySelectorAll('.player')).forEach(function(p){
    if(p.querySelector('.gmx-pshare'))return;
    var f=p.querySelector('iframe'),h=p.querySelector('h3'),src=f?(f.getAttribute('src')||f.getAttribute('data-src')||''):'',url=null,m;
    if(!h){srcLinkFor(p,src);return}
    if((m=/open\.spotify\.com\/embed\/(playlist|album|track)\/([A-Za-z0-9]+)/.exec(src)))url='https://open.spotify.com/'+m[1]+'/'+m[2];
    else if((m=/w\.soundcloud\.com\/player\/\?(?:.*&)?url=([^&]+)/.exec(src)))try{url=decodeURIComponent(m[1])}catch(e){url=null}
    if(!url)return;
    var name=text(h).replace(/[^\p{L}\p{N}\p{P}]+$/u,'').trim()||'this playlist';
    var b=document.createElement('button');b.type='button';b.className='gmx-more gmx-pshare';b.setAttribute('aria-label','share '+name);b.title='share';b.innerHTML=svg('share');
    b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();shareNow({text:name,url:url},b)});
    h.parentNode.insertBefore(b,h.nextSibling);p.classList.add('has-share');
  });
  /* an instagram reel on a profile: the same plain way out under it */
  [].slice.call(document.querySelectorAll('.gmxreel-wrap')).forEach(function(w){var f=w.querySelector('iframe');if(f)srcLinkFor(w,f.getAttribute('src')||f.getAttribute('data-src')||'')});
  itemShares();
  hit();
}
function tlAct(k,icon,label){var b=document.createElement('button');b.type='button';b.className='tag gmx-tlact';b.setAttribute('data-tl',k);b.innerHTML=svg(icon)+'<span>'+esc(label)+'</span>';return b}
function later(e){setTimeout(function(){wire(e&&e.target&&e.target.querySelectorAll?e.target:document)},0)}
/* the open IDs board draws its rows after a fetch and again on every search, so it is watched */
function watch(){
  var board=document.getElementById('board');if(!board||!window.MutationObserver||!/^\/open-ids$/.test(path()))return;
  var t=null;new MutationObserver(function(){clearTimeout(t);t=setTimeout(function(){itemShares()},60)}).observe(board,{childList:true});
}
function start(){wire();watch();setTimeout(wire,400);setTimeout(wire,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
document.addEventListener('gmx:stage',later);document.addEventListener('gmx:cards',later);
window.addEventListener('hashchange',function(){jumped='';hit()});
window.gmxSheet={open:open,close:close,wire:wire,share:shareNow,sharePage:sharePage,toast:toast,ROW_NOISE:NOISE,listText:function(){return listText()}};
})();
