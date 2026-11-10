/* groovesmaxxing account layer (accounts design 2026-10-12, builds 2 and 3b). vanilla, no dependencies.
   the api base and the app key come from /gmx-config.json, never from this file. the session token
   lives in localStorage as gmx_session, the key scan.html already uses, so one sign-in covers the
   whole site. this file does these things:
     - the crate, synced: signed in, the phone's gmx_crate goes up as PUT /me/crate (a union, the newest
       timestamp wins on removals) and the answer replaces it. once at boot when something changed, and
       a moment after every heart. signed out, the crate stays on the phone as before
     - follow an artist: the follow pill on a profile signs you in first, then POSTs /follow/artist
     - the sign-up moments: the card after the third heart signed out, the newsletter box at sign-in,
       the chip at the top of every page with a back row
     - "this is me" on every artist and label profile, and the sheet behind it: the GMX- code, the
       accounts the site pins as official, the three ways to prove it, "these aren't mine"
     - the account card on /more: sign in, handle, badge, my claims, the team, notifications, your data
     - the artist tools on /more for verified accounts and their teams: my tracks with counts only, name
       one, say it is out, say it is not mine, and send a file through the sent door
     - the header chip on every page (shell v2, 2026-10-12): "sign in" or "@handle", with the logo and the search
       button beside it on a wide screen, into .top where a page has one, beside a bare back link, over the hero
     - a small api for other scripts, and the sign-in calls the shell's scan.html and more.html make: window.gmxAccount below
   calls are counted against the phone's hourly budget like a scan is, so /me is cached ten minutes and
   the crate only goes up when it changed. nothing here touches audio. */
