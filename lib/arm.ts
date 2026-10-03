import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export const L = 1 // length of each arm link
const SHOULDER_Y = 0.5 // height of the shoulder axle above the table
export const GRIP = 0.4 // wrist axle to fingertips
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/**
 * A desktop manipulator in the style of open-hardware servo arms: base plate, servo blocks at each
 * joint, lattice links made of two rails with diagonal braces, and a two-finger claw.
 * All primitives, no model file. Shared by the recorder (driven by your hand) and the landing page (driven by scroll).
 * finish: 'graphite' is the anodised look for the landing page, 'light' reads better on the small recorder view.
 */
export function buildArm(finish: 'graphite' | 'light' = 'light') {
  const dark = finish === 'graphite'
  const body = new THREE.MeshStandardMaterial({ color: dark ? 0x5a606b : 0xd9d4cc, roughness: 0.42, metalness: dark ? 0.75 : 0.35 })
  const servo = new THREE.MeshStandardMaterial({ color: dark ? 0x2d3038 : 0x8e9a9b, roughness: 0.5, metalness: 0.5 })
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c2, roughness: 0.25, metalness: 0.95 })
  const accent = new THREE.MeshStandardMaterial({ color: 0xa8744a, roughness: 0.4, metalness: 0.6 })
  const box = (w: number, h: number, d: number, m: THREE.Material = body) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  const cyl = (r: number, h: number, m: THREE.Material = steel, seg = 28) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m)
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o)

  /** A joint: servo block with the axle running through it and a bolt circle on each face. */
  const joint = (size: number) => {
    const g = new THREE.Group()
    const axle = cyl(size * 0.34, size * 1.5)
    axle.rotation.x = Math.PI / 2
    g.add(box(size, size * 0.82, size * 1.18, servo), axle)
    for (const side of [-1, 1]) {
      const cap = at(cyl(size * 0.44, 0.02, accent), 0, 0, side * size * 0.76)
      cap.rotation.x = Math.PI / 2
      g.add(cap)
      for (let i = 0; i < 6; i++) {
        const bolt = at(cyl(0.012, 0.03), Math.cos(i * 1.047) * size * 0.3, Math.sin(i * 1.047) * size * 0.3, side * size * 0.78)
        bolt.rotation.x = Math.PI / 2
        g.add(bolt)
      }
    }
    return g
  }

  /** A link: two side frames, each made of two rails joined by diagonal braces, tied together by cross rungs. */
  const link = (w: number) => {
    const g = new THREE.Group(), bays = 4, bay = (L - 0.24) / bays
    for (const side of [-1, 1]) {
      for (const x of [-0.05, 0.05]) g.add(at(box(0.022, L - 0.16, 0.02), x, L / 2, side * w))
      for (let i = 0; i < bays; i++) {
        const brace = at(box(0.016, Math.hypot(bay, 0.1), 0.016), 0, 0.12 + bay * (i + 0.5), side * w)
        brace.rotation.z = (i % 2 ? 1 : -1) * Math.atan2(0.1, bay)
        g.add(brace)
      }
    }
    for (let i = 0; i <= bays; i++) g.add(at(box(0.1, 0.018, w * 2), 0, 0.12 + bay * i, 0))
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
    for (let i = 0; i < 4; i++) g.add(at(box(0.074, 0.012, 0.012, steel), 0, 0.15 + i * 0.035, side * 0.012))
    return g
  }

  const root = new THREE.Group()
  const plate = at(box(1.0, 0.05, 1.0), 0, 0.025, 0)
  root.add(plate, at(box(0.36, 0.22, 0.36, servo), 0, 0.16, 0))
  for (const x of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) root.add(at(cyl(0.035, 0.06), x, 0.035, z))
  const turret = new THREE.Group() // everything above the base yaws together
  turret.add(at(cyl(0.2, 0.07, body, 40), 0, 0.305, 0), at(box(0.24, 0.12, 0.3), 0, 0.4, 0))
  const shoulder = at(new THREE.Group(), 0, SHOULDER_Y, 0)
  const elbow = at(new THREE.Group(), 0, L, 0)
  const wrist = at(new THREE.Group(), 0, L, 0)
  const fingers = [finger(-1), finger(1)]
  wrist.add(joint(0.16), at(box(0.12, 0.08, 0.2, servo), 0, 0.07, 0), ...fingers)
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

  return { root, solve }
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
