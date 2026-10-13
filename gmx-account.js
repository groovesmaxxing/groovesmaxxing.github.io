/* groovesmaxxing account (shell v2 plus accounts build 3b, 2026-10-12). vanilla, no dependencies.
   the api base and the app key come from /gmx-config.json, never from this file. the device id is minted
   once and kept on the phone. the session token lives in localStorage as gmx_session (this phone only,
   rides every call as X-GMX-Session), so one sign-in covers the whole site. this file does five things:
     - the sign-in calls that lived in scan.html: the email link and six-digit code flow, /me and the
       handle, push. nothing works worse signed out
     - the "sign in" or "@handle" chip in the header of every page: into .top where a page has one,
       beside a bare back link, over the hero on the home page
     - the "this is me" button on every artist and label profile, and the sheet behind it: the GMX-
       code, the accounts the site pins as official, the three ways to prove it, "these aren't mine"
     - my claims and the team invites on /more, inside the shell v2 account rows (#gmx-claims, #gmx-team)
     - a small api for other scripts (below)
   scan.html and more.html load this file; gmx-nav.js loads it everywhere else. nothing here touches audio.
   api: gmxAccount.token() set(t) device() config() ready() headers(extra) call(path,opts,ms) api(path,opts)
        start(email) code(email,code) finish(token) poll(ticket) waitForLink(ticket,minutes,cb) resumeWait(cb)
        signout() me(force) snapshot() setHandle(h) ensurePush() pushState() on(fn) paint()
        badge(role) signIn(from,done,why) open(title,sub,html,from) close() claims() */