(function(){
'use strict';
if(window.gmxAccount)return;
var POST_MS=25000, GET_MS=8000, SESSION='gmx_session', DEVICE='gmx_device', CFGK='gmx_cfg', PENDING='gmx_pending';
var CRATE='gmx_crate', CRATE_RM='gmx_crate_rm', CRATE_SIG='gmx_crate_sig', ME='gmx_me', NUDGE='gmx_nudge_until', NL='gmx_nl_wanted', WANT_FOLLOW='gmx_follow_wanted';
/* whose crate is on this phone, and a signed-out crate set aside while a link from elsewhere is signed in (2026-11-09) */
var OWNER='gmx_crate_owner', AWAY='gmx_crate_away';
var ME_TTL=10*60000, SYNC_TTL=30*60000, NUDGE_DAYS=30;
var cfg=null, cfgP=null, me=null, meP=null, pollTimer=null, waitGen=0, waitOn=false, syncT=null, syncing=false, syncAgain=false, sheetDone=null, sheetWired=false, signedEmail='', signedTok='';
var BADGE={verified_artist:'verified artist',verified_label:'verified label',verified_venue:'verified venue',team:'team'};
var HOST={soundcloud:'soundcloud',instagram:'instagram',email:'mail',spotify:'spotify',bandcamp:'bandcamp',youtube:'youtube',ra:'resident advisor',beatport:'beatport',tiktok:'tiktok',x:'x',site:'site'};
var path=location.pathname.replace(/\.html$/,''), chip=null, subs=[];
/* the homepage logo, for the header on a wide screen (the same drawing gmx-nav.js puts on the scan disc) */
var WAVE='6,120 30,120 48,84 68,150 88,96 108,138 120,114 132,138 152,96 172,150 192,84 210,120 234,120';
var MARK='<svg viewBox="0 0 240 240" aria-hidden="true"><g class="gx-r gx-r3" fill="none"><circle cx="120" cy="120" r="100" stroke="#8A8A93" stroke-width="17"/><circle cx="120" cy="120" r="100" stroke="#FF1C02" stroke-width="11"/></g><g class="gx-r gx-r2" fill="none"><circle cx="120" cy="120" r="58" stroke="#8A8A93" stroke-width="17"/><circle cx="120" cy="120" r="58" stroke="#FF1C02" stroke-width="11"/></g><circle cx="120" cy="120" r="25" fill="#8A8A93"/><circle cx="120" cy="120" r="20" fill="#FF1C02"/><polyline class="gx-wv" points="'+WAVE+'" fill="none" stroke="#0B0B0D" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><polyline class="gx-wv" points="'+WAVE+'" fill="none" stroke="#FFFFFF" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var CSS='.wrap > .top,.gmx-top{display:flex;align-items:center;justify-content:space-between;gap:12px}'+
 '.hero > .gmx-hdr.float{position:absolute;top:calc(16px + env(safe-area-inset-top));right:16px;z-index:2}'+
 '.gmx-chip{flex:none;position:relative;z-index:3;background:#0B0B0D;font-family:"Space Mono",monospace;font-size:.7rem;letter-spacing:.08em;color:#8A8A93;text-decoration:none;border:1px solid rgba(242,242,239,.18);border-radius:999px;padding:0 12px;min-height:34px;line-height:32px;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;-webkit-tap-highlight-color:transparent}'+
 '.gmx-chip.in{color:#F2F2EF;border-color:rgba(255,28,2,.5)}'+
 '.gmx-chip:hover,.gmx-chip:focus-visible{color:#FF1C02;border-color:#FF1C02;outline:none}'+
 '.gmx-acct-line{position:fixed;left:12px;right:12px;bottom:calc(78px + env(safe-area-inset-bottom));z-index:88;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;background:#141417;color:#c9c9c4;border:1px solid #26262b;border-radius:16px;padding:10px 8px 10px 14px;box-shadow:0 14px 40px rgba(0,0,0,.45);font-family:"Space Mono",monospace;font-size:.75rem;letter-spacing:.03em;line-height:1.6}'+
 '.gmx-acct-line p{margin:0;flex:1;min-width:0;overflow-wrap:anywhere}.gmx-acct-line b{font-weight:700;color:#F2F2EF}'+
 '.gmx-acct-line button{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
 '.gmx-acct-line .ln{background:none;border:0;color:#F2F2EF;text-decoration:underline;text-underline-offset:3px;padding:10px 4px;margin:-10px 0}'+
 '.gmx-acct-line .lx{flex:none;width:40px;height:40px;border-radius:999px;border:1px solid #26262b;background:none;color:#8A8A93;font-size:1.1rem;line-height:1}'+
 '.gmx-acct-line .lrow{display:flex;flex-wrap:wrap;gap:8px;flex-basis:100%}'+
 '.gmx-acct-line .lb{border:2px solid #26262b;border-radius:999px;background:none;color:#F2F2EF;padding:10px 16px;min-height:44px;letter-spacing:.06em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
 '.gmx-acct-line .lb.red{border-color:#FF1C02;background:#FF1C02;color:#0B0B0D}'+
 '.gmx-acct-line .ln:focus-visible,.gmx-acct-line .lx:focus-visible,.gmx-acct-line .lb:focus-visible{outline:3px solid #FF1C02;outline-offset:2px}'+
 '@media (min-width:720px){.gmx-acct-line{left:auto;right:24px;bottom:24px;width:400px}}'+
 '';
function fire(w){subs.forEach(function(f){try{f(w)}catch(e){}})}
var NOTIFY=[['email','email alerts at all'],['named','an ID i scanned gets a name'],['released','a track i scanned comes out'],['artist','an artist i follow drops something'],['newsletter','fresh grooves friday']];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function ls(k){try{return localStorage.getItem(k)||''}catch(e){return ''}}
function lss(k,v){try{if(v)localStorage.setItem(k,v);else localStorage.removeItem(k)}catch(e){}}
function lsj(k){try{return JSON.parse(ls(k)||'null')}catch(e){return null}}
function fx(url,opts,ms){
  opts=opts||{};
  if(!('AbortController' in window))return fetch(url,opts);
  var ac=new AbortController(), t=setTimeout(function(){ac.abort()},ms||GET_MS);
  opts.signal=ac.signal;
  return fetch(url,opts).then(function(r){clearTimeout(t);return r},function(e){clearTimeout(t);throw (e&&e.name==='AbortError')?new Error('timeout'):e});
}
function loadCfg(){
  if(cfgP)return cfgP;
  cfgP=fx('/gmx-config.json',{cache:'no-store'},GET_MS).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})
    .then(function(j){if(!j.api_base||!j.app_key)throw new Error('incomplete');cfg=j;lss(CFGK,JSON.stringify(j));return j})
    .catch(function(e){var c=lsj(CFGK);if(c&&c.api_base&&c.app_key){cfg=c;return c}cfgP=null;throw e});
  return cfgP;
}
function deviceId(){
  var v=ls(DEVICE);
  if(v&&/^[A-Za-z0-9_-]{8,64}$/.test(v))return v;
  var b=new Uint8Array(16);(window.crypto||window.msCrypto).getRandomValues(b);
  v=Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('');
  lss(DEVICE,v);return v;
}
function token(){return ls(SESSION)}
function setToken(t){lss(SESSION,t);me=null;meP=null;lss(ME,'');if(!t)lss(CRATE_SIG,'');paint();fire('session');try{document.dispatchEvent(new CustomEvent('gmx-account',{detail:{signedIn:!!t}}))}catch(e){}}
function headers(extra){
  var h={'X-GMX-App-Key':cfg.app_key,'X-GMX-Device':deviceId()};
  var ss=token();if(ss)h['X-GMX-Session']=ss;
  if(extra)for(var k in extra)h[k]=extra[k];
  return h;
}
/* api('/verify/mine') or api('/verify/start',{method:'POST',json:{...}}). resolves to the response. */
function api(path,opts){
  opts=opts||{};
  return loadCfg().then(function(){
    var h=opts.headers||{};
    if(opts.json!==undefined){opts.body=JSON.stringify(opts.json);h['Content-Type']='application/json';delete opts.json}
    /* a FormData body (the sent door) goes up as it is: the browser writes the multipart boundary */
    opts.headers=headers(h);
    return fx(cfg.api_base+path,opts,(opts.method&&opts.method!=='GET')?POST_MS:GET_MS);
  });
}
/* who is signed in. cached ten minutes on the phone, because every call counts against the hourly budget */
function whoami(force){
  if(!token())return Promise.resolve(null);
  if(me&&!force)return Promise.resolve(me);
  var c=lsj(ME);
  if(c&&c.me&&!force&&Date.now()-(c.at||0)<ME_TTL){me=c.me;return Promise.resolve(me)}
  if(meP&&!force)return meP;
  meP=api('/me').then(function(r){if(r.status===401){ended();return null}if(!r.ok)throw new Error(r.status);return r.json()})
    .then(function(j){remember(j);return j}).catch(function(){return me||((c&&c.me)||null)});
  return meP;
}
function remember(m){me=m;lss(ME,JSON.stringify({me:m,at:Date.now()}));paint();fire('me')}
function snapshot(){if(me)return me;var c=lsj(ME);return c&&c.me?c.me:null}
function badge(role){return BADGE[role]||''}
function handleOf(url){var m=/(?:instagram\.com|soundcloud\.com)\/([^\/?#]+)/.exec(url||'');return m?'@'+m[1]:(url||'').replace(/^https?:\/\//,'').replace(/\/$/,'')}
function short(url){return (url||'').replace(/^mailto:/,'').replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,'')}
function onScan(){return location.pathname==='/scan'||/\/scan\.html$/.test(location.pathname)}
function onMore(){return location.pathname==='/more'||/\/more\.html$/.test(location.pathname)}

/* ---- the sheet. its own small shell, so it works on pages without gmx-sheet.css too ------------------ */
var sheet,body,opener;
function build(){
  sheet=document.createElement('div');sheet.className='gmx-acct';sheet.hidden=true;
  sheet.innerHTML='<div class="gmx-acct-back" data-close></div><div class="gmx-acct-panel" role="dialog" aria-modal="true" aria-labelledby="gmx-acct-title">'+
    '<div class="gmx-acct-grip" aria-hidden="true"></div><div class="gmx-acct-head"><div class="gmx-acct-tx"><h2 class="gmx-acct-title" id="gmx-acct-title"></h2><p class="gmx-acct-sub" hidden></p></div>'+
    '<button type="button" class="gmx-acct-x" data-close aria-label="close">×</button></div><div class="gmx-acct-body"></div></div>';
  document.body.appendChild(sheet);body=sheet.querySelector('.gmx-acct-body');
  sheet.addEventListener('click',function(e){if(e.target.closest('[data-close]'))close()});
  document.addEventListener('keydown',function(e){
    if(!sheet||sheet.hidden)return;
    if(e.key==='Escape'){e.preventDefault();close();return}
    /* tab and shift tab go round the open sheet, so a keyboard or a screen reader never lands on the page behind it */
    if(e.key!=='Tab')return;
    var f=[].filter.call(sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'),function(x){return x.offsetParent!==null&&x.tabIndex>=0});
    if(!f.length)return;var a=f[0],z=f[f.length-1];
    if(!sheet.contains(document.activeElement)){e.preventDefault();a.focus();return}
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
  });
}
function open(title,sub,html,from){
  if(!sheet)build();
  opener=from||document.activeElement;
  sheet.querySelector('.gmx-acct-title').textContent=title||'';
  var s=sheet.querySelector('.gmx-acct-sub');s.textContent=sub||'';s.hidden=!sub;
  body.innerHTML=html||'';
  sheet.hidden=false;document.documentElement.classList.add('gmx-acct-open');
  setTimeout(function(){var f=body.querySelector('input,button,a');(f||sheet.querySelector('.gmx-acct-x')).focus()},30);
}
function set(html){if(body)body.innerHTML=html}
function close(){
  if(!sheet||sheet.hidden)return;
  sheet.hidden=true;document.documentElement.classList.remove('gmx-acct-open');
  if(opener&&opener.focus)try{opener.focus()}catch(e){}
}
function note(el,t,ok){if(!el)return;el.textContent=t||'';el.className=(el.id==='youmsg'?'msg':'gmx-acct-msg')+(ok?' ok':'')}
function msgEl(){return document.getElementById('gmx-you-msg')||document.getElementById('youmsg')}
/* download and delete answer right under their rows on /more (2026-11-09), not in the profile card far above */
function dataMsg(){return document.getElementById('gmx-data-msg')||msgEl()}
/* a failed call: a status the server sent says so, only a call that never reached it says check your signal */
/* /auth/start answers 429 for three limits (2026-11-09): the address cap, the global mail ceiling, the connection bucket.
   only the first is about the address that was typed */
function startLimit(r){
  var own='too many links for that address this hour.',all='too many sign-in mails right now. try again in a few minutes.';
  return r.json().then(function(j){return /for that address/i.test(String((j&&j.detail)||''))?own:all},function(){return all});
}
function failLine(e,net){
  var s=e&&/^\d{3}$/.test(String(e.message||''))?+e.message:0;
  if(!s)return net;
  return s>=500?'the sign-in service did not answer. try again in a minute.':'that did not go through. try again in a minute.';
}
var toastT;
function toast(msg){
  var t=document.querySelector('.gmx-acct-toast');
  if(!t){t=document.createElement('div');t.className='gmx-acct-toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on')},Math.max(2200,String(msg).length*60));
}

/* ---- sign in: email link, no password. the same three doors scan.html opens ------------------------- */
function signinForm(){
  return '<form class="gmx-acct-form" data-form="start" autocomplete="off"><label for="gmx-acct-email">email</label>'+
    '<input id="gmx-acct-email" name="email" type="email" inputmode="email" maxlength="320" required placeholder="you@example.com">'+
    '<label class="gmx-acct-check"><input type="checkbox" name="nl"> fresh grooves friday in my inbox too</label>'+
    '<div class="gmx-acct-row"><button class="gmx-acct-btn red" type="submit">send me a sign-in link</button><span class="gmx-acct-msg" role="status"></span></div>'+
    '<p class="gmx-acct-p small">your email is only for this. <a href="/privacy">privacy</a> · <a href="/terms">terms</a></p></form>';
}
function codeForm(email){
  return '<form class="gmx-acct-form on" data-form="code" data-email="'+esc(email)+'" autocomplete="off"><label for="gmx-acct-code">the six digits from the mail</label>'+
    '<input id="gmx-acct-code" name="code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="one-time-code" placeholder="000 000">'+
    '<div class="gmx-acct-row"><button class="gmx-acct-btn red" type="submit">sign in</button><span class="gmx-acct-msg" role="status"></span></div>'+
    '<p class="gmx-acct-p small">or tap the link in the mail, anywhere. this page signs in on its own while it stays open.</p></form>';
}
function wireSignin(root,done){
  root.addEventListener('submit',function(ev){
    var f=ev.target.closest('form[data-form]');if(!f)return;ev.preventDefault();
    if(f.dataset.form!=='start'&&f.dataset.form!=='code')return;
    /* one request per submit: a double tap would send two mails or burn two code tries (2026-11-09) */
    if(f.dataset.busy)return;
    var m=f.querySelector('.gmx-acct-msg'),sb=f.querySelector('[type=submit]');
    var hold=function(){f.dataset.busy='1';if(sb)sb.disabled=true},free=function(){delete f.dataset.busy;if(sb)sb.disabled=false};
    if(f.dataset.form==='start'){
      var email=(f.querySelector('input[name=email]').value||'').trim();if(!email)return;note(m,'sending');hold();
      var nl=f.querySelector('input[name=nl]');lss(NL,nl&&nl.checked?'1':'');
      api('/auth/start',{method:'POST',json:{email:email}}).then(function(r){
        if(r.status===429)return startLimit(r).then(function(t){note(m,t)});
        if(r.status===422){note(m,'that does not look like an email address.');return}
        if(!r.ok)throw new Error(r.status);
        return r.json().then(function(j){
          if(!j.mail_sent){note(m,'the mail could not go out right now. try again later.');return}
          [].forEach.call(root.querySelectorAll('form[data-form=code]'),function(x){x.remove()});
          var box=document.createElement('div');box.innerHTML=codeForm(email);f.parentNode.insertBefore(box.firstChild,f.nextSibling);f.hidden=true;
          var c=root.querySelector('#gmx-acct-code');if(c)c.focus();
          if(j.pending)waitForLink(j.pending,j.minutes||20,done);
        });
      }).catch(function(e){note(m,failLine(e,'did not send. check your signal and try again.'))}).then(free);
    }else if(f.dataset.form==='code'){
      var code=(f.querySelector('input[name=code]').value||'').replace(/\D/g,'');
      if(code.length!==6){note(m,'six digits.');return}
      note(m,'checking');hold();
      api('/auth/code',{method:'POST',json:{email:f.dataset.email,code:code}}).then(function(r){
        /* the api caps wrong tries per address (2026-11-09): past the cap every code for it is spent, the link still works */
        if(r.status===429){note(m,'too many tries. tap the link in the mail, or ask for a new code later.');return}
        if(r.status===410){note(m,'that code is wrong, used or too old. ask for a new one.');return}
        if(r.status===401||r.status===403){note(m,'that code did not work. ask for a new one.');return}
        if(!r.ok)throw new Error(r.status);
        return r.json().then(function(j){signedIn(j.session,j.email);done&&done()});
      }).catch(function(e){note(m,failLine(e,'did not send. check your signal.'))}).then(free);
    }
  });
}
/* a session just opened: the crate goes up, the newsletter box is honoured, a follow that waited is made */
function signedIn(t,email){
  stopWait();setToken(t);signedEmail=email||'';signedTok=t;
  afterSignIn(email);
}
function afterSignIn(email){
  if(ls(NL)==='1'){lss(NL,'');api('/me/newsletter',{method:'POST'}).catch(function(){})}
  var w=ls(WANT_FOLLOW);if(w){lss(WANT_FOLLOW,'');followCall(api('/follow/artist',{method:'POST',json:{slug:w}}))}
  ownCrate(email,true);
}
/* whose crate is on this phone (2026-11-09). gmx_crate_owner names the account the list last synced with. a crate built
   signed out has no owner and goes up on the first own sign-in, as designed. a list that belongs to another account is
   already on that account, so it is dropped here, never uploaded into this one. a link this browser did not ask for
   (push false) never uploads this browser's list: an ownerless one is set aside under gmx_crate_away and comes back on
   sign out. either way the sync then brings the account's own list down. */
function ownCrate(email,push){
  var owner=ls(OWNER);
  if(owner&&!email){whoami(true).then(function(m){ownCrate((m&&m.email)||'?',push)});return}
  if(owner&&owner.toLowerCase()!==String(email).toLowerCase())dropCrate();
  else if(!owner&&!push){
    var l=crateLocal();
    if(l.length){var a=lsj(AWAY),seen={};a=Array.isArray(a)?a:[];lss(AWAY,JSON.stringify(l.concat(a).filter(function(x){if(!x||!x.id||seen[x.id])return false;seen[x.id]=1;return true}).slice(0,500)))}
    dropCrate();
  }
  syncCrate('sign-in',true);
}
function dropCrate(){lss(CRATE,'');lss(CRATE_RM,'');lss(CRATE_SIG,'');synced('drop',{})}
function synced(reason,j){try{document.dispatchEvent(new CustomEvent('gmx:crate-synced',{detail:{count:j.count,merged:j.merged,reason:reason}}))}catch(e){}}
function markOwner(){
  /* the email a sign-in reported counts only for that session: another tab may have signed in someone else since */
  var m=snapshot(),em=(m&&m.email)||(signedTok&&signedTok===token()?signedEmail:'');if(em){lss(OWNER,em);return}
  var t=token();whoami().then(function(x){if(x&&x.email&&token()===t)lss(OWNER,x.email)});
}
/* the link wait (2026-11-09). /auth/poll shares the phone's hourly budget with scans, so the polls space out with the
   ticket's age: 4 s for the first minute, 15 s to five minutes, then 45 s (about 50 calls in 20 minutes, not 300). it
   pauses while the page is hidden and asks at once when the page comes back or gets focus, so coming back from the mail
   app signs in as fast as before. errors back off (doubling, then once a minute until the ticket ends, never a silent stop). a 429 stops the
   wait and says so in the code form. one wait at a time; the ticket stays stored after an error or 429 stop, so a
   reload picks it up and a link opened here still counts as this browser's own. */
var waitAsk=null;
function stopTimer(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null}waitGen++;waitOn=false;waitAsk=null}
function codeNote(t){var el=document.querySelector('form[data-form=code] .gmx-acct-msg')||document.getElementById('codemsg');if(el)el.textContent=t}
function stopWait(){stopTimer();lss(PENDING,'')}
function forgetWanted(){lss(NL,'');lss(WANT_FOLLOW,'')}
function waitForLink(ticket,minutes,done){
  var until=Date.now()+minutes*60000,began=Date.now(),bad=0,busy=false,last=0;
  stopTimer();lss(PENDING,JSON.stringify({t:ticket,until:until}));
  var gen=waitGen;waitOn=true;
  var pace=function(){var age=Date.now()-began;return age<60000?4000:age<300000?15000:45000};
  var ask=function(){
    pollTimer=null;
    if(gen!==waitGen||busy)return;
    if(token()){stopTimer();return}
    if(Date.now()>until){stopWait();forgetWanted();return}
    /* hidden: no timer. the visibility and focus listeners ask again the moment the page is back */
    if(document.hidden)return;
    busy=true;last=Date.now();
    api('/auth/poll',{method:'POST',json:{pending:ticket}}).then(function(r){
      if(r.status===429)return 'limited';
      if(!r.ok)throw new Error(r.status);
      return r.json();
    }).then(function(j){
      if(j==='limited')return j;
      bad=0;
      /* this page signed in another way first (its own link, the code): a session this poll opened anyway is ended */
      if(gen!==waitGen){if(j&&j.state==='ready'&&j.session&&j.session!==token())endSession(j.session);return 'stop'}
      if(j&&j.state==='ready'){signedIn(j.session,j.email);done&&done();return 'stop'}
      if(j&&j.state==='gone'){stopWait();return 'stop'}
    },function(){bad++}).then(function(s){
      busy=false;
      if(gen!==waitGen)return;
      if(s==='limited'){stopTimer();codeNote('stopped waiting here. type the six digits, or tap the link in the mail.');return}
      if(s==='stop'||token()){stopTimer();return}
      var gap=bad?Math.min(pace()*Math.pow(2,bad),60000):pace();
      pollTimer=setTimeout(ask,Math.max(0,Math.min(gap,until-Date.now()+50)));
    });
  };
  waitAsk=function(){if(gen!==waitGen||busy||Date.now()-last<1500)return;if(pollTimer){clearTimeout(pollTimer);pollTimer=null}ask()};
  ask();
}
document.addEventListener('visibilitychange',function(){if(!document.hidden&&waitAsk)waitAsk()});
window.addEventListener('focus',function(){if(waitAsk)waitAsk()});
function resumeWait(done){
  if(token())return;
  /* boot's bare call never replaces a wait the page already started with its own callback (/more) */
  if(waitOn&&!done)return;
  var p=lsj(PENDING);
  if(p&&p.t&&p.until>Date.now())waitForLink(p.t,(p.until-Date.now())/60000,done);
  else{if(p)forgetWanted();lss(PENDING,'')}
}
/* open the sign-in sheet; done runs once a session exists. the sheet body lives for the whole page, so it is wired once */
function signIn(from,done,why){
  open('sign in',why||'email link, no password',signinForm(),from);
  sheetDone=done||null;
  if(!sheetWired){sheetWired=true;wireSignin(body,function(){close();var d=sheetDone;sheetDone=null;d&&d()})}
}

