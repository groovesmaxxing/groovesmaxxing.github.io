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
  const SKIP = 'header,nav,footer,script,style,.top,.gmx-tabs,[hidden]';
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
  const list = [...targets].filter(el => el.getBoundingClientRect().top > fold).slice(0, 500);
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
  document.querySelectorAll('.v, .ev, .letterhead, .issues > *, .list > li, .card, .lane, .cluster, .pod, .serie').forEach(el => el.classList.add('gmx-lift'));

  /* halftone ripple field behind the page title */
  const h1 = document.querySelector('h1'); if (!h1 || RM || small) return;   // phones keep the text clear, the field is a desktop thing
  const cv = document.createElement('canvas'); cv.className = 'gmx-fx'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const gl = cv.getContext('webgl', {antialias: false, alpha: true, premultipliedAlpha: false});
  if (!gl) return;
  const FS = `
precision highp float;
uniform vec2 uRes; uniform vec2 uC; uniform float uT; uniform float uBeat; uniform vec2 uBox; uniform vec2 uHalf; uniform float uCell;
const vec3 RED = vec3(1.0,0.110,0.008); const vec3 DEEP = vec3(0.8,0.078,0.0); const vec3 DAY = vec3(0.949,0.949,0.937);
void main(){
  vec2 p = gl_FragCoord.xy; float m = min(uRes.x, uRes.y*2.2); float cell = uCell;
  float row = floor(p.y/cell); float off = mod(row,2.0)*0.5*cell;
  vec2 cc = vec2((floor((p.x+off)/cell)+0.5)*cell - off, (row+0.5)*cell);
  float d = length(cc-uC)/m;
  float ph = d*18.0 - uT*1.6;
  float v = 0.5+0.5*sin(ph);
  vec2 q = abs(cc-uBox)-uHalf; float box = length(max(q,0.0))+min(max(q.x,q.y),0.0);
  float env = smoothstep(0.0, 0.10*m, box) * smoothstep(0.0, 0.35, p.y/uRes.y) * (1.0 - smoothstep(0.25, 0.75, d));
  float r = cell*0.5*clamp(v*env*(0.88+0.18*uBeat),0.0,1.0);
  float a = 1.0 - smoothstep(r-0.9, r+0.6, length(p-cc));
  float band = mod(floor(ph/6.2831853),3.0);
  vec3 col = band<0.5 ? RED : (band<1.5 ? DAY : DEEP);
  gl_FragColor = vec4(col, a*0.8);
}`;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const al = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ['uRes','uC','uT','uBeat','uBox','uHalf','uCell'].forEach(n => U[n] = gl.getUniformLocation(pr, n));
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const dpr = Math.min(devicePixelRatio || 1, small ? 1 : 1.5);
  let W = 0, H = 0, geo = null;
  const measure = () => {
    const r = h1.getBoundingClientRect(), top = r.top + scrollY;
    const hCss = Math.min(Math.max(top + r.height + 140, 260), innerHeight * 0.85);
    cv.style.height = hCss + 'px';
    W = cv.width = Math.round(document.documentElement.clientWidth * dpr); H = cv.height = Math.round(hCss * dpr);
    gl.viewport(0, 0, W, H);
    // ripple source sits off the top right, the title keeps a clear pocket
    geo = {c: [W * (small ? 0.95 : 0.86), H * 0.62], box: [(r.left + r.width / 2) * dpr, H - (top + r.height / 2) * dpr], half: [(r.width / 2 + 24) * dpr, (r.height / 2 + 16) * dpr]};
  };
  measure();
  addEventListener('resize', measure);
  document.fonts && document.fonts.ready.then(measure);
  let visible = true, running = false, last = 0;
  const t0 = performance.now(), cap = small ? 30 : 60;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(cv);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  function frame(now){
    if (!visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    if (now - last < 1000 / cap - 1) return; last = now;
    const t = (now - t0) / 1000, beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 6);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uC, geo.c[0], geo.c[1]); gl.uniform1f(U.uT, t); gl.uniform1f(U.uBeat, beat);
    gl.uniform2f(U.uBox, geo.box[0], geo.box[1]); gl.uniform2f(U.uHalf, geo.half[0], geo.half[1]);
    gl.uniform1f(U.uCell, Math.max(12 * dpr, W / 90));
    gl.drawArrays(gl.TRIANGLES, 0, 3); cv.classList.add('on');
  }
  function kick(){ if (!running) { running = true; requestAnimationFrame(frame); } }
  kick();
})();