(function(){
'use strict';
if(window.gmxAccount)return;
var SESSION='gmx_session',ME='gmx_me',ME_AT='gmx_me_at',CFG='gmx_cfg',DEVICE='gmx_device',PENDING='gmx_pending';
var GET_MS=8000,POST_MS=25000,ME_FRESH=10*60000;
var cfg=null,cfgP=null,me=null,meP=null,subs=[],chip=null,pollTimer=null;
var path=location.pathname.replace(/\.html$/,'');
var BADGE={verified_artist:'verified artist',verified_label:'verified label',verified_venue:'verified venue',team:'team'};
var HOST={soundcloud:'soundcloud',instagram:'instagram',email:'mail',spotify:'spotify',bandcamp:'bandcamp',youtube:'youtube',ra:'resident advisor',beatport:'beatport',tiktok:'tiktok',x:'x',site:'site'};
/* the logo mark from favicon.svg, for the header on a wide screen (the same drawing gmx-nav.js puts on the scan disc) */
var WAVE='6,120 30,120 48,84 68,150 88,96 108,138 120,114 132,138 152,96 172,150 192,84 210,120 234,120';
var MARK='<svg viewBox="0 0 240 240" aria-hidden="true"><g fill="none" stroke="#F2F2EF" stroke-linecap="round" stroke-linejoin="round" stroke-width="11"><circle cx="120" cy="120" r="104"/><circle cx="120" cy="120" r="76"/><circle cx="120" cy="120" r="48"/></g><circle cx="120" cy="120" r="20" fill="#0B0B0D"/><polyline points="'+WAVE+'" fill="none" stroke="#0B0B0D" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+WAVE+'" fill="none" stroke="#F2F2EF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{if(v==null||v==='')localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fire(what){
  subs.forEach(function(f){try{f(what)}catch(e){}});
  if(what==='session')try{document.dispatchEvent(new CustomEvent('gmx-account',{detail:{signedIn:!!token()}}))}catch(e){}
}
function fx(url,opts,ms){
  opts=opts||{};
  if(!('AbortController' in window))return fetch(url,opts);
  var ac=new AbortController(),t=setTimeout(function(){ac.abort()},ms||GET_MS);
  opts.signal=ac.signal;
  return fetch(url,opts).then(function(r){clearTimeout(t);return r},function(e){clearTimeout(t);throw (e&&e.name==='AbortError')?new Error('timeout'):e});
}
/* config: the api base and the app key, never from this file. the last good copy stays on the phone so a flaky load still works. */
function config(){
  if(cfg)return Promise.resolve(cfg);
  if(cfgP)return cfgP;
  cfgP=fx('/gmx-config.json',{cache:'no-store'},GET_MS).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){
    if(!j||!j.api_base||!j.app_key)throw new Error('incomplete');
    cfg=j;lsSet(CFG,JSON.stringify(j));return j;
  }).catch(function(e){
    var c=null;try{c=JSON.parse(lsGet(CFG)||'null')}catch(x){}
    if(c&&c.api_base&&c.app_key){cfg=c;return c}
    cfgP=null;throw e;
  });
  return cfgP;
}
function device(){
  var v=lsGet(DEVICE);
  if(v&&/^[A-Za-z0-9_-]{8,64}$/.test(v))return v;
  var b=new Uint8Array(16);(window.crypto||window.msCrypto).getRandomValues(b);
  v=Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('');
  lsSet(DEVICE,v);return v;
}
function token(){return lsGet(SESSION)||''}
function headers(extra){
  var h={'X-GMX-App-Key':cfg?cfg.app_key:'','X-GMX-Device':device()};
  var ss=token();if(ss)h['X-GMX-Session']=ss;
  if(extra)for(var k in extra)h[k]=extra[k];
  return h;
}
/* one call to the recognizer: the headers, a json body when given, a deadline. resolves to the response. */
function call(p,opts,ms){
  opts=opts||{};
  return config().then(function(c){
    var init={method:opts.method||'GET',headers:headers(opts.headers)};
    if(opts.body!=null){init.headers['Content-Type']='application/json';init.body=typeof opts.body==='string'?opts.body:JSON.stringify(opts.body)}
    return fx(c.api_base+p,init,ms||(init.method==='GET'?GET_MS:POST_MS));
  });
}
/* api('/verify/mine') or api('/verify/start',{method:'POST',json:{...}}). the claim and team calls, on top of call(). */
function api(p,opts){
  opts=opts||{};
  return call(p,{method:opts.method,headers:opts.headers,body:opts.json!==undefined?opts.json:opts.body});
}
function remember(j){me=j||null;lsSet(ME,j?JSON.stringify(j):null);lsSet(ME_AT,j?String(Date.now()):null);paint();fire('me')}
function snapshot(){if(me)return me;try{var j=JSON.parse(lsGet(ME)||'null');if(j&&typeof j==='object')me=j}catch(e){}return me}
function set(t){
  var had=token();
  lsSet(SESSION,t||null);
  if(pollTimer){clearInterval(pollTimer);pollTimer=null}
  if(t)lsSet(PENDING,null);else remember(null);
  paint();fire('session');
  if(t&&t!==had)getMe(true).catch(function(){});
}
/* who this is. resolves to the profile, or null when signed out (a 401 clears the session). rejects when the recognizer did not answer. */
function getMe(force){
  if(!token())return Promise.resolve(null);
  var at=Number(lsGet(ME_AT)||0);
  if(!force&&snapshot()&&Date.now()-at<ME_FRESH)return Promise.resolve(me);
  if(meP)return meP;
  meP=call('/me',{},GET_MS).then(function(r){
    if(r.status===401){set('');return null}
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(j){remember(j);return j});
  });
  meP.then(function(){meP=null},function(){meP=null});
  return meP;
}
/* the same, but null when the recognizer did not answer: for the profile button and the claims, which just stay quiet */
function whoami(force){return getMe(force).catch(function(){return null})}
function start(email){return call('/auth/start',{method:'POST',body:{email:email}},POST_MS)}
function code(email,c){return call('/auth/code',{method:'POST',body:{email:email,code:c}},POST_MS)}
function finish(t){return call('/auth/finish',{method:'POST',body:{token:t}},POST_MS)}
function poll(ticket){return call('/auth/poll',{method:'POST',body:{pending:ticket}},POST_MS)}
function signout(){
  var h={};if(token())h['X-GMX-Session']=token();
  var p=token()?call('/auth/signout',{method:'POST',headers:h},POST_MS).catch(function(){}):Promise.resolve();
  set('');return p;
}
function setHandle(h){
  return call('/me',{method:'POST',body:{handle:h||null}},POST_MS).then(function(r){
    if(r.ok)r.clone().json().then(remember).catch(function(){});
    return r;
  });
}
/* the page that asked for the link keeps a ticket and asks every few seconds whether the link was tapped, in
   any browser. the first ready answer carries this browser's own session, so the person is signed in where
   they started. the ticket is remembered across a reload for the link's window. cb runs once, signed in. */
