(() => {
  const canvas = document.getElementById("bg");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });

  // Respect reduced motion
  const reduceMotion =
    window.matchMedia &&
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

  // ---------- Torus mesh setup ----------
  const segU = 64; // around the donut
  const segV = 24; // around the tube

  // Base torus radii (in "scene units")
  const R = 1.05; // major radius
  const r0 = 0.42; // minor radius

  // Build param grid indices
  const points = new Array(segU * segV);
  const baseUV = new Array(segU * segV);

  const idx = (u, v) => (v * segU + u);

  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) {
      const U = (u / segU) * Math.PI * 2;
      const V = (v / segV) * Math.PI * 2;
      baseUV[idx(u, v)] = { U, V };
      points[idx(u, v)] = { x: 0, y: 0, z: 0 };
    }
  }

  // Create edges (wrap around)
  const edges = [];
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) {
      const u1 = (u + 1) % segU;
      const v1 = (v + 1) % segV;

      edges.push([idx(u, v), idx(u1, v)]);  // along U
      edges.push([idx(u, v), idx(u, v1)]);  // along V

      // occasional diagonals for extra mesh vibe
      if ((u + v) % 5 === 0) edges.push([idx(u, v), idx(u1, v1)]);
    }
  }

  // ---------- 3D helpers ----------
  function rotateY(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
  }

  function rotateX(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  }

  function rotateZ(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  }

  function project(p) {
    // perspective projection
    const camera = 3.0;
    const depth = camera / (camera + p.z);
    const scale = Math.min(w, h) * 0.38;

    return {
      x: p.x * depth * scale + w * 0.5,
      y: p.y * depth * scale + h * 0.5,
      z: p.z
    };
  }

  // ---------- Render loop ----------
  // 1 RPM = 2π radians per 60 seconds
  const omega = (Math.PI * 2) / 60;

  function draw(ts) {
    ctx.clearRect(0, 0, w, h);

    // subtle grayscale fog/vignette
    const grad = ctx.createRadialGradient(
      w * 0.5, h * 0.35, 0,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.75
    );
    grad.addColorStop(0, "rgba(255,255,255,0.055)");
    grad.addColorStop(1, "rgba(0,0,0,0.40)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const t = ts * 0.001; // seconds

    // Exactly 1 RPM rotation (about Y)
    const rotY = omega * t;

    // Slow additional wobble so it feels alive (subtle!)
    const wobX = 0.18 + Math.sin(t * 0.12) * 0.08;
    const wobZ = -0.12 + Math.cos(t * 0.10) * 0.06;

    // Bending / breathing:
    // - minor radius pulses
    // - a gentle "bend" along the major ring (adds that manifold feel)
    const pulse = 1.0 + 0.10 * Math.sin(t * 0.6); // breathing
    const bendAmt = 0.18 + 0.05 * Math.sin(t * 0.22); // slow bend

    // Update points in 3D
    for (let i = 0; i < points.length; i++) {
      const { U, V } = baseUV[i];

      // tube radius varies slightly along U and time
      const r = r0 * pulse * (1.0 + 0.07 * Math.sin(3 * U + t * 0.9));

      // base torus
      let x = (R + r * Math.cos(V)) * Math.cos(U);
      let z = (R + r * Math.cos(V)) * Math.sin(U);
      let y = r * Math.sin(V);

      // add a gentle bend: push y and z a bit based on U (and time)
      // feels like the torus is flexing rather than perfectly rigid
      y += bendAmt * 0.35 * Math.sin(U + t * 0.25);
      z += bendAmt * 0.25 * Math.cos(2 * U - t * 0.2);

      // apply global rotations
      let p = { x, y, z };
      p = rotateY(p, rotY);
      p = rotateX(p, wobX);
      p = rotateZ(p, wobZ);

      points[i].x = p.x;
      points[i].y = p.y;
      points[i].z = p.z;
    }

    // Project points, track depth for nice fading
    const proj = new Array(points.length);
    let zmin = Infinity, zmax = -Infinity;

    for (let i = 0; i < points.length; i++) {
      const p2 = project(points[i]);
      proj[i] = p2;
      zmin = Math.min(zmin, p2.z);
      zmax = Math.max(zmax, p2.z);
    }

    // Draw mesh lines
    ctx.lineWidth = 1;

    for (let e = 0; e < edges.length; e++) {
      const a = proj[edges[e][0]];
      const b = proj[edges[e][1]];

      const z = (a.z + b.z) * 0.5;
      const zn = (z - zmin) / (zmax - zmin + 1e-6); // 0..1
      const alpha = 0.08 + (1 - zn) * 0.26;

      ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // A few faint “spark” points for depth cues
    for (let i = 0; i < proj.length; i += 37) {
      const p = proj[i];
      const zn = (p.z - zmin) / (zmax - zmin + 1e-6);
      const r = 1.0 + (1 - zn) * 1.4;
      const a = 0.04 + (1 - zn) * 0.11;

      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(ts) {
    draw(ts);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  if (!reduceMotion) requestAnimationFrame(loop);
  else draw(0);
})();