/* ---- the crate, synced (design section 1) ------------------------------------------------------------ */
function crateLocal(){var l=lsj(CRATE);return Array.isArray(l)?l:[]}
function rmLocal(){var l=lsj(CRATE_RM);return Array.isArray(l)?l:[]}
function sig(items,removed){return items.length+':'+items.slice(0,40).map(function(x){return x.id+'@'+(x.t||0)}).join(',')+'|'+removed.length}
function norm(it){
  var o={kind:it.kind,id:it.id,t:it.t||Date.now()};
  ['title','sub','url','page','artist','label','links'].forEach(function(k){if(it[k]!=null)o[k]=it[k]});
  return o;
}
/* PUT the phone's list, take the merged answer back. reason is for the log line only */
function syncCrate(reason,force){
  if(!token())return Promise.resolve(false);
  if(syncing){syncAgain=true;return Promise.resolve(false)}
  var items=crateLocal().slice(0,500),removed=rmLocal().slice(0,500),s=sig(items,removed),last=lsj(CRATE_SIG),dirty=false,tk=token();
  if(!force&&last&&last.sig===s&&Date.now()-(last.at||0)<SYNC_TTL)return Promise.resolve(false);
  syncing=true;
  return api('/me/crate',{method:'PUT',json:{items:items,removed:removed}}).then(function(r){
    if(r.status===401){ended();return null}
    if(!r.ok)throw new Error(r.status);
    return r.json();
  }).then(function(j){
    /* signed out or switched while it was out: the answer belongs to nobody on this phone now */
    if(!j||token()!==tk)return false;
    /* the phone kept moving while the PUT was out (2026-11-09): a heart or an unheart made in that window is not in the
       answer, so it is put back on top of it and goes up on the next sync instead of being written over */
    var sent={},sentR={},gone={},inList={};
    items.forEach(function(x){sent[x.id]=1});removed.forEach(function(x){if(x)sentR[x.id]=1});
    var list=(j.items||[]).map(norm);
    var nowL=crateLocal(),nowIds={};nowL.forEach(function(x){if(x&&x.id)nowIds[x.id]=1});
    var keepR=rmLocal().filter(function(x){return x&&x.id&&!sentR[x.id]&&!nowIds[x.id]});
    keepR.forEach(function(x){gone[x.id]=1});
    if(keepR.length)list=list.filter(function(x){return !gone[x.id]});
    list.forEach(function(x){inList[x.id]=1});
    var add=nowL.filter(function(x){return x&&x.id&&!sent[x.id]&&!inList[x.id]});
    if(add.length)list=add.concat(list);
    dirty=!!(add.length||keepR.length);
    lss(CRATE,JSON.stringify(list.slice(0,500)));lss(CRATE_RM,keepR.length?JSON.stringify(keepR):'');
    lss(CRATE_SIG,dirty?'':JSON.stringify({sig:sig(list,[]),at:Date.now()}));
    markOwner();
    synced(reason,j);
    return true;
  }).catch(function(){return false}).then(function(ok){
    syncing=false;
    if(syncAgain||dirty){syncAgain=false;syncCrate('again',true)}
    return ok;
  });
}
/* every heart, follow or unheart: gmx-crate.js says so. signed in it syncs a moment later; signed out it
   is the moment to ask, once in a while */
function onCrateChange(e){
  var d=e.detail||{},item=d.item||{};
  if(token()){
    clearTimeout(syncT);syncT=setTimeout(function(){syncCrate('heart',true)},1500);
    if(item.kind==='artist'&&item.id){
      var slug=String(item.id).replace(/^artist:/,'');
      if(d.on)followCall(api('/follow/artist',{method:'POST',json:{slug:slug}}));
      else followCall(api('/follow/artist/'+encodeURIComponent(slug),{method:'DELETE'}),true);
    }
    return;
  }
  if(!d.on)return;
  if(item.kind==='artist'||item.kind==='label'){
    /* moment 4: the follow signs you in first. the heart stays on the phone either way, nothing gets worse.
       alerts fire on artist follows only (api 2026-11-06), so a label follow promises the crate on every phone, no more */
    if(item.kind==='artist')lss(WANT_FOLLOW,String(item.id).replace(/^artist:/,''));
    signIn(d.button||null,null,item.kind==='artist'?'sign in to follow '+(item.title||'them')+': drops and dates land in your alerts. the heart stays on this phone either way.':'sign in to keep '+(item.title||'it')+' on every phone. the heart stays on this phone either way.');
    return;
  }
  /* moment 1: the third heart */
  var n=crateLocal().filter(function(x){return x.kind==='set'||x.kind==='track'}).length;
  var until=+ls(NUDGE)||0;
  if(n>=3&&until<Date.now())nudge();
}
/* a follow or unfollow the account did not take says so (2026-11-09): the pill alone would claim alerts that never come */
function followCall(p,off){
  return p.then(function(r){
    if(r.status===401){ended();return}
    if(off&&r.status===404)return;
    if(!r.ok)throw new Error(r.status);
  }).catch(function(){toast(off?'removed on this phone. the alerts did not stop yet, try again in a minute.':'saved on this phone. the alert did not save, tap follow again in a minute.')});
}
function nudge(){
  if(document.querySelector('.gmx-nudge'))return;
  var c=document.createElement('div');c.className='gmx-nudge';c.setAttribute('role','status');
  c.innerHTML='<p>save your crate to any phone. email only, no password.</p><div class="gmx-acct-row"><button type="button" class="gmx-acct-btn red" data-nudge="in">sign in</button><button type="button" class="gmx-acct-btn ghost" data-nudge="no">not now</button></div>';
  document.body.appendChild(c);
  c.addEventListener('click',function(e){
    var b=e.target.closest('[data-nudge]');if(!b)return;
    lss(NUDGE,String(Date.now()+NUDGE_DAYS*86400000));c.remove();
    if(b.dataset.nudge==='in')signIn(null,null,'keep your crate on every phone');
  });
}
/* the crate page: the line under the title says where the list lives */
function wireCratePage(){
  var el=document.getElementById('gmx-crate-sync');if(!el)return;
  function paint(){
    if(token())el.innerHTML='it is synced to your account: every phone you sign in on sees this list.';
    else el.innerHTML='it lives on this phone only, nothing is sent anywhere. <button type="button" class="gmx-acct-link" data-signin>sign in</button> to keep it on every phone.';
  }
  paint();
  el.addEventListener('click',function(e){if(e.target.closest('[data-signin]'))signIn(e.target,null,'keep your crate on every phone')});
  document.addEventListener('gmx-account',paint);
}

