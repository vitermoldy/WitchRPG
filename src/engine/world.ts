import * as THREE from 'three'
import { Colliders, type Box } from './collide'
import { WORLD } from '../game/balance'

export interface PropSpot {
  kind: 'car' | 'crate'
  x: number
  z: number
  yaw: number
  stack?: number
}

export interface WorldBuild {
  colliders: Colliders
  portals: THREE.Vector3[]
  playerStart: THREE.Vector3
  props: PropSpot[]
  breakables: Box[]
  update: (t: number) => void
  keyLight: THREE.DirectionalLight
  riftDir: THREE.Vector3
}

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

/** Asphalt with two crossing roads, sidewalks, cracks and the glowing rift fractures. */
function groundTextures(size: number, half: number, cracksAt: THREE.Vector3[]) {
  const R = rand(7)
  const { c, g } = canvas(size, size)
  const { c: ec, g: eg } = canvas(size, size)
  const px = (m: number) => ((m + half) / (half * 2)) * size
  g.fillStyle = '#2a2527'
  g.fillRect(0, 0, size, size)
  // Roads.
  const road = 6.5
  g.fillStyle = '#1a1617'
  g.fillRect(px(-road), 0, px(road) - px(-road), size)
  g.fillRect(0, px(-road), size, px(road) - px(-road))
  // Plaza disc in the middle.
  g.beginPath()
  g.arc(px(0), px(0), (size / (half * 2)) * 11, 0, Math.PI * 2)
  g.fillStyle = '#242022'
  g.fill()
  // Paving joints on the sidewalks.
  g.strokeStyle = 'rgba(0,0,0,0.22)'
  g.lineWidth = 1
  for (let m = -half; m <= half; m += 2.5) {
    g.beginPath()
    g.moveTo(px(m), 0)
    g.lineTo(px(m), size)
    g.stroke()
    g.beginPath()
    g.moveTo(0, px(m))
    g.lineTo(size, px(m))
    g.stroke()
  }
  g.fillStyle = '#1a1617'
  g.fillRect(px(-road), 0, px(road) - px(-road), size)
  g.fillRect(0, px(-road), size, px(road) - px(-road))
  // Lane dashes, worn.
  g.fillStyle = 'rgba(190,180,170,0.28)'
  for (let m = -half; m < half; m += 4) {
    if (Math.abs(m) < 12) continue
    g.fillRect(px(-0.12), px(m), px(0.12) - px(-0.12), px(m + 2) - px(m))
    g.fillRect(px(m), px(-0.12), px(m + 2) - px(m), px(0.12) - px(-0.12))
  }
  // Curbs.
  g.fillStyle = '#39332f'
  for (const s of [-1, 1]) {
    g.fillRect(px(s * road) - 2, 0, 4, size)
    g.fillRect(0, px(s * road) - 2, size, 4)
  }
  // Grain.
  for (let i = 0; i < size * size * 0.05; i++) {
    const v = R()
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,230,0.035)'
    g.fillRect(R() * size, R() * size, 1 + R() * 2, 1 + R() * 2)
  }
  // Ordinary cracks.
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  for (let i = 0; i < 70; i++) {
    let x = R() * size
    let y = R() * size
    let a = R() * Math.PI * 2
    g.lineWidth = 1 + R() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 12; k++) {
      a += (R() - 0.5) * 1.2
      x += Math.cos(a) * 9
      y += Math.sin(a) * 9
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // Rift fractures: emissive map only, so they glow without lighting.
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, size, size)
  for (const at of cracksAt) {
    for (let i = 0; i < 9; i++) {
      const x = px(at.x)
      const y = px(at.z)
      const a = (i / 9) * Math.PI * 2 + R() * 0.5
      const len = 10 + R() * 18
      for (const pass of [0, 1]) {
        eg.strokeStyle = pass === 0 ? 'rgba(255,40,60,0.22)' : 'rgba(255,110,100,0.85)'
        g.strokeStyle = 'rgba(0,0,0,0.8)'
        eg.lineWidth = pass === 0 ? 5 : 1.5
        g.lineWidth = 3
        let cx = x
        let cy = y
        let ca = a
        const R2 = rand(i * 31 + Math.round(at.x * 7 + at.z * 13))
        eg.beginPath()
        g.beginPath()
        eg.moveTo(cx, cy)
        g.moveTo(cx, cy)
        for (let k = 0; k < len; k++) {
          ca += (R2() - 0.5) * 0.9
          cx += Math.cos(ca) * 7
          cy += Math.sin(ca) * 7
          eg.lineTo(cx, cy)
          g.lineTo(cx, cy)
        }
        eg.stroke()
        if (pass === 1) g.stroke()
      }
    }
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const emissive = new THREE.CanvasTexture(ec)
  emissive.colorSpace = THREE.SRGBColorSpace
  return { map, emissive }
}

