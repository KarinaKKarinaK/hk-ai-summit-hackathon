import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { flow } from '@/components/Dither'

export const L = 1 // length of each arm link
const SHOULDER_Y = 0.5 // height of the shoulder axle above the table
export const GRIP = 0.4 // wrist axle to fingertips
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/** Draw on a small canvas and hand it back as a repeating texture. */
function texture(size: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
/** Brushed metal: fine streaks along one direction, plus pits. Used as both the bump and the roughness of the metal parts. */
const brushed = () => texture(256, (g) => {
  g.fillStyle = '#8c8c8c'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1600; i++) {
    const v = (90 + Math.random() * 120) | 0
    g.fillStyle = `rgb(${v} ${v} ${v} / ${0.08 + Math.random() * 0.25})`
    g.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 120, 1)
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgb(40 40 40 / 0.3)' : 'rgb(225 225 225 / 0.3)'
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5)
  }
})
/** Orange and black warning stripes for the edge of the base plate. */
const hazard = () => texture(64, (g) => {
  g.fillStyle = '#16130f'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#ee7340'
  for (let x = -64; x < 128; x += 32) {
    g.beginPath()
    g.moveTo(x, 64); g.lineTo(x + 16, 64); g.lineTo(x + 80, 0); g.lineTo(x + 64, 0)
    g.fill()
  }
})

/**
 * A desktop manipulator in the style of open-hardware servo arms: base plate, servo blocks at each
 * joint, lattice links made of two rails with diagonal braces, and a two-finger claw.
 * Dressed like a real one: brushed metal, cooling fins, status lights, cable runs, a gear ring, a wrist camera.
 * All primitives, no model file. Shared by the recorder (driven by your hand) and the landing page (driven by scroll).
 * finish: 'graphite' is the anodised look for the landing page, 'light' reads better on the small recorder view.
 */
