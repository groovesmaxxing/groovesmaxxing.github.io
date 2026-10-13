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
     - a small api for other scripts: window.gmxAccount.{ready, token, headers, api, me, signIn, badge, sync}
   calls are counted against the phone's hourly budget like a scan is, so /me is cached ten minutes and
   the crate only goes up when it changed. nothing here touches audio. */
(function(){
'use strict';
if(window.gmxAccount)return;
var POST_MS=25000, GET_MS=8000, SESSION='gmx_session', DEVICE='gmx_device', CFGK='gmx_cfg', PENDING='gmx_pending';
var CRATE='gmx_crate', CRATE_RM='gmx_crate_rm', CRATE_SIG='gmx_crate_sig', ME='gmx_me', NUDGE='gmx_nudge_until', NL='gmx_nl_wanted', WANT_FOLLOW='gmx_follow_wanted';
var ME_TTL=10*60000, SYNC_TTL=30*60000, NUDGE_DAYS=30;
var cfg=null, cfgP=null, me=null, meP=null, pollTimer=null, syncT=null, syncing=false, syncAgain=false;
var BADGE={verified_artist:'verified artist',verified_label:'verified label',verified_venue:'verified venue',team:'team'};
var HOST={soundcloud:'soundcloud',instagram:'instagram',email:'mail',spotify:'spotify',bandcamp:'bandcamp',youtube:'youtube',ra:'resident advisor',beatport:'beatport',tiktok:'tiktok',x:'x',site:'site'};
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
function setToken(t){lss(SESSION,t);me=null;meP=null;lss(ME,'');if(!t)lss(CRATE_SIG,'');try{document.dispatchEvent(new CustomEvent('gmx-account',{detail:{signedIn:!!t}}))}catch(e){}}
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
  meP=api('/me').then(function(r){if(r.status===401){setToken('');return null}if(!r.ok)throw new Error(r.status);return r.json()})
    .then(function(j){me=j;lss(ME,JSON.stringify({me:j,at:Date.now()}));return j}).catch(function(){return me||((c&&c.me)||null)});
  return meP;
}
function remember(m){me=m;lss(ME,JSON.stringify({me:m,at:Date.now()}))}
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
function set(html){if(body)body.innerHTML=html}
function close(){
  if(!sheet||sheet.hidden)return;
  sheet.hidden=true;document.documentElement.classList.remove('gmx-acct-open');
  if(opener&&opener.focus)try{opener.focus()}catch(e){}
}
function note(el,t,ok){if(!el)return;el.textContent=t||'';el.className='gmx-acct-msg'+(ok?' ok':'')}
var toastT;
function toast(msg){
  var t=document.querySelector('.gmx-acct-toast');
  if(!t){t=document.createElement('div');t.className='gmx-acct-toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on')},2200);
}