/* ---- the chip at the top of a page with a back row (moment 6) ---------------------------------------- */
function paint(){
  if(!chip)return;
  var t=token(),m=snapshot();
  chip.className='gmx-chip'+(t?' in':'');
  chip.textContent=t?(m&&m.handle?'@'+m.handle:'you'):'sign in';
  chip.href=onScan()?'#you':'/more#account';
  chip.setAttribute('aria-label',t?'your account'+(m&&m.handle?', @'+m.handle:''):'sign in');
}
/* the header row: on a wide screen the logo (to /, the way home: there is no tab bar there) and the search button sit
   beside the chip, since there is no tab bar and no floating button there. gmx-nav.css hides both under 1025px. */
function headerRow(){
  var row=document.createElement('span');row.className='gmx-hdr';
  if(!onScan()){var m=document.createElement('a');m.className='gmx-hmark';m.href='/';m.setAttribute('aria-label','groovesmaxxing home');m.innerHTML=MARK;row.appendChild(m)}
  if(path!=='/search'){var b=document.createElement('button');b.type='button';b.className='gmx-hsearch';b.setAttribute('aria-label','search the site');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>';b.addEventListener('click',function(){if(window.gmxQuick)gmxQuick.open(b);else location.href='/search'});row.appendChild(b)}
  chip=document.createElement('a');row.appendChild(chip);
  return row;
}
function mountChip(){
  if(chip||document.querySelector('meta[http-equiv="refresh"]')||document.querySelector('.gmx-chip'))return;
  var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  var row=headerRow();
  var top=document.querySelector('.wrap > .top');
  if(top)top.appendChild(row);
  else{
    var back=document.querySelector('.wrap > a.back');
    if(back){var d=document.createElement('div');d.className='gmx-top';back.parentNode.insertBefore(d,back);d.appendChild(back);d.appendChild(row)}
    else{
      var hero=document.querySelector('header.hero');
      /* first in the hero, so tab order matches what the eye sees: it sits top right, absolutely placed */
      if(hero){row.className+=' float';hero.insertBefore(row,hero.firstChild)}
      else{var w=document.querySelector('.wrap')||document.body,d2=document.createElement('div');d2.className='gmx-top';d2.appendChild(row);w.insertBefore(d2,w.firstChild)}
    }
  }
  paint();
  if(token())whoami().then(paint);
}

/* ---- "this is me" on a profile (design section 3) ----------------------------------------------------- */
function wireProfile(){
  var sec=document.querySelector('section.artist');if(!sec||sec.querySelector('.gmx-claim'))return;
  var kind=(sec.classList.contains('label')||/^\/labels\//.test(location.pathname))?'label':'artist';
  var slug=(sec.id||location.pathname.split('/').pop().replace(/\.html$/,'')||'').toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]*$/.test(slug))return;
  var name=(sec.querySelector('h1.aname')||{}).textContent||slug;name=name.replace(/\s+/g,' ').trim();
  var wrap=document.createElement('div');wrap.className='gmx-claim-row';
  wrap.innerHTML='<button type="button" class="gmx-claim" aria-haspopup="dialog">this is me</button><span class="gmx-claim-why">'+(kind==='label'?'run this label? claim the page.':'your page? claim it, get the badge.')+'</span>';
  /* under the tag row: the profile section is a grid that pins .links top right, so "after .links" in
     the DOM would land at the bottom of the page */
  var meta=sec.querySelector('.meta')||sec.querySelector('.links');
  if(meta)meta.parentNode.insertBefore(wrap,meta.nextSibling);else sec.appendChild(wrap);
  var b=wrap.querySelector('.gmx-claim');
  b.addEventListener('click',function(){
    if(!token()){signIn(b,function(){claim(kind,slug,name,b)},'sign in first, then claim '+name);return}
    claim(kind,slug,name,b);
  });
  whoami().then(function(m){if(m&&badge(m.role)&&m.role!=='team')markMine(kind,slug,wrap)});
}
function markMine(kind,slug,wrap){
  api('/verify/mine').then(function(r){return r.ok?r.json():[]}).then(function(rows){
    var mine=rows.filter(function(x){return x.kind===kind&&x.slug===slug&&x.state==='verified'})[0];
    if(mine){wrap.classList.add('mine');wrap.innerHTML='<span class="gmx-claim on">✓ '+esc(badge(kind==='label'?'verified_label':'verified_artist'))+'</span><span class="gmx-claim-why">this is your page.</span>'}
  }).catch(function(){});
}
function claim(kind,slug,name,from){
  open('prove it\'s you',name,'<p class="gmx-acct-p">one sec.</p>',from);
  api('/verify/start',{method:'POST',json:{kind:kind,slug:slug}}).then(function(r){
    if(r.status===401){setToken('');close();signIn(from,function(){claim(kind,slug,name,from)});return null}
    if(r.status===409)return r.json().then(function(j){set('<p class="gmx-acct-p">'+esc(/revoked/.test(j.detail||'')?'this claim was closed. write to us from the more page and we will look again.':'you are already verified here. the badge is on.')+'</p>');return null});
    if(!r.ok)throw new Error(r.status);
    return r.json();
  }).then(function(role){if(role)renderClaim(role,name)}).catch(function(){set('<p class="gmx-acct-p">the recognizer did not answer. try again in a minute.</p>')});
}
function pinList(role){
  return '<ul class="gmx-acct-pins">'+role.pinned.map(function(p){return '<li><b>'+esc(HOST[p.host]||p.host)+'</b> <span>'+esc(short(p.url))+'</span></li>'}).join('')+'</ul>';
}
function renderClaim(role,name){
  var h='';
  if(role.state==='verified'){set('<p class="gmx-acct-p">you are verified here. the badge is on.</p>');return}
  if(role.needs_pipeline){
    h='<p class="gmx-acct-p">'+(role.pinned&&role.pinned.length?'we have '+esc(name)+' on the site but no official soundcloud, instagram or mail pinned yet.':'we do not have '+esc(name)+'\'s official accounts pinned yet.')+
      ' we are reading them now. once they are in, come back here for the code step. we will mail you.</p>'+
      '<p class="gmx-acct-p small">a code only ever counts from an account we have as officially yours. that is what keeps a copycat page from claiming your name.</p>';
    set(h);return;
  }
  var ig=null,sc=null,mail=null;role.pinned.forEach(function(p){if(p.host==='instagram'&&!ig)ig=p.url;if(p.host==='soundcloud'&&!sc)sc=p.url;if(p.host==='email'&&!mail)mail=p.url});
  var last=role.match_result?'<p class="gmx-acct-p small">last check: '+esc(role.match_result)+'.</p>':'';
  h+='<div class="gmx-acct-code"><span>your code</span><b>'+esc(role.code||'')+'</b><small>good for 24 hours</small></div>';
  h+='<p class="gmx-acct-p">prove it from one of the accounts we have as officially yours:</p>'+pinList(role);
  h+='<div class="gmx-acct-ways">';
  if(ig)h+='<section><h3>dm us</h3><p>send the code to <b>@groovesmaxxing</b> on instagram from '+esc(handleOf(ig))+'. strongest and easiest.</p><div class="gmx-acct-row"><button type="button" class="gmx-acct-btn" data-check="instagram_dm">i sent the dm</button></div></section>';
  if(sc)h+='<section><h3>bio code</h3><p>paste the code in the bio of '+esc(handleOf(sc))+' on soundcloud for ten minutes, then tap check.</p><div class="gmx-acct-row"><button type="button" class="gmx-acct-btn red" data-check="soundcloud_bio">check my bio</button></div></section>';
  h+='<section><h3>mail it</h3><p>mail the code to hello@groovesmaxxing.com from an address on your site or bio'+(mail?' ('+esc(short(mail))+' works)':'')+'.</p>'+
     '<div class="gmx-acct-row"><input type="email" inputmode="email" maxlength="320" placeholder="the address you will mail from" aria-label="the address you will mail from"><button type="button" class="gmx-acct-btn" data-check="email">i will mail it from here</button></div></section>';
  h+='</div>'+last+'<p class="gmx-acct-msg" data-msg role="status"></p>';
  h+='<p class="gmx-acct-p small"><button type="button" class="gmx-acct-link" data-disown>these aren\'t mine</button></p>'+
     '<form class="gmx-acct-form" data-form="disown" hidden><label for="gmx-acct-why">which one is wrong?</label><input id="gmx-acct-why" maxlength="300" placeholder="that instagram is my old one, mine is @…"><div class="gmx-acct-row"><button class="gmx-acct-btn" type="submit">send</button></div></form>';
  set(h);
  var msg=body.querySelector('[data-msg]');
  body.querySelectorAll('[data-check]').forEach(function(b){
    b.addEventListener('click',function(){
      var method=b.dataset.check, payload={role_id:role.role_id,method:method};
      if(method==='email'){var em=(b.parentNode.querySelector('input').value||'').trim();if(!em){note(msg,'which address will the mail come from?');return}payload.email=em}
      body.querySelectorAll('[data-check]').forEach(function(x){x.disabled=true});note(msg,method==='soundcloud_bio'?'reading your bio':'noting it');
      api('/verify/check',{method:'POST',json:payload}).then(function(r){
        body.querySelectorAll('[data-check]').forEach(function(x){x.disabled=false});
        if(r.status===410){note(msg,'that code expired. close this and tap "this is me" again for a new one.');return}
        if(r.status===429){note(msg,'checked a moment ago. give the bio a minute, then try again.');return}
        if(r.status===422)return r.json().then(function(j){note(msg,j.detail||'that did not look right.')});
        if(!r.ok)throw new Error(r.status);
        return r.json().then(function(j){
          if(method==='soundcloud_bio'){
            if(j.matched)note(msg,'found it. we check these by hand, you will get a mail when the badge is on.',true);
            else if(/^unreadable/.test(j.result))note(msg,'could not read the bio right now. try again in a bit.');
            else note(msg,'not in the bio yet. give it a minute and tap check again.');
          }else if(method==='instagram_dm')note(msg,'noted. we read the dm by hand and mail you when the badge is on.',true);
          else note(msg,'noted. mail the code from that address and we take it from there.',true);
        });
      }).catch(function(){body.querySelectorAll('[data-check]').forEach(function(x){x.disabled=false});note(msg,'the recognizer did not answer. try again in a minute.')});
    });
  });
  var dis=body.querySelector('[data-disown]'),df=body.querySelector('form[data-form=disown]');
  if(dis)dis.addEventListener('click',function(){df.hidden=false;df.querySelector('input').focus()});
  if(df)df.addEventListener('submit',function(ev){
    ev.preventDefault();
    api('/verify/disown',{method:'POST',json:{role_id:role.role_id,note:(df.querySelector('input').value||'').trim()||null}}).then(function(r){
      if(!r.ok)throw new Error(r.status);df.hidden=true;note(msg,'got it. we look at it by hand and mail you.',true);
    }).catch(function(){note(msg,'did not send. try again in a minute.')});
  });
}