/** Facade with a window grid. A few windows still burn: the city was emptied, not dead. */
function facadeTextures(seed: number) {
  const R = rand(seed)
  const { c, g } = canvas(256, 512)
  const { c: ec, g: eg } = canvas(256, 512)
  const base = ['#2b2629', '#262225', '#302a2a', '#232123'][seed % 4]
  g.fillStyle = base
  g.fillRect(0, 0, 256, 512)
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, 256, 512)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.025)'
    g.fillRect(R() * 256, R() * 512, 2, 2)
  }
  const cols = 4
  const rows = 8
  for (let r = 0; r < rows; r++) {
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(0, r * 64 + 58, 256, 6)
    for (let k = 0; k < cols; k++) {
      const x = 14 + k * 60
      const y = 10 + r * 64
      g.fillStyle = '#0d0b0c'
      g.fillRect(x, y, 40, 42)
      const v = R()
      if (v < 0.1) {
        eg.fillStyle = v < 0.025 ? '#ff4d4d' : '#ffa05a'
        eg.globalAlpha = 0.35 + R() * 0.5
        eg.fillRect(x + 2, y + 2, 36, 38)
        eg.globalAlpha = 1
        g.fillStyle = '#3a2a22'
        g.fillRect(x + 2, y + 2, 36, 38)
      } else if (v < 0.22) {
        // Broken pane.
        g.fillStyle = '#1b1718'
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + 40 * R(), y + 42)
        g.lineTo(x + 40, y + 42 * R())
        g.fill()
      }
    }
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  const emissive = new THREE.CanvasTexture(ec)
  emissive.colorSpace = THREE.SRGBColorSpace
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping
  return { map, emissive }
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uRift;
  uniform float uTime;
  void main() {
    float h = vDir.y;
    vec3 top = vec3(0.025, 0.012, 0.03);
    vec3 mid = vec3(0.085, 0.02, 0.03);
    vec3 low = vec3(0.07, 0.03, 0.035);
    vec3 col = mix(low, mid, smoothstep(-0.05, 0.12, h));
    col = mix(col, top, smoothstep(0.15, 0.75, h));
    float r = max(0.0, dot(vDir, normalize(uRift)));
    col += vec3(0.42, 0.03, 0.05) * pow(r, 8.0) * 0.5;
    col += vec3(0.2, 0.06, 0.3) * pow(r, 40.0) * 0.45;
    gl_FragColor = vec4(col, 1.0);
  }
`

export const TEAR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
/** A torn lens of space: black core, violet sparks, crimson rim that the bloom picks up. */
export const TEAR_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpen;
  uniform float uSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float width = (1.0 - p.y * p.y) * 0.42 * uOpen;
    float edge = fbm(vec2(p.y * 6.0, uTime * 0.35)) * 0.28 - 0.14;
    float d = abs(p.x + edge * 0.6) - width;
    float rim = smoothstep(0.09, 0.0, abs(d)) ;
    float inside = smoothstep(0.02, -0.04, d);
    float swirl = fbm(vec2(p.x * 3.0 + uTime * 0.2, p.y * 5.0 - uTime * 0.5));
    vec3 core = mix(vec3(0.01, 0.0, 0.02), vec3(0.35, 0.12, 0.6), pow(swirl, 3.0) * 1.6);
    vec3 rimCol = mix(vec3(1.6, 0.12, 0.2), vec3(2.4, 0.9, 0.7), rim * rim);
    vec3 col = core * inside + rimCol * rim;
    float a = max(inside, rim) * smoothstep(1.0, 0.85, abs(p.y));
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`

export function makeTearMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uSeed: { value: seed } },
    vertexShader: TEAR_VERT,
    fragmentShader: TEAR_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