export function buildArm(finish: 'graphite' | 'light' = 'light') {
  const dark = finish === 'graphite'
  const grain = brushed()
  const metal = { roughnessMap: grain, bumpMap: grain, bumpScale: 1.4 }
  const body = new THREE.MeshStandardMaterial({ color: dark ? 0x5a606b : 0xd9d4cc, roughness: 0.75, metalness: dark ? 0.8 : 0.35, ...metal })
  const servo = new THREE.MeshStandardMaterial({ color: dark ? 0x25272e : 0x8e9a9b, roughness: 0.85, metalness: 0.5, ...metal })
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c2, roughness: 0.25, metalness: 0.95 })
  const accent = new THREE.MeshStandardMaterial({ color: 0xe8703a, roughness: 0.7, metalness: 0.55, ...metal })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.9, metalness: 0 })
  const led = new THREE.MeshStandardMaterial({ color: 0xff7fb8, emissive: 0xff4fa0, emissiveIntensity: 3 })
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.05, metalness: 0.2, clearcoat: 1 })
  const box = (w: number, h: number, d: number, m: THREE.Material = body) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  const cyl = (r: number, h: number, m: THREE.Material = steel, seg = 28) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m)
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o)
  const cable = (pts: number[][], r: number, m: THREE.Material) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 24, r, 8), m)

  /** A joint: servo block with cooling fins and a status light, the axle running through it, and a bolt circle on each face. */
  const joint = (size: number) => {
    const g = new THREE.Group()
    const axle = cyl(size * 0.34, size * 1.5)
    axle.rotation.x = Math.PI / 2
    g.add(box(size, size * 0.82, size * 1.18, servo), axle)
    for (let i = 0; i < 6; i++) g.add(at(box(size * 1.04, size * 0.03, size * 1.22, steel), 0, (i - 2.5) * size * 0.13, 0)) // cooling fins
    g.add(at(box(size * 0.05, size * 0.12, size * 0.3, led), size * 0.51, size * 0.22, 0))
    for (const side of [-1, 1]) {
      const cap = at(cyl(size * 0.44, 0.02, accent), 0, 0, side * size * 0.76)
      cap.rotation.x = Math.PI / 2
      const hub = at(cyl(size * 0.16, 0.035, servo), 0, 0, side * size * 0.775)
      hub.rotation.x = Math.PI / 2
      g.add(cap, hub)
      for (let i = 0; i < 6; i++) {
        const bolt = at(cyl(0.012, 0.03, steel, 6), Math.cos(i * 1.047) * size * 0.3, Math.sin(i * 1.047) * size * 0.3, side * size * 0.78)
        bolt.rotation.x = Math.PI / 2
        g.add(bolt)
      }
    }
    return g
  }

  /** A link: two side frames of rails and diagonal braces tied by cross rungs, with a cable pair clipped along one side. */
  const link = (w: number) => {
    const g = new THREE.Group(), bays = 4, bay = (L - 0.24) / bays
    for (const side of [-1, 1]) {
      for (const x of [-0.05, 0.05]) g.add(at(box(0.022, L - 0.16, 0.02), x, L / 2, side * w))
      for (let i = 0; i < bays; i++) {
        const brace = at(box(0.016, Math.hypot(bay, 0.1), 0.016), 0, 0.12 + bay * (i + 0.5), side * w)
        brace.rotation.z = (i % 2 ? 1 : -1) * Math.atan2(0.1, bay)
        g.add(brace)
      }
      g.add(at(box(0.09, 0.14, 0.006, accent), 0, L * 0.5, side * (w + 0.012))) // maker's plate
    }
    for (let i = 0; i <= bays; i++) g.add(at(box(0.1, 0.018, w * 2), 0, 0.12 + bay * i, 0))
    // power and signal, slack enough to bend with the joint
    g.add(cable([[-0.1, 0.02, 0.03], [-0.13, L * 0.3, 0.05], [-0.085, L * 0.62, 0.02], [-0.1, L - 0.02, 0.03]], 0.013, rubber))
    g.add(cable([[-0.1, 0.02, -0.03], [-0.12, L * 0.36, -0.05], [-0.09, L * 0.7, -0.02], [-0.1, L - 0.02, -0.03]], 0.008, accent))
    for (const y of [0.3, 0.68]) g.add(at(box(0.05, 0.03, 0.12, servo), -0.09, L * y, 0)) // cable clips
    return g
  }

  /** One claw finger: a curved talon outline, extruded, with grip ribs. Pivots at its root. */
  const talon = new THREE.Shape()
  talon.moveTo(0, 0.03)
  talon.quadraticCurveTo(0.13, 0.15, 0.32, 0.03)
  talon.lineTo(0.32, 0)
  talon.quadraticCurveTo(0.15, 0.055, 0.02, -0.035)
  talon.closePath()
  const talonGeo = new THREE.ExtrudeGeometry(talon, { depth: 0.07, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 })
  // shape x runs along the finger, shape y outward, extrusion across: map to local y, z, x
  talonGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -0.035, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1))
  const claw = new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.42, metalness: body.metalness, side: THREE.DoubleSide })
  const finger = (side: number) => {
    const g = at(new THREE.Group(), 0, 0.09, side * 0.045)
    const f = new THREE.Mesh(talonGeo, claw)
    f.scale.z = side
    g.add(f)
    for (let i = 0; i < 6; i++) g.add(at(box(0.074, 0.01, 0.012, rubber), 0, 0.13 + i * 0.03, side * 0.012))
    return g
  }

  const root = new THREE.Group()
  const plate = at(box(1.0, 0.05, 1.0), 0, 0.025, 0)
  root.add(plate, at(box(0.36, 0.22, 0.36, servo), 0, 0.16, 0))
  for (const x of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) root.add(at(cyl(0.035, 0.06, steel, 6), x, 0.035, z))
  // warning stripes along the front and back edges, panel seams across the plate
  const stripes = new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.7 })
  stripes.map!.repeat.set(8, 1)
  for (const z of [-0.47, 0.47]) root.add(at(box(0.8, 0.052, 0.05, stripes), 0, 0.026, z))
  for (const x of [-0.25, 0.25]) root.add(at(box(0.006, 0.052, 0.84, rubber), x, 0.026, 0))
  // controller box on the plate, with its lights and the lead that feeds the turret
  root.add(at(box(0.2, 0.09, 0.3, servo), -0.34, 0.095, 0.02), at(box(0.205, 0.012, 0.305, accent), -0.34, 0.145, 0.02))
  for (let i = 0; i < 3; i++) root.add(at(box(0.02, 0.02, 0.01, led), -0.4 + i * 0.04, 0.11, 0.172))
  for (let i = 0; i < 7; i++) root.add(at(box(0.012, 0.07, 0.26, steel), -0.415 + i * 0.025, 0.1, 0.02).translateY(0.06))
  root.add(cable([[-0.24, 0.1, 0.02], [-0.2, 0.2, 0.1], [-0.19, 0.24, 0.02]], 0.014, rubber))

  const turret = new THREE.Group() // everything above the base yaws together
  turret.add(at(cyl(0.2, 0.07, body, 40), 0, 0.305, 0), at(box(0.24, 0.12, 0.3), 0, 0.4, 0))
  for (let i = 0; i < 28; i++) { // gear ring
    const tooth = at(box(0.03, 0.04, 0.022, steel), Math.cos((i / 28) * 6.283) * 0.212, 0.29, Math.sin((i / 28) * 6.283) * 0.212)
    tooth.rotation.y = -(i / 28) * 6.283
    turret.add(tooth)
  }
  const shoulder = at(new THREE.Group(), 0, SHOULDER_Y, 0)
  const elbow = at(new THREE.Group(), 0, L, 0)
  const wrist = at(new THREE.Group(), 0, L, 0)
  const fingers = [finger(-1), finger(1)]
  // wrist camera looking down the claw
  const cam = at(new THREE.Group(), 0.085, 0.07, 0)
  const glass = at(cyl(0.022, 0.012, lens), 0, 0.04, 0)
  cam.add(box(0.05, 0.07, 0.07, servo), glass, at(cyl(0.028, 0.02, steel), 0, 0.03, 0), at(box(0.008, 0.008, 0.008, led), 0.026, 0.02, 0.02))
  wrist.add(joint(0.16), at(box(0.12, 0.08, 0.2, servo), 0, 0.07, 0), cam, ...fingers)
  elbow.add(joint(0.2), link(0.085), wrist)
  shoulder.add(joint(0.24), link(0.11), elbow)
  turret.add(shoulder)
  root.add(turret)
  root.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)))

  /**
   * Put the wrist axle at (x, y, z). Two-link analytic IK in the arm's plane, base yaw toward the target,
   * and the wrist turned so the claw always points straight down. open is 0 (closed) to 1.
   */
  function solve(x: number, y: number, z: number, open: number) {
    const r = Math.hypot(x, z), h = y - SHOULDER_Y
    const d = clamp(Math.hypot(r, h), 0.35, 2 * L - 0.01)
    turret.rotation.y = Math.atan2(-z, x)
    shoulder.rotation.z = Math.atan2(h, r) + Math.acos(d / (2 * L)) - Math.PI / 2
    elbow.rotation.z = Math.acos(1 - (d * d) / (2 * L * L)) - Math.PI
    wrist.rotation.z = Math.PI - shoulder.rotation.z - elbow.rotation.z
    fingers.forEach((f, i) => (f.rotation.x = (i ? 1 : -1) * (0.02 + open * 0.6)))
  }

  return { root, solve, parts: { shoulder, elbow, wrist } }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/**
 * The ground: a square platform of blocks, the landing page's halftone pattern in 3D.
 * Flat where the arm works, then the blocks shrink and step up in terraces toward the rim.
 * A dithered river of orange and pink blocks runs through the charcoal ones. One instanced mesh.
 */