/* ---- the account card on /more (design section 4) ---------------------------------------------------- */
function wireMore(){
  var box=document.getElementById('gmx-you');if(!box){wireMoreShell();return}
  function paintBox(){
    if(!token()){
      box.innerHTML='<div class="gmx-you out"><h3>your account</h3><p class="gmx-acct-p">sign in to keep your crate on every phone, get your name on the IDs you help find, hear first when a track you scanned comes out, '+
        'and claim your page if you are one of the names on here. email only. no password.</p>'+signinForm()+'</div>';
      wireSignin(box,function(){paintBox()});
      return;
    }
    box.innerHTML='<div class="gmx-you"><p class="gmx-acct-p">one sec.</p></div>';
    whoami(true).then(function(m){
      if(!m){box.innerHTML='<div class="gmx-you"><p class="gmx-acct-p">signed in, but the recognizer did not answer. <button type="button" class="gmx-acct-link" data-out>sign out</button></p></div>';return}
      var since=m.since?new Date(m.since):null;
      var h='<div class="gmx-you"><div class="gmx-you-head"><span class="gmx-you-at">'+(m.handle?'@'+esc(m.handle):'no handle yet')+'</span>'+(badge(m.role)?'<span class="gmx-badge">'+esc(badge(m.role))+'</span>':'')+'</div>'+
        '<p class="gmx-acct-p small">'+esc(m.email)+(since?' · since '+since.toLocaleDateString(undefined,{month:'short',year:'numeric'}).toLowerCase():'')+'</p>'+
        '<ul class="gmx-you-counts"><li><b>'+(m.crate||0)+'</b>in the crate</li><li><b>'+(m.artists||0)+'</b>artists followed</li><li><b>'+(m.follows||0)+'</b>IDs waited on</li></ul>'+
        '<h4>your stuff</h4><ul class="gmx-you-list">'+
        '<li><a href="/crate"><b>my crate</b><small>synced to every phone you sign in on</small></a></li>'+
        '<li><a href="/scan#you"><b>scan history and follows</b><small>every device, with stop buttons</small></a></li>'+
        '<li><a href="/scan#you"><b>handle and push on this phone</b><small>the credit on IDs, notifications here</small></a></li></ul>'+
        '<div id="gmx-claims"></div><div id="gmx-team"></div><div id="gmx-tools"></div>'+
        '<h4>notifications</h4><p class="gmx-acct-p small">by email, to '+esc(m.email)+'. push is the phone\'s own switch, under scan.</p><ul class="gmx-you-switches" id="gmx-notify"></ul>'+
        '<h4>your data</h4><ul class="gmx-you-list">'+
        '<li><button type="button" class="gmx-acct-rowbtn" data-export><b>download my data</b><small>scans, crate, follows, claims, as one json file</small></button></li>'+
        '<li><button type="button" class="gmx-acct-rowbtn" data-delete><b>delete my account</b><small>a mail confirms it, then it is gone for good</small></button></li></ul>'+
        '<div id="gmx-delete"></div>'+
        '<div class="gmx-acct-row"><button type="button" class="gmx-acct-btn ghost" data-out>sign out</button><span class="gmx-acct-msg" id="gmx-you-msg" role="status"></span></div></div>';
      box.innerHTML=h;
      paintNotify(m);paintClaims(m);
    });
  }
  box.addEventListener('click',function(e){
    var o=e.target.closest('[data-out]');if(o){signout();paintBox();return}
    var x=e.target.closest('[data-export]');if(x){exportData(x);return}
    var d=e.target.closest('[data-delete]');if(d){startDelete(d);return}
  });
  box.addEventListener('change',function(e){var sw=e.target.closest('input[data-notify]');if(sw)notifyChange(sw)});
  paintBox();
  document.addEventListener('gmx-account',function(){paintBox()});
}
/* the switches' line sits right under them (2026-10-13). on /more it used to land in the account card at the top
   of the page, off screen on a phone, so a switch that failed just flipped back with no word. every failure says
   why, logs the status, and the fresh grooves friday switch points at the subscribe form, which does not need us. */
function notifyMsg(sw){return document.getElementById('gmx-notify-msg')||(sw&&sw.closest('#gmx-you')&&document.getElementById('gmx-you-msg'))||msgEl()}
function notifyChange(sw){
    var key=sw.dataset.notify,on=sw.checked,msg=notifyMsg(sw),fgf=key==='newsletter';sw.disabled=true;
    var form=fgf?(onMore()?' the subscribe form further down still works.':' the subscribe form on the more tab still works.'):'';
    if(navigator.onLine===false){sw.checked=!on;note(msg,'you are offline, so nothing changed. try again with signal.');sw.disabled=false;return}
    var p=fgf?api('/me/newsletter',{method:on?'POST':'DELETE'}):api('/me',{method:'POST',json:{notify:(function(){var o={};o[key]=on;return o})()}});
    p.then(function(r){
      if(!r.ok)console.warn('gmx notify: '+key+' answered '+r.status);
      if(fgf&&(r.status===503||r.status===404||r.status===501)){note(msg,'the fresh grooves friday switch is not wired up yet.'+form);sw.checked=!on;return}
      if(r.status===401){note(msg,'your sign-in ran out. sign in again, then flip it.');sw.checked=!on;return}
      if(r.status===429){note(msg,'too many changes this hour. try again later.'+form);sw.checked=!on;return}
      if(!r.ok)throw new Error(r.status);
      return r.json().catch(function(){return null}).then(function(j){if(j&&j.notify)remember(j);else if(me){me.notify=me.notify||{};me.notify[key]=on;remember(me)}
        note(msg,fgf?(on?'saved. fresh grooves friday comes to your email every friday.':'saved. no more fresh grooves friday mail.'):'saved.',true)});
    }).catch(function(e){console.warn('gmx notify: '+key,e);sw.checked=!on;note(msg,'did not save ('+(e&&e.message||'no answer')+').'+(form||' try again in a minute.'))}).then(function(){sw.disabled=false});
}
/* the shell's /more (shell v2): more.html paints the profile card itself through the api below. this fills the
   notification switches, my claims, the team and the artist tools into the rows it left for them, and wires the
   download and delete rows */