/* ---- sign in: email link, no password. the same three doors scan.html opens ------------------------- */
function signinForm(){
  return '<form class="gmx-acct-form" data-form="start" autocomplete="off"><label for="gmx-acct-email">email</label>'+
    '<input id="gmx-acct-email" name="email" type="email" inputmode="email" maxlength="320" required placeholder="you@example.com">'+
    '<label class="gmx-acct-check"><input type="checkbox" name="nl"> fresh grooves friday in my inbox too</label>'+
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
    var f=ev.target.closest('form[data-form]');if(!f)return;ev.preventDefault();
    var m=f.querySelector('.gmx-acct-msg');
    if(f.dataset.form==='start'){
      var email=(f.querySelector('input[name=email]').value||'').trim();if(!email)return;note(m,'sending');
      var nl=f.querySelector('input[name=nl]');lss(NL,nl&&nl.checked?'1':'');
      api('/auth/start',{method:'POST',json:{email:email}}).then(function(r){
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
    }else if(f.dataset.form==='code'){
      var code=(f.querySelector('input[name=code]').value||'').replace(/\D/g,'');
      if(code.length!==6){note(m,'six digits.');return}
      note(m,'checking');
      api('/auth/code',{method:'POST',json:{email:f.dataset.email,code:code}}).then(function(r){
        if(r.status===410){note(m,'that code is wrong, used or too old. ask for a new one.');return}
        if(!r.ok)throw new Error(r.status);
        return r.json().then(function(j){signedIn(j.session);done&&done()});
      }).catch(function(){note(m,'did not send. check your signal.')});
    }
  });
}
/* a session just opened: the crate goes up, the newsletter box is honoured, a follow that waited is made */
function signedIn(t){
  if(pollTimer){clearInterval(pollTimer);pollTimer=null}
  lss(PENDING,'');setToken(t);
  afterSignIn();
}
function afterSignIn(){
  if(ls(NL)==='1'){lss(NL,'');api('/me/newsletter',{method:'POST'}).catch(function(){})}
  var w=ls(WANT_FOLLOW);if(w){lss(WANT_FOLLOW,'');api('/follow/artist',{method:'POST',json:{slug:w}}).catch(function(){})}
  syncCrate('sign-in');
}
function waitForLink(ticket,minutes,done){
  lss(PENDING,JSON.stringify({t:ticket,until:Date.now()+minutes*60000}));
  if(pollTimer)clearInterval(pollTimer);
  var ask=function(){
    if(token()){clearInterval(pollTimer);pollTimer=null;return}
    api('/auth/poll',{method:'POST',json:{pending:ticket}}).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(!j)return;
      if(j.state==='ready'){signedIn(j.session);done&&done()}
      else if(j.state==='gone'){clearInterval(pollTimer);pollTimer=null;lss(PENDING,'')}
    }).catch(function(){});
  };
  pollTimer=setInterval(ask,4000);ask();
}
function resumeWait(done){
  if(token())return;
  var p=lsj(PENDING);
  if(p&&p.t&&p.until>Date.now())waitForLink(p.t,Math.ceil((p.until-Date.now())/60000),done);else lss(PENDING,'');
}
/* open the sign-in sheet; done runs once a session exists */
function signIn(from,done,why){
  open('sign in',why||'email link, no password',signinForm(),from);
  wireSignin(body,function(){close();done&&done()});
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
  var items=crateLocal().slice(0,500),removed=rmLocal().slice(0,500),s=sig(items,removed),last=lsj(CRATE_SIG);
  if(!force&&last&&last.sig===s&&Date.now()-(last.at||0)<SYNC_TTL)return Promise.resolve(false);
  syncing=true;
  return api('/me/crate',{method:'PUT',json:{items:items,removed:removed}}).then(function(r){
    if(r.status===401){setToken('');return null}
    if(!r.ok)throw new Error(r.status);
    return r.json();
  }).then(function(j){
    if(!j)return false;
    var list=(j.items||[]).map(norm);
    lss(CRATE,JSON.stringify(list));lss(CRATE_RM,'');
    lss(CRATE_SIG,JSON.stringify({sig:sig(list,[]),at:Date.now()}));
    try{document.dispatchEvent(new CustomEvent('gmx:crate-synced',{detail:{count:j.count,merged:j.merged,reason:reason}}))}catch(e){}
    return true;
  }).catch(function(){return false}).then(function(ok){
    syncing=false;
    if(syncAgain){syncAgain=false;syncCrate('again')}
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
      if(d.on)api('/follow/artist',{method:'POST',json:{slug:slug}}).catch(function(){});
      else api('/follow/artist/'+encodeURIComponent(slug),{method:'DELETE'}).catch(function(){});
    }
    return;
  }
  if(!d.on)return;
  if(item.kind==='artist'||item.kind==='label'){
    /* moment 4: the follow signs you in first. the heart stays on the phone either way, nothing gets worse */
    if(item.kind==='artist')lss(WANT_FOLLOW,String(item.id).replace(/^artist:/,''));
    signIn(d.button||null,null,'sign in to follow '+(item.title||'them')+': drops and dates land in your alerts. the heart stays on this phone either way.');
    return;
  }
  /* moment 1: the third heart */
  var n=crateLocal().filter(function(x){return x.kind==='set'||x.kind==='track'}).length;
  var until=+ls(NUDGE)||0;
  if(n>=3&&until<Date.now())nudge();
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
function wireChip(){
  if(onScan()||onMore())return;
  var top=document.querySelector('.top');if(!top||top.querySelector('.gmx-chip'))return;
  var a=document.createElement('a');a.className='gmx-chip';a.href='/more';top.appendChild(a);
  function paint(){
    if(!token()){a.textContent='sign in';a.classList.remove('in');return}
    a.classList.add('in');a.innerHTML='<b>you</b>';
    whoami().then(function(m){if(m)a.innerHTML='<b>'+esc(m.handle?'@'+m.handle:'you')+'</b>'});
  }
  paint();document.addEventListener('gmx-account',paint);
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
  h+='</div>'+last+'<p class="gmx-acct-msg" data-msg></p>';
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
  var box=document.getElementById('gmx-you');if(!box)return;
  function paint(){
    if(!token()){
      box.innerHTML='<div class="gmx-you out"><h3>your account</h3><p class="gmx-acct-p">sign in to keep your crate on every phone, get your name on the IDs you help find, hear first when a track you scanned comes out, '+
        'and claim your page if you are one of the names on here. email only. no password.</p>'+signinForm()+'</div>';
      wireSignin(box,function(){paint()});
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
        '<div id="gmx-claims"></div><div id="gmx-team"></div>'+
        '<h4>notifications</h4><p class="gmx-acct-p small">by email, to '+esc(m.email)+'. push is the phone\'s own switch, under scan.</p><ul class="gmx-you-switches" id="gmx-notify"></ul>'+
        '<h4>your data</h4><ul class="gmx-you-list">'+
        '<li><button type="button" class="gmx-acct-rowbtn" data-export><b>download my data</b><small>scans, crate, follows, claims, as one json file</small></button></li>'+
        '<li><button type="button" class="gmx-acct-rowbtn" data-delete><b>delete my account</b><small>a mail confirms it, then it is gone for good</small></button></li></ul>'+
        '<div id="gmx-delete"></div>'+
        '<div class="gmx-acct-row"><button type="button" class="gmx-acct-btn ghost" data-out>sign out</button><span class="gmx-acct-msg" id="gmx-you-msg"></span></div></div>';
      box.innerHTML=h;
      paintNotify(m);paintClaims(m);
    });
  }
  box.addEventListener('click',function(e){
    var o=e.target.closest('[data-out]');if(o){api('/auth/signout',{method:'POST'}).catch(function(){});setToken('');paint();return}
    var x=e.target.closest('[data-export]');if(x){exportData(x);return}
    var d=e.target.closest('[data-delete]');if(d){startDelete(d);return}
  });
  box.addEventListener('change',function(e){
    var sw=e.target.closest('input[data-notify]');if(!sw)return;
    var key=sw.dataset.notify,on=sw.checked,msg=document.getElementById('gmx-you-msg');sw.disabled=true;
    var p=key==='newsletter'?api('/me/newsletter',{method:on?'POST':'DELETE'}):api('/me',{method:'POST',json:{notify:(function(){var o={};o[key]=on;return o})()}});
    p.then(function(r){
      if(r.status===503){note(msg,'the newsletter switch is not wired on this deployment yet. the form below still works.');sw.checked=!on;return}
      if(!r.ok)throw new Error(r.status);
      return r.json().then(function(j){if(j&&j.notify)remember(j);else if(me){me.notify=me.notify||{};me.notify[key]=on;remember(me)}note(msg,'saved.',true)});
    }).catch(function(){sw.checked=!on;note(msg,'did not save. try again in a minute.')}).then(function(){sw.disabled=false});
  });
  paint();
  document.addEventListener('gmx-account',function(){paint()});
}
function paintNotify(m){
  var ul=document.getElementById('gmx-notify');if(!ul)return;
  var n=m.notify||{};
  ul.innerHTML=NOTIFY.map(function(x){
    var on=n[x[0]]!==undefined?!!n[x[0]]:(x[0]!=='newsletter');
    return '<li><label class="gmx-sw"><span class="tx">'+esc(x[1])+'</span><input type="checkbox" role="switch" data-notify="'+x[0]+'"'+(on?' checked':'')+'><span class="knob" aria-hidden="true"></span></label></li>';
  }).join('');
}
function exportData(btn){
  var msg=document.getElementById('gmx-you-msg');btn.disabled=true;note(msg,'packing it up');
  api('/me/export').then(function(r){if(!r.ok)throw new Error(r.status);return r.blob()}).then(function(b){
    var u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='groovesmaxxing-export.json';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(u)},4000);note(msg,'downloaded.',true);
  }).catch(function(){note(msg,'could not fetch it. try again in a minute.')}).then(function(){btn.disabled=false});
}
function startDelete(btn){
  var box=document.getElementById('gmx-delete'),msg=document.getElementById('gmx-you-msg');
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
      box.querySelector('[data-delcancel]').addEventListener('click',function(){box.innerHTML='';note(msg,'kept.',true)});
      box.querySelector('form').addEventListener('submit',function(ev){
        ev.preventDefault();var code=(box.querySelector('input').value||'').replace(/\D/g,'');if(code.length!==6){note(msg,'six digits.');return}
        note(msg,'deleting');
        api('/me/delete/confirm',{method:'POST',json:{code:code}}).then(function(r){
          if(r.status===410){note(msg,'that code is wrong, used or too old. ask for a new mail.');return}
          if(!r.ok)throw new Error(r.status);
          return r.json().then(function(){setToken('');lss(CRATE_SIG,'');toast('your account is gone. the crate on this phone stays yours.')});
        }).catch(function(){note(msg,'did not go through. try again in a minute.')});
      });
    });
  }).catch(function(){note(msg,'the recognizer did not answer. try again in a minute.')}).then(function(){btn.disabled=false});
}
function paintClaims(m){
  var cl=document.getElementById('gmx-claims');if(!cl)return;
  api('/verify/mine').then(function(r){return r.ok?r.json():[]}).then(function(rows){
    if(!rows.length){cl.innerHTML='<h4>for artists</h4><p class="gmx-acct-p small">an artist or a label on here? open your page and tap "this is me".</p>';return}
    cl.innerHTML='<h4>my claims</h4><ul class="gmx-you-list">'+rows.map(function(r){
      var st=r.state==='verified'?'verified':r.state==='revoked'?'closed':(r.needs_pipeline?'waiting on your official accounts':(r.match_result||'waiting on your proof'));
      return '<li><a href="/'+esc(r.entity_kind==='label'?'labels':'artists')+'/'+esc(r.slug)+'"><b>'+esc(r.name||r.slug)+'</b> <small>'+esc(r.kind==='team'?'team seat':r.kind)+' · '+esc(st)+'</small></a></li>';
    }).join('')+'</ul>';
    var owned=rows.filter(function(r){return r.state==='verified'&&(r.kind==='artist'||r.kind==='label')});
    if(owned.length)paintTeam(owned);
  }).catch(function(){});
}
function paintTeam(owned){
  var t=document.getElementById('gmx-team');if(!t)return;
  t.innerHTML='<h4>team</h4><p class="gmx-acct-p small">a manager, a label person: invite them by email and they act for you here. they can never invite others.</p>'+owned.map(function(o){
    return '<div class="gmx-team" data-slug="'+esc(o.slug)+'"><b>'+esc(o.name||o.slug)+'</b><ul class="gmx-you-list" data-seats></ul>'+
      '<form class="gmx-acct-form on" data-form="invite" autocomplete="off"><div class="gmx-acct-row"><input type="email" inputmode="email" maxlength="320" placeholder="their email" aria-label="their email" required><button class="gmx-acct-btn" type="submit">invite</button><span class="gmx-acct-msg"></span></div></form></div>';
  }).join('');
  t.querySelectorAll('.gmx-team').forEach(function(box){loadSeats(box)});
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
  wireProfile();wireMore();wireChip();wireCratePage();
  document.addEventListener('gmx:crate',onCrateChange);
  if(!onScan()){resumeWait();if(token())syncCrate('boot')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.gmxAccount={ready:loadCfg,token:token,headers:function(x){return cfg?headers(x):null},api:api,me:whoami,signIn:signIn,badge:badge,open:open,close:close,sync:function(){return syncCrate('asked',true)}};
})();
