(() => {
  const canvas = document.getElementById("bg");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });

  // Respect reduced motion
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let w = 0, h = 0, dpr = 1;

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = Math.floor(window.innerWidth);
    h = Math.floor(window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();

  // --- Build a jittered grid in 3D (z adds “manifold” depth) ---
  const cols = 28;
  const rows = 18;
  const points = [];
  const base = [];

  // 3D helpers
  const rand = (a, b) => a + Math.random() * (b - a);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const nx = (x / (cols - 1)) * 2 - 1; // -1..1
      const ny = (y / (rows - 1)) * 2 - 1;
      // Start as a plane, then “warp” it
      const px = nx * 1.25;
      const py = ny * 0.8;
      const pz =
        0.35 * Math.sin(nx * 2.6) +
        0.35 * Math.cos(ny * 2.2) +
        0.20 * Math.sin((nx + ny) * 3.1);

      const jx = rand(-0.03, 0.03);
      const jy = rand(-0.03, 0.03);
      const jz = rand(-0.04, 0.04);

      base.push({ x: px + jx, y: py + jy, z: pz + jz });
      points.push({ x: px + jx, y: py + jy, z: pz + jz });
    }
  }

  // Edge list (grid neighbors)
  const edges = [];
  const idx = (x, y) => y * cols + x;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) edges.push([idx(x, y), idx(x + 1, y)]);
      if (y + 1 < rows) edges.push([idx(x, y), idx(x, y + 1)]);
      // a few diagonals for “mesh” feel
      if (x + 1 < cols && y + 1 < rows && (x + y) % 3 === 0)
        edges.push([idx(x, y), idx(x + 1, y + 1)]);
    }
  }

  // Project 3D to 2D
  function project(p, rotY, rotX) {
    // rotate around Y
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    let x = p.x * cy + p.z * sy;
    let z = -p.x * sy + p.z * cy;

    // rotate around X
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    let y = p.y * cx - z * sx;
    z = p.y * sx + z * cx;

    // perspective
    const camera = 2.7;           // distance
    const depth = camera / (camera + z);
    const sx2 = (x * depth) * (Math.min(w, h) * 0.42) + w * 0.5;
    const sy2 = (y * depth) * (Math.min(w, h) * 0.42) + h * 0.5;
    return { x: sx2, y: sy2, z };
  }

  function draw(t) {
    // background clear (keep it subtle)
    ctx.clearRect(0, 0, w, h);

    // subtle vignette / fog
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
    grad.addColorStop(0, "rgba(255,255,255,0.05)");
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const time = t * 0.001;

    const rotY = 0.35 + Math.sin(time * 0.22) * 0.15;
    const rotX = 0.12 + Math.cos(time * 0.18) * 0.10;

    // animate the surface slightly (“breathing” manifold)
    for (let i = 0; i < points.length; i++) {
      const b = base[i];
      points[i].x = b.x;
      points[i].y = b.y;
      points[i].z = b.z + 0.08 * Math.sin(time * 0.9 + b.x * 3.0 + b.y * 2.0);
    }

    // pre-project points
    const proj = new Array(points.length);
    let zmin = Infinity, zmax = -Infinity;

    for (let i = 0; i < points.length; i++) {
      const p2 = project(points[i], rotY, rotX);
      proj[i] = p2;
      zmin = Math.min(zmin, p2.z);
      zmax = Math.max(zmax, p2.z);
    }

    // draw lines
    ctx.lineWidth = 1;

    for (let e = 0; e < edges.length; e++) {
      const a = proj[edges[e][0]];
      const b = proj[edges[e][1]];

      // fade with depth (closer = brighter)
      const z = (a.z + b.z) * 0.5;
      const zn = (z - zmin) / (zmax - zmin + 1e-6); // 0..1
      const alpha = 0.10 + (1 - zn) * 0.22;

      ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // optional: a few “highlight” points
    for (let i = 0; i < proj.length; i += 19) {
      const p = proj[i];
      const zn = (p.z - zmin) / (zmax - zmin + 1e-6);
      const r = 1.2 + (1 - zn) * 1.2;
      const a = 0.05 + (1 - zn) * 0.10;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(t) {
    draw(t);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  if (!reduceMotion) requestAnimationFrame(loop);
  else draw(0); // static frame if reduced motion
})();
