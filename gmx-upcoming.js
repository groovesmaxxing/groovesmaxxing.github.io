/* groovesmaxxing dropping soon (2026-10-11, tabs and the show menu 2026-11-04, monday graduation 2026-11-05).
   vanilla, no dependencies. the release rows come from the laptop's upcomingpage.py and this never changes
   what they say. it adds:
   - tabs: dropping soon and released. a release stays under dropping soon through the sunday after its day
     (G-MO 2026-11-05), reading "out friday" with its chip from the day after, then graduates on monday
     morning. the page is not rebuilt at midnight, so the graduation happens here: on that monday, a row the
     store had already confirmed when the page was built (data-out) moves to released, and a row it had not
     leaves the page until the store pass and the next build decide. /upcoming#released opens the second tab.
   - a show menu per tab, how far ahead or how far back. the dates past it hide, and the line under the
     last date in range says how many more there are, with a look further button. a choice stays on this
     phone under gmx_upcoming_range, per tab. a tab never set steps out on its own until it shows something.
   - the relative day on each date: today, tomorrow, this friday, next friday, last friday, 2 weeks ago.
     only the phone knows what today is. inside two weeks the relative day is the heading and the date the
     small line, further out the other way round, so a run of dates never reads "2 weeks ago" three times.
   - the crate chips (with gmx-crate.js): everyone, or only the releases whose artist or label is in the
     crate (liked sets and tracks, followed artists and labels). the choice stays under gmx_upcoming_mine,
     /upcoming?mine=1 switches it on, and a crate synced from the account reapplies it.
   - the sample player (2026-11-05): a tap on a sample pill (a.ur-play, a link to the beatport track) loads
     beatport's own embed at the end of its li, one open at a time, a second tap closes it.
   - web review 2026-11-09: each sample pill is named for its track (play the sample · <track>) with a 44px hit
     area; label names in the where line link to the label page when the site has one; every row gets an id
     (r-<title and artists>) so /upcoming#r-... opens its tab and fold and scrolls to it; a row with no store link
     gets a beatport search (released) or says no link yet; the released tab points at the friday list and the
     picks. the css for these is injected here so a rebuild of upcoming.html keeps it.
   without this script both lists read in full, one under the other. */
