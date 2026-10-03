import * as THREE from 'three'

export const L = 1 // length of each arm link
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/**
 * The robot arm, from primitives: base, two links, two-finger gripper.
 * Light links and warm joints so it reads clearly on the dark page.
 * Shared by the recorder (driven by your hand) and the landing page (driven by scroll).
 */
export function buildArm() {
  const link = new THREE.MeshStandardMaterial({ color: 0xece5db, roughness: 0.55, metalness: 0.1 })
  const joint = new THREE.MeshStandardMaterial({ color: 0xa8744a, roughness: 0.4, metalness: 0.45 })
  const grip = new THREE.MeshStandardMaterial({ color: 0x8e9a9b, roughness: 0.35, metalness: 0.6 })
  const rod = (r: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 28), link)
    m.position.y = L / 2
    return m
  }
  const ball = (r: number) => new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), joint)

  const root = new THREE.Group()
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.2, 40), joint)
  foot.position.y = 0.1
  const shoulder = new THREE.Group()
  shoulder.position.y = 0.2
  const elbow = new THREE.Group()
  elbow.position.y = L
  const wrist = ball(0.1)
  wrist.position.y = L
  const fingers = [-1, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.11), grip))
  fingers.forEach((f) => (f.position.y = L + 0.17))
  elbow.add(rod(0.07), ball(0.12), wrist, ...fingers)
  shoulder.add(rod(0.09), ball(0.15), elbow)
  root.add(foot, shoulder)

  /** Two-link analytic IK: yaw the base at the target, then law of cosines in the arm's plane. open is 0 (closed) to 1. */
  function solve(x: number, y: number, z: number, open: number) {
    const r = Math.hypot(x, z), h = y - 0.2
    const d = clamp(Math.hypot(r, h), 0.3, 2 * L - 0.01)
    root.rotation.y = Math.atan2(-z, x)
    shoulder.rotation.z = Math.atan2(h, r) + Math.acos(d / (2 * L)) - Math.PI / 2
    elbow.rotation.z = Math.acos(1 - (d * d) / (2 * L * L)) - Math.PI
    fingers.forEach((f, i) => (f.position.z = (i ? 1 : -1) * (0.035 + open * 0.09)))
  }

  return { root, solve }
}

/** Warm key light and a soft fill, the same in both scenes. */
export function addLights(scene: THREE.Scene) {
  const sun = new THREE.DirectionalLight(0xffe2c2, 2.4)
  sun.position.set(2, 4, 3)
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2a180a, 1.7), sun)
}
