import * as T from 'three';
import { BUILDINGS, MAP_HEIGHT, MAP_WIDTH, RESOURCES } from './data';
import { count, Simulation } from './Simulation';
import type { BuildingKind, BuildingState, Inventory, Point } from './types';
import { AssetLibrary } from './AssetLibrary';
import type { AssetKey } from './assetCatalog';
import { ROOMS, roomAt, type RoomDefinition } from './facility';

const SCALE = 1.1;
const world = (p: Point) => new T.Vector3((p.x - (MAP_WIDTH - 1) / 2) * SCALE, 0, (p.y - (MAP_HEIGHT - 1) / 2) * SCALE);
interface Actor { root: T.Group; limbs: T.Group[]; load: T.Group; phase: number; previous: T.Vector3; loadKey: string; mixer?: T.AnimationMixer; actions?: Map<string, T.AnimationAction>; mode?: string }
interface View { root: T.Group; label: HTMLDivElement; ring: T.Mesh; level: number; moving: T.Object3D[]; materials: T.MeshStandardMaterial[]; upgrade: T.Group; upgradeLabel: HTMLDivElement }
interface Lot { kind: BuildingKind; x: number; y: number; root: T.Group; label: HTMLDivElement; hold: number; warned: boolean; eligible: boolean }
interface RoomView { definition: RoomDefinition; root: T.Group; gate: T.Group; label: HTMLDivElement; opened: boolean; hold: number; warned: boolean }