(function(){
'use strict';
var MINE='gmx_upcoming_mine',RANGE='gmx_upcoming_range',FOLD_AT=12,FOLD_SLACK=3;
var MENU={
  soon:[[14,'next 2 weeks'],[31,'next month'],[92,'next 3 months'],[0,'everything']],
  released:[[7,'last week'],[14,'last 2 weeks'],[31,'last month'],[0,'last 3 months']]
};
var WD=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function text(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():''}
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function midnight(){var t=new Date();t.setHours(0,0,0,0);return t}
function dateOf(iso){var p=iso.split('-');return new Date(+p[0],+p[1]-1,p[2]?+p[2]:1)}
function days(iso){return Math.round((dateOf(iso)-midnight())/86400000)}
/* a date is past once the monday after it has come (sun +1, mon +7, fri +3), a month once the month is */
function past(iso){if(iso.length===10){var d=dateOf(iso);d.setDate(d.getDate()+((8-d.getDay())%7||7));return midnight()>=d}if(iso.length===7){var p=iso.split('-');return new Date(+p[0],+p[1],1)<=midnight()}return false}
function rel(iso,released){
  var n=days(iso),wd=WD[dateOf(iso).getDay()],w;
  if(n===0)return 'today';
  if(released){
    if(n>0)return 'out early';
    if(n===-1)return 'yesterday';
    if(n>-7)return 'last '+wd;
    w=Math.round(-n/7);return w===1?'a week ago':w+' weeks ago';
  }
  if(n<0&&!past(iso))return 'out '+wd;   /* its release week, still under dropping soon */
  if(n===1)return 'tomorrow';
  return n<7?'this '+wd:n<14?'next '+wd:'in '+Math.round(n/7)+' weeks';
}
/* named nfold: start() has its own local fold (the crate's), which would shadow this one inside it */
function nfold(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/\s+/g,' ').trim()}
var CSS='.ur-play{position:relative}.ur-play::before{content:"";position:absolute;inset:-12px -4px}'+
  '.ur-hub a,.ev .where a.gmx-ar{color:inherit;text-decoration:underline;text-underline-offset:3px}.ur-hub a{color:var(--racing);white-space:nowrap}'+
  '.ev.ur-hit{outline:2px solid var(--racing);outline-offset:4px;border-radius:8px}.ur-nolink{color:var(--steel)}'+
  '.gmx-mine button b{opacity:1}';
function css(){if(document.getElementById('ur-js-css'))return;var st=document.createElement('style');st.id='ur-js-css';st.textContent=CSS;document.head.appendChild(st)}
/* the track a sample pill plays: a release's own row reads its h4, a track row the text before the bpm */
function trackOf(a){
  var li=a.closest('li'),t='';if(!li)return '';
  if(li.classList.contains('ev'))return text(li.querySelector('h4'));
  for(var n=li.firstChild;n;n=n.nextSibling){if(n.nodeType===1&&(n.classList.contains('ur-bk')||n.classList.contains('ur-play')))break;t+=n.textContent}
  return t.replace(/\s+/g,' ').trim();
}
/* ' · ' on purpose: gmx-lang.js translates each segment on its own, so the words change and the track stays */
function playName(a,open){if(a._t==null)a._t=trackOf(a);a.setAttribute('aria-label',(open?'close the sample':'play the sample')+(a._t?' · '+a._t:''))}
function slug(s){return nfold(s).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)}
function nWord(n){return n+(n===1?' release':' releases')}
function list(rows){var u=document.createElement('ul');u.className='ur-list';rows.forEach(function(r){u.appendChild(r)});return u}
/* rebuild one date's rows: the first twelve in the card, the rest behind a fold, the count beside the date */
function relist(el,rows,long){
  [].slice.call(el.querySelectorAll(':scope>.ur-list,:scope>.ur-more')).forEach(function(x){el.removeChild(x)});
  var shown=rows.length>FOLD_AT+FOLD_SLACK?rows.slice(0,FOLD_AT):rows,rest=rows.slice(shown.length);
  el.appendChild(list(shown));
  if(rest.length){
    var d=document.createElement('details'),s=document.createElement('summary');d.className='ur-more';
    s.textContent=rest.length+' more '+(long.indexOf('sometime ')===0?long.replace('sometime ',''):'on '+long);
    d.appendChild(s);d.appendChild(list(rest));el.appendChild(d);
  }
  var c=el.querySelector('.ur-n');if(c)c.textContent=nWord(rows.length);
}