function waitForLink(ticket,minutes,cb){
  lsSet(PENDING,JSON.stringify({t:ticket,until:Date.now()+minutes*60000}));
  if(pollTimer)clearInterval(pollTimer);
  var ask=function(){
    if(token()){clearInterval(pollTimer);pollTimer=null;return}
    poll(ticket).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(!j)return;
      if(j.state==='ready'){clearInterval(pollTimer);pollTimer=null;lsSet(PENDING,null);set(j.session);if(cb)cb()}
      else if(j.state==='gone'){clearInterval(pollTimer);pollTimer=null;lsSet(PENDING,null)}
    }).catch(function(){});
  };
  pollTimer=setInterval(ask,4000);ask();
}
function resumeWait(cb){
  if(token())return;
  var p=null;try{p=JSON.parse(lsGet(PENDING)||'null')}catch(e){}
  if(p&&p.t&&p.until>Date.now())waitForLink(p.t,Math.ceil((p.until-Date.now())/60000),cb);
  else lsSet(PENDING,null);
}
/* a push subscription for this phone: the browser's permission prompt, the recognizer's public key, the
   subscription posted back. resolves true when the phone can be pushed, false when it cannot. never throws. */
function urlB64ToU8(b){var pad='='.repeat((4-b.length%4)%4),raw=atob((b+pad).replace(/-/g,'+').replace(/_/g,'/')),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function ensurePush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return Promise.resolve(false);
  return call('/push/key',{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(k){
    if(!k||!k.enabled||!k.public_key)return false;
    return Notification.requestPermission().then(function(perm){
      if(perm!=='granted')return false;
      return navigator.serviceWorker.ready.then(function(reg){
        return reg.pushManager.getSubscription().then(function(sub){return sub||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToU8(k.public_key)})});
      }).then(function(sub){
        return call('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON()}},POST_MS).then(function(r){return r.ok});
      });
    });
  }).catch(function(){return false});
}
/* where this phone stands on push: none, blocked, off, allowed (permission but no subscription), on */
function pushState(){
  if(!('Notification' in window)||!('PushManager' in window)||!('serviceWorker' in navigator))return Promise.resolve('none');
  if(Notification.permission==='denied')return Promise.resolve('blocked');
  if(Notification.permission!=='granted')return Promise.resolve('off');
  return navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){return sub?'on':'allowed'}).catch(function(){return 'allowed'});
}
function badge(role){return BADGE[role]||''}
function handleOf(url){var m=/(?:instagram\.com|soundcloud\.com)\/([^\/?#]+)/.exec(url||'');return m?'@'+m[1]:(url||'').replace(/^https?:\/\//,'').replace(/\/$/,'')}
function short(url){return (url||'').replace(/^mailto:/,'').replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,'')}

/* ---- the header chip. .gmx-chip, since .gmx-acct is the sheet in gmx-account.css ---- */
var CSS='.wrap > .top,.gmx-top{display:flex;align-items:center;justify-content:space-between;gap:12px}'+
 '.hero > .gmx-hdr.float{position:absolute;top:calc(16px + env(safe-area-inset-top));right:16px;z-index:2}'+
 '.gmx-chip{flex:none;position:relative;z-index:3;background:#0B0B0D;font-family:"Space Mono",monospace;font-size:.7rem;letter-spacing:.08em;color:#8A8A93;text-decoration:none;border:1px solid rgba(242,242,239,.18);border-radius:999px;padding:0 12px;min-height:34px;line-height:32px;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;-webkit-tap-highlight-color:transparent}'+
 '.gmx-chip.in{color:#F2F2EF;border-color:rgba(255,28,2,.5)}'+
 '.gmx-chip:hover,.gmx-chip:focus-visible{color:#FF1C02;border-color:#FF1C02;outline:none}'+
 '';
function paint(){
  if(!chip)return;
  var t=token(),m=snapshot();
  chip.className='gmx-chip'+(t?' in':'');
  chip.textContent=t?(m&&m.handle?'@'+m.handle:'you'):'sign in';
  chip.href=path==='/scan'?'#you':'/more#account';
  chip.setAttribute('aria-label',t?'your account'+(m&&m.handle?', @'+m.handle:''):'sign in');
}
/* the header row: on a wide screen the logo (to /scan) and the search button sit beside the chip, since there is
   no tab bar and no floating button there. gmx-nav.css hides both under 1025px. */
function headerRow(){
  var row=document.createElement('span');row.className='gmx-hdr';
  if(path!=='/scan'){var m=document.createElement('a');m.className='gmx-hmark';m.href='/scan';m.setAttribute('aria-label','scan what is playing');m.innerHTML=MARK;row.appendChild(m)}
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
      if(hero){row.className+=' float';hero.appendChild(row)}
      else{var w=document.querySelector('.wrap')||document.body,d2=document.createElement('div');d2.className='gmx-top';d2.appendChild(row);w.insertBefore(d2,w.firstChild)}
    }
  }
  paint();
  if(token())getMe(false).catch(function(){});
}