export function buildWorld(scene: THREE.Scene): WorldBuild {
  const half = WORLD.arenaHalf
  const colliders = new Colliders()
  const R = rand(1234)
  const riftDir = new THREE.Vector3(0.25, 0.42, -1).normalize()
  const portals = [new THREE.Vector3(0, 0, -33), new THREE.Vector3(33, 0, 0), new THREE.Vector3(0, 0, 33), new THREE.Vector3(-33, 0, 0)]

  scene.background = new THREE.Color(0x0b0507)
  scene.fog = new THREE.FogExp2(0x1a0a0e, 0.0135)

  // Sky dome.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uRift: { value: riftDir }, uTime: { value: 0 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  )
  scene.add(sky)

  // The great tear in the sky.
  const tearMat = makeTearMaterial(3.1)
  ;(tearMat as THREE.ShaderMaterial & { fog: boolean }).fog = false
  const tear = new THREE.Mesh(new THREE.PlaneGeometry(70, 150), tearMat)
  tear.position.copy(riftDir.clone().multiplyScalar(250))
  tear.lookAt(0, 0, 0)
  tear.rotateZ(0.35)
  scene.add(tear)

  // Light: dim crimson sky fill, a red key light from the tear, cold violet bounce.
  scene.add(new THREE.HemisphereLight(0x5c3a42, 0x140c12, 1.1))
  const amb = new THREE.AmbientLight(0x3a2a48, 0.75)
  scene.add(amb)
  const key = new THREE.DirectionalLight(0xff8268, 1.7)
  key.position.copy(riftDir.clone().multiplyScalar(60))
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const sc = key.shadow.camera
  sc.left = sc.bottom = -46
  sc.right = sc.top = 46
  sc.near = 1
  sc.far = 160
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.04
  scene.add(key)
  scene.add(key.target)

  // Ground.
  const crackSpots = [...portals, new THREE.Vector3(0, 0, 0)]
  const gt = groundTextures(2048, 50, crackSpots)
  const groundMat = new THREE.MeshStandardMaterial({
    map: gt.map,
    emissiveMap: gt.emissive,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 1,
    roughness: 0.93,
    metalness: 0,
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  // Far ground beyond the arena so the fog has something to swallow.
  const far = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x141011, roughness: 1 }))
  far.rotation.x = -Math.PI / 2
  far.position.y = -0.02
  scene.add(far)

  const concrete = new THREE.MeshStandardMaterial({ color: 0x4a4446, roughness: 0.95, flatShading: true })
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x242022, roughness: 0.6, metalness: 0.5, flatShading: true })
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x3b3236, roughness: 0.8, metalness: 0.3, flatShading: true })
  const stripe = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 })
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0x100806, emissive: 0xffa060, emissiveIntensity: 2.2 })

  const solid = (mesh: THREE.Mesh) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }

  // Perimeter buildings, inner faces on the arena edge, gaps at the four road ends.
  const facades = [0, 1, 2, 3].map((i) => facadeTextures(10 + i))
  for (let side = 0; side < 4; side++) {
    let along = -60
    while (along < 60) {
      const w = 11 + R() * 9
      const centre = along + w / 2
      along += w + 0.6
      if (Math.abs(centre) < 8 + w / 2) continue
      const h = 16 + R() * 34
      const depth = 14
      const inset = half + 1.5 + R() * 2.5 + depth / 2
      const f = facades[Math.floor(R() * 4)]
      const mapW = f.map.clone()
      mapW.repeat.set(w / 12, h / 24)
      mapW.needsUpdate = true
      const em = f.emissive.clone()
      em.repeat.copy(mapW.repeat)
      em.needsUpdate = true
      const mat = new THREE.MeshStandardMaterial({ map: mapW, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9 })
      const m = new THREE.Mesh(new THREE.BoxGeometry(side % 2 === 0 ? w : depth, h, side % 2 === 0 ? depth : w), mat)
      const sx = side === 1 ? inset : side === 3 ? -inset : centre
      const sz = side === 0 ? -inset : side === 2 ? inset : centre
      m.position.set(sx, h / 2, sz)
      m.receiveShadow = true
      scene.add(m)
      // Roof clutter for a broken skyline.
      if (R() < 0.6) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(3 + R() * 4, 2 + R() * 3, 3 + R() * 3), darkMetal)
        cap.position.set(sx + (R() - 0.5) * 4, h + 1, sz + (R() - 0.5) * 4)
        scene.add(cap)
      }
    }
  }
  // Rubble mounds close the four streets behind each portal.
  for (const p of portals) {
    const across = Math.abs(p.x) > 1 ? 'z' : 'x'
    for (let i = 0; i < 9; i++) {
      const s = 1.5 + R() * 2.5
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), concrete)
      const off = (R() - 0.5) * 16
      rock.position.set(
        p.x * 1.2 + (across === 'x' ? off : (R() - 0.5) * 3),
        s * 0.5,
        p.z * 1.2 + (across === 'z' ? off : (R() - 0.5) * 3),
      )
      rock.rotation.set(R() * 3, R() * 3, R() * 3)
      solid(rock)
    }
  }
  // The arena edge itself.
  const wall = half + 0.5
  colliders.add(0, -wall, wall * 2 + 2, 1, 60)
  colliders.add(0, wall, wall * 2 + 2, 1, 60)
  colliders.add(-wall, 0, 1, wall * 2 + 2, 60)
  colliders.add(wall, 0, 1, wall * 2 + 2, 60)

  // Central monument: a plinth you can stand on and a cracked obelisk leaning out of it.
  const plinth = solid(new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 7), concrete))
  plinth.position.set(0, 0.55, 0)
  colliders.add(0, 0, 7, 7, 1.1)
  const obelisk = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, 8, 4, 1), concrete))
  obelisk.position.set(0.3, 4.6, -0.4)
  obelisk.rotation.set(0.12, 0.6, -0.09)
  colliders.add(0.3, -0.4, 2, 2, 9)

  // Jersey barriers: low, standable cover.
  const barrierSpots: [number, number, number][] = [
    [-9, -9, 0], [9, 9, 0], [-20, 10, 1], [20, -12, 1], [0, 26, 0], [26, 22, 1], [-26, -22, 0], [14, -24, 0], [-14, 24, 0],
  ]
  for (const [x, z, rot] of barrierSpots) {
    const w = rot ? 0.7 : 3.2
    const d = rot ? 3.2 : 0.7
    const b = solid(new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), concrete))
    b.position.set(x, 0.45, z)
    const s = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), stripe)
    s.position.set(x, 0.62, z)
    scene.add(s)
    colliders.add(x, z, w, d, 0.9)
  }

  // Thin cover panels that Chaos Burst knocks over.
  const breakables: Box[] = []
  const panelSpots: [number, number, number][] = [
    [-11, -2, 1], [12, 5, 1], [-2, -13, 0], [4, 14, 0], [-22, 20, 0], [23, -21, 1], [-24, -8, 1], [22, 8, 0],
  ]
  for (const [x, z, rot] of panelSpots) {
    const w = rot ? 0.22 : 2.9
    const d = rot ? 2.9 : 0.22
    const mesh = solid(new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), panelMat))
    mesh.position.set(x, 0.9, z)
    breakables.push(colliders.add(x, z, w, d, 1.8, { breakable: true, mesh }))
  }

  // Bus shelters.
  for (const [x, z] of [[-28, 9], [28, -7]] as const) {
    const roof = solid(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 4.4), darkMetal))
    roof.position.set(x, 2.6, z)
    const back = solid(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 4.4), panelMat))
    back.position.set(x + (x < 0 ? -0.85 : 0.85), 1.3, z)
    colliders.add(x + (x < 0 ? -0.85 : 0.85), z, 0.3, 4.4, 2.6)
  }

  // Street lamps, the only warm light left. Emissive only; real lights stay in the pool.
  const lampSpots: [number, number][] = [[-8, -8], [8, -8], [-8, 8], [8, 8], [-21, -8], [21, 8], [8, 21], [-8, -21], [-21, 21], [21, -21]]
  for (const [x, z] of lampSpots) {
    const pole = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5, 6), darkMetal))
    pole.position.set(x, 2.5, z)
    const tilt = R() < 0.4 ? (R() - 0.5) * 0.5 : 0
    pole.rotation.z = tilt
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), R() < 0.3 ? darkMetal : lampGlow)
    head.position.set(x + Math.sin(-tilt) * 2.5, 5, z)
    scene.add(head)
    colliders.add(x, z, 0.3, 0.3, 5)
  }

  // Reality is bent here: chunks of street float above the plaza.
  const floaters: { m: THREE.Mesh; base: number; spin: THREE.Vector3; phase: number }[] = []
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3234, roughness: 0.9, flatShading: true })
  for (let i = 0; i < 26; i++) {
    const s = 0.8 + R() * 3.2
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat)