function wireMoreShell(){
  if(!document.getElementById('acctrows'))return;
  function paintAll(){
    var ids=['gmx-claims','gmx-team','gmx-tools','gmx-notify','gmx-delete'];
    if(!token()){ids.forEach(function(i){var x=document.getElementById(i);if(x)x.innerHTML=''});return}
    whoami().then(function(m){if(!m)return;if(document.getElementById('gmx-notify'))paintNotify(m);paintClaims(m)});
  }
  document.addEventListener('change',function(e){var sw=e.target.closest('input[data-notify]');if(sw&&!sw.closest('#gmx-you'))notifyChange(sw)});
  document.addEventListener('click',function(e){
    var x=e.target.closest('[data-acct="export"]');if(x){exportData(x);return}
    var d=e.target.closest('[data-acct="delete"]');if(d)startDelete(d);
  });
  paintAll();
  document.addEventListener('gmx-account',paintAll);
}
function paintNotify(m){
  var ul=document.getElementById('gmx-notify');if(!ul)return;
  var n=m.notify||{};
  ul.innerHTML=NOTIFY.map(function(x){
    var on=n[x[0]]!==undefined?!!n[x[0]]:(x[0]!=='newsletter');
    return '<li><label class="gmx-sw"><span class="tx">'+esc(x[1])+(x[0]==='newsletter'?', by email':'')+'</span><input type="checkbox" role="switch" data-notify="'+x[0]+'"'+(on?' checked':'')+'><span class="knob" aria-hidden="true"></span></label></li>';
  }).join('');
}
function exportData(btn){
  var msg=dataMsg();btn.disabled=true;note(msg,'packing it up');
  api('/me/export').then(function(r){if(!r.ok)throw new Error(r.status);return r.blob()}).then(function(b){
    var u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='groovesmaxxing-export.json';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(u)},4000);note(msg,'downloaded.',true);
  }).catch(function(){note(msg,'could not fetch it. try again in a minute.')}).then(function(){btn.disabled=false});
}
function startDelete(btn){
  var box=document.getElementById('gmx-delete'),msg=dataMsg();
  if(!confirm('delete your groovesmaxxing account? we mail you a code first. nothing is deleted until you type it.'))return;
  btn.disabled=true;note(msg,'sending the mail');
  api('/me/delete',{method:'POST'}).then(function(r){
    if(r.status===429){note(msg,'too many delete mails this hour.');return}
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(j){
      note(msg,j.mail_sent?'sent. type the six digits from the mail here.':'the mail could not go out right now.',j.mail_sent);
      if(!j.mail_sent)return;
      box.innerHTML='<form class="gmx-acct-form on" data-form="delcode" autocomplete="off"><label for="gmx-acct-del">the six digits from the mail</label><input id="gmx-acct-del" inputmode="numeric" maxlength="7" autocomplete="one-time-code" placeholder="000 000">'+
        '<div class="gmx-acct-row"><button class="gmx-acct-btn red" type="submit">delete it all</button><button class="gmx-acct-btn ghost" type="button" data-delcancel>keep my account</button></div></form>';
      var di=box.querySelector('#gmx-acct-del');if(di)try{di.focus()}catch(e){}
      box.querySelector('[data-delcancel]').addEventListener('click',function(){box.innerHTML='';note(msg,'kept.',true)});
      box.querySelector('form').addEventListener('submit',function(ev){
        ev.preventDefault();var code=(box.querySelector('input').value||'').replace(/\D/g,'');if(code.length!==6){note(msg,'six digits.');return}
        note(msg,'deleting');
        api('/me/delete/confirm',{method:'POST',json:{code:code}}).then(function(r){
          if(r.status===410){note(msg,'that code is wrong, used or too old. ask for a new mail.');return}
          if(!r.ok)throw new Error(r.status);
          return r.json().then(function(){setToken('');lss(CRATE_SIG,'');lss(OWNER,'');toast('your account is gone. the crate on this phone stays yours.')});
        }).catch(function(){note(msg,'did not go through. try again in a minute.')});
      });
    });
  }).catch(function(){note(msg,'the recognizer did not answer. try again in a minute.')}).then(function(){btn.disabled=false});
}
function paintClaims(m){
  var cl=document.getElementById('gmx-claims');if(!cl)return;
  api('/verify/mine').then(function(r){return r.ok?r.json():[]}).then(function(rows){
    if(!rows.length){cl.innerHTML=document.getElementById('gmx-you')?'<h4>for artists</h4><p class="gmx-acct-p small">an artist or a label on here? open your page and tap "this is me".</p>':'';return}
    cl.innerHTML='<h4>my claims</h4><ul class="gmx-you-list">'+rows.map(function(r){
      var st=r.state==='verified'?'verified':r.state==='revoked'?'closed':(r.needs_pipeline?'waiting on your official accounts':(r.match_result||'waiting on your proof'));
      return '<li><a href="/'+esc(r.entity_kind==='label'?'labels':'artists')+'/'+esc(r.slug)+'"><b>'+esc(r.name||r.slug)+'</b> <small>'+esc(r.kind==='team'?'team seat':r.kind)+' · '+esc(st)+'</small></a></li>';
    }).join('')+'</ul>';
    var owned=rows.filter(function(r){return r.state==='verified'&&(r.kind==='artist'||r.kind==='label')});
    if(owned.length)paintTeam(owned);
    /* a team seat acts too, through the entity it sits on */
    var acting=owned.concat(rows.filter(function(r){return r.state==='verified'&&r.kind==='team'}));
    if(acting.length)paintTools(acting);
  }).catch(function(){});
}
function paintTeam(owned){
  var t=document.getElementById('gmx-team');if(!t)return;
  t.innerHTML='<h4>team</h4><p class="gmx-acct-p small">a manager, a label person: invite them by email and they act for you here. they can never invite others.</p>'+owned.map(function(o){
    return '<div class="gmx-team" data-slug="'+esc(o.slug)+'"><b>'+esc(o.name||o.slug)+'</b><ul class="gmx-you-list" data-seats></ul>'+
      '<form class="gmx-acct-form on" data-form="invite" autocomplete="off"><div class="gmx-acct-row"><input type="email" inputmode="email" maxlength="320" placeholder="their email" aria-label="their email" required><button class="gmx-acct-btn" type="submit">invite</button><span class="gmx-acct-msg" role="status"></span></div></form></div>';
  }).join('');
  t.querySelectorAll('.gmx-team').forEach(function(box){loadSeats(box)});
  /* wired once: paintTeam runs on every account event, and a second listener would post every invite twice */
  if(t.dataset.wired)return;t.dataset.wired='1';
  t.addEventListener('submit',function(ev){
    var f=ev.target.closest('form[data-form=invite]');if(!f)return;ev.preventDefault();
    var box=f.closest('.gmx-team'),m=f.querySelector('.gmx-acct-msg'),em=(f.querySelector('input').value||'').trim();if(!em)return;note(m,'sending');
    api('/team/invite',{method:'POST',json:{email:em,slug:box.dataset.slug}}).then(function(r){
      if(r.status===422||r.status===429||r.status===403)return r.json().then(function(j){note(m,j.detail||'that did not work.')});
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(j){note(m,j.mail_sent?'invited. they sign in with that address and they are in.':'noted, but the mail could not go out right now.',j.mail_sent);f.querySelector('input').value='';loadSeats(box)});
    }).catch(function(){note(m,'did not send. try again in a minute.')});
  });
  t.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-remove]');if(!b)return;
    var box=b.closest('.gmx-team');b.disabled=true;
    api('/team/'+encodeURIComponent(b.dataset.remove),{method:'DELETE'}).then(function(){loadSeats(box)}).catch(function(){b.disabled=false});
  });
}
function loadSeats(box){
  var ul=box.querySelector('[data-seats]');
  api('/team?slug='+encodeURIComponent(box.dataset.slug)).then(function(r){return r.ok?r.json():[]}).then(function(rows){
    rows=rows.filter(function(s){return s.state!=='revoked'});
    ul.innerHTML=rows.length?rows.map(function(s){
      return '<li><span><b>'+esc(s.email||s.invited_email||'')+'</b> <small>'+(s.state==='verified'?'on the team':'invited, not signed in yet')+'</small></span><button type="button" class="gmx-acct-link" data-remove="'+esc(s.role_id)+'">remove</button></li>';
    }).join(''):'<li><small>nobody yet.</small></li>';
  }).catch(function(){});
}


/* ---- the artist tools (design section 2): my tracks, three actions, the sent door ----------------------- */
function trackRow(t,slug){
  var name=t.confirmed_name||null,guess=!name&&t.name&&t.name!=='an unreleased ID'?t.name:null;
  var head=name?'<b>'+esc(name)+'</b>':(guess?'<b>unnamed</b> <small>our guess: '+esc(guess)+'</small>':'<b>unnamed</b>');
  var state=(t.status==='released'?'out':'unreleased')+' · '+t.scans+' scan'+(t.scans===1?'':'s')+' · '+t.waiting+' waiting'+(t.confirmed_by==='artist'?' · named by you':'');
  var acts='';
  if(t.status!=='released'){
    acts+=(name&&t.confirmed_by==='artist'?'':'<button type="button" class="gmx-acct-btn" data-tact="confirm">'+(name?'that\'s right':'name it')+'</button>')+
      '<button type="button" class="gmx-acct-btn ghost" data-tact="rename">it\'s actually…</button>'+
      '<button type="button" class="gmx-acct-btn ghost" data-tact="out">it\'s out</button>';
  }
  acts+='<button type="button" class="gmx-acct-link" data-tact="not_mine">not mine</button>';
  return '<li class="gmx-track" data-entry="'+esc(t.library_entry_id)+'" data-slug="'+esc(slug)+'"><div class="gmx-track-tx">'+head+'<small>'+esc(state)+'</small></div>'+
    '<div class="gmx-acct-row">'+acts+'</div><div class="gmx-track-form"></div><p class="gmx-acct-msg" role="status"></p></li>';
}
function paintTools(owned){
  var box=document.getElementById('gmx-tools');if(!box)return;
  box.innerHTML='<h4>your tracks</h4><p class="gmx-acct-p small">what the library holds under your name or from your accounts. name them, say which are out, tell us which are not yours. counts only, never who scanned.</p>'+
    owned.map(function(o){return '<div class="gmx-toolset" data-slug="'+esc(o.slug)+'"><b>'+esc(o.name||o.slug)+'</b><ul class="gmx-you-list" data-tracks><li><small>one sec.</small></li></ul>'+
      '<form class="gmx-acct-form on" data-form="sendfile" autocomplete="off"><label>send us a file to fingerprint</label>'+
      '<input type="text" name="title" maxlength="200" placeholder="artist - title (optional)"><input type="file" name="audio" accept="audio/*,.m4a,.mp3,.wav,.flac,.aiff" required>'+
      '<div class="gmx-acct-row"><button class="gmx-acct-btn" type="submit">send it</button><span class="gmx-acct-msg" role="status"></span></div>'+
      '<p class="gmx-acct-p small">this is the sent door: your yes to fingerprinting is logged with the file, we review it, and once accepted it is what the scan finds. nothing is fetched from anywhere.</p></form></div>'}).join('');
  box.querySelectorAll('.gmx-toolset').forEach(function(set){loadTracks(set)});
  if(box.dataset.wired)return;box.dataset.wired='1';
  box.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-tact]');if(!b)return;
    var li=b.closest('.gmx-track'),form=li.querySelector('.gmx-track-form'),msg=li.querySelector('.gmx-acct-msg'),act=b.dataset.tact;
    if(act==='rename'){form.innerHTML='<div class="gmx-acct-row"><input type="text" maxlength="512" placeholder="artist - title" aria-label="the name as it should read"><button type="button" class="gmx-acct-btn red" data-tsave="confirm">save the name</button></div>';form.querySelector('input').focus();return}
    if(act==='out'){form.innerHTML='<div class="gmx-acct-row"><input type="url" inputmode="url" maxlength="1024" placeholder="the store link (optional)" aria-label="the store link"><button type="button" class="gmx-acct-btn red" data-tsave="released">it\'s out</button></div>';form.querySelector('input').focus();return}
    if(act==='not_mine'&&!confirm('take this one off your list? we keep it as an unnamed id.'))return;
    trackAct(li,act,{});
  });
  box.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-tsave]');if(!b)return;
    var li=b.closest('.gmx-track'),v=(li.querySelector('.gmx-track-form input').value||'').trim();
    trackAct(li,b.dataset.tsave,b.dataset.tsave==='confirm'?{name:v}:{url:v||null});
  });
  box.addEventListener('submit',function(ev){
    var f=ev.target.closest('form[data-form=sendfile]');if(!f)return;ev.preventDefault();
    var set=f.closest('.gmx-toolset'),m=f.querySelector('.gmx-acct-msg'),file=f.querySelector('input[name=audio]').files[0];
    if(!file){note(m,'pick the file first.');return}
    var fd=new FormData();fd.append('audio',file,file.name);fd.append('title',(f.querySelector('input[name=title]').value||'').trim());fd.append('slug',set.dataset.slug);
    f.querySelector('button').disabled=true;note(m,'sending '+Math.round(file.size/1048576*10)/10+' mb');
    api('/artist/files',{method:'POST',body:fd}).then(function(r){
      if(r.status===413){note(m,'too big for one send. a clip of the track is enough.');return}
      if(r.status===422||r.status===409)return r.json().then(function(j){note(m,(j.detail&&j.detail.message)||j.detail||'that did not work.')});
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(){note(m,'in. we fingerprint it, review it, and it joins the library once accepted.',true);f.reset()});
    }).catch(function(){note(m,'did not send. check your signal and try again.')}).then(function(){f.querySelector('button').disabled=false});
  });
}
function loadTracks(set){
  var ul=set.querySelector('[data-tracks]');
  api('/artist/tracks?slug='+encodeURIComponent(set.dataset.slug)).then(function(r){return r.ok?r.json():null}).then(function(j){
    if(!j){ul.innerHTML='<li><small>could not load the list right now.</small></li>';return}
    ul.innerHTML=j.tracks.length?j.tracks.map(function(t){return trackRow(t,j.slug)}).join(''):'<li><small>nothing under your name yet. send us a file below, or scan one of yours.</small></li>';
  }).catch(function(){ul.innerHTML='<li><small>could not load the list right now.</small></li>'});
}
function trackAct(li,action,extra){
  var msg=li.querySelector('.gmx-acct-msg'),payload=Object.assign({action:action,slug:li.dataset.slug},extra);
  li.querySelectorAll('button').forEach(function(x){x.disabled=true});note(msg,'saving');
  api('/artist/tracks/'+encodeURIComponent(li.dataset.entry),{method:'POST',json:payload}).then(function(r){
    if(r.status===422||r.status===403)return r.json().then(function(j){note(msg,j.detail||'that did not work.');li.querySelectorAll('button').forEach(function(x){x.disabled=false})});
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(t){
      if(action==='not_mine'){li.remove();return}
      var fresh=document.createElement('div');fresh.innerHTML=trackRow(t,li.dataset.slug);li.replaceWith(fresh.firstChild);
    });
  }).catch(function(){note(msg,'did not save. try again in a minute.');li.querySelectorAll('button').forEach(function(x){x.disabled=false})});
}