/* ---- the sheet. its own small shell, so it works on pages without gmx-sheet.css too ------------------ */
var sheet,body,opener;
function build(){
  sheet=document.createElement('div');sheet.className='gmx-acct';sheet.hidden=true;
  sheet.innerHTML='<div class="gmx-acct-back" data-close></div><div class="gmx-acct-panel" role="dialog" aria-modal="true" aria-labelledby="gmx-acct-title">'+
    '<div class="gmx-acct-grip" aria-hidden="true"></div><div class="gmx-acct-head"><div class="gmx-acct-tx"><h2 class="gmx-acct-title" id="gmx-acct-title"></h2><p class="gmx-acct-sub" hidden></p></div>'+
    '<button type="button" class="gmx-acct-x" data-close aria-label="close">×</button></div><div class="gmx-acct-body"></div></div>';
  document.body.appendChild(sheet);body=sheet.querySelector('.gmx-acct-body');
  sheet.addEventListener('click',function(e){if(e.target.closest('[data-close]'))close()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sheet&&!sheet.hidden){e.preventDefault();close()}});
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
function fill(html){if(body)body.innerHTML=html}
function close(){
  if(!sheet||sheet.hidden)return;
  sheet.hidden=true;document.documentElement.classList.remove('gmx-acct-open');
  if(opener&&opener.focus)try{opener.focus()}catch(e){}
}
function note(el,t,ok){if(!el)return;el.textContent=t||'';el.className='gmx-acct-msg'+(ok?' ok':'')}