/** The economy remains independent of the real 3D presentation. */
export class World3D {
  buildMode?: { kind: BuildingKind; rotated: boolean };
  selected?: string;
  touchMovement: Point = { x: 0, y: 0 };
  cameras = { main: { zoom: 1 } };
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(43, 1, .1, 220);
  private renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private target = new T.Vector3();
  private follow = true;
  private keys = new Set<string>();
  private views = new Map<string, View>();
  private actors = new Map<string, Actor>();
  private lots: Lot[] = [];
  private roomViews: RoomView[] = [];
  private autoUpgrade = { id: '', remaining: 0, latched: false };
  private materials = new Map<string, T.MeshStandardMaterial>();
  private host = document.querySelector<HTMLDivElement>('#game')!;
  private labels = document.createElement('div');
  private ghost = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0x7afa82, transparent: true, opacity: .45, side: T.DoubleSide }));
  private ghostPoint?: Point;
  private pointers = new Map<number, Point>();
  private drag?: Point;
  private dragged = false;
  private pinch = 0;
  private frame = 0;
  private last = 0;
  private lotCheck = 0;
  private observer: ResizeObserver;
  private abort = new AbortController();

  constructor(private sim: Simulation, private onSelect: (id: string) => void, private assets: AssetLibrary) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.setClearColor(0xcce9c1);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '3D Çöpten Şehre oyun alanı');
    this.renderer.domElement.tabIndex = 0;
    this.host.append(this.renderer.domElement);
    this.labels.className = 'world-labels'; this.host.append(this.labels);
    this.scene.background = new T.Color(0xcce9c1);
    this.scene.fog = new T.Fog(0xcce9c1, 65, 120);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x9bb083, 1.5));
    const sun = new T.DirectionalLight(0xfff1d6, 1.8); sun.position.set(-18, 35, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35; sun.shadow.camera.far = 90;
    sun.shadow.bias = -.0007; sun.shadow.normalBias = .025; sun.shadow.radius = 3;
    this.scene.add(sun);
    this.environment();
    this.ghost.rotation.x = -Math.PI / 2; this.ghost.position.y = .07; this.ghost.visible = false; this.scene.add(this.ghost);
    this.sync(); this.centerPlayer(); this.bind();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host); this.resize();
    this.frame = requestAnimationFrame(this.animate);
  }
  private mat(color: number | string) {
    const key = String(color); let m = this.materials.get(key);
    if (!m) { m = new T.MeshStandardMaterial({ color, roughness: .82, flatShading: true }); this.materials.set(key, m); }
    return m;
  }
  private mesh(parent: T.Object3D, geometry: T.BufferGeometry, color: number | string, x: number, y: number, z: number) {
    geometry.userData.generated = true;
    const m = new T.Mesh(geometry, this.mat(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  private box(p: T.Object3D, c: number | string, x: number, y: number, z: number, w: number, h: number, d: number) { return this.mesh(p, new T.BoxGeometry(w, h, d), c, x, y, z); }
  private cylinder(p: T.Object3D, c: number, x: number, y: number, z: number, r: number, h: number, top = r) { return this.mesh(p, new T.CylinderGeometry(top, r, h, 12), c, x, y, z); }
  private ball(p: T.Object3D, c: number, x: number, y: number, z: number, r: number) { return this.mesh(p, new T.IcosahedronGeometry(r, 1), c, x, y, z); }
  private floorTiles(parent: T.Object3D, width: number, depth: number, color: number) {
    const cells: [number, number][] = [];
    for (let x = 0; x < Math.floor(width / SCALE); x++) for (let z = 0; z < Math.floor(depth / SCALE); z++) if ((x + z) % 2 === 0) cells.push([x, z]);
    const tiles = new T.InstancedMesh(new T.BoxGeometry(SCALE - .03, .018, SCALE - .03), this.mat(color), cells.length);
    tiles.geometry.userData.generated = true;
    const transform = new T.Matrix4(); cells.forEach(([x, z], index) => { transform.makeTranslation(-width / 2 + (x + .5) * SCALE, .105, -depth / 2 + (z + .5) * SCALE); tiles.setMatrixAt(index, transform); });
    tiles.receiveShadow = true; parent.add(tiles);
  }
  private environment() {
    const W = MAP_WIDTH * SCALE, H = MAP_HEIGHT * SCALE;
    this.box(this.scene, 0xb9df72, 0, -.32, 0, 180, .5, 180);
    const hall = world({ x: 16.5, y: 18.5 });
    this.box(this.scene, 0xe5d4a3, hall.x, -.03, hall.z, 6 * SCALE, .12, 36 * SCALE);
    this.box(this.scene, 0x268768, hall.x, .045, hall.z, 3.6 * SCALE, .035, 36 * SCALE);
    for (const x of [14.6, 18.4]) { const p = world({ x, y: 18.5 }); this.box(this.scene, 0xe0c68a, p.x, .065, p.z, .07, .025, 36 * SCALE); }
    const lobby = new T.Group(); lobby.position.copy(world({ x: 16.5, y: 34.5 })); this.scene.add(lobby);
    this.box(lobby, 0xead6a4, 0, .01, 0, 32 * SCALE, .1, 4 * SCALE);
    this.floorTiles(lobby, 32 * SCALE, 4 * SCALE, 0xe2cd96);
    this.box(lobby, 0x268768, 0, .14, 0, 3.6 * SCALE, .03, 4 * SCALE);
    this.box(lobby, 0x65ad86, -16 * SCALE, 1, 0, .2, 2, 4 * SCALE);
    this.box(lobby, 0x65ad86, 16 * SCALE, 1, 0, .2, 2, 4 * SCALE);
    this.box(lobby, 0xe9c895, 0, .25, 2 * SCALE, 32 * SCALE, .5, .2);
    for (const x of [-15, 15, -11, 11]) this.prop(lobby, 'plant', x * SCALE, .07, 1.4, { height: .9 });
    for (const x of [-8, 8]) this.prop(lobby, 'bench', x * SCALE, .08, 1.4, { width: 2.6 });
    for (const definition of ROOMS) {
      const root = new T.Group(); root.position.copy(world({ x: definition.x + (definition.width - 1) / 2, y: definition.y + (definition.height - 1) / 2 })); this.scene.add(root);
      const gate = new T.Group(); gate.position.copy(world(definition.gate)); this.scene.add(gate);
      const gatePad = this.box(gate, 0x70d678, 0, .055, 0, 1.4, .08, 1.4); gatePad.material = gatePad.material.clone(); this.squareArea(gate, 1.4, 0xffffff);
      const arrow = this.mesh(gate, new T.ConeGeometry(.23, .5, 4), 0xffcf53, 0, 1.25, 0); arrow.rotation.z = Math.PI;
      gate.userData.room = definition.id;
      const label = this.label('room-label'); label.setAttribute('role', 'button'); label.tabIndex = 0;
      const visit = () => { this.sim.goTo(definition.gate); this.follow = true; document.querySelector('#app')!.classList.remove('panel-open'); };
      label.addEventListener('click', visit, { signal: this.abort.signal });
      label.addEventListener('keydown', e => { if (e.key === 'Enter') visit(); }, { signal: this.abort.signal });
      this.roomViews.push({ definition, root, gate, label, opened: false, hold: 0, warned: false });
      this.box(root, 0xb6c6a5, 0, .005, 0, (definition.width - 1) * SCALE, .07, (definition.height - 1) * SCALE);
      // Unbuilt rooms remain empty, with a foundation outline and a visible lock pad.
      for (const z of [-(definition.height - 1) * SCALE / 2, (definition.height - 1) * SCALE / 2]) this.box(root, 0xe2dbb8, 0, .08, z, (definition.width - 1) * SCALE, .12, .12);
    }
    this.box(this.scene, 0xdce4cb, 0, -.03, -H / 2 - 2.3, 95, .1, 4.3);
    this.prop(this.scene, 'bench', -7, 0, -H / 2 - 2.2, { width: 2.5 });
    this.prop(this.scene, 'bench', 7, 0, -H / 2 - 2.2, { width: 2.5 });
    this.box(this.scene, 0x626774, 0, -.02, -H / 2 - 7, 95, .12, 5);
    for (let x = -45; x < 45; x += 5) this.box(this.scene, 0xf9e9ae, x, .05, -H / 2 - 7, 2.3, .025, .12);
    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? -1 : 1, x = side * (W / 2 + 2.5 + (i % 3) * 2.1), z = -H / 2 + (i / 2) * 2.8;
      this.tree(x, z, .85 + (i % 4) * .14);
    }
    for (let i = 0; i < 14; i++) this.tree(-35 + i * 5.2, -H / 2 - 12, 1.2);
    for (const [x, c] of [[-12, 0x5bb9e7], [11, 0xffcf66]] as const) {
      const car = new T.Group(); car.position.set(x, .2, -H / 2 - 7); this.scene.add(car);
      this.box(car, c, 0, .5, 0, 3, .7, 1.4); this.box(car, 0xc4eeef, -.2, 1, 0, 1.5, .6, 1.25);
      for (const wx of [-.9, .9]) for (const wz of [-.7, .7]) { const wheel = this.cylinder(car, 0x353e4d, wx, .2, wz, .3, .18); wheel.rotation.x = Math.PI / 2; }
    }
  }
  private furnishRoom(view: RoomView) {
    const { root, definition: r } = view;
    root.traverse(o => { if (o instanceof T.Mesh && o.geometry.userData.generated) o.geometry.dispose(); });
    root.clear(); const W = (r.width - 1) * SCALE, H = (r.height - 1) * SCALE;
    const grade = Math.max(1, ...this.sim.state.buildings.filter(b => roomAt(b.x, b.y)?.id === r.id).map(b => b.level)); root.userData.grade = grade;
    this.box(root, r.floor, 0, .03, 0, W, .12, H);
    this.floorTiles(root, W, H, new T.Color(r.floor).multiplyScalar(.965).getHex());
    for (let i = 0; i < 8; i++) this.box(root, new T.Color(r.floor).multiplyScalar(.94).getHex(), 0, .097, -H / 2 + i * H / 8, W, .01, .035);
    // Cutaway front wall keeps the inside visible; actual collision still encloses the room.
    this.box(root, r.color, 0, 1.15, -H / 2, W, 2.3, .18);
    this.box(root, 0xf5d8ac, 0, .24, H / 2, W, .48, .18);
    const innerSide = r.x < 14 ? 1 : -1;
    this.box(root, r.color, -innerSide * W / 2, 1.1, 0, .18, 2.2, H);
    const doorZ = world(r.door).z - root.position.z;
    const sideX = innerSide * W / 2;
    for (const [from, to] of [[-H / 2, doorZ - SCALE * .55], [doorZ + SCALE * .55, H / 2]]) {
      this.box(root, r.color, sideX, .65, (from + to) / 2, .18, 1.3, to - from);
      this.box(root, 0xffe6bd, sideX, 1.32, (from + to) / 2, .25, .08, to - from);
    }
    for (let x = -W / 2 + .5; x < W / 2; x += .7) this.box(root, new T.Color(r.color).multiplyScalar(.92).getHex(), x, 1.15, -H / 2 + .1, .06, 2.2, .025);
    this.box(root, 0xffe6bd, 0, 2.32, -H / 2, W, .12, .27);
    this.box(root, 0xffdf95, 0, 1.4, -H / 2 + .15, 1.7, 1, .12);
    this.box(root, r.id === 'energy' ? 0x5c9acb : 0x6bab91, 0, 1.4, -H / 2 + .23, 1.4, .75, .025);
    this.box(root, 0x99d9e8, -innerSide * (W / 2 - .11), 1.45, -1, .025, 1.1, 2.2);
    for (const z of [-2.15, .15]) this.box(root, 0xf7d587, -innerSide * (W / 2 - .15), 1.45, z, .08, 1.35, .3);
    this.prop(root, 'plant', -innerSide * (W / 2 - 1), .1, H / 2 - 1.1, { height: 1 });
    this.prop(root, 'rack', innerSide * (W / 2 - 1.2), .1, -H / 2 + 1, { height: 1.65 });
    if (r.id === 'community') { this.prop(root, 'bench', 0, .12, H / 2 - 2, { width: 4 }); this.prop(root, 'table', 0, .12, H / 2 - 3.5, { height: .7 }); }
    if (r.id === 'kitchen') { this.prop(root, 'table', 4, .12, 3, { height: .85 }); this.prop(root, 'chair', 4, .12, 4.2, { height: 1 }); }
    if (grade >= 2) { this.box(root, 0xffca69, 0, 2.37, -H / 2, W, .16, .3); this.prop(root, 'bench', 0, .12, H / 2 - 1, { width: 2.6 }); }
    if (grade >= 3) { this.prop(root, 'flower', 1.5, .12, H / 2 - 1, { height: .8 }); this.prop(root, 'plant', -1.5, .12, H / 2 - 1, { height: 1.1 }); this.box(root, 0x79c9bc, 0, .18, H / 2 - 2, 4, .025, 1.3); }
    view.opened = true;
  }
  private tree(x: number, z: number, scale: number) {
    const key: AssetKey = Math.round(Math.abs(x + z)) % 3 === 0 ? 'treeDetailed' : Math.round(Math.abs(x)) % 3 === 0 ? 'treeSmall' : 'treeOak';
    const tree = this.assets.instantiate(key, { height: 3.5 * scale });
    if (tree) {
      tree.root.position.set(x, 0, z); tree.root.rotation.y = x * .7; this.scene.add(tree.root);
      if (Math.round(Math.abs(x + z)) % 4 === 0) { this.prop(this.scene, 'bush', x + .9, 0, z + .9, { width: 1.3 }); this.prop(this.scene, 'rock', x - .7, 0, z + .5, { width: .6 }); this.prop(this.scene, 'flower', x + .7, 0, z - .6, { height: .4 }); }
      return;
    }
    const root = new T.Group(); root.position.set(x, 0, z); root.scale.setScalar(scale); this.scene.add(root);
    const trunk = this.cylinder(root, 0xa87c50, 0, 1, 0, .18, 2, .12); trunk.rotation.z = -.15;
    this.ball(root, 0xb7d853, 0, 2.6, 0, 1.2); this.ball(root, 0xcbe76e, -.7, 2.2, .25, .85); this.ball(root, 0xa5cc48, .65, 2.1, -.2, .8);
  }
  private ring(parent: T.Object3D, radius: number, color: number) {
    const m = new T.Mesh(new T.RingGeometry(radius - .08, radius, 40), new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: .85 }));
    m.rotation.x = -Math.PI / 2; m.position.y = .045; parent.add(m); return m;
  }
  private squareArea(parent: T.Object3D, size: number, color: number) {
    const h = size / 2, inner = h - .07;
    const shape = new T.Shape(); shape.moveTo(-h, -h); shape.lineTo(h, -h); shape.lineTo(h, h); shape.lineTo(-h, h); shape.closePath();
    const hole = new T.Path(); hole.moveTo(-inner, -inner); hole.lineTo(-inner, inner); hole.lineTo(inner, inner); hole.lineTo(inner, -inner); hole.closePath(); shape.holes.push(hole);
    const geometry = new T.ShapeGeometry(shape); geometry.userData.generated = true;
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: .95 }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = .06; parent.add(mesh); return mesh;
  }
  private label(className: string) { const label = document.createElement('div'); label.className = className; this.labels.append(label); return label; }
  private prop(parent: T.Object3D, key: AssetKey, x: number, y: number, z: number, size: { width?: number; height?: number }, rotation = 0) {
    const instance = this.assets.instantiate(key, size); if (!instance) return;
    instance.root.position.set(x, y, z); instance.root.rotation.y = rotation; parent.add(instance.root); return instance;
  }
  private assetStation(b: BuildingState, root: T.Group, moving: T.Object3D[]) {
    const place = (key: AssetKey, x: number, y: number, z: number, size: { width?: number; height?: number }, rotation = 0) => this.prop(root, key, x, y, z, size, rotation);
    switch (b.kind) {
      case 'collection':
        if (!this.assets.has('bin')) return false;
        for (let i = -1; i <= 1; i++) place('bin', i * .8, .18, -.15, { height: .95 });
        place('crate', -.7, .18, .95, { width: .7 }); place('crate', .45, .18, .9, { width: .6 }); return true;
      case 'recycling':
        if (!this.assets.has('machine')) return false;
        place(b.level === 1 ? 'machine' : b.level === 2 ? 'processor' : 'generator', 0, .18, -.45, { height: 1.65 + (b.level - 1) * .25 }); place('hopper', 0, 1.83 + (b.level - 1) * .25, -.55, { height: .6 });
        place('conveyor', 0, .18, .85, { width: 2.5 }, Math.PI / 2); place('screen', .9, 1.45, .4, { height: .5 });
        place('crate', -.6, .6, .85, { width: .35 }); place('crate', .55, .6, .85, { width: .35 });
        { const cog = place('cog', -.75, 1.1, .05, { width: .45 }); if (cog) moving.push(cog.root); } return true;
      case 'farm': {
        if (!this.assets.has('lettuce')) return false;
        const { width } = this.sim.footprint(b);
        for (let row = 0; row < 3; row++) {
          this.box(root, 0xa9754f, 0, .25, (row - 1) * .85, width * SCALE - .6, .4, .68);
          this.box(root, 0x674b37, 0, .46, (row - 1) * .85, width * SCALE - .8, .03, .46);
          for (let i = 0; i < 6; i++) place(row === 0 ? 'corn' : row === 1 ? 'lettuce' : 'carrot', -1.75 + i * .68, .47, (row - 1) * .85, { height: row === 0 ? .8 : row === 1 ? .4 : .45 });
        } return true;
      }
      case 'composter':
        if (!this.assets.has('hopper')) return false;
        for (const x of [-.7, .7]) { place('hopper', x, .18, -.3, { width: 1.25 }); this.ball(root, 0x8b6846, x, 1.22, -.3, .42); }
        place('crate', 0, .18, 1, { width: .65 }); place('bush', -.8, .18, .9, { height: .45 }); return true;
      case 'kitchen':
        if (!this.assets.has('stove')) return false;
        place('fridge', -.95, .18, -.65, { height: 1.9 }); place('cabinet', .6, .18, -.65, { height: 1.05 });
        place('stove', -.85, .18, .65, { height: 1.05 }); place('sink', .35, .18, .65, { height: 1.05 }); place('plant', .75, 1.23, -.65, { height: .4 });
        { const pot = this.cylinder(root, 0xe58b61, -.85, 1.38, .65, .22, .3); this.cylinder(root, 0xffc86b, -.85, 1.54, .65, .18, .02); moving.push(pot); } return true;
      case 'workshop': {
        if (!this.assets.has('robot')) return false;
        place('table', 0, .18, .65, { height: .8 }); place('processor', .7, .18, -.65, { height: 1.05 });
        const robot = place('robot', -.75, .18, -.5, { height: 1.5 }); const joint = robot?.root.getObjectByName('element-a'); if (joint) moving.push(joint);
        place('chair', .5, .98, .65, { height: .65 }); place('crate', -.8, .18, 1, { width: .6 }); return true;
      }
      case 'biogas':
        if (!this.assets.has('tank')) return false;
        for (const x of [-.7, .7]) { place('tank', x, .18, -.3, { width: 1.05 }); place('tank', x, 1.2, -.3, { width: 1.05 }); this.ball(root, 0x72d4b8, x, 2.25, -.3, .48); }
        place('valve', 0, .18, .85, { width: 1.15 }); return true;
      case 'generator':
        if (!this.assets.has('generator')) return false;
        place('generator', -.65, .18, .2, { height: 1.35 }); place('screen', -.65, .85, 1, { height: .4 }); place('pipe', .7, .18, -.8, { width: .75 });
        { const panel = this.box(root, 0x397dcc, .7, 1.4, -.1, 1.15, .12, 1.65); panel.rotation.x = -.32; this.box(root, 0x879fa4, .7, .65, -.1, .13, 1.2, .13); }
        return true;
      case 'warehouse':
        if (!this.assets.has('rack')) return false;
        for (const x of [-1.25, 1.25]) { place('rack', x, .18, -.65, { height: 2.1 }); for (const y of [.25, .92, 1.59]) place('crate', x, y, -.65, { width: .6 }); }
        place('crate', 0, .18, .65, { width: .9 }); place('crate', 0, .65, .65, { width: .8 });
        return true;
      case 'home':
        place('plant', -.95, .18, 1.2, { height: .65 }); place('chair', .95, .18, 1.2, { height: .65 }); return false;
      case 'shop':
        place('plant', 1.15, .18, 1.1, { height: .75 }); place('crate', -1.05, .18, 1.1, { width: .55 }); return false;
    }
  }
  private station(b: BuildingState): View {
    const root = new T.Group(), d = BUILDINGS[b.kind], { width: w, height: h } = this.sim.footprint(b);
    root.position.copy(world({ x: b.x + (w - 1) / 2, y: b.y + (h - 1) / 2 })); root.userData.building = b.id; this.scene.add(root);
    this.box(root, 0xe8dbbc, 0, .06, 0, w * SCALE - .22, .15, h * SCALE - .22);
    const accent = new T.Color(d.color).lerp(new T.Color(0xffffff), .1).getHex();
    const moving: T.Object3D[] = [];
    if (!this.assetStation(b, root, moving)) switch (b.kind) {
      case 'collection':
        for (let i = 0; i < 3; i++) { this.box(root, [0x63b780, 0x61bada, 0xffce64][i], (i - 1) * .85, .6, 0, .7, 1.05, .85); this.box(root, 0x49675f, (i - 1) * .85, 1.17, 0, .77, .14, .92); }
        for (let i = 0; i < 4; i++) this.ball(root, 0x9ba792, -.95 + i * .55, .25, .85, .25);
        break;
      case 'recycling': {
        this.box(root, 0x49b995, 0, .9, -.55, 2.45, 1.5, 1.05); this.box(root, 0x414b59, 0, .6, .45, 2.5, .22, 1);
        for (let i = -1; i <= 1; i++) { const roller = this.cylinder(root, 0xb9d7db, i * .8, .76, .45, .15, .85); roller.rotation.x = Math.PI / 2; moving.push(roller); }
        this.box(root, 0xffd268, .55, 1.4, .01, .55, .35, .1); break;
      }
      case 'composter':
      case 'farm':
        for (let row = 0; row < 3; row++) {
          this.box(root, 0xa9754f, 0, .25, (row - 1) * .85, w * SCALE - .6, .4, .68);
          this.box(root, 0x74553f, 0, .46, (row - 1) * .85, w * SCALE - .8, .03, .46);
          for (let i = 0; i < (b.kind === 'farm' ? 6 : 4); i++) {
            const x = -(w * SCALE - 1.1) / 2 + i * .6;
            if (b.kind === 'farm') { this.cylinder(root, 0xff9c42, x, .58, (row - 1) * .85, .13, .25, .2); this.ball(root, 0x6abb55, x, .82, (row - 1) * .85, .22); }
            else this.ball(root, 0x96ae58, x, .58, (row - 1) * .85, .22);
          }
        } break;
      case 'kitchen':
        this.box(root, 0xffb888, 0, .65, -.75, 2.7, 1.15, .7); this.box(root, 0xfff0db, 0, 1.27, -.75, 2.8, .15, .85);
        this.box(root, 0x8acbd0, -.75, .65, .6, .85, 1.1, 1); this.box(root, 0xdce5df, .5, .65, .55, 1.25, 1.1, 1.1);
        for (const x of [.15, .8]) { this.cylinder(root, 0x3e515c, x, 1.25, .55, .22, .08); const pot = this.cylinder(root, 0xe88768, x, 1.42, .55, .21, .3); moving.push(pot); }
        break;
      case 'workshop':
        this.box(root, 0xb98455, 0, .9, 0, 2.55, .25, 1.4);
        for (const x of [-1, 1]) for (const z of [-.5, .5]) this.box(root, 0x85664b, x, .5, z, .15, .9, .15);
        this.box(root, 0xf4c67e, -.3, 1.08, 0, 1.75, .13, .7);
        { const saw = this.cylinder(root, 0xb6ccd2, .75, 1.17, 0, .4, .08); saw.rotation.z = Math.PI / 2; moving.push(saw); }
        this.box(root, 0xdab278, -.8, .35, 1.1, .8, .55, .6); break;
      case 'biogas':
        for (const x of [-.65, .65]) { this.cylinder(root, 0x66c6c2, x, 1.1, -.2, .57, 2, .57); this.ball(root, 0xa0e5d7, x, 2.1, -.2, .57); this.cylinder(root, 0xffd578, x, 2.7, -.2, .12, .5); }
        this.box(root, 0x7b9d9a, 0, .6, .8, 1.4, .2, .2); break;
      case 'generator':
        this.box(root, 0xffcf67, -.65, .7, .25, 1.1, 1.25, 1.3);
        this.box(root, 0x405574, -.65, .9, .93, .7, .5, .06);
        { const panel = this.box(root, 0x5389c2, .6, 1.3, -.2, 1.3, .12, 1.9); panel.rotation.x = -.32;
          for (let i = 0; i < 3; i++) { const line = this.box(root, 0xa8d6e6, .6, 1.32 + (i - 1) * .2, -.2 + (i - 1) * .58, 1.3, .025, .025); line.rotation.x = -.32; }
          this.box(root, 0x9dacad, .6, .55, -.2, .12, 1, .12); } break;
      case 'warehouse':
        for (const x of [-1.65, 1.65]) this.box(root, 0x7cbed0, x, 1.1, -.2, .12, 2.2, 2.4);
        for (const y of [.35, 1.15, 1.95]) { this.box(root, 0x7cbed0, 0, y, -.75, 3.4, .12, 1); for (let i = -1; i <= 1; i++) this.box(root, i % 2 ? 0xf2c88c : 0xe6ad6a, i * 1.05, y + .3, -.75, .85, .55, .8); }
        this.box(root, 0x94dbe0, 0, 2.45, -.3, 3.75, .17, 2.65); break;
      case 'home': {
        this.prop(root, 'table', 0, .18, 0, { height: .85 });
        this.prop(root, 'chair', -.8, .18, 0, { height: 1 }); this.prop(root, 'chair', .8, .18, 0, { height: 1 }, Math.PI);
        this.prop(root, 'plant', 0, 1.03, 0, { height: .35 }); break;
      }
      case 'shop':
        this.box(root, 0xd79058, 0, .65, .05, 2.7, 1.05, 1.2);
        this.box(root, 0xffbf7e, 0, 1.23, .05, 2.85, .15, 1.4);
        this.prop(root, 'screen', -.7, 1.31, .05, { height: .35 }); this.prop(root, 'plant', .85, 1.31, .05, { height: .4 }); break;
    }
    // Upgrades visibly add finished stock, a premium rim and equipment details.
    if (b.level >= 2) {
      this.box(root, 0xffd76c, 0, .22, -h * SCALE / 2 + .1, w * SCALE - .22, .16, .15);
      this.prop(root, 'crate', -w * SCALE / 2 + .4, .18, -.5, { width: .55 });
      this.prop(root, 'screen', w * SCALE / 2 - .4, .8, -.5, { height: .4 });
    }
    if (b.level >= 3) { this.prop(root, 'plant', w * SCALE / 2 - .4, .18, .65, { height: .6 }); this.box(root, 0x79d5d0, 0, .28, h * SCALE / 2 - .18, w * SCALE - .22, .18, .18); }
    this.box(root, accent, 0, .17, h * SCALE / 2 - .12, w * SCALE - .22, .15, .15);
    const entrance = world(this.sim.entrance(b)).sub(root.position); entrance.y = .13; const pad = new T.Group(); pad.position.copy(entrance); root.add(pad);
    const ring = this.squareArea(pad, SCALE, 0xffffff);
    const label = this.label('station-label');
    label.setAttribute('role', 'button'); label.tabIndex = 0; label.setAttribute('aria-label', `${d.name} istasyonuna git`);
    const visit = () => { this.selected = b.id; this.sim.goToBuilding(b.id); this.follow = true; document.querySelector('#app')!.classList.remove('panel-open'); };
    label.addEventListener('click', visit, { signal: this.abort.signal });
    label.addEventListener('keydown', e => { if (e.key === 'Enter') visit(); }, { signal: this.abort.signal });
    // Separate station materials allow only obstructing buildings to fade.
    const materials = new Map<T.Material, T.MeshStandardMaterial>();
    root.traverse(o => { if (o instanceof T.Mesh && o.material instanceof T.MeshStandardMaterial) { const original = o.material; if (!materials.has(original)) materials.set(original, original.clone()); o.material = materials.get(original)!; } });
    const upgrade = new T.Group(); upgrade.position.copy(entrance).add(new T.Vector3(SCALE, 0, 0)); root.add(upgrade);
    this.box(upgrade, 0xffd46b, 0, .025, 0, .75, .05, .75); this.squareArea(upgrade, .9, 0xfff9d6);
    const upgradeLabel = this.label('upgrade-label'); upgradeLabel.setAttribute('role', 'button'); upgradeLabel.tabIndex = 0;
    upgradeLabel.setAttribute('aria-label', `${d.name} yükseltme alanına git`);
    const goUpgrade = () => { this.sim.goTo({ x: this.sim.entrance(b).x + 1, y: this.sim.entrance(b).y }); this.follow = true; };
    upgradeLabel.addEventListener('click', goUpgrade, { signal: this.abort.signal });
    upgradeLabel.addEventListener('keydown', e => { if (e.key === 'Enter') goUpgrade(); }, { signal: this.abort.signal });
    return { root, label, ring, level: b.level, moving, materials: [...materials.values()], upgrade, upgradeLabel };
  }
  private actor(color: number, key: AssetKey): Actor {
    const root = new T.Group(); root.userData.actor = true; this.scene.add(root);
    const instance = this.assets.instantiate(key, { height: 1.65 });
    if (instance) {
      root.add(instance.root); const mixer = new T.AnimationMixer(instance.model), actions = new Map<string, T.AnimationAction>();
      for (const clip of instance.clips) if (['idle', 'walk', 'interact-right', 'holding-both'].includes(clip.name)) actions.set(clip.name, mixer.clipAction(clip));
      actions.get('idle')?.play(); const load = new T.Group(); load.position.set(0, .45, -.45); root.add(load);
      return { root, limbs: [], load, phase: 0, previous: new T.Vector3(), loadKey: '', mixer, actions, mode: 'idle' };
    }
    this.cylinder(root, color, 0, .78, 0, .23, .52, .27);
    this.ball(root, 0xffd0a3, 0, 1.23, 0, .23);
    this.cylinder(root, color, 0, 1.44, 0, .25, .13); this.box(root, color, 0, 1.41, .21, .36, .06, .25);
    this.box(root, 0x344959, -.08, 1.25, .205, .05, .045, .025); this.box(root, 0x344959, .08, 1.25, .205, .05, .045, .025);
    const limbs: T.Group[] = [];
    for (const x of [-.14, .14]) { const leg = new T.Group(); leg.position.set(x, .57, 0); root.add(leg); this.box(leg, 0x3d719b, 0, -.23, 0, .18, .44, .18); this.box(leg, 0x374d62, 0, -.43, .06, .2, .13, .3); limbs.push(leg); }
    for (const x of [-.33, .33]) { const arm = new T.Group(); arm.position.set(x, .95, 0); root.add(arm); this.box(arm, color, 0, -.17, 0, .15, .35, .17); this.ball(arm, 0xffd0a3, 0, -.38, 0, .095); limbs.push(arm); }
    const load = new T.Group(); load.position.set(0, .55, -.4); root.add(load);
    return { root, limbs, load, phase: 0, previous: new T.Vector3(), loadKey: '' };
  }
  private sync() {
    for (const view of this.roomViews) {
      const grade = Math.max(1, ...this.sim.state.buildings.filter(b => roomAt(b.x, b.y)?.id === view.definition.id).map(b => b.level));
      if (this.sim.roomOpen(view.definition.id) && (!view.opened || view.root.userData.grade !== grade)) this.furnishRoom(view);
    }
    for (const b of this.sim.state.buildings) {
      const old = this.views.get(b.id);
      if (old && old.level !== b.level) { this.scene.remove(old.root); old.label.remove(); old.upgradeLabel.remove(); old.root.traverse(o => { if (o instanceof T.Mesh && o.geometry.userData.generated) o.geometry.dispose(); }); old.materials.forEach(m => m.dispose()); this.views.delete(b.id); }
      if (!this.views.has(b.id)) this.views.set(b.id, this.station(b));
    }
    if (!this.actors.has('player')) this.actors.set('player', this.actor(0x38a9ed, 'player'));
    for (let i = 0; i < 3; i++) if (!this.actors.has(`customer${i}`)) this.actors.set(`customer${i}`, this.actor(0xa97ccc, i % 2 ? 'workerAlt' : 'worker'));
    for (const [index, w] of this.sim.state.workers.entries()) if (!this.actors.has(w.id)) this.actors.set(w.id, this.actor(0xffbb55, index % 2 ? 'workerAlt' : 'worker'));
    if (!this.lots.length) for (const spec of [{ kind: 'collection', x: 3, y: 29 }, { kind: 'warehouse', x: 4, y: 33 }, { kind: 'kitchen', x: 28, y: 29 }, { kind: 'workshop', x: 28, y: 19 }] as const) {
      const root = new T.Group(); const d = BUILDINGS[spec.kind]; root.position.copy(world({ x: spec.x + Math.floor(d.width / 2), y: spec.y + d.height })); root.position.y = .13; root.userData.lot = this.lots.length;
      this.box(root, 0x70d678, 0, .02, 0, 1.25, .04, 1.25); this.squareArea(root, 1.25, 0xffffff);
      const arrow = this.mesh(root, new T.ConeGeometry(.22, .45, 4), 0x99ff47, 0, 1.2, 0); arrow.rotation.z = Math.PI;
      const label = this.label('lot-label'); label.setAttribute('role', 'button'); label.tabIndex = 0;
      label.setAttribute('aria-label', `${d.name} satın alma alanına git`);
      const visit = () => { this.sim.goTo({ x: spec.x + Math.floor(d.width / 2), y: spec.y + d.height }); this.follow = true; document.querySelector('#app')!.classList.remove('panel-open'); };
      label.addEventListener('click', visit, { signal: this.abort.signal });
      label.addEventListener('keydown', e => { if (e.key === 'Enter') visit(); }, { signal: this.abort.signal });
      this.scene.add(root); this.lots.push({ ...spec, root, label, hold: 0, warned: false, eligible: true });
    }
  }
  private project(label: HTMLElement, point: T.Vector3) {
    const p = point.clone().project(this.camera), width = this.host.clientWidth, height = this.host.clientHeight;
    const visible = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.12 && Math.abs(p.y) < 1.1;
    label.style.display = visible ? '' : 'none';
    const x = (p.x * .5 + .5) * width; let y = (-p.y * .5 + .5) * height;
    const head = world(this.sim.state.player).add(new T.Vector3(0, 1.6, 0)).project(this.camera), feet = world(this.sim.state.player).project(this.camera);
    const hx = (head.x * .5 + .5) * width, hy = (-head.y * .5 + .5) * height, fy = (-feet.y * .5 + .5) * height;
    if (visible && Math.abs(x - hx) < label.offsetWidth / 2 + 17 && y > hy - 8 && y - label.offsetHeight < fy + 5) y = hy - 10;
    label.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
  }
  private updateActor(id: string, point: Point, inventory: Inventory, dt: number, working: boolean) {
    const a = this.actors.get(id)!, p = world(point), delta = p.clone().sub(a.previous), walking = delta.length() > .001;
    a.root.position.copy(p); if (walking) a.root.rotation.y = Math.atan2(delta.x, delta.z);
    if (working) {
      const job = this.sim.state.buildings.find(b => b.job?.owner === id);
      if (job) { const direction = world(job).sub(p); a.root.rotation.y = Math.atan2(direction.x, direction.z); }
    }
    if (!this.sim.state.settings.paused) a.phase += dt * (walking ? 11 : working ? 8 : 1.5);
    const stride = walking ? Math.sin(a.phase) * .65 : 0;
    if (a.mixer && !this.sim.state.settings.paused) {
      const mode = walking ? 'walk' : working ? 'interact-right' : count(inventory) ? 'holding-both' : 'idle';
      if (mode !== a.mode && a.actions?.has(mode)) { a.actions.get(a.mode!)?.fadeOut(.15); a.actions.get(mode)!.reset().fadeIn(.15).play(); a.mode = mode; }
      a.mixer.update(dt * this.sim.state.settings.speed * this.sim.multiplier);
    } else if (a.limbs.length) {
      a.limbs[0].rotation.x = stride; a.limbs[1].rotation.x = -stride;
      a.limbs[2].rotation.x = working ? -1 + Math.sin(a.phase) * .25 : -stride;
      a.limbs[3].rotation.x = working ? -1 - Math.sin(a.phase) * .25 : stride;
    }
    a.root.position.y = .12 + (walking ? Math.abs(Math.sin(a.phase)) * .055 : 0); a.previous.copy(p);
    const key = JSON.stringify(inventory);
    if (a.loadKey !== key) {
      while (a.load.children.length) { const child = a.load.children[0] as T.Mesh; a.load.remove(child); child.geometry.dispose(); }
      Object.entries(inventory).filter(([, n]) => n > 0).forEach(([r, n]) => { for (let i = 0; i < Math.min(n, 4); i++) this.box(a.load, RESOURCES[r as keyof typeof RESOURCES].color, 0, a.load.children.length * .21, 0, .43, .19, .37); });
      a.loadKey = key;
    }
  }
  private animate = (now: number) => {
    const dt = this.last ? Math.min((now - this.last) / 1000, .1) : 0; this.last = now;
    let dx = this.touchMovement.x + (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    let dy = this.touchMovement.y + (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    const length = Math.hypot(dx, dy); if (length > 1) { dx /= length; dy /= length; }
    if (length > .05 && !this.sim.state.settings.paused) { this.sim.movePlayer(dx, dy, dt); this.follow = true; }
    this.sim.tick(dt); this.sync();
    const s = this.sim.state;
    const atUpgrade = s.buildings.find(b => b.level < 3 && Math.hypot(s.player.x - this.sim.entrance(b).x - 1, s.player.y - this.sim.entrance(b).y) < .35);
    if (this.autoUpgrade.id !== (atUpgrade?.id ?? '')) this.autoUpgrade = { id: atUpgrade?.id ?? '', remaining: 0, latched: false };
    if (atUpgrade && !s.settings.paused && !s.player.path.length && !this.autoUpgrade.latched) {
      this.autoUpgrade.remaining += dt;
      if (this.autoUpgrade.remaining >= 1.3) { this.autoUpgrade.latched = true; this.sim.upgradeBuilding(atUpgrade.id); }
    }
    this.updateActor('player', s.player, s.player.bag, dt, !!s.player.activeBuilding);
    for (const w of s.workers) this.updateActor(w.id, w, w.carrying, dt, w.phase === 'working');
    const counter = s.buildings.find(b => b.kind === 'shop');
    if (counter) {
      const entrance = this.sim.entrance(counter);
      for (let i = 0; i < 3; i++) {
        this.updateActor(`customer${i}`, { x: entrance.x + 1.5 + i * 1.2, y: entrance.y + 1.1 }, {}, dt, false);
        this.actors.get(`customer${i}`)!.root.rotation.y = Math.PI;
      }
    }
    if (this.follow) this.target.lerp(world(s.player).add(new T.Vector3(0, .5, 0)), 1 - Math.exp(-dt * 6));
    const zoom = this.cameras.main.zoom, distance = this.follow ? 1 : Math.max(MAP_HEIGHT / 12, MAP_WIDTH / 13 / this.camera.aspect);
    this.camera.position.copy(this.target).add(new T.Vector3(0, 15 * distance / zoom, 16 * distance / zoom)); this.camera.lookAt(this.target);
    const head = world(s.player).add(new T.Vector3(0, 1.1, 0)), sight = new T.Raycaster(this.camera.position, head.clone().sub(this.camera.position).normalize(), 0, this.camera.position.distanceTo(head) - .15);
    const obscuring = new Set<string>();
    for (const hit of sight.intersectObjects([...this.views.values()].map(v => v.root), true)) { let o: T.Object3D | null = hit.object; while (o) { if (o.userData.building) { obscuring.add(o.userData.building); break; } o = o.parent; } }
    for (const b of s.buildings) {
      const v = this.views.get(b.id)!, amount = count(b.output), active = this.selected === b.id || this.sim.nearby(b);
      const occluded = obscuring.has(b.id);
      for (const material of v.materials) { material.opacity = T.MathUtils.lerp(material.opacity, occluded ? .22 : 1, 1 - Math.exp(-dt * 12)); material.transparent = material.opacity < .99; material.depthWrite = !material.transparent; }
      v.label.style.opacity = occluded ? '.3' : '1';
      (v.ring.material as T.MeshBasicMaterial).color.set(active ? 0x99ff66 : amount ? 0xffdb67 : 0xffffff);
      const content = `<b>${BUILDINGS[b.kind].icon} ${BUILDINGS[b.kind].name}</b><small>${b.job ? `⚙ ${Math.ceil(b.job.remaining)} sn` : amount ? this.sim.testMode ? '📦 ∞ hazır' : `📦 ${amount} hazır` : b.kind === 'warehouse' ? this.sim.testMode ? '∞ stok ve kapasite' : `${count(s.inventory)}/${this.sim.capacity}` : b.kind === 'shop' ? '📋 Sipariş teslim et' : 'Sv. ' + b.level}</small>`;
      if (v.label.innerHTML !== content) v.label.innerHTML = content;
      v.label.classList.toggle('nearby', active);
      this.project(v.label, v.root.position.clone().add(new T.Vector3(0, b.kind === 'home' ? 3.2 : 2.7, 0)));
      if (this.follow && world(s.player).distanceTo(v.root.position) > 11) v.label.style.display = 'none';
      if (!this.follow) v.label.style.display = 'none';
      v.upgrade.visible = b.level < 3;
      const upgradeHtml = `<b>↑ Sv. ${b.level + 1}</b><small>🍃 ${Math.round(BUILDINGS[b.kind].cost * .65 * b.level)}</small>`;
      if (v.upgradeLabel.innerHTML !== upgradeHtml) v.upgradeLabel.innerHTML = upgradeHtml;
      this.project(v.upgradeLabel, v.root.position.clone().add(v.upgrade.position).add(new T.Vector3(0, .75, 0)));
      if (b.level >= 3 || !active || !this.follow) v.upgradeLabel.style.display = 'none';
      if (b.job && !s.settings.paused) for (const part of v.moving) part.rotation.y += dt * 3;
    }
    for (const view of this.roomViews) {
      const r = view.definition, opened = this.sim.roomOpen(r.id), ready = this.sim.roomUnlockable(r.id);
      view.gate.visible = !opened;
      view.label.setAttribute('aria-label', opened ? `${r.name} girişine git` : `${r.name} açma alanına git`);
      view.label.classList.toggle('locked', !opened && !ready); view.label.classList.toggle('opened', opened);
      (view.gate.children[0] as T.Mesh<T.BoxGeometry, T.MeshStandardMaterial>).material.color.set(ready ? 0x7cdf79 : 0xb4b4a0);
      const near = world(s.player).distanceTo(view.gate.position) < .65;
      if (!opened && near && !s.settings.paused && !s.player.path.length) {
        view.hold += dt;
        if (view.hold >= 1.3 && !view.warned) { view.warned = true; this.sim.unlockRoom(r.id); }
      } else { view.hold = 0; view.warned = false; }
      const roomHtml = `<b>${opened ? r.icon : ready ? '＋' : '🔒'} ${r.name}</b><small>${opened ? 'AÇIK' : `Seviye ${r.level} · 🍃 ${r.cost}`}${!opened && near && ready ? ' · ' + Math.min(100, Math.floor(view.hold / 1.3 * 100)) + '%' : ''}</small>`;
      if (view.label.innerHTML !== roomHtml) view.label.innerHTML = roomHtml;
      this.project(view.label, world(opened ? r.door : r.gate).add(new T.Vector3(0, opened ? 2 : 1.3, 0)));
    }
    const checkLots = now - this.lotCheck > 500;
    if (checkLots) this.lotCheck = now;
    for (const lot of this.lots) {
      const built = s.buildings.some(b => b.x === lot.x && b.y === lot.y);
      if (checkLots) lot.eligible = this.sim.placementValid(lot.kind, lot.x, lot.y, false);
      lot.root.visible = !built && lot.eligible;
      if (!lot.root.visible) { lot.label.style.display = 'none'; continue; }
      const near = world(s.player).distanceTo(lot.root.position) < .65;
      if (near && !s.settings.paused) {
        lot.hold += dt;
        if (lot.hold > 1.3) { if (s.money >= BUILDINGS[lot.kind].cost) this.sim.build(lot.kind, lot.x, lot.y, false); else if (!lot.warned) { this.sim.notify('Bu alan için yeterli yaprağın yok.'); lot.warned = true; } }
      } else { lot.hold = 0; lot.warned = false; }
      lot.root.children[2].position.y = 1.15 + Math.sin(now / 350) * .12;
      const html = `<b>＋ ${BUILDINGS[lot.kind].name}</b><small>🍃 ${BUILDINGS[lot.kind].cost}${near ? ' · ' + Math.min(100, Math.floor(lot.hold / 1.3 * 100)) + '%' : ''}</small>`;
      if (lot.label.innerHTML !== html) lot.label.innerHTML = html;
      this.project(lot.label, lot.root.position.clone().add(new T.Vector3(0, 1.55, 0)));
    }
    this.ghost.visible = !!this.buildMode && !!this.ghostPoint;
    if (this.buildMode && this.ghostPoint) {
      const d = BUILDINGS[this.buildMode.kind], w = this.buildMode.rotated ? d.height : d.width, h = this.buildMode.rotated ? d.width : d.height;
      this.ghost.position.copy(world({ x: this.ghostPoint.x + (w - 1) / 2, y: this.ghostPoint.y + (h - 1) / 2 })); this.ghost.position.y = .08; this.ghost.scale.set(w * SCALE, h * SCALE, 1);
      (this.ghost.material as T.MeshBasicMaterial).color.set(this.sim.placementValid(this.buildMode.kind, this.ghostPoint.x, this.ghostPoint.y, this.buildMode.rotated) ? 0x72f879 : 0xff6868);
    }
    this.renderer.render(this.scene, this.camera); this.frame = requestAnimationFrame(this.animate);
  };
  setZoom(zoom: number) { this.cameras.main.zoom = T.MathUtils.clamp(zoom, .55, 1.8); }
  centerPlayer() { this.follow = true; this.target.copy(world(this.sim.state.player)).y = .5; }
  fit(_force?: boolean) { this.follow = false; this.target.set(0, 0, 0); this.setZoom(1); }
  private resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  private ground(p: Point) {
    const r = this.renderer.domElement.getBoundingClientRect(); this.ray.setFromCamera(new T.Vector2((p.x - r.left) / r.width * 2 - 1, -(p.y - r.top) / r.height * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, new T.Vector3());
    return hit ? { x: Math.round(hit.x / SCALE + (MAP_WIDTH - 1) / 2), y: Math.round(hit.z / SCALE + (MAP_HEIGHT - 1) / 2) } : undefined;
  }
  private click(p: Point) {
    const point = this.ground(p); if (!point) return;
    if (this.buildMode) { if (this.sim.build(this.buildMode.kind, point.x, point.y, this.buildMode.rotated)) this.buildMode = undefined; return; }
    const hits = this.ray.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      let o: T.Object3D | null = hit.object;
      while (o) {
        if (o.userData.room) { const room = ROOMS.find(r => r.id === o!.userData.room)!; this.sim.goTo(room.gate); this.follow = true; return; }
        if (o.userData.building) { this.selected = o.userData.building; this.sim.goToBuilding(this.selected!); this.follow = true; document.querySelector('#app')!.classList.remove('panel-open'); return; }
        if (o.userData.lot !== undefined) { const lot = this.lots[o.userData.lot]; this.sim.goTo({ x: lot.x + Math.floor(BUILDINGS[lot.kind].width / 2), y: lot.y + BUILDINGS[lot.kind].height }); this.follow = true; return; }
        o = o.parent;
      }
      if (hit.object.userData.actor) return;
    }
    this.sim.goTo(point); this.follow = true;
  }
  private bind() {
    const opts = { signal: this.abort.signal }, canvas = this.renderer.domElement;
    window.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName) || document.querySelector('dialog[open]')) return;
      const key = e.key.toLowerCase(); this.keys.add(key);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      if (e.repeat) return;
      if (key === ' ') this.sim.state.settings.paused = !this.sim.state.settings.paused;
      if (key === 'r' && this.buildMode) this.buildMode.rotated = !this.buildMode.rotated;
      if (key === 'escape') { this.buildMode = undefined; document.querySelector('#app')!.classList.remove('panel-open'); }
    }, opts);
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()), opts);
    window.addEventListener('blur', () => { this.keys.clear(); this.touchMovement = { x: 0, y: 0 }; }, opts);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.cameras.main.zoom * Math.exp(-e.deltaY * .001)); }, { ...opts, passive: false });
    canvas.addEventListener('pointerdown', e => { canvas.focus(); canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.drag = { x: e.clientX, y: e.clientY }; this.dragged = false; this.pinch = 0; }, opts);
    canvas.addEventListener('pointermove', e => {
      const p = { x: e.clientX, y: e.clientY }; this.ghostPoint = this.ground(p);
      if (!this.pointers.has(e.pointerId)) return;
      const previous = this.pointers.get(e.pointerId)!; this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) this.setZoom(this.cameras.main.zoom * d / this.pinch); this.pinch = d; this.dragged = true; return; }
      if (this.drag && Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 7) this.dragged = true;
      if (this.dragged && !this.buildMode) { this.follow = false; this.target.x -= (p.x - previous.x) * .04 / this.cameras.main.zoom; this.target.z -= (p.y - previous.y) * .05 / this.cameras.main.zoom; this.target.x = T.MathUtils.clamp(this.target.x, -22, 22); this.target.z = T.MathUtils.clamp(this.target.z, -22, 22); }
    }, opts);
    canvas.addEventListener('pointerup', e => { if (!this.dragged && this.pointers.size === 1) this.click({ x: e.clientX, y: e.clientY }); this.pointers.delete(e.pointerId); this.pinch = 0; }, opts);
    canvas.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.pinch = 0; }, opts);
  }
  dispose() { cancelAnimationFrame(this.frame); this.observer.disconnect(); this.abort.abort(); this.actors.forEach(a => a.mixer?.stopAllAction()); this.scene.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); }); this.views.forEach(v => v.materials.forEach(m => m.dispose())); this.materials.forEach(m => m.dispose()); this.assets.dispose(); this.renderer.dispose(); this.labels.remove(); this.renderer.domElement.remove(); }
}