/* ---- boot ---------------------------------------------------------------------------------------- */
/* ---- the sign-in calls scan.html and more.html make (shell v2). a Response comes back, as from api() ---------- */
function setSession(t,email){if(t)signedIn(t,email);else setToken('')}
function start(email){return api('/auth/start',{method:'POST',json:{email:email}})}
function code(email,c){return api('/auth/code',{method:'POST',json:{email:email,code:c}})}
function finish(t){return api('/auth/finish',{method:'POST',json:{token:t}})}
function poll(ticket){return api('/auth/poll',{method:'POST',json:{pending:ticket}})}
/* sign out (2026-11-09). the session header is read before the token is forgotten and sent by hand: api() builds its
   headers a tick later, when token() is already empty, so the server never knew which session to end. then the phone
   forgets what a shared phone must not keep: the account's synced crate (the account holds it; a crate set aside by a
   link from elsewhere comes back), the newsletter tick and the follow that waited for a sign-in, a half-finished sign-in,
   and this phone's push tie to the account. the browser keeps its push permission, so the next yes is silent. */
function signout(){
  var t=token(),dev=t?deviceId():'';
  var p=t?api('/auth/signout',{method:'POST',headers:{'X-GMX-Session':t}}).catch(function(){}):Promise.resolve();
  /* the unsubscribe names the session and device it had (api() would read them a tick later, after they are gone) and
     is part of what the caller waits on: clear this phone drops the device id only once both calls are out */
  var u=t?unsubPush({'X-GMX-Session':t,'X-GMX-Device':dev}):Promise.resolve();
  forgetPhone();
  setToken('');signedEmail='';signedTok='';
  synced('signout',{});
  return Promise.all([p,u]).then(function(){});
}
/* the session ended somewhere else (2026-11-09): sign out from your other phones, an expiry, a deleted account. the server
   already answers 401, so nothing is sent; the phone forgets what signout() forgets, so the next person on a shared phone
   never reads the old account's crate or hearts into it */
function ended(){forgetPhone();setToken('');signedEmail='';signedTok='';synced('signout',{})}
/* a crate that never synced with an account (no owner) is the only copy of those hearts, so it stays on the phone */
function forgetPhone(){
  stopWait();forgetWanted();lss('gmx_push_skip','');
  if(ls(OWNER)){lss(CRATE,'');lss(CRATE_RM,'');lss(OWNER,'')}
  var away=lsj(AWAY);
  if(Array.isArray(away)&&away.length){var l=crateLocal(),seen={};lss(CRATE,JSON.stringify(l.concat(away).filter(function(x){if(!x||!x.id||seen[x.id])return false;seen[x.id]=1;return true}).slice(0,500)))}
  lss(AWAY,'');
}
function unsubPush(h){
  try{
    if(!('serviceWorker' in navigator)||!navigator.serviceWorker.getRegistration)return Promise.resolve();
    return navigator.serviceWorker.getRegistration().then(function(reg){return reg&&reg.pushManager?reg.pushManager.getSubscription():null})
      .then(function(sub){if(sub)return api('/push/unsubscribe',{method:'POST',headers:h||{},json:{endpoint:sub.endpoint}})}).catch(function(){});
  }catch(e){return Promise.resolve()}
}
/* ---- a sign-in link opened on this page (contract C1, 2026-11-09). scan.html and more.html hand ?signin= to this.
   this browser asked for it (a live gmx_pending ticket): finish silently, exactly as before, the ticket goes along.
   no live ticket (the mail opened in another browser while the app waits, or a link someone sent): sign in, but never
   upload this browser's crate or apply its newsletter tick or waiting follow; the account's crate comes down instead,
   and one quiet line says who is signed in, with a sign out. already signed in to another account: one small card asks
   before replacing it. same account: nothing changes. no new tap on any normal path.
   done(state,email): 'in', 'foreign', 'switched', 'same', 'kept', 'gone' (used or expired), 'limited' (429), 'error'. */
function openLink(tok,done){
  done=done||function(){};
  var p=lsj(PENDING),live=!!(p&&p.t&&p.until>Date.now()),cur=token(),curMe=snapshot();
  var json={token:tok};if(live)json.pending=p.t;
  return api('/auth/finish',{method:'POST',json:json}).then(function(r){
    if(r.status===410){done('gone');return}
    /* the api caps sign-in tries per address (sec-auth-v1): say so instead of blaming the signal */
    if(r.status===429){done('limited');return}
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(j){
      var em=j.email||'';
      /* this page's own link wait signed in first with the same ticket: keep that session, end the spare one */
      if(!cur&&live&&token()){if(j.session&&j.session!==token())endSession(j.session);done('in',em);return}
      if(cur&&token()===cur){
        var known=(curMe&&curMe.email)||ls(OWNER);
        if(known){decide(known);return}
        whoami().then(function(m){decide((m&&m.email)||'')});
        return;
      }
      /* the api may say the ticket did not match the link (matched:false): then it is a link from elsewhere after all */
      if(live&&j.matched!==false){signedIn(j.session,em);done('in',em);return}
      adoptForeign(j.session,em);done('foreign',em);
      function decide(curEm){
        if(em&&curEm&&em.toLowerCase()===curEm.toLowerCase()){endSession(j.session);done('same',em);return}
        askSwitch(j.session,em,curEm,done);
      }
    });
  }).catch(function(){done('error')});
}
function endSession(t){if(t)api('/auth/signout',{method:'POST',headers:{'X-GMX-Session':t}}).catch(function(){})}
function adoptForeign(t,em){
  stopTimer();setToken(t);signedEmail=em||'';signedTok=t;
  ownCrate(em,false);
  if(em)line('<p><span>signed in as</span> <b>'+esc(em)+'</b> <span>· not you?</span> <button type="button" class="ln" data-line="out">sign out</button></p><button type="button" class="lx" data-line="x" aria-label="close">×</button>',
    function(k){if(k==='out')signout()},20000);
}
function askSwitch(t,em,curEm,done){
  line('<p><span>this link signs in</span> <b>'+esc(em||'another account')+'</b><span>. switch accounts?</span></p><div class="lrow"><button type="button" class="lb red" data-line="switch">switch</button>'+
    '<button type="button" class="lb" data-line="keep">'+(curEm?'<span>keep</span> '+esc(curEm):'keep this one')+'</button></div>',
    function(k){
      if(k==='switch'){signout();adoptForeign(t,em);done('switched',em)}
      else{endSession(t);done('kept',curEm)}
    },0);
}
/* one line at the bottom of the page, for the two cases above. ms 0 keeps it until a button is tapped */
function line(html,cb,ms){
  var old=document.querySelector('.gmx-acct-line');if(old)old.remove();
  var c=document.createElement('div');c.className='gmx-acct-line';c.setAttribute('role','status');c.innerHTML=html;
  document.body.appendChild(c);
  var t=ms?setTimeout(function(){c.remove()},ms):0;
  c.addEventListener('click',function(e){var b=e.target.closest('[data-line]');if(!b)return;clearTimeout(t);c.remove();cb&&cb(b.getAttribute('data-line'))});
  if(!ms){var f=c.querySelector('[data-line="keep"]')||c.querySelector('button');if(f)setTimeout(function(){try{f.focus({preventScroll:true})}catch(x){}},30)}
  return c;
}
/* ---- the delete-my-account mail link lands on /more?delete=<token> (2026-11-09). it never fires on load (mail scanners and
   link previews open links): the page asks once, and the yes finishes it. works signed out too: the mail is the proof. */