/* ---- sign in from the sheet: email link, no password. the same three doors scan.html and more.html open -- */
function signinForm(){
  return '<form class="gmx-acct-form" data-form="start" autocomplete="off"><label for="gmx-acct-email">email</label>'+
    '<input id="gmx-acct-email" name="email" type="email" inputmode="email" maxlength="320" required placeholder="you@example.com">'+
    '<div class="gmx-acct-row"><button class="gmx-acct-btn red" type="submit">send me a sign-in link</button><span class="gmx-acct-msg"></span></div></form>';
}
function codeForm(email){
  return '<form class="gmx-acct-form on" data-form="code" data-email="'+esc(email)+'" autocomplete="off"><label for="gmx-acct-code">the six digits from the mail</label>'+
    '<input id="gmx-acct-code" name="code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="one-time-code" placeholder="000 000">'+
    '<div class="gmx-acct-row"><button class="gmx-acct-btn red" type="submit">sign in</button><span class="gmx-acct-msg"></span></div>'+
    '<p class="gmx-acct-p small">or tap the link in the mail, anywhere. this page signs in on its own while it stays open.</p></form>';
}
function wireSignin(root,done){
  root.addEventListener('submit',function(ev){
    var f=ev.target.closest('form[data-form]');if(!f||(f.dataset.form!=='start'&&f.dataset.form!=='code'))return;ev.preventDefault();
    var m=f.querySelector('.gmx-acct-msg');
    if(f.dataset.form==='start'){
      var email=(f.querySelector('input[name=email]').value||'').trim();if(!email)return;note(m,'sending');
      start(email).then(function(r){
        if(r.status===429){note(m,'too many links for that address this hour.');return}
        if(r.status===422){note(m,'that does not look like an email address.');return}
        if(!r.ok)throw new Error(r.status);
        return r.json().then(function(j){
          if(!j.mail_sent){note(m,'the mail could not go out right now. try again later.');return}
          var box=document.createElement('div');box.innerHTML=codeForm(email);f.parentNode.insertBefore(box.firstChild,f.nextSibling);f.hidden=true;
          var c=root.querySelector('#gmx-acct-code');if(c)c.focus();
          if(j.pending)waitForLink(j.pending,j.minutes||20,done);
        });
      }).catch(function(){note(m,'did not send. check your signal and try again.')});
    }else{
      var digits=(f.querySelector('input[name=code]').value||'').replace(/\D/g,'');
      if(digits.length!==6){note(m,'six digits.');return}
      note(m,'checking');
      code(f.dataset.email,digits).then(function(r){
        if(r.status===410){note(m,'that code is wrong, used or too old. ask for a new one.');return}
        if(!r.ok)throw new Error(r.status);
        return r.json().then(function(j){set(j.session);done&&done()});
      }).catch(function(){note(m,'did not send. check your signal.')});
    }
  });
}
/* open the sign-in sheet; done runs once a session exists */
function signIn(from,done,why){
  open('sign in',why||'email link, no password',signinForm(),from);
  wireSignin(body,function(){close();done&&done()});
}