function start(){
  var wrap=document.querySelector('.wrap'),bar=document.querySelector('.ur-tabs');
  var panels={soon:document.getElementById('soon'),released:document.getElementById('released')};
  if(!wrap||!bar||!panels.soon||!panels.released||bar.getAttribute('role'))return;
  wrap.classList.add('ur-js');css();
  var KEYS=['soon','released'];

  /* ids, so one release can be linked: r-<title and artists>, a repeat gets -2, -3 */
  var seen={};
  [].forEach.call(wrap.querySelectorAll('.ur-panel .ev'),function(ev){
    if(!ev.id){var b='r-'+(slug(text(ev.querySelector('h4')))||'release'),id=b,i=1;while(seen[id]||document.getElementById(id))id=b+'-'+(++i);ev.id=id}
    seen[ev.id]=1;
    /* a row with no store link: a beatport search once it is out, a plain word before */
    if(!ev.querySelector('a.go')){
      var h4=ev.querySelector('h4'),q=((h4&&h4.firstChild&&h4.firstChild.nodeType===3?h4.firstChild.nodeValue:'')+' '+text(ev.querySelector('h4 small'))).replace(/\s+/g,' ').trim();
      if(ev.getAttribute('data-out')==='1'){var g=document.createElement('a');g.className='go';g.href='https://www.beatport.com/search?q='+encodeURIComponent(q);g.target='_blank';g.rel='noopener';g.textContent='search beatport →';ev.appendChild(g)}
      else{var w=document.createElement('span');w.className='go ur-nolink';w.textContent='no link yet';ev.appendChild(w)}
    }
  });
  [].forEach.call(wrap.querySelectorAll('a.ur-play'),function(a){playName(a,a.getAttribute('aria-expanded')==='true')});
  /* the released tab points at the verified weekly list and the picks */
  var rpn=panels.released.querySelector('.ur-pn');
  if(rpn&&!panels.released.querySelector('.ur-hub')){
    var hub=document.createElement('p');hub.className='ur-pn ur-hub';
    hub.innerHTML='the verified weekly list: <a href="/friday">fresh grooves friday →</a> · <a href="/picks">how our picks did →</a>';
    rpn.parentNode.insertBefore(hub,rpn.nextSibling);
  }
  /* label names link to the label page when the site has one */
  fetch('/names-index.json',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(n){
    if(!n||!n.l)return;
    [].forEach.call(wrap.querySelectorAll('.ur-panel .ev .where'),function(w){
      var t=w.firstChild;if(!t||t.nodeType!==3)return;
      var v=t.nodeValue,i=v.indexOf(' · '),lab=(i<0?v:v.slice(0,i)).trim(),s=lab&&n.l[nfold(lab)];if(!s)return;
      var a=document.createElement('a');a.className='gmx-ar';a.href='/labels/'+s;a.textContent=lab;
      w.insertBefore(a,t);t.nodeValue=v.slice(v.indexOf(lab)+lab.length);
    });
  }).catch(function(){});

  /* graduation: a dropping soon date that is over moves its confirmed rows to released, newest first */
  [].slice.call(panels.soon.querySelectorAll('.ur-day')).forEach(function(el){
    var iso=el.getAttribute('data-iso')||'';
    if(!past(iso))return;
    var rows=[].slice.call(el.querySelectorAll('.ev')).filter(function(r){return r.getAttribute('data-out')==='1'});
    var long=text(el.querySelector('.ur-rel'));
    el.parentNode.removeChild(el);
    if(!rows.length)return;
    var same=null,before=null;
    [].slice.call(panels.released.querySelectorAll('.ur-day')).some(function(g){
      var gi=g.getAttribute('data-iso')||'';if(gi===iso){same=g;return true}if(gi<iso){before=g;return true}return false;
    });
    if(same){relist(same,[].slice.call(same.querySelectorAll('.ev')).concat(rows),long);return}
    relist(el,rows,long);
    var empty=panels.released.querySelector(':scope>.empty');if(empty)panels.released.removeChild(empty);
    panels.released.insertBefore(el,before);
  });
  if(!panels.soon.querySelector('.ur-day,.empty')){
    var none=document.createElement('p');none.className='empty';none.textContent='nothing dated right now. check back friday.';
    var pn=panels.soon.querySelector('.ur-pn');panels.soon.insertBefore(none,pn?pn.nextSibling:null);
  }
  tabCount();
  function tabCount(){KEYS.forEach(function(k){var b=bar.querySelector('[data-tab="'+k+'"] b');if(b)b.textContent=panels[k].querySelectorAll('.ev').length})}

  /* the dates: relative day, today's chip, and in its release week a pre-order is the release page */
  var groups={soon:[],released:[]};
  KEYS.forEach(function(k){
    [].forEach.call(panels[k].querySelectorAll('.ur-day'),function(el){
      var iso=el.getAttribute('data-iso')||'';
      if(iso.length===10){
        var r=el.querySelector('.ur-rel'),d=el.querySelector('.ur-dd'),n=days(iso),say=rel(iso,k==='released');
        if(r&&d){if(n>-7&&n<14){d.textContent=text(r);r.textContent=say}else d.textContent=say}
        if(k==='released'?n===0:n<=0&&!past(iso)){
          el.classList.add('ur-now');
          [].forEach.call(el.querySelectorAll('a.go'),function(a){var t=text(a);if(t==='pre-order →')a.textContent='on beatport →';else if(t==='pre-save →')a.textContent='listen →'});
        }
      }
      var c=el.querySelector('.ur-n');
      groups[k].push({el:el,iso:iso,rows:[].slice.call(el.querySelectorAll('.ev')),lists:[].slice.call(el.querySelectorAll('.ur-list')),
        folds:[].slice.call(el.querySelectorAll('details')),count:c,count0:c?c.textContent:''});
    });
  });
  var tba=panels.soon.querySelector('.ur-tba'),tbaRows=tba?[].slice.call(tba.querySelectorAll('.ev')):[];

  /* a way back up from the bottom of a long fold */
  [].forEach.call(document.querySelectorAll('.ur-more'),function(d){
    var b=document.createElement('button');b.type='button';b.className='ur-fold';b.textContent='fold it back up';
    b.addEventListener('click',function(){var s=d.querySelector('summary');d.open=false;s.scrollIntoView({block:'center'});s.focus({preventScroll:true})});
    d.appendChild(b);
  });

  /* the tabs */
  var tabs=[].slice.call(bar.querySelectorAll('[data-tab]'));
  bar.setAttribute('role','tablist');bar.setAttribute('aria-label','releases');
  tabs.forEach(function(t){
    var k=t.getAttribute('data-tab');
    t.id='tab-'+k;t.setAttribute('role','tab');t.setAttribute('aria-controls',k);
    panels[k].setAttribute('role','tabpanel');panels[k].setAttribute('aria-labelledby','tab-'+k);
  });

  /* the show menu, then the crate chips, in one row under the tabs */
  var ctl=document.createElement('div');ctl.className='ur-ctl';
  ctl.innerHTML='<label class="ur-rng"><span>show</span><select></select></label>';
  bar.parentNode.insertBefore(ctl,bar.nextSibling);
  var sel=ctl.querySelector('select');
  var line=document.createElement('div');line.className='ur-line gmx-hidden';
  line.innerHTML='<span></span><button type="button">look further</button>';
  var lineTxt=line.querySelector('span'),lineBtn=line.querySelector('button');

  var crate=window.gmxCrate,meta=[],allB,mineB,why,opened=[];
  if(crate){
    var fold=crate.fold,split=crate.artistsOf;
    var chips=document.createElement('div');chips.className='gmx-mine';chips.setAttribute('role','group');chips.setAttribute('aria-label','whose releases');
    chips.innerHTML='<button type="button" data-m="0">everyone<b></b></button><button type="button" data-m="1">my crate<b></b></button><p class="why" hidden></p>';
    ctl.appendChild(chips);
    allB=chips.querySelector('[data-m="0"]');mineB=chips.querySelector('[data-m="1"]');why=chips.querySelector('.why');
    /* what each row is: the artists in the small line, the label in the first part of the where line */
    [].forEach.call(wrap.querySelectorAll('.ur-panel .ev'),function(ev){
      var small=ev.querySelector('h4 small'),where=ev.querySelector('.where');
      meta.push({ev:ev,artists:split(text(small)).map(fold),label:fold(text(where).split(' · ')[0]||'')});
    });
    chips.addEventListener('click',function(e){var b=e.target.closest('[data-m]');if(!b)return;mine=b.getAttribute('data-m')==='1';put(MINE,mine?'1':'0');apply()});
    document.addEventListener('gmx:crate-synced',function(){apply()});
    document.addEventListener('gmx:crate',function(){if(mine)apply()});
  }
  function matches(m,n){if(m.label&&n.labels[m.label])return true;for(var i=0;i<m.artists.length;i++)if(n.artists[m.artists[i]])return true;return false}

  var cur='soon',mine=false,idx={soon:1,released:1},picked={},saved={};
  try{saved=JSON.parse(get(RANGE)||'{}')||{};KEYS.forEach(function(k){var v=saved[k];if(v===+v&&v>=0&&v<MENU[k].length&&v%1===0){idx[k]=v;picked[k]=true}else delete saved[k]})}catch(e){saved={}}
  try{mine=!!crate&&(/[?&]mine=1\b/.test(location.search)||get(MINE)==='1')}catch(e){}

  function vis(r){return !r.classList.contains('gmx-hidden')}
  /* the crate filter opens folds to show what it found, and closes the ones it opened when it is off */
  function openFor(d){if(!d.open){d.open=true;opened.push(d)}}
  function apply(){
    closeAll();
    var p=panels[cur],opt=MENU[cur][idx[cur]],lim=opt[0],names=mine&&crate?crate.names():null;
    meta.forEach(function(m){m.ev.classList.toggle('gmx-hidden',!!names&&!matches(m,names))});
    if(!names&&opened.length){opened.forEach(function(d){d.open=false});opened=[]}
    var more=0,shown=0,last=null,total=0,hit=0;
    groups[cur].forEach(function(g){
      var n=g.iso?days(g.iso):0,inRange=!lim||(cur==='soon'?n<=lim:-n<=lim),v=g.rows.filter(vis).length;
      g.el.classList.toggle('gmx-hidden',!(inRange&&v));
      if(inRange){total+=g.rows.length;hit+=v;if(v){shown+=v;last=g.el}}else more+=v;
      g.lists.forEach(function(u){u.classList.toggle('gmx-hidden',!!names&&![].some.call(u.querySelectorAll('.ev'),vis))});
      g.folds.forEach(function(d){var any=[].some.call(d.querySelectorAll('.ev'),vis);d.classList.toggle('gmx-hidden',!!names&&!any);if(names&&any)openFor(d)});
      if(g.count)g.count.textContent=names&&v<g.rows.length?v+' of '+g.count0:g.count0;
    });
    if(cur==='soon'&&tba){
      var tv=tbaRows.filter(vis).length;
      tba.classList.toggle('gmx-hidden',!tv);total+=tbaRows.length;hit+=tv;
      if(names&&tv)openFor(tba);
    }
    /* the line sits under the last date in range, above no date yet */
    var showLine=!!(lim&&more);
    if(showLine){
      lineTxt.textContent=(shown?'that’s the '+opt[1]:'nothing in the '+opt[1])+' · '+more+' more '+(cur==='soon'?'further out':'further back');
      var at=last?last.nextSibling:p.querySelector('.ur-pn').nextSibling;
      if(line.parentNode!==p||line.previousSibling!==(last||p.querySelector('.ur-pn')))p.insertBefore(line,at);
    }
    line.classList.toggle('gmx-hidden',!showLine);
    if(crate){
      allB.querySelector('b').textContent=total;mineB.querySelector('b').textContent=names?hit:'';
      allB.setAttribute('aria-pressed',names?'false':'true');mineB.setAttribute('aria-pressed',names?'true':'false');
      if(names&&!hit){
        why.hidden=false;
        why.innerHTML=names.count?'nothing here matches your crate yet. it matches on the artist or the label of what you liked, and on the artists and labels you follow. keep digging and check back.':'your crate is empty on this phone. tap the heart under a set or next to a track, or follow an artist or a label on their page, and this filter wakes up. <a href="/crate">my crate</a>';
      }else why.hidden=true;
    }
    return shown;
  }
  function fill(){sel.innerHTML=MENU[cur].map(function(o,i){return '<option value="'+i+'">'+o[1]+'</option>'}).join('');sel.value=String(idx[cur])}
  function step(to){
    idx[cur]=to;sel.value=String(to);picked[cur]=true;saved[cur]=to;put(RANGE,JSON.stringify(saved));
    if(cur==='soon'&&tba&&!MENU.soon[to][0])tba.open=true;   /* everything includes no date yet */
    apply();
  }
  sel.addEventListener('change',function(){step(+sel.value)});
  lineBtn.addEventListener('click',function(){
    if(idx[cur]>=MENU[cur].length-1)return;
    var had=document.activeElement===lineBtn;step(idx[cur]+1);
    if(had)(line.classList.contains('gmx-hidden')?sel:lineBtn).focus({preventScroll:true});
  });

  function show(k,focus){
    cur=k;
    tabs.forEach(function(t){var on=t.getAttribute('data-tab')===k;t.setAttribute('aria-selected',on?'true':'false');t.tabIndex=on?0:-1;if(on&&focus)t.focus()});
    KEYS.forEach(function(x){panels[x].hidden=x!==k});
    fill();
    /* a tab never set: a quiet range steps out until it shows something, without saving the step */
    if(!apply()&&!picked[cur]&&!mine)while(idx[cur]<MENU[cur].length-1){idx[cur]++;sel.value=String(idx[cur]);if(apply())break}
  }
  function go(k,focus){show(k,focus);try{history.replaceState(null,'',k==='released'?'#released':location.pathname+location.search)}catch(e){}}
  bar.addEventListener('click',function(e){var t=e.target.closest('[data-tab]');if(!t)return;e.preventDefault();closeAll();go(t.getAttribute('data-tab'))});
  bar.addEventListener('keydown',function(e){
    if(['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)<0)return;e.preventDefault();
    go(e.key==='Home'?'soon':e.key==='End'?'released':cur==='soon'?'released':'soon',true);
  });
  /* only the tab hashes switch tabs, the skip link (#gmx-main) and others are left alone */
  /* a row hash (#r-...) opens that row's tab, widens the range just enough, opens its fold and scrolls to it */
  function row(h){
    var ev=/^#r-[a-z0-9-]+$/.test(h)&&document.getElementById(h.slice(1));
    var pn=ev&&ev.closest('.ur-panel');if(!pn||!panels[pn.id])return false;
    if(mine&&crate&&!matches(meta.filter(function(m){return m.ev===ev})[0]||{artists:[]},crate.names()))mine=false;
    show(pn.id);
    while(ev.closest('.gmx-hidden')&&idx[cur]<MENU[cur].length-1){idx[cur]++;sel.value=String(idx[cur]);apply()}
    for(var d=ev.parentElement;d&&d!==wrap;d=d.parentElement)if(d.tagName==='DETAILS'&&!d.open)d.open=true;
    [].forEach.call(wrap.querySelectorAll('.ur-hit'),function(x){x.classList.remove('ur-hit')});
    ev.classList.add('ur-hit');
    setTimeout(function(){ev.scrollIntoView({block:'center'})},0);
    return true;
  }
  window.addEventListener('hashchange',function(){var h=location.hash;if(/^#r-/.test(h)){row(h);return}if(h&&h!=='#released'&&h!=='#soon')return;var k=h==='#released'?'released':'soon';if(k!==cur)show(k)});
  if(!row(location.hash))show(location.hash==='#released'?'released':'soon');
  /* /upcoming#released lands on the panel with the tabs scrolled away: bring them into view, on a fresh visit only,
     so a reload or a back keeps where the reader was */
  var nav=(window.performance&&performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||{};
  if(location.hash==='#released'&&(!nav.type||nav.type==='navigate')){
    var top=function(){window.scrollTo(0,Math.max(0,bar.getBoundingClientRect().top+window.pageYOffset-12))},y0;
    top();y0=window.pageYOffset;
    /* the browser's own jump to #released may land after this: redo it then, unless the reader has scrolled */
    window.addEventListener('load',function(){setTimeout(function(){
      if(Math.abs(window.pageYOffset-y0)<2||Math.abs(panels.released.getBoundingClientRect().top)<4)top();
    },0)});
  }

  /* the sample player: beatport's embed, loaded only on a tap, inside the pill's li (a track, or a single's row) */
  function closePlay(a){
    var li=a.closest('li');
    if(li)[].slice.call(li.children).forEach(function(c){if(c.classList.contains('ur-embed'))li.removeChild(c)});
    a.setAttribute('aria-expanded','false');a.textContent='sample ▸';playName(a,false);
  }
  /* a hidden embed keeps playing: a tab switch, a filter or show change, or a closed fold stops every open one */
  function closeAll(el){[].forEach.call((el||wrap).querySelectorAll('a.ur-play[aria-expanded="true"]'),closePlay)}
  wrap.addEventListener('toggle',function(e){var d=e.target;if(d&&d.tagName==='DETAILS'&&!d.open)closeAll(d)},true);
  wrap.addEventListener('click',function(e){
    var a=e.target.closest('a.ur-play'),id=a&&a.getAttribute('data-bp'),li=a&&a.closest('li');
    if(!a||!li||!/^\d+$/.test(id||''))return;
    e.preventDefault();
    if(a.getAttribute('aria-expanded')==='true'){closePlay(a);return}
    closeAll();
    var box=document.createElement('div');box.className='ur-embed';
    var fr=document.createElement('iframe');fr.src='https://embed.beatport.com/?id='+id+'&type=track';
    if(a._t==null)a._t=trackOf(a);
    fr.title='beatport sample'+(a._t?' · '+a._t:'');fr.setAttribute('loading','lazy');fr.setAttribute('scrolling','no');fr.setAttribute('allow','autoplay');
    box.appendChild(fr);li.appendChild(box);
    a.setAttribute('aria-expanded','true');a.textContent='close ▴';playName(a,true);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