export function buildFloor(R = 1.95, N = 40, flat = 1.5) {
  const cell = (2 * R) / N
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.28, 1).translate(0, -0.14, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.25 }), N * N)
  const o = new THREE.Object3D(), col = new THREE.Color()
  let n = 0
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * cell - R, z = (j + 0.5) * cell - R, r = Math.max(Math.abs(x), Math.abs(z)) // square platform
    const v = flow(x * 0.5 + 2, z * 0.5 + 2, 3.3), edge = clamp((r - flat) / (R - flat), 0, 1)
    const size = cell * (0.9 - 0.6 * edge)
    o.position.set(x, (Math.round(v * 5) / 5) * 0.16 * edge, z)
    o.scale.set(size, 1, size)
    o.updateMatrix()
    mesh.setMatrixAt(n, o.matrix)
    const lit = (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16 < (v - 0.5) / 0.5
    if (lit) col.set(v > 0.9 ? 0xe26eaa : v > 0.76 ? 0xf3bcae : 0xee7340)
    else col.set(0x242127).multiplyScalar(0.75 + ((i * 7 + j * 13) % 5) * 0.11)
    mesh.setColorAt(n++, col)
  }
  mesh.count = n
  mesh.receiveShadow = true
  return mesh
}

/** A glass mug with a little amber in it. The handle is what makes its rotation visible. */
export function buildMug() {
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.05, ior: 1.5, transparent: true, opacity: 1, side: THREE.DoubleSide, envMapIntensity: 1.4 })
  // wall profile, revolved: outer wall up, over the rim, inner wall down to a thick base
  const profile = [[0, 0], [0.092, 0], [0.1, 0.012], [0.1, 0.25], [0.094, 0.256], [0.088, 0.25], [0.088, 0.03], [0, 0.03]].map(([r, y]) => new THREE.Vector2(r, y))
  const mug = new THREE.Group()
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), glass)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.013, 16, 40, Math.PI), glass)
  handle.position.set(0.098, 0.135, 0)
  handle.rotation.z = -Math.PI / 2
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.13, 48), new THREE.MeshPhysicalMaterial({ color: 0xa8641f, roughness: 0.1, transmission: 0.75, thickness: 0.2, ior: 1.33, transparent: true }))
  drink.position.y = 0.097
  mug.add(drink, body, handle)
  mug.traverse((o) => (o.castShadow = true))
  return mug
}

/** Warm key light with soft shadows, a cool rim, and studio reflections so metal and glass read as metal and glass. */
export function addLights(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
  const sun = new THREE.DirectionalLight(0xffe2c2, 2.6)
  sun.position.set(2.5, 4.5, 3)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = sun.shadow.camera.bottom = -3
  sun.shadow.camera.right = sun.shadow.camera.top = 3
  sun.shadow.bias = -0.0004
  const rim = new THREE.DirectionalLight(0x9fb4b8, 1.6)
  rim.position.set(-3, 2.5, -3)
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2a180a, 0.9), sun, rim)
  if (renderer) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 1.1
    renderer.toneMappingExposure = 1.35
  }
}