/* ---- "this is me" on a profile (design section 3) ----------------------------------------------------- */
function wireProfile(){
  var sec=document.querySelector('section.artist');if(!sec||sec.querySelector('.gmx-claim'))return;
  var kind=sec.classList.contains('label')?'label':'artist';
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
    if(mine)wrap.innerHTML='<span class="gmx-claim on">✓ '+esc(badge(kind==='label'?'verified_label':'verified_artist'))+'</span><span class="gmx-claim-why">this is your page.</span>';
  }).catch(function(){});
}
function claim(kind,slug,name,from){
  open('prove it\'s you',name,'<p class="gmx-acct-p">one sec.</p>',from);
  api('/verify/start',{method:'POST',json:{kind:kind,slug:slug}}).then(function(r){
    if(r.status===401){set('');close();signIn(from,function(){claim(kind,slug,name,from)});return null}
    if(r.status===409)return r.json().then(function(j){fill('<p class="gmx-acct-p">'+esc(/revoked/.test(j.detail||'')?'this claim was closed. write to us from the more page and we will look again.':'you are already verified here. the badge is on.')+'</p>');return null});
    if(!r.ok)throw new Error(r.status);
    return r.json();
  }).then(function(role){if(role)renderClaim(role,name)}).catch(function(){fill('<p class="gmx-acct-p">the recognizer did not answer. try again in a minute.</p>')});
}
function pinList(role){
  return '<ul class="gmx-acct-pins">'+role.pinned.map(function(p){return '<li><b>'+esc(HOST[p.host]||p.host)+'</b> <span>'+esc(short(p.url))+'</span></li>'}).join('')+'</ul>';
}
function renderClaim(role,name){
  var h='';
  if(role.state==='verified'){fill('<p class="gmx-acct-p">you are verified here. the badge is on.</p>');return}
  if(role.needs_pipeline){
    h='<p class="gmx-acct-p">'+(role.pinned&&role.pinned.length?'we have '+esc(name)+' on the site but no official soundcloud, instagram or mail pinned yet.':'we do not have '+esc(name)+'\'s official accounts pinned yet.')+
      ' we are reading them now. once they are in, come back here for the code step. we will mail you.</p>'+
      '<p class="gmx-acct-p small">a code only ever counts from an account we have as officially yours. that is what keeps a copycat page from claiming your name.</p>';
    fill(h);return;
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
  h+='</div>'+last+'<p class="gmx-acct-msg" data-msg></p>';
  h+='<p class="gmx-acct-p small"><button type="button" class="gmx-acct-link" data-disown>these aren\'t mine</button></p>'+
     '<form class="gmx-acct-form" data-form="disown" hidden><label for="gmx-acct-why">which one is wrong?</label><input id="gmx-acct-why" maxlength="300" placeholder="that instagram is my old one, mine is @…"><div class="gmx-acct-row"><button class="gmx-acct-btn" type="submit">send</button></div></form>';
  fill(h);
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

/* ---- my claims and the team on /more (design section 4, "for artists"). more.html owns the profile card and
   the rows; this fills #gmx-claims and #gmx-team inside them, signed in, and empties them signed out ---- */
var teamWired=false;
function claims(){
  var cl=document.getElementById('gmx-claims'),t=document.getElementById('gmx-team');if(!cl)return;
  if(!token()){cl.innerHTML='';if(t)t.innerHTML='';return}
  api('/verify/mine').then(function(r){return r.ok?r.json():[]}).then(function(rows){
    if(!rows.length){cl.innerHTML='';if(t)t.innerHTML='';return}
    cl.innerHTML='<h4>my claims</h4><ul class="gmx-you-list">'+rows.map(function(r){
      var st=r.state==='verified'?'verified':r.state==='revoked'?'closed':(r.needs_pipeline?'waiting on your official accounts':(r.match_result||'waiting on your proof'));
      return '<li><a href="/'+esc(r.entity_kind==='label'?'labels':'artists')+'/'+esc(r.slug)+'"><b>'+esc(r.name||r.slug)+'</b> <small>'+esc(r.kind==='team'?'team seat':r.kind)+' · '+esc(st)+'</small></a></li>';
    }).join('')+'</ul>';
    var owned=rows.filter(function(r){return r.state==='verified'&&(r.kind==='artist'||r.kind==='label')});
    if(owned.length)paintTeam(owned);else if(t)t.innerHTML='';
  }).catch(function(){});
}
function paintTeam(owned){
  var t=document.getElementById('gmx-team');if(!t)return;
  t.innerHTML='<h4>team</h4><p class="gmx-acct-p small">a manager, a label person: invite them by email and they act for you here. they can never invite others.</p>'+owned.map(function(o){
    return '<div class="gmx-team" data-slug="'+esc(o.slug)+'"><b>'+esc(o.name||o.slug)+'</b><ul class="gmx-you-list" data-seats></ul>'+
      '<form class="gmx-acct-form on" data-form="invite" autocomplete="off"><div class="gmx-acct-row"><input type="email" inputmode="email" maxlength="320" placeholder="their email" aria-label="their email" required><button class="gmx-acct-btn" type="submit">invite</button><span class="gmx-acct-msg"></span></div></form></div>';
  }).join('');
  t.querySelectorAll('.gmx-team').forEach(function(box){loadSeats(box)});
  if(teamWired)return;teamWired=true;
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

/* ---- boot ---------------------------------------------------------------------------------------- */
function boot(){
  mountChip();wireProfile();claims();
  subs.push(function(w){if(w==='session')claims()});
  /* scan and more run their own wait, with their own "you are in" */
  if(path!=='/scan'&&path!=='/more')resumeWait();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
/* a sign-in in another tab shows up here too */
window.addEventListener('storage',function(e){if(e.key===SESSION||e.key===ME){me=null;paint();fire('session')}});
window.gmxAccount={
  token:token,set:set,device:device,config:config,ready:config,headers:headers,call:call,api:api,
  start:start,code:code,finish:finish,poll:poll,waitForLink:waitForLink,resumeWait:resumeWait,signout:signout,
  me:getMe,snapshot:snapshot,setHandle:setHandle,ensurePush:ensurePush,pushState:pushState,
  on:function(f){subs.push(f)},paint:paint,
  badge:badge,signIn:signIn,open:open,close:close,claims:claims
};
})();
