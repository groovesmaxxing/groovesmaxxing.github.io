/* groovesmaxxing page motion kit: progress bar, halftone ripple behind the page title, scroll reveals, hover lifts.
   vanilla, no dependencies. respects prefers-reduced-motion. */
(() => {
  if (window.__gmxMotion) return; window.__gmxMotion = 1;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  root.classList.add('gmx-motion');
  const small = matchMedia('(max-width:640px)').matches;

  /* progress bar */
  const bar = document.createElement('div'); bar.id = 'gmx-progress'; document.body.prepend(bar);
  let pend = false;
  const prog = () => { pend = false; const h = root.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
  addEventListener('scroll', () => { if (!pend) { pend = true; requestAnimationFrame(prog); } }, {passive: true});
  prog();

  /* reveal targets: the blocks of each .wrap, or the items of a block that is a list or grid */
  const SKIP = 'header,nav,footer,script,style,.top,.gmx-tabs,.gmx-stage,[hidden]';   // the shared player wires its own slides
  const blocks = [...document.querySelectorAll('.wrap > *, main > *, section > *')].filter(el => !el.matches(SKIP) && !el.closest('header,footer,nav,.top'));
  const targets = new Set();
  blocks.forEach(el => {
    const kids = [...el.children].filter(k => !k.matches(SKIP));
    const disp = getComputedStyle(el).display;
    const listy = el.matches('ul,ol') || disp.includes('grid') || (disp.includes('flex') && kids.length > 3);
    if (listy && kids.length >= 3 && kids.length <= 80) kids.forEach(k => targets.add(k));
    else if (kids.length > 80) return;              // big chip walls stay put, they are tools
    else targets.add(el);
  });
  // never hide things that are already on screen at load, only what is below the fold
  const fold = innerHeight * 0.92;
  const list = [...targets].filter(el => { const r = el.getBoundingClientRect(); return r.top > fold && r.height < innerHeight * 1.5; }).slice(0, 500);  // a block taller than the screen can never reach the reveal threshold, so it is never hidden
  list.forEach(el => el.classList.add('rv'));

  const heads = [...document.querySelectorAll('.wrap h1, .wrap h2, main h1, main h2, section h2')].filter(h => !h.closest('footer,nav') && parseFloat(getComputedStyle(h).fontSize) >= 22);
  heads.forEach(h => h.classList.add('gmx-zz'));

  if (RM || !('IntersectionObserver' in window)) {
    list.forEach(el => el.classList.add('in')); heads.forEach(h => h.classList.add('in'));
  } else {
    const io = new IntersectionObserver(es => {
      let k = 0;
      es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top).forEach(e => {
        e.target.style.transitionDelay = (Math.min(k++, 8) * 60) + 'ms';
        e.target.classList.add('in'); io.unobserve(e.target);
      });
    }, {rootMargin: '0px 0px -6% 0px', threshold: 0.06});
    list.forEach(el => io.observe(el)); heads.forEach(h => io.observe(h));
  }

  /* cards lift on hover */
  document.querySelectorAll('.grid > .v, .ev, .letterhead, .issues > *, .list > li, .card, .lane, .cluster, .pod, .serie').forEach(el => el.classList.add('gmx-lift'));

  /* halftone ripple field behind the page title. profile pages (artists, labels) get the homepage treatment:
     a taller band, and the spinning groovesmaxxing mark the ripples roll out of */
  const h1 = document.querySelector('h1'); if (!h1 || RM) return;
  const prof = h1.matches('.aname') ? h1.closest('section.artist') : null;
  const scanBtn = document.querySelector('#go.rings'), stage = document.getElementById('stage');
  // phones keep text clear: only the scan screen and the profile corner mark run there
  if (small && !prof && !scanBtn) return;
  const cv = document.createElement('canvas'); cv.className = 'gmx-fx'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const gl = cv.getContext('webgl', {antialias: false, alpha: true, premultipliedAlpha: false});
  if (!gl) return;
  let mark = null, wave = null, dot = null, base = [];
  if (prof && !scanBtn) {
    mark = document.createElement('div'); mark.className = 'gmx-mark'; mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<svg viewBox="0 0 240 240"><g class="gmx-rings" fill="none" stroke="#FF1C02" stroke-width="5"><circle cx="120" cy="120" r="104"/><circle cx="120" cy="120" r="76"/><circle cx="120" cy="120" r="48"/></g><circle cx="120" cy="120" r="18" fill="#FF1C02"/><polyline points="6,120 30,120 48,84 68,150 88,96 108,138 120,114 132,138 152,96 172,150 192,84 210,120 234,120" fill="none" stroke="#F2F2EF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    document.body.appendChild(mark);
    wave = mark.querySelector('polyline'); dot = mark.querySelector('svg > circle');
    base = wave.getAttribute('points').split(' ').map(p => p.split(',').map(Number));
  }
  const FS = `
precision highp float;
uniform vec2 uRes; uniform vec2 uC; uniform float uT; uniform float uBeat; uniform vec2 uBox; uniform vec2 uHalf; uniform float uCell; uniform float uR; uniform float uK; uniform float uMaxR; uniform float uSpeed;
const vec3 RED = vec3(1.0,0.110,0.008); const vec3 DEEP = vec3(0.8,0.078,0.0); const vec3 DAY = vec3(0.949,0.949,0.937);
void main(){
  vec2 p = gl_FragCoord.xy; float m = min(uRes.x, uRes.y*2.2); float cell = uCell;
  float row = floor(p.y/cell); float off = mod(row,2.0)*0.5*cell;
  vec2 cc = vec2((floor((p.x+off)/cell)+0.5)*cell - off, (row+0.5)*cell);
  float dpx = length(cc-uC); float d = dpx/m;
  float ph = d*uK - uT*uSpeed;
  float v = 0.5+0.5*sin(ph);
  vec2 q = abs(cc-uBox)-uHalf; float box = length(max(q,0.0))+min(max(q.x,q.y),0.0);
  float reach = uR > 0.0 ? 1.0 - smoothstep(0.45, 1.25, d) : 1.0 - smoothstep(0.25, 0.75, d);
  float env = smoothstep(0.0, 0.08*m, box) * smoothstep(0.0, 0.3, p.y/uRes.y) * reach * smoothstep(uR*1.08, uR*1.08 + 30.0, dpx) * (uMaxR > 0.0 ? 1.0 - smoothstep(uMaxR*0.6, uMaxR, dpx) : 1.0);
  float r = cell*0.5*clamp(v*env*(0.88+0.18*uBeat),0.0,1.0);
  float a = 1.0 - smoothstep(r-0.9, r+0.6, length(p-cc));
  float band = mod(floor(ph/6.2831853),3.0);
  vec3 col = band<0.5 ? RED : (band<1.5 ? DAY : DEEP);
  gl_FragColor = vec4(col, a*0.85);
}`;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const al = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ['uRes','uC','uT','uBeat','uBox','uHalf','uCell','uR','uK','uMaxR','uSpeed'].forEach(n => U[n] = gl.getUniformLocation(pr, n));
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const dpr = Math.min(devicePixelRatio || 1, small ? 2 : 1.5);
  let W = 0, H = 0, geo = null;
  const inkRect = e => { if (e.matches('h1')) { const rg = document.createRange(); rg.selectNodeContents(e); return rg.getBoundingClientRect(); } return e.getBoundingClientRect(); };
  const rectOf = els => {
    const rs = els.filter(Boolean).map(inkRect).filter(r => r.width && r.height);
    return {l: Math.min(...rs.map(r => r.left)), r: Math.max(...rs.map(r => r.right)), t: Math.min(...rs.map(r => r.top)) + scrollY, b: Math.max(...rs.map(r => r.bottom)) + scrollY};
  };
  const measure = () => {
    const cw = document.documentElement.clientWidth;
    if (scanBtn) {                                  // the app's scan screen: ripples roll out of the scan button
      const g = scanBtn.getBoundingClientRect(), st = (stage || scanBtn).getBoundingClientRect();
      const topEl = document.querySelector('.top'), top0 = topEl ? topEl.getBoundingClientRect().bottom + scrollY + 6 : 0;
      const hCss = st.bottom + scrollY + 30 - top0;
      cv.style.top = top0 + 'px';
      cv.style.height = hCss + 'px'; W = cv.width = Math.round(cw * dpr); H = cv.height = Math.round(hCss * dpr); gl.viewport(0, 0, W, H);
      // every line of text under the button stays clear, whatever state the screen is in
      const txt = rectOf([...(stage ? stage.children : [])].filter(e => e !== scanBtn && getComputedStyle(e).display !== 'none'));
      txt.t -= top0; txt.b -= top0;
      const cx = g.left + g.width / 2, cy = g.top + g.height / 2 + scrollY - top0;
      geo = {c: [cx * dpr, H - cy * dpr], R: (g.width / 2) * dpr, k: small ? 30 : 24, maxR: 0,
             box: [((txt.l + txt.r) / 2) * dpr, H - ((txt.t + txt.b) / 2) * dpr], half: [((txt.r - txt.l) / 2 + 12) * dpr, ((txt.b - txt.t) / 2 + 8) * dpr]};
      return;
    }
    if (prof && small) {                            // phones: a small mark in the top right corner, dots only around it
      const back = prof.parentElement.querySelector('.top a') || document.querySelector('.top a');
      const ink = rectOf([h1, back]);
      const size = 76, space = cw - ink.r;
      if (space < size + 28) { cv.style.display = 'none'; if (mark) mark.style.display = 'none'; geo = null; return; }
      const hCss = inkRect(h1).bottom + scrollY + 14;
      cv.style.display = ''; cv.style.height = hCss + 'px'; W = cv.width = Math.round(cw * dpr); H = cv.height = Math.round(hCss * dpr); gl.viewport(0, 0, W, H);
      const R = size / 2, cx = cw - R - 16, cy = Math.min(hCss - R - 6, R + 18);
      Object.assign(mark.style, {display: 'block', width: size + 'px', height: size + 'px', left: (cx - R) + 'px', top: (cy - R) + 'px'});
      geo = {c: [cx * dpr, H - cy * dpr], R: R * dpr, k: 40, maxR: R * 2.6 * dpr,
             box: [((ink.l + ink.r) / 2) * dpr, H - ((ink.t + ink.b) / 2) * dpr], half: [((ink.r - ink.l) / 2 + 12) * dpr, ((ink.b - ink.t) / 2 + 8) * dpr]};
      return;
    }
    const bio = prof && prof.querySelector('.bio');
    const bioTop = bio ? bio.getBoundingClientRect().top : Infinity;
    // the header's real ink: the name, the link icons and the chips, whatever wrapper they sit in
    const inks = prof ? [h1, ...prof.querySelectorAll('.links a, .links > *, .meta > *')].filter(e => e.getBoundingClientRect().top < bioTop) : [h1];
    const txt = rectOf(inks);
    const clear = bio ? rectOf([...inks, bio]) : txt;
    const hCss = prof ? Math.max(txt.b + 90, 360) : Math.min(Math.max(txt.b + 140, 260), innerHeight * 0.85);
    cv.style.height = hCss + 'px';
    W = cv.width = Math.round(cw * dpr); H = cv.height = Math.round(hCss * dpr);
    gl.viewport(0, 0, W, H);
    let cx = cw * 0.86, cy = hCss * 0.38, R = 0;
    if (mark) {
      const space = cw - Math.max(txt.r, clear.r), size = Math.min(230, space - 70);
      if (size >= 150) {
        R = size / 2; cx = txt.r + space / 2; cy = Math.max(R + 30, (txt.t + txt.b) / 2);
        Object.assign(mark.style, {display: 'block', width: size + 'px', height: size + 'px', left: (cx - R) + 'px', top: (cy - R) + 'px'});
      } else { mark.style.display = 'none'; cx = cw * 0.9; }
    }
    geo = {c: [cx * dpr, H - cy * dpr], R: R * dpr, k: prof ? 26 : 18, maxR: 0,
           box: [((clear.l + clear.r) / 2) * dpr, H - ((clear.t + clear.b) / 2) * dpr],
           half: [((clear.r - clear.l) / 2 + 24) * dpr, ((clear.b - clear.t) / 2 + 16) * dpr]};
  };
  measure();
  addEventListener('resize', measure);
  if (stage && 'MutationObserver' in window) new MutationObserver(() => setTimeout(measure, 30)).observe(stage, {attributes: true, attributeFilter: ['class'], subtree: true, childList: true});
  document.fonts && document.fonts.ready.then(measure);
  setTimeout(measure, 1500);   // late layout (embeds, images) can push the header around
  let visible = true, running = false, last = 0, speed = 1.6, phase = 0;
  const t0 = performance.now();
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(cv);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  function frame(now){
    if (!visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    if (!geo || now - last < 1000 / (small ? 30 : 60) - 1) return; last = now;
    const t = (now - t0) / 1000, beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 6);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uC, geo.c[0], geo.c[1]); gl.uniform1f(U.uT, phase); gl.uniform1f(U.uBeat, beat);
    gl.uniform2f(U.uBox, geo.box[0], geo.box[1]); gl.uniform2f(U.uHalf, geo.half[0], geo.half[1]);
    gl.uniform1f(U.uCell, Math.max(12 * dpr, W / 90)); gl.uniform1f(U.uR, geo.R); gl.uniform1f(U.uK, geo.k); gl.uniform1f(U.uMaxR, geo.maxR);
    const live = stage && (stage.classList.contains('listening') || stage.classList.contains('finding'));
    speed += ((live ? 4.2 : 1.6) - speed) * 0.05; phase += speed / (small ? 30 : 60); gl.uniform1f(U.uSpeed, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3); cv.classList.add('on');
    if (wave && mark.style.display !== 'none') {
      wave.setAttribute('points', base.map(([x, y], i) => (i < 2 || i > base.length - 3) ? x + ',' + y
        : x + ',' + (120 + (y - 120) * (0.8 + 0.22 * Math.sin(t * 1.7 - i * 0.62) + 0.08 * beat)).toFixed(1)).join(' '));
      dot.setAttribute('r', (18 + 2.5 * beat).toFixed(2));
    }
  }
  function kick(){ if (!running) { running = true; requestAnimationFrame(frame); } }
  kick();
})();