function wireDeleteLink(){
  if(!onMore())return;
  var q=new URLSearchParams(location.search),del=q.get('delete');if(!del)return;
  q.delete('delete');var rest=q.toString();
  try{history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+location.hash)}catch(e){}
  var c=document.createElement('div');c.className='gmx-you gmx-delcard';c.setAttribute('role','region');c.setAttribute('aria-label','delete your account');
  c.innerHTML='<p class="gmx-acct-p">delete your account for good? your crate, follows, scan history and sign-ins go.</p>'+
    '<div class="gmx-acct-row"><button type="button" class="gmx-acct-btn red" data-del="yes">delete it</button><button type="button" class="gmx-acct-btn ghost" data-del="no">keep it</button></div><p class="gmx-acct-msg" role="status"></p>';
  var at=document.querySelector('header.mast');
  if(at&&at.parentNode)at.parentNode.insertBefore(c,at.nextSibling);else (document.querySelector('.wrap')||document.body).insertBefore(c,(document.querySelector('.wrap')||document.body).firstChild);
  var msg=c.querySelector('.gmx-acct-msg');
  try{c.scrollIntoView({block:'center'})}catch(e){}
  setTimeout(function(){try{c.querySelector('[data-del="no"]').focus({preventScroll:true})}catch(e){}},50);
  c.addEventListener('click',function(e){
    var b=e.target.closest('[data-del]');if(!b)return;
    if(b.dataset.del==='no'){c.innerHTML='<p class="gmx-acct-p">kept. nothing was deleted.</p>';return}
    c.querySelectorAll('button').forEach(function(x){x.disabled=true});note(msg,'deleting');
    api('/me/delete/confirm',{method:'POST',json:{token:del}}).then(function(r){
      if(r.status===410){note(msg,'that confirmation is used, expired or unknown. ask for a new one.');return}
      if(!r.ok)throw new Error(r.status);
      return r.json().catch(function(){return null}).then(function(){
        c.innerHTML='<p class="gmx-acct-p">your account is gone. the crate on this phone stays yours.</p>';
        /* signed in here: if it was this account, its session now answers 401 and whoami() signs the phone out. the owner
           is cleared first, so that sign out keeps the crate on this phone (it is yours); a live other account gets it back */
        if(token()){var was=ls(OWNER);lss(OWNER,'');whoami(true).then(function(m){if(m&&token()&&was&&!ls(OWNER))lss(OWNER,was)})}
      });
    }).catch(function(){c.querySelectorAll('button').forEach(function(x){x.disabled=false});note(msg,'did not go through. try again in a minute.')});
  });
}
function setHandle(h){return api('/me',{method:'POST',json:{handle:h||null}}).then(function(r){if(r.ok)r.clone().json().then(remember).catch(function(){});return r})}
/* a push subscription for this phone: the browser's permission prompt, the recognizer's public key, the
   subscription posted back. resolves true when the phone can be pushed, false when it cannot. never throws.
   2026-10-13: the prompt is asked first, still inside the tap. iphone and firefox only show it straight from a
   user gesture, and the old order asked after the key fetch had landed, so on an iphone the prompt never showed
   and the switch just said no. pushWhy() says why the last try failed, pushLine() is the line to show for it.
   ensurePush({test:true}) sends a test notification from this phone once it is on. */
function urlB64ToU8(b){var pad='='.repeat((4-b.length%4)%4),raw=atob((b+pad).replace(/-/g,'+').replace(/_/g,'/')),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
var lastWhy='';
function isIos(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function installed(){try{return navigator.standalone===true||matchMedia('(display-mode: standalone)').matches}catch(e){return false}}
function askPermission(){
  if(Notification.permission!=='default')return Promise.resolve(Notification.permission);
  /* older safari takes a callback and returns nothing, newer browsers return a promise */
  return new Promise(function(res){var p;try{p=Notification.requestPermission(res)}catch(e){res('default');return}if(p&&p.then)p.then(res,function(){res('default')})});
}
function ensurePush(opts){
  opts=opts||{};lastWhy='';
  function no(why,e){lastWhy=why;console.warn('gmx push: '+why,e===undefined?'':e);return false}
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return Promise.resolve(no(isIos()&&!installed()?'ios-browser':'unsupported'));
  if(navigator.onLine===false)return Promise.resolve(no('offline'));
  return askPermission().then(function(perm){
    if(perm==='denied')return no('denied');
    if(perm!=='granted')return no('dismissed');
    return api('/push/key').then(function(r){if(!r.ok)return no('server-off',r.status);return r.json()}).then(function(k){
      if(k===false)return false;
      if(!k||!k.enabled||!k.public_key)return no('server-off');
      return navigator.serviceWorker.ready.then(function(reg){
        return reg.pushManager.getSubscription().then(function(sub){return sub||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToU8(k.public_key)})})
        .then(function(sub){
          return api('/push/subscribe',{method:'POST',json:{subscription:sub.toJSON()}}).then(function(r){
            if(!r.ok)return no('save-failed',r.status);
            if(opts.test)reg.showNotification('groovesmaxxing',{body:'test: this phone gets notified.',icon:'/icon-192.png',badge:'/badge-96.png',tag:'gmx-test',data:{url:'/more'}}).catch(function(e){console.warn('gmx push: test notification',e)});
            return true;
          });
        });
      });
    });
  }).catch(function(e){return no('failed',e)});
}
var PUSH_LINES={
  'ios-browser':'on iphone, push only works in the installed app. tap share, then add to home screen, open groovesMAXX from there and turn this on.',
  unsupported:'this browser cannot push. email alerts still work.',
  offline:'you are offline. try again with signal.',
  denied:'notifications are blocked for this site. allow them in your browser or phone settings, then tap again.',
  dismissed:'the prompt closed without a yes, so nothing changed. tap again to get it back.',
  'server-off':'push is not switched on for the site yet. email alerts still work.',
  'save-failed':'the phone said yes but the subscription did not save. try again in a minute.',
  failed:'that did not work on this phone. try again in a minute, or use email alerts.'
};
/* a test notification from this phone's own service worker, no server call. true when it showed. */
function testPush(){
  if(!('serviceWorker' in navigator)||!('Notification' in window)||Notification.permission!=='granted')return Promise.resolve(false);
  return navigator.serviceWorker.ready.then(function(reg){return reg.showNotification('groovesmaxxing',{body:'test: this phone gets notified.',icon:'/icon-192.png',badge:'/badge-96.png',tag:'gmx-test',data:{url:'/more'}})}).then(function(){return true},function(e){console.warn('gmx push: test notification',e);return false});
}
function pushWhy(){return lastWhy}
function pushLine(why){return PUSH_LINES[why]||PUSH_LINES.failed}
/* where this phone stands on push: none, blocked, off, allowed (permission but no subscription), on */
function pushState(){
  if(!('Notification' in window)||!('PushManager' in window)||!('serviceWorker' in navigator))return Promise.resolve('none');
  if(Notification.permission==='denied')return Promise.resolve('blocked');
  if(Notification.permission!=='granted')return Promise.resolve('off');
  return navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){return sub?'on':'allowed'}).catch(function(){return 'allowed'});
}
/* a profile page whose section lost its id (28 upgraded artist pages did) or its label class (labels/nu-moda): put them
   back before gmx-related.js, gmx-crate.js and gmx-sheet.js look (they load after this file and need section.artist[id]),
   so a rebuild that drops them again does not take the follow pill, the "..." sheet and the related block with it */
function fixProfile(){
  if(!/^\/(artists|labels)\//.test(location.pathname))return;
  var sec=document.querySelector('section.artist');if(!sec)return;
  if(!sec.id){var s=(location.pathname.split('/').pop()||'').replace(/\.html$/,'').toLowerCase();if(/^[a-z0-9][a-z0-9-]*$/.test(s)&&!document.getElementById(s))sec.id=s}
  if(/^\/labels\//.test(location.pathname))sec.classList.add('label');
}
function boot(){
  fixProfile();wireProfile();wireMore();mountChip();wireCratePage();wireDeleteLink();
  document.addEventListener('gmx:crate',onCrateChange);
  /* inside the installed app the more tab does not offer to install it (older iphones miss the display-mode query) */
  if(onMore()&&installed()){var ir=document.getElementById('installrow');if(ir&&ir.parentNode)ir.parentNode.style.display='none'}
  if(!onScan()){resumeWait();if(token())syncCrate('boot')}
}
/* another tab or the installed app signed in or out: drop what this page cached about the old session and repaint */
window.addEventListener('storage',function(e){
  if(e.key!==SESSION&&e.key!==null)return;
  me=null;meP=null;if(token())stopTimer();
  paint();fire('session');try{document.dispatchEvent(new CustomEvent('gmx-account',{detail:{signedIn:!!token()}}))}catch(x){}
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.gmxAccount={
  ready:loadCfg,config:loadCfg,token:token,set:setSession,device:deviceId,headers:function(x){return cfg?headers(x):null},api:api,call:api,
  start:start,code:code,finish:finish,poll:poll,waitForLink:waitForLink,resumeWait:resumeWait,signout:signout,openLink:openLink,failLine:failLine,startLimit:startLimit,
  me:whoami,snapshot:snapshot,setHandle:setHandle,ensurePush:ensurePush,pushState:pushState,pushWhy:pushWhy,pushLine:pushLine,testPush:testPush,on:function(f){subs.push(f)},paint:paint,
  badge:badge,signIn:signIn,open:open,close:close,sync:function(){return syncCrate('asked',true)}
};
})();
