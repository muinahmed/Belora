// Homepage banner in 3D: a lipstick, gold rings, a compact and a pearl bracelet float and
// turn slowly, leaning towards the mouse. Drawn with plain WebGL (no library), so the page
// stays light. The banner photo stays underneath and is shown instead when the visitor
// asks for less motion, has data saver on, or the device can't draw WebGL.
(() => {
  const hero = document.querySelector(".hero");
  const canvas = hero?.querySelector(".hero-3d");
  if (!canvas) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.connection?.saveData) return;

  const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) return;

  // ---------- Small matrix helpers (column-major 4x4) ----------
  const multiply = (a, b) => {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
        out[col * 4 + row] = sum;
      }
    }
    return out;
  };
  const translation = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  const scaling = (s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
  const rotationX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
  const rotationY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
  const rotationZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
  const chain = (...matrices) => matrices.reduce(multiply);
  const perspective = (fovY, aspect, near, far) => {
    const f = 1 / Math.tan(fovY / 2), range = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (near + far) * range, -1, 0, 0, 2 * near * far * range, 0]);
  };

  // ---------- Shapes ----------
  // A shape turned on a lathe around the y axis. Each outline runs bottom to top as [radius, y]
  // points; separate outlines meet at sharp edges.
  const lathe = (outlines, segments = 48, shear = 0) => {
    const positions = [], normals = [], indices = [];
    for (const outline of outlines) {
      const edgeNormals = outline.slice(1).map(([r, y], i) => {
        const dr = r - outline[i][0], dy = y - outline[i][1], length = Math.hypot(dr, dy) || 1;
        return [dy / length, -dr / length];
      });
      const start = positions.length / 3;
      outline.forEach(([r, y], i) => {
        const a = edgeNormals[Math.max(i - 1, 0)], b = edgeNormals[Math.min(i, edgeNormals.length - 1)];
        const nr = a[0] + b[0], ny = a[1] + b[1];
        for (let s = 0; s <= segments; s++) {
          const angle = (s / segments) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
          // An optional slant (y += shear * x) gives the lipstick its cut tip.
          positions.push(r * cos, y + shear * r * cos, r * sin);
          const nx = nr * cos, nz = nr * sin, nyShear = ny, nxShear = nx - shear * ny;
          const length = Math.hypot(nxShear, nyShear, nz) || 1;
          normals.push(nxShear / length, nyShear / length, nz / length);
        }
      });
      for (let i = 0; i < outline.length - 1; i++) {
        for (let s = 0; s < segments; s++) {
          const a = start + i * (segments + 1) + s, b = a + segments + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    return { positions, normals, indices };
  };

  const arc = (cx, cy, radius, from, to, steps) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const angle = from + ((to - from) * i) / steps;
      return [Math.max(cx + radius * Math.cos(angle), 0), cy + radius * Math.sin(angle)];
    });

  const sphere = (radius, steps = 18) => lathe([arc(0, 0, radius, -Math.PI / 2, Math.PI / 2, steps)], 32);

  const torus = (major, minor, segments = 64, sides = 20) => {
    const positions = [], normals = [], indices = [];
    for (let u = 0; u <= segments; u++) {
      const a = (u / segments) * Math.PI * 2;
      for (let v = 0; v <= sides; v++) {
        const b = (v / sides) * Math.PI * 2;
        normals.push(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a));
        positions.push((major + minor * Math.cos(b)) * Math.cos(a), minor * Math.sin(b), (major + minor * Math.cos(b)) * Math.sin(a));
      }
    }
    for (let u = 0; u < segments; u++) {
      for (let v = 0; v < sides; v++) {
        const a = u * (sides + 1) + v, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { positions, normals, indices };
  };

  // A cut gem: flat facets, so every face catches the light separately.
  const gem = (radius) => {
    const outline = [[0, -0.9], [1, 0], [0.62, 0.38], [0, 0.38]].map(([r, y]) => [r * radius, y * radius]);
    const facets = 8, positions = [], normals = [], indices = [];
    const point = (i, s) => {
      const [r, y] = outline[i], angle = (s / facets) * Math.PI * 2 + (i === 2 ? Math.PI / facets : 0);
      return [r * Math.cos(angle), y, r * Math.sin(angle)];
    };
    for (let i = 0; i < outline.length - 1; i++) {
      for (let s = 0; s < facets; s++) {
        for (const triangle of [[point(i, s), point(i + 1, s), point(i, s + 1)], [point(i + 1, s), point(i + 1, s + 1), point(i, s + 1)]]) {
          const [a, b, c] = triangle;
          const u = b.map((value, k) => value - a[k]), v = c.map((value, k) => value - a[k]);
          let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          const length = Math.hypot(...n);
          if (length < 1e-6) continue;
          const centre = [0, 1, 2].map(k => (a[k] + b[k] + c[k]) / 3);
          if (n[0] * centre[0] + n[1] * (centre[1] + radius * 0.2) + n[2] * centre[2] < 0) n = n.map(value => -value);
          for (const corner of triangle) {
            indices.push(positions.length / 3);
            positions.push(...corner);
            normals.push(...n.map(value => value / length));
          }
        }
      }
    }
    return { positions, normals, indices };
  };

  // ---------- Shaders ----------
  // Soft studio lighting: a large window up and to the left, a warm rim from the right, and
  // a cream room for reflections. Gold is fully reflective; pearls get a pink-blue sheen.
  const MESH_VERTEX = `
    attribute vec3 aPosition; attribute vec3 aNormal;
    uniform mat4 uProjection, uView, uModel;
    varying vec3 vNormal, vWorld;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vNormal = (uModel * vec4(aNormal, 0.0)).xyz;
      gl_Position = uProjection * uView * world;
    }`;
  const MESH_FRAGMENT = `
    precision mediump float;
    uniform vec3 uColor, uCamera;
    uniform float uMetal, uGloss, uSheen;
    varying vec3 vNormal, vWorld;
    vec3 room(vec3 r) {
      vec3 c = mix(vec3(0.42, 0.30, 0.24), vec3(1.0, 0.95, 0.88), smoothstep(-0.7, 0.45, r.y));
      c += vec3(1.25, 1.2, 1.12) * smoothstep(0.78, 0.96, dot(r, normalize(vec3(-0.55, 0.65, 0.55))));
      c += vec3(1.0, 0.72, 0.55) * 0.75 * smoothstep(0.86, 0.98, dot(r, normalize(vec3(0.95, 0.05, 0.3))));
      return c;
    }
    void main() {
      vec3 n = normalize(vNormal), v = normalize(uCamera - vWorld);
      vec3 l = normalize(vec3(-0.5, 0.7, 0.6));
      float facing = max(dot(n, v), 0.0);
      float fresnel = pow(1.0 - facing, 5.0);
      vec3 env = room(reflect(-v, n));
      float specular = pow(max(dot(n, normalize(l + v)), 0.0), uGloss);
      vec3 diffuse = uColor * (0.32 + 0.3 * (0.5 + 0.5 * n.y) + 0.55 * max(dot(n, l), 0.0));
      vec3 dielectric = diffuse + env * (0.035 + 0.45 * fresnel) + vec3(specular) * 0.55;
      vec3 metal = uColor * env * 0.92 + uColor * specular * 0.9 + fresnel * 0.25;
      vec3 color = mix(dielectric, metal, uMetal);
      color += uSheen * (vec3(0.55, 0.42, 0.62) * fresnel + vec3(0.12, 0.1, 0.06) * pow(facing, 3.0));
      gl_FragColor = vec4(color, 1.0);
    }`;
  const SPARKLE_VERTEX = `
    attribute vec4 aSparkle;
    uniform mat4 uProjection, uView;
    uniform float uTime, uPixelRatio;
    varying float vGlow;
    void main() {
      vec3 p = aSparkle.xyz;
      p.y += mod(uTime * 0.06 + aSparkle.w * 3.0, 3.6) - 1.8;
      p.x += 0.08 * sin(uTime * 0.5 + aSparkle.w * 12.0);
      vGlow = 0.5 + 0.5 * sin(uTime * 1.6 + aSparkle.w * 40.0);
      gl_Position = uProjection * uView * vec4(p, 1.0);
      gl_PointSize = (3.0 + 5.0 * vGlow) * uPixelRatio;
    }`;
  const SPARKLE_FRAGMENT = `
    precision mediump float;
    varying float vGlow;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d) * (0.25 + 0.55 * vGlow);
      gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a);
    }`;

  const program = (vertexSource, fragmentSource) => {
    const shaders = [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]].map(([type, source]) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    });
    const linked = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(linked, shader));
    gl.linkProgram(linked);
    if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(linked) || "Shader failed");
    const uniforms = {};
    for (let i = 0; i < gl.getProgramParameter(linked, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(linked, i).name;
      uniforms[name] = gl.getUniformLocation(linked, name);
    }
    return { linked, uniforms };
  };

  const buffer = (data, target = gl.ARRAY_BUFFER) => {
    const created = gl.createBuffer();
    gl.bindBuffer(target, created);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return created;
  };

  let meshProgram, sparkleProgram;
  try {
    meshProgram = program(MESH_VERTEX, MESH_FRAGMENT);
    sparkleProgram = program(SPARKLE_VERTEX, SPARKLE_FRAGMENT);
  } catch {
    return;
  }
  const meshPosition = gl.getAttribLocation(meshProgram.linked, "aPosition");
  const meshNormal = gl.getAttribLocation(meshProgram.linked, "aNormal");
  const sparkleAttribute = gl.getAttribLocation(sparkleProgram.linked, "aSparkle");

  const upload = ({ positions, normals, indices }) => ({
    positions: buffer(new Float32Array(positions)),
    normals: buffer(new Float32Array(normals)),
    indices: buffer(new Uint16Array(indices), gl.ELEMENT_ARRAY_BUFFER),
    count: indices.length
  });

  // ---------- Materials ----------
  const GOLD = { color: [0.94, 0.72, 0.42], metal: 1, gloss: 90, sheen: 0 };
  const ROSE_GOLD = { color: [0.93, 0.62, 0.52], metal: 1, gloss: 90, sheen: 0 };
  const PEARL = { color: [0.95, 0.91, 0.86], metal: 0, gloss: 60, sheen: 1 };
  const LIPSTICK_ROSE = { color: [0.66, 0.16, 0.2], metal: 0, gloss: 40, sheen: 0 };
  const LIPSTICK_NUDE = { color: [0.74, 0.42, 0.35], metal: 0, gloss: 40, sheen: 0 };
  const ENAMEL = { color: [0.9, 0.62, 0.6], metal: 0, gloss: 120, sheen: 0.3 };
  const RUBY = { color: [0.85, 0.26, 0.38], metal: 0.35, gloss: 200, sheen: 0.2 };

  // ---------- Pieces ----------
  const lipstickCase = upload(lathe([
    [[0, 0], [0.3, 0]],
    [[0.3, 0], [0.3, 0.7], ...arc(0.27, 0.7, 0.03, 0, Math.PI / 2, 4)],
    [[0.27, 0.73], [0.25, 0.75], [0.25, 0.98], [0.21, 0.98]]
  ]));
  const lipstickBullet = upload(lathe([
    [[0, 0.5], [0.2, 0.5], [0.2, 1.28], ...arc(0.16, 1.28, 0.04, 0, Math.PI / 2, 5), [0, 1.32]]
  ], 48, 0.9));
  const ring = upload(torus(0.42, 0.065));
  const thinRing = upload(torus(0.36, 0.04));
  const setting = upload(torus(0.11, 0.025, 24, 10));
  const stone = upload(gem(0.17));
  const loose = upload(gem(0.22));
  const pearl = upload(sphere(0.1));
  const bigPearl = upload(sphere(0.17));
  const compactShell = upload(lathe([
    [[0, -0.09], [0.58, -0.09], ...arc(0.58, 0, 0.09, -Math.PI / 2, Math.PI / 2, 10), [0, 0.09]]
  ], 64));
  const compactInlay = upload(lathe([[[0.4, 0.092], [0, 0.092]]], 64));
  const compactRim = upload(torus(0.42, 0.018, 64, 8));

  // Each piece: meshes with materials, a resting place in the group, a tilt, and how it moves.
  const pieces = [
    { parts: [[lipstickCase, GOLD], [lipstickBullet, LIPSTICK_ROSE]], at: [0.25, -0.75, 0.3], tilt: [0.15, 0, -0.32], spin: 0.35, bob: 0.08, phase: 0 },
    { parts: [[lipstickCase, ROSE_GOLD], [lipstickBullet, LIPSTICK_NUDE]], at: [-0.75, -1.2, -0.4], tilt: [0.3, 0.8, 0.55], spin: -0.25, bob: 0.06, phase: 2.1, scale: 0.8 },
    { parts: [[ring, GOLD], [setting, GOLD, [0, 0, 0.5]], [stone, RUBY, [0, 0, 0.56], [Math.PI / 2, 0, 0]]], at: [1.35, 0.85, 0], tilt: [Math.PI / 2 - 0.35, 0, 0.25], spin: 0.45, spinAxis: "z", bob: 0.1, phase: 1 },
    { parts: [[thinRing, ROSE_GOLD]], at: [1.55, -0.85, 0.45], tilt: [1.1, 0, -0.4], spin: -0.5, spinAxis: "z", bob: 0.07, phase: 3.3 },
    { parts: [[compactShell, GOLD], [compactInlay, ENAMEL], [compactRim, GOLD, [0, 0.09, 0]]], at: [-0.35, 0.95, -0.5], tilt: [1.05, 0, 0.2], spin: 0.2, bob: 0.06, phase: 4 },
    { parts: Array.from({ length: 17 }, (_, i) => {
      const angle = (i / 17) * Math.PI * 2;
      return [pearl, PEARL, [0.62 * Math.cos(angle), 0, 0.62 * Math.sin(angle)]];
    }), at: [-1.65, 0.3, -0.1], tilt: [1.15, 0, -0.5], spin: 0.3, bob: 0.07, phase: 5.2 },
    { parts: [[bigPearl, PEARL]], at: [-0.55, 0.05, 0.9], tilt: [0, 0, 0], spin: 0, bob: 0.1, phase: 0.6 },
    { parts: [[bigPearl, PEARL]], at: [1.1, -0.05, 0.8], tilt: [0, 0, 0], spin: 0, bob: 0.08, phase: 2.7, scale: 0.6 },
    { parts: [[loose, RUBY]], at: [0.95, -1.35, -0.3], tilt: [0.4, 0, 0.3], spin: 0.6, bob: 0.09, phase: 3.9 }
  ];

  // Floating gold specks drift upwards through the scene.
  const SPARKLES = 70;
  const sparkleData = new Float32Array(SPARKLES * 4);
  for (let i = 0; i < SPARKLES; i++) {
    sparkleData.set([(Math.random() - 0.5) * 5.5, (Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 2.5, Math.random()], i * 4);
  }
  const sparkleBuffer = buffer(sparkleData);

  // ---------- Layout ----------
  // Wide screens: the pieces sit to the right of the headline. Phones: in the upper part of
  // the banner, above the copy at the bottom.
  const CAMERA_DISTANCE = 8;
  const view = translation(0, 0, -CAMERA_DISTANCE);
  let projection, groupCentre = [0, 0, 0], groupScale = 1, pixelRatio = 1;

  const resize = () => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    pixelRatio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = width / height, fov = 0.6;
    projection = perspective(fov, aspect, 0.1, 50);
    const halfHeight = Math.tan(fov / 2) * CAMERA_DISTANCE, halfWidth = halfHeight * aspect;
    const layout = getComputedStyle(hero);
    if (layout.display === "block") {
      // Tablet banner: the scene sits on its own above the copy.
      groupScale = Math.min(halfWidth / 2.4, halfHeight / 2.2);
      groupCentre = [0, 0, 0];
    } else if (aspect >= 1.15) {
      groupScale = Math.min(halfHeight / 2.2, (halfWidth * 0.5) / 2.1);
      groupCentre = [halfWidth * 0.48, -halfHeight * 0.02, 0];
    } else {
      // Phone banner (and tall windows): the copy covers roughly the bottom 45%.
      groupScale = Math.min(halfWidth / 2.25, (halfHeight * 0.55) / 2.1);
      groupCentre = [0, halfHeight * 0.4, 0];
    }
    schedule();
  };

  // ---------- Pointer ----------
  const pointer = { x: 0, y: 0 }, lean = { x: 0, y: 0 };
  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const box = hero.getBoundingClientRect();
    pointer.x = ((event.clientX - box.left) / box.width) * 2 - 1;
    pointer.y = ((event.clientY - box.top) / box.height) * 2 - 1;
  });
  hero.addEventListener("pointerleave", () => { pointer.x = 0; pointer.y = 0; });

  // ---------- Drawing ----------
  const drawMesh = (mesh, material, model) => {
    const u = meshProgram.uniforms;
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3fv(u.uColor, material.color);
    gl.uniform1f(u.uMetal, material.metal);
    gl.uniform1f(u.uGloss, material.gloss);
    gl.uniform1f(u.uSheen, material.sheen);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positions);
    gl.vertexAttribPointer(meshPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normals);
    gl.vertexAttribPointer(meshNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  };

  const draw = (time) => {
    const t = time / 1000;
    lean.x += (pointer.x - lean.x) * 0.05;
    lean.y += (pointer.y - lean.y) * 0.05;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const group = chain(
      translation(...groupCentre),
      rotationY(0.22 * Math.sin(t * 0.17) + lean.x * 0.4),
      rotationX(0.08 * Math.sin(t * 0.13) + lean.y * 0.25),
      scaling(groupScale)
    );

    gl.useProgram(meshProgram.linked);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.enableVertexAttribArray(meshPosition);
    gl.enableVertexAttribArray(meshNormal);
    gl.uniformMatrix4fv(meshProgram.uniforms.uProjection, false, projection);
    gl.uniformMatrix4fv(meshProgram.uniforms.uView, false, view);
    gl.uniform3fv(meshProgram.uniforms.uCamera, [0, 0, CAMERA_DISTANCE]);

    for (const piece of pieces) {
      const [x, y, z] = piece.at;
      const spin = piece.spin * t + piece.phase;
      const [tx, ty, tz] = piece.tilt;
      const placed = chain(
        group,
        translation(x, y + piece.bob * Math.sin(t * 0.9 + piece.phase), z),
        rotationY(ty), rotationX(tx), rotationZ(tz),
        piece.spinAxis === "z" ? rotationZ(spin) : rotationY(spin),
        scaling(piece.scale || 1)
      );
      for (const [mesh, material, offset = [0, 0, 0], turn = [0, 0, 0]] of piece.parts) {
        drawMesh(mesh, material, chain(placed, translation(...offset), rotationX(turn[0]), rotationY(turn[1]), rotationZ(turn[2])));
      }
    }
    gl.disableVertexAttribArray(meshNormal);

    gl.useProgram(sparkleProgram.linked);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const u = sparkleProgram.uniforms;
    gl.uniformMatrix4fv(u.uProjection, false, projection);
    gl.uniformMatrix4fv(u.uView, false, multiply(view, chain(translation(...groupCentre), scaling(groupScale))));
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uPixelRatio, pixelRatio);
    gl.bindBuffer(gl.ARRAY_BUFFER, sparkleBuffer);
    gl.enableVertexAttribArray(sparkleAttribute);
    gl.vertexAttribPointer(sparkleAttribute, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, SPARKLES);
    gl.disableVertexAttribArray(sparkleAttribute);
    gl.depthMask(true);
  };

  // ---------- Running ----------
  // Only animates while the banner is on screen and the tab is visible.
  let frame = 0, onScreen = true, shown = false, lost = false;
  const loop = (time) => {
    frame = 0;
    draw(time);
    if (!shown) {
      shown = true;
      hero.classList.add("is-3d");
      hero.querySelector("picture")?.setAttribute("aria-hidden", "true");
    }
    schedule();
  };
  const schedule = () => {
    if (!frame && projection && onScreen && !lost && !document.hidden) frame = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  canvas.addEventListener("webglcontextlost", () => {
    stop();
    lost = true;
    hero.classList.remove("is-3d");
    hero.querySelector("picture")?.removeAttribute("aria-hidden");
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : schedule()));
  if ("IntersectionObserver" in globalThis) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      onScreen ? schedule() : stop();
    }).observe(hero);
  }
  if ("ResizeObserver" in globalThis) new ResizeObserver(resize).observe(canvas);
  else addEventListener("resize", resize);

  resize();
})();
