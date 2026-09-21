import { BAR_CENTER, poolDirtyRack, poolTowelRack, wantsDrink } from './PoolServices';
import { guestInWater } from './GuestPreferences';
import { foldedTowel } from './FoldedTowel';
import { guestMood } from './GuestMood';
import './guest-mood.css';
import { staffIconSvg, staffRole } from './StaffHiring';
import * as T from 'three';
import { AssetLibrary, type AssetInstance } from '../game/AssetLibrary';
import type { AssetKey } from '../game/assetCatalog';
import { HEIGHT, LAUNDRY_FRONT_EDGE, LAUNDRY_ORIGIN, LAUNDRY_TRASH_PROP, MAP_MAX_X, MAP_MIN_X, RECEPTION, ROOM_DEFS, ROOM_DOOR, ROOM_WORK, SEAT_DEFS, DIRTY_BASKET, DIRTY_HAMPER, TOWEL_RACK, WIDTH } from './data';
import { ResortSimulation } from './Simulation';
import type { Actor, Area, Point, Towels } from './types';
import { taskIndicators, taskIconSvg, type TaskIndicator } from './TaskIndicators';
import { cleaningProgress, resortGoal, upgradeBenefit } from './Guidance';
import { ResortGameFeel } from './GameFeel';
import { BedLinen } from './BedLinen';
import { TowelShelf } from './TowelShelf';
import { linenCount } from './Linen';
import { OFFICE } from './Office';
import { LAUNDRY_WALLS, laundryMachines } from './LaundryLayout';
import './hire-marker.css';

interface Character { root: T.Group; load: T.Group; broom: T.Group; tray: T.Group; iceCream: T.Group; net: T.Group; mixer?: T.AnimationMixer; actions: Map<string, T.AnimationAction>; mode: string; previous: T.Vector3; bagKey: string }
// Keep the reception's cash and upgrade interaction zones available to the
// simulation, but remove their old yellow floor markers from the scene.
const HIDDEN_RECEPTION_MARKERS = new Set(['receptionCash', 'receptionUpgrade']);
const RECEPTION_VISUAL_X = RECEPTION.x - 1;
const world = (p: Point) => new T.Vector3(p.x - 19, 0, p.y - 27);
const purchaseIconSvg = (kind: 'bed' | 'pool' | 'bar' | 'lock') => {
  const paths = {
    bed: '<path d="M3 18v3m18-3v3M3 10V5h3m-3 5h18v8H3v-8Z"/><rect x="6" y="6" width="5" height="4" rx="1"/><rect x="12" y="6" width="5" height="4" rx="1"/>',
    pool: '<path d="M4 13V7h16v6M7 7V4m5 3V4m5 3V4M3 14c2 0 2 2 5 2s3-2 5-2 2 2 5 2 3-2 5-2M3 19c2 0 2 2 5 2s3-2 5-2 2 2 5 2 3-2 5-2"/>',
    bar: '<path d="M6 7h12l-1 14H7L6 7Z"/><path d="M9 3h6m-3 4V3m4 4 3-3"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3m-5 4v3"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`;
};
const officeDevelopmentIconSvg = () => '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="9" r="4"/><path d="M3 25v-3a7 7 0 0 1 14 0v3m7 0V7m-5 5 5-5 5 5"/></svg>';
export class ResortWorld {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(43, 1, .1, 200);
  private renderer = new T.WebGLRenderer({ antialias: true });
  private host = document.querySelector<HTMLDivElement>('#game')!;
  private labels = document.createElement('div');
  private structures = new T.Group();
  private characters = new Map<string, Character>();
  private pads = new Map<string, { root: T.Group; outline: T.Mesh; fill: T.Mesh; label: HTMLButtonElement; area: Area }>();
  private facilityLabels = new Map<string, HTMLDivElement>();
  private tipModels = new Map<string, T.Group>();
  private guestMoods = new Map<string, HTMLDivElement>();
  private moneyModels = new Map<string, T.Group>();
  private taskMarkers = new Map<string, { button: HTMLButtonElement; progress: HTMLSpanElement; notice: TaskIndicator }>();
  private dirtModels = new Map<string, T.Mesh[]>();
  private bedLinen = new Map<string, BedLinen>();
  private bathroomDoors = new Map<string, T.Group>();
  private stockModels = new Map<string, T.Mesh[]>();
  private washerDoors: { root: T.Object3D; mixer: T.AnimationMixer; open: T.AnimationAction; close: T.AnimationAction; closed: boolean }[] = [];
  private washerStates: { open: T.Object3D; closed: T.Object3D }[] = [];
  private poolLeaves: T.Mesh[] = [];
  private drums: T.Mesh[] = [];
  private feel: ResortGameFeel;
  private beacon = new T.Group();
  private footsteps: T.Mesh[] = [];
  private materials = new Map<number, T.MeshStandardMaterial>();
  private roomFloorTexture: T.Texture;
  private roomFloorMaterial: T.MeshStandardMaterial;
  private promenadeTexture: T.Texture;
  private promenadeMaterial: T.MeshStandardMaterial;
  private poolTileTexture: T.Texture;
  private poolTileNormal: T.Texture;
  private poolTileMaterial: T.MeshStandardMaterial;
  private poolWaterMaterial: T.MeshStandardMaterial;
  private target = world({ x: RECEPTION.x, y: 44 });
  private keys = new Set<string>();
  private touch: Point = { x: 0, y: 0 };
  private zoom = 1;
  private follow = true;
  private layoutKey = '';
  private abort = new AbortController();
  private observer: ResizeObserver;
  private last = 0;
  private frame = 0;
  private pointers = new Map<number, Point>();
  private dragged = false;
  private origin?: Point;
  private pinch = 0;
  private wave!: T.Mesh;
  constructor(private sim: ResortSimulation, private assets: AssetLibrary, private inspect: (id: string) => void) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); this.renderer.setClearColor(0xd4edec);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    const publicAsset = (path: string) => new URL(`assets/${path}`, document.baseURI).href;
    this.roomFloorTexture = new T.TextureLoader().load(publicAsset('polyhaven/herringbone-parquet/herringbone_parquet_diff_1k.jpg'));
    this.roomFloorTexture.colorSpace = T.SRGBColorSpace; this.roomFloorTexture.wrapS = this.roomFloorTexture.wrapT = T.RepeatWrapping;
    this.roomFloorTexture.repeat.set(1.75, 1.4); this.roomFloorTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.roomFloorMaterial = new T.MeshStandardMaterial({ color: 0xffe8ca, map: this.roomFloorTexture, roughness: .76 });
    this.promenadeTexture = new T.TextureLoader().load(publicAsset('polyhaven/pavement-05/pavement_05_diff_1k.jpg'));
    this.promenadeTexture.colorSpace = T.SRGBColorSpace; this.promenadeTexture.wrapS = this.promenadeTexture.wrapT = T.RepeatWrapping;
    this.promenadeTexture.repeat.set(2.1, 9); this.promenadeTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.promenadeMaterial = new T.MeshStandardMaterial({ color: 0xe8cfaa, map: this.promenadeTexture, roughness: .9 });
    this.poolTileTexture = new T.TextureLoader().load(publicAsset('opengameart/blue-pool-tiles/pooltiles_albedo.png'));
    this.poolTileNormal = new T.TextureLoader().load(publicAsset('opengameart/blue-pool-tiles/pooltiles_normal.png'));
    for (const texture of [this.poolTileTexture, this.poolTileNormal]) { texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(5, 3); texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); }
    this.poolTileTexture.colorSpace = T.SRGBColorSpace;
    this.poolTileMaterial = new T.MeshStandardMaterial({ map: this.poolTileTexture, normalMap: this.poolTileNormal, roughness: .72 });
    this.poolWaterMaterial = new T.MeshStandardMaterial({ color: 0x48cbd5, transparent: true, opacity: .58, roughness: .12, metalness: .05 });
    this.renderer.domElement.tabIndex = 0; this.renderer.domElement.setAttribute('aria-label', 'Ege Kaçamağı 3D tatil köyü'); this.host.append(this.renderer.domElement);
    this.labels.className = 'resort-world-labels'; this.host.append(this.labels);
    this.scene.background = new T.Color(0xd4edec); this.scene.fog = new T.Fog(0xd4edec, 95, 160);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x96ae82, 2));
    const sun = new T.DirectionalLight(0xfff4dc, 3.3); sun.position.set(-25, 45, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 120 }); sun.shadow.bias = -.0004; this.scene.add(sun);
    this.scene.add(this.structures); this.environment(); this.rebuild(); this.events();
    this.feel = new ResortGameFeel(this.scene, this.labels, (el, p) => this.project(el, p));
    const ring = new T.Mesh(new T.RingGeometry(.82, 1, 32), new T.MeshBasicMaterial({ color: 0xffdd65, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .21; this.beacon.add(ring);
    const arrow = new T.Mesh(new T.ConeGeometry(.28, .6, 4), this.material(0xffd66c)); arrow.rotation.z = Math.PI; arrow.position.y = 1.4; this.beacon.add(arrow); this.scene.add(this.beacon);
    for (let i = 0; i < 16; i++) { const dot = new T.Mesh(new T.CircleGeometry(.13, 8), new T.MeshBasicMaterial({ color: 0xffe8a0, side: T.DoubleSide })); dot.rotation.x = -Math.PI / 2; dot.visible = false; this.scene.add(dot); this.footsteps.push(dot); }
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host); this.resize(); this.frame = requestAnimationFrame(this.animate);
  }
  private material(color: number) { let m = this.materials.get(color); if (!m) { m = new T.MeshStandardMaterial({ color, roughness: .85 }); this.materials.set(color, m); } return m; }
  setVolume(value: number) { this.feel.setVolume(value); }
  private box(parent: T.Object3D, color: number, x: number, y: number, z: number, w: number, h: number, d: number) { const g = new T.BoxGeometry(w, h, d); g.userData.generated = true; const mesh = new T.Mesh(g, this.material(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
  private sphere(parent: T.Object3D, color: number, x: number, y: number, z: number, radius: number, sx = 1, sy = 1, sz = 1) { const g = new T.IcosahedronGeometry(radius, 1); g.userData.generated = true; const m = new T.Mesh(g, this.material(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; }
  private prop(parent: T.Object3D, key: AssetKey, x: number, y: number, z: number, size: { width?: number; height?: number }, rotation = 0) { const a = this.assets.instantiate(key, size); if (a) { a.root.position.set(x, y, z); a.root.rotation.y = rotation; parent.add(a.root); } return a; }
  private group(p: Point, parent: T.Object3D = this.structures) { const g = new T.Group(); g.position.copy(world(p)); parent.add(g); return g; }
  private palm(x: number, y: number, height = 5) {
    const g = this.group({ x, y }, this.scene);
    if (!this.prop(g, (x + y) % 2 ? 'palmTall' : 'palmBent', 0, 0, 0, { height }, ((x * 7 + y) % 9) * .3)) {
      this.box(g, 0xac8060, 0, height / 2, 0, .35, height, .35);
      for (let i = 0; i < 7; i++) { const leaf = new T.Group(); leaf.position.y = height; leaf.rotation.y = i / 7 * Math.PI * 2; leaf.rotation.z = -.25; this.box(leaf, i % 2 ? 0x5dab79 : 0x79bf76, 0, -.1, 1.05, .65, .15, 2.6); g.add(leaf); }
    }
  }
  private paving(center: Point, width: number, depth: number, palette: number[], elevation = .015, surface?: T.MeshStandardMaterial) {
    const g = this.group(center, this.scene);
    // Warm stone slabs with recessed sand-coloured joints, not a flat white floor.
    this.box(g, 0x9c805c, 0, elevation, 0, width, .08, depth);
    if (surface) { const slab = this.box(g, 0xffffff, 0, elevation + .055, 0, width - .08, .035, depth - .08); slab.material = surface; return; }
    const columns = Math.ceil(width / 1.8), rows = Math.ceil(depth / 1.25);
    const slabWidth = width / columns, slabDepth = depth / rows;
    const geometry = new T.BoxGeometry(slabWidth - .045, .035, slabDepth - .045);
    geometry.userData.generated = true;
    const stones = new T.InstancedMesh(geometry, this.material(0xffffff), columns * rows);
    const matrix = new T.Matrix4(), color = new T.Color();
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const i = row * columns + column;
      matrix.makeTranslation(-width / 2 + (column + .5) * slabWidth, elevation + .055, -depth / 2 + (row + .5) * slabDepth);
      stones.setMatrixAt(i, matrix);
      stones.setColorAt(i, color.setHex(palette[(column * 7 + row * 3 + Math.floor(row / 3)) % palette.length]));
    }
    stones.receiveShadow = true; g.add(stones);
  }
  private environment() {
    const office = this.group({ x: OFFICE.x, y: OFFICE.y - 1 }, this.scene);
    this.box(office, 0xe8c494, 0, .08, 0, 8.5, .16, 6.5);
    this.box(office, 0x8bbcb5, 0, 1.35, -3, 8.3, 2.5, .2);
    this.box(office, 0x8bbcb5, 4, .65, 0, .2, 1.1, 6);
    // Leave a visible doorway on the left side while closing the lower/front edge.
    this.box(office, 0x8bbcb5, -4, .65, -1.2, .2, 1.1, 3.6);
    this.box(office, 0x8bbcb5, -4, .65, 2.1, .2, 1.1, 1.8);
    for (const x of [-2.5, 2.5]) this.box(office, 0xf7edcf, x, .5, 3, 3, .8, .2);
    // Close the former front opening; the existing left-side doorway remains.
    this.box(office, 0xf7edcf, 0, .5, 3, 2, .8, .2);
    this.prop(office, 'roomRug', 0, .18, -.25, { width: 3.2 });
    this.prop(office, 'officeDesk', 0, .18, -1, { height: 1.2 });
    this.prop(office, 'officeChair', 0, .18, .25, { height: 1.2 }, Math.PI);
    this.prop(office, 'officeLaptop', .32, 1.4, -1.05, { width: .85 });
    const picture = new T.Group(); picture.position.set(2, 1.9, -2.84); office.add(picture);
    this.box(picture, 0x765039, 0, 0, 0, 1.45, .98, .12);
    this.box(picture, 0xf3e6c3, 0, 0, .067, 1.31, .84, .025);
    this.box(picture, 0x86c8c0, 0, .12, .083, 1.24, .56, .015);
    this.box(picture, 0x4f9aa0, 0, -.24, .092, 1.24, .16, .015);
    this.sphere(picture, 0xf1c464, -.34, .26, .105, .12, 1, 1, .18);
    const shore = this.box(picture, 0xe3aa72, .32, -.12, .105, .58, .12, .02); shore.rotation.z = -.12;
    this.prop(office, 'bedsideTable', 3.05, .18, -2.25, { height: .86 });
    this.prop(office, 'plantSmallA', -3, .1, -2, { height: 1.25 });
    const ground = this.group({ x: 19, y: 25 }, this.scene); this.box(ground, 0xeeddb4, 0, -.22, 0, 44, .4, 60);
    const grass = this.group({ x: 18, y: 27 }, this.scene); this.box(grass, 0xa3c98c, 0, -.03, 0, 38, .08, 46);
    const sea = this.group({ x: 57, y: 27 }, this.scene); const water = new T.Mesh(new T.PlaneGeometry(45, 100), new T.MeshStandardMaterial({ color: 0x41babc, roughness: .24, metalness: .12 })); water.rotation.x = -Math.PI / 2; water.position.y = -.12; sea.add(water); this.wave = water;
    for (let i = 0; i < 4; i++) this.box(sea, [0x76d4cf, 0x99e0d5, 0xb9e7d9, 0xe4f0db][i], -21.5 + i * .65, -.06, 0, .3, .025, 80);
    const promenade = [0xc39a6b, 0xcba477, 0xb99468, 0xd1ac80, 0xc09c73];
    const courtyard = [0xd0ad82, 0xc9a478, 0xd8b88e, 0xc7a27a, 0xd3b18a];
    this.paving({ x: 19, y: 47 }, 37, 8, courtyard);
    for (const r of ROOM_DEFS) {
      const door = ROOM_DOOR(r);
      const promenadeEdge = door.x < 18 ? 14 : 24;
      this.paving({ x: (door.x + promenadeEdge) / 2, y: door.y }, Math.abs(promenadeEdge - door.x), 2, courtyard, .035);
    }
    // Fill the complete corridor between the bungalow rows. The left entrance
    // edge is around x=11 and the right row starts at x=24, so the 13-cell
    // route reaches both sides without leaving a pale strip on the left.
    this.paving({ x: 17.5, y: 25.5 }, 13, 35, promenade, .045, this.promenadeMaterial);
    // Narrow terracotta borders frame the main promenade and its garden edges.
    for (const x of [11.08, 23.92]) {
      const border = this.group({ x, y: 25.5 }, this.scene);
      this.box(border, 0xa97451, 0, .085, 0, .16, .035, 35);
    }
    // Edge landscaping stays outside the bungalow footprints after the map
    // expansion, so tree crowns cannot spill into guest rooms.
    for (const [x, y] of [[-1, 8], [-1, 23], [-1, 43], [36, 16], [36, 31], [36, 46], [16, 2], [32, 1]]) this.palm(x, y, 4 + (y % 3));
    for (let y = 3; y < 49; y += 5) { const g = this.group({ x: 0, y }, this.scene); this.prop(g, 'bush', 0, 0, 0, { width: 1.7 }); }
    for (let y = 14; y < 48; y += 3) { const g = this.group({ x: 35, y }, this.scene); this.box(g, 0xfff5d5, 0, .6, 0, .12, 1.2, .12); this.box(g, 0xfff5d5, 0, .7, 1.4, .1, .1, 2.8); }
  }
  private bungalow(r: typeof ROOM_DEFS[number]) {
    const f = this.sim.facility(r.id), g = this.group({ x: r.x + 4.5, y: r.y + 3.5 });
    if (!f.open) { this.box(g, 0xcbc5a9, 0, .045, 0, 9.8, .1, 7.8); for (const x of [-4.5, 4.5]) this.box(g, 0xe4dbbc, x, .15, 0, .15, .2, 7.8); this.box(g, 0xe4dbbc, 0, .15, -3.5, 9.8, .2, .15); return; }
    this.box(g, 0xa9784e, 0, .08, 0, 9.8, .18, 7.8);
    // A real herringbone parquet texture makes rooms unmistakably different from
    // the large stone slabs of the promenade, even at the zoomed-out camera angle.
    const roomFloor = this.box(g, 0xffffff, 0, .19, 0, 9.3, .04, 7.3);
    roomFloor.material = this.roomFloorMaterial;
    // Both rows open sideways onto the central promenade; the front is a solid cutaway wall.
    this.box(g, r.color, 0, 1.7, -3.5, 10, 3.1, .25);
    const entranceX = r.x < 15 ? 4.5 : -4.5;
    this.box(g, r.color, -entranceX, 1.4, 0, .25, 2.55, 7);
    // Low entrance-side segments and open jambs keep every doorway visible from above.
    this.box(g, r.color, entranceX, .55, -1.5, .25, .75, 4);
    this.box(g, r.color, entranceX, .55, 3, .25, .75, 1);
    for (const z of [.5, 2.5]) this.box(g, 0xffe9bf, entranceX, 1.05, z, .35, 1.8, .2);
    this.box(g, 0xc58e69, entranceX, .23, 1.5, .65, .12, 2);
    this.box(g, 0xffe9bf, 0, .55, 3.5, 9.2, .75, .25);
    this.box(g, 0xffe9bf, 0, 3.28, -3.5, 10.2, .2, .35);
    this.box(g, 0xffe9bf, -entranceX, 2.75, 0, .35, .2, 7.5);
    this.box(g, 0xffe9bf, entranceX, 1, -1.5, .35, .12, 4);
    this.box(g, 0xffe9bf, entranceX, 1, 3, .35, .12, 1);
    // The window faces the resort exterior, never the bungalow behind it. Keeping it
    // toward the foot of the room also leaves the level-two bathroom wall untouched.
    const exteriorX = r.x < 15 ? -4.38 : 4.38, windowZ = 1.65;
    this.prop(g, 'exteriorWindow', exteriorX + (r.x < 15 ? .08 : -.08), .92, windowZ, { height: 2.05 }, r.x < 15 ? Math.PI / 2 : -Math.PI / 2);
    const curtain = this.prop(g, 'roomCurtain', exteriorX + (r.x < 15 ? .3 : -.3), .56, windowZ, { height: 1.88 }, r.x < 15 ? Math.PI / 2 : -Math.PI / 2);
    curtain?.model.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const materials = source.map(material => {
        const copy = material.clone();
        if (copy instanceof T.MeshStandardMaterial && copy.name === 'soft') copy.color.set(r.x < 15 ? 0xe7aa83 : 0x82bfae);
        return copy;
      });
      if (source.some(material => material.name === 'carcass')) object.visible = false;
      object.material = Array.isArray(object.material) ? materials : materials[0];
    });
    const bedColor = f.level === 2 ? 0x70b9ac : 0x80b8d9;
    const singleRoom = f.level === 1, bedX = singleRoom ? 0 : -1.5, bedWidth = singleRoom ? 1.8 : 3.35, bedDepth = singleRoom ? 3.8 : 4.15;
    const bed = this.prop(g, singleRoom ? 'bedSingle' : 'bedDouble', bedX, .2, -.5, {});
    bed?.model.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      // The asset's white carcass includes a second mattress/cover surface.
      // Keep its frame and headboard; render one explicit mattress and our own
      // three linen states so the stripped bed cannot show layered white covers.
      if (materials.some(material => ['soft', 'accent', 'carcass'].includes(material.name))) object.visible = false;
    });
    if (bed) bed.root.children[0].scale.set(bedWidth / (singleRoom ? 1.17 : 2.02), 1, bedDepth / 2.204);
    this.box(g, singleRoom ? 0x987658 : 0x8c694f, bedX, .48, -.5, bedWidth, .42, bedDepth);
    this.box(g, 0xfff8e8, bedX, .82, -.5, bedWidth - .15, .28, bedDepth - .2);
    const linen = new BedLinen(bedColor, color => this.material(color), { single: singleRoom, centerX: bedX }); linen.update(f.dirty ? 0 : 1); g.add(linen.root); this.bedLinen.set(r.id, linen);
    if (!bed) this.box(g, singleRoom ? 0xac7359 : 0x8f5d4a, bedX, singleRoom ? 1.1 : 1.25, -2.45, bedWidth + .1, singleRoom ? 1.25 : 1.55, .2);
    // Sit the visible tip stack on the writing-table surface instead of floating above it.
    const tipPile = new T.Group(); tipPile.position.set(2.5, 1, -2); g.add(tipPile);
    for (let i = 0; i < 3; i++) { const note = this.box(tipPile, i % 2 ? 0x92d85d : 0x3f9c58, .03 * i, i * .07, 0, .55, .045, .3); note.rotation.y = (i - 1) * .12; this.box(note, 0xffed9b, 0, .025, 0, .11, .012, .17); }
    this.tipModels.set(r.id, tipPile);
    if (singleRoom) { this.prop(g, 'bedsideTable', 1.45, .2, -2.25, { height: .85 }); this.prop(g, 'tableLamp', 1.45, .85, -2.25, { height: .62 }); }
    this.prop(g, 'plant', -3.5, .2, -2.6, { height: 1 });
    // Level one uses the future bathroom corner as a compact writing area, so the
    // room feels furnished before that space is replaced by the bathroom upgrade.
    if (singleRoom) { this.prop(g, 'table', 2.75, .2, -1.9, { width: 1.65 }); this.prop(g, 'chair', 2.75, .2, -.75, { height: 1.15 }, Math.PI); this.prop(g, 'plant', 3.75, .2, -2.65, { height: .9 }); }
    if (f.level >= 2) {
      // A fully enclosed bathroom with a clear doorway, instead of a floating divider.
      const bathWall = 0x79aaa5;
      this.box(g, 0xe7f7ef, 2.75, .24, -1.72, 3.35, .06, 2.9);
      this.box(g, bathWall, 1.08, 1.35, -1.72, .16, 2.35, 2.95);
      this.box(g, bathWall, 4.42, 1.35, -1.72, .16, 2.35, 2.95);
      this.box(g, bathWall, 2.75, 1.35, -3.17, 3.5, 2.35, .16);
      // Front wall is split so the bathroom has one intentional, usable entrance.
      this.box(g, bathWall, 1.16, 1.35, -.27, .32, 2.35, .16);
      this.box(g, bathWall, 3.43, 1.35, -.27, 2.05, 2.35, .16);
      this.box(g, 0xe6c69d, 1.82, .255, -.62, .9, .035, .55);
      const door = new T.Group(); door.position.set(1.3, .2, -.22); g.add(door);
      this.box(door, 0xc79063, .55, 1.05, 0, 1.1, 2.1, .12);
      this.box(door, 0xffe2a4, 1, 1.05, -.08, .08, .08, .08);
      this.bathroomDoors.set(r.id, door);
      this.prop(g, 'shower', 3.35, .22, -2.15, { height: 2.05 });
      this.prop(g, 'bathroomSink', 2.05, .22, -1.25, { height: 1.02 });
      this.prop(g, 'bathroomMirror', 2.05, 1.35, -3.05, { width: .85 });
      this.prop(g, 'toilet', 3.55, .22, -.85, { height: .82 }, Math.PI);
      if (f.bathroomDirty) {
        this.sphere(g, 0x87a68f, 2.7, .31, -1.7, .18, 1.6, .18, 1);
        this.sphere(g, 0x87a68f, 3.15, .31, -1.5, .13, 1.6, .15, 1);
      }
    }
    if (!f.dirty && f.towels) this.box(g, 0xfffcf0, -.7, 1.26, 1, .8, .2, .45);
    if (f.floorDirty) {
      const litter: T.Mesh[] = [];
      for (const [x, z, angle] of [[2.5, .5, .3], [3, 1.3, -.5], [1.8, 1.8, .7]]) {
        const paper = this.box(g, 0xfff7de, x, .3, z, .5, .035, .65); paper.rotation.y = angle;
        this.box(paper, 0x77b8ba, 0, .023, .06, .35, .012, .08); litter.push(paper);
      }
      const geometry = new T.CylinderGeometry(.18, .12, .42, 10); geometry.userData.generated = true;
      const cup = new T.Mesh(geometry, this.material(0xd68b60)); cup.position.set(2, .4, .65); cup.rotation.z = 1.1; cup.castShadow = true; g.add(cup); litter.push(cup);
      this.dirtModels.set(r.id, litter);
    }
  }
  private reception() {
    const f = this.sim.facility('reception'), g = this.group({ x: RECEPTION_VISUAL_X, y: 43.5 });
    // Standalone, low rounded counter: no canopy, awning or supporting posts.
    const rounded = (w: number, d: number, h: number, y: number, color: number) => {
      const r = .3, x = w / 2, z = d / 2, shape = new T.Shape();
      shape.moveTo(-x + r, -z); shape.lineTo(x - r, -z); shape.quadraticCurveTo(x, -z, x, -z + r);
      shape.lineTo(x, z - r); shape.quadraticCurveTo(x, z, x - r, z); shape.lineTo(-x + r, z);
      shape.quadraticCurveTo(-x, z, -x, z - r); shape.lineTo(-x, -z + r); shape.quadraticCurveTo(-x, -z, -x + r, -z);
      const geometry = new T.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 }); geometry.rotateX(-Math.PI / 2); geometry.userData.generated = true;
      const mesh = new T.Mesh(geometry, this.material(color)); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    };
    rounded(5, 1.5, .78, .25, f.level === 3 ? 0xb07a57 : 0xc58e69);
    rounded(5.35, 1.85, .18, 1.03, 0xffe4bc);
    this.box(g, 0x388c7c, 0, .65, .78, 3.8, .5, .06);
    for (const x of [-2.12, 2.12]) this.box(g, 0xffe3af, x, .65, .73, .12, .78, .08);
    const emblemGeometry = new T.TorusGeometry(.17, .045, 8, 20); emblemGeometry.userData.generated = true;
    const emblem = new T.Mesh(emblemGeometry, this.material(0xffdd87)); emblem.position.set(-.13, .65, .85); g.add(emblem);
    this.box(g, 0xffdd87, .15, .65, .85, .35, .075, .08); this.box(g, 0xffdd87, .29, .57, .85, .075, .15, .08);
    // Bell and guest ledger on top; upgraded desks gain a small terminal.
    this.sphere(g, 0xe5b963, -1.7, 1.26, .2, .16, 1, .6, 1);
    this.box(g, 0x549c97, .8, 1.23, -.08, .65, .045, .45); this.box(g, 0xfffbed, .8, 1.26, -.08, .57, .025, .4);
    if (f.level >= 2) { this.box(g, 0x365d60, 1.65, 1.26, -.3, .55, .07, .45); const screen = this.box(g, 0x365d60, 1.65, 1.52, -.4, .55, .44, .08); screen.rotation.x = -.15; }
    this.prop(g, 'plant', -3.3, .2, 1.1, { height: 1.4 }); this.prop(g, 'plant', 3.3, .2, 1.1, { height: 1.4 });
    if (f.level >= 2) this.prop(g, 'bench', -5, .12, 1, { width: 2.5 }, Math.PI / 2);
    if (f.level === 3) this.prop(g, 'bench', 5, .12, 1, { width: 2.5 }, -Math.PI / 2);
  }
  private laundry() {
    const f = this.sim.facility('laundry'), g = this.group(LAUNDRY_ORIGIN);
    // Extend the laundry floor toward the front while keeping its rear edge fixed.
    const floorFront = LAUNDRY_FRONT_EDGE - LAUNDRY_ORIGIN.y;
    const floorBack = 41.5 - LAUNDRY_ORIGIN.y;
    this.box(g, 0xf6eacb, -.2, .08, (floorFront + floorBack) / 2, 9.6, .16, floorFront - floorBack);
    for (const wall of LAUNDRY_WALLS) { this.box(g, 0x99c9cd, wall.x - LAUNDRY_ORIGIN.x, .15 + wall.height / 2, wall.y - LAUNDRY_ORIGIN.y, wall.width, wall.height, wall.depth); this.box(g, 0xffe9bf, wall.x - LAUNDRY_ORIGIN.x, .19 + wall.height, wall.y - LAUNDRY_ORIGIN.y, wall.width + .1, .12, wall.depth + .1); }
    for (let z = -3.5; z <= floorFront - .5; z++) this.box(g, 0xe6d7b9, -.2, .17, z, 8.9, .015, .035);
    for (const machine of laundryMachines(f.level)) {
      const x = machine.x - LAUNDRY_ORIGIN.x, stacked = f.level >= 2;
      const z = machine.y - LAUNDRY_ORIGIN.y;
      if (stacked) {
        const appliance = this.prop(g, 'washerStacked', x, .2, z, { height: 2.25 }, Math.PI / 2);
        if (appliance) this.setupWasherDoor(appliance);
        else this.box(g, 0xfff9e8, x, 1, z, machine.width, 1.8, machine.depth);
      } else {
        const closed = this.prop(g, 'washer', x, .2, z, { height: 1.62 }, Math.PI / 2);
        const open = this.prop(g, 'washerOpen', x, .2, z, { height: 1.62 }, Math.PI / 2);
        if (closed && open) {
          closed.root.visible = false;
          this.washerStates.push({ open: open.root, closed: closed.root });
        } else if (!closed && !open) this.box(g, 0xfff9e8, x, 1, z, machine.width, 1.8, machine.depth);
      }
    }
    this.prop(g, 'rack', TOWEL_RACK.x - LAUNDRY_ORIGIN.x, .1, TOWEL_RACK.y - LAUNDRY_ORIGIN.y, { height: 2.2 });
    const rack = new TowelShelf(color => this.material(color), 2.2, false, false); rack.root.position.set(TOWEL_RACK.x - LAUNDRY_ORIGIN.x, .1, TOWEL_RACK.y - LAUNDRY_ORIGIN.y); g.add(rack.root);
    this.prop(g, 'rack', DIRTY_BASKET.x - LAUNDRY_ORIGIN.x, .1, DIRTY_BASKET.y - LAUNDRY_ORIGIN.y, { height: 1.7 });
    const dirtyRack = new TowelShelf(color => this.material(color), 1.7, true, false);
    dirtyRack.root.scale.x *= .7; dirtyRack.root.position.set(DIRTY_BASKET.x - LAUNDRY_ORIGIN.x, .1, DIRTY_BASKET.y - LAUNDRY_ORIGIN.y); g.add(dirtyRack.root);
    dirtyRack.towels.forEach(t => t.material = this.material(0x9a897d));
    const dirty = dirtyRack.towels;
    this.stockModels.set('laundryClean', rack.towels.slice(0, 8)); this.stockModels.set('laundryDirty', dirty);
    rack.towels.slice(8).forEach(towel => towel.visible = false);
    const sheets: T.Mesh[] = []; for (let i = 0; i < 4; i++) { const sheet = this.box(rack.root, 0xfff2dc, i % 2 ? .46 : -.46, 1.75 + Math.floor(i / 2) * .13, 0, .85, .12, .76); this.box(sheet, 0x73c4d1, 0, 0, .39, .8, .04, .01); sheets.push(sheet); } this.stockModels.set('laundrySheets', sheets);
    // Open canvas cart with visible folded linen: larger and visually distinct
    // from the lidded waste bin in the opposite corner.
    this.prop(g, 'laundryHamper', DIRTY_HAMPER.x - LAUNDRY_ORIGIN.x, .2, DIRTY_HAMPER.y - LAUNDRY_ORIGIN.y, { height: 1.45 }, Math.PI / 2);
    this.prop(g, 'bin', LAUNDRY_TRASH_PROP.x - LAUNDRY_ORIGIN.x, .2, LAUNDRY_TRASH_PROP.y - LAUNDRY_ORIGIN.y, { height: 1.2 }, -Math.PI / 2);
  }
  private setupWasherDoor(appliance: AssetInstance) {
    const clips = appliance.clips.map(clip => new T.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => /door-(?:drum|washer)\.quaternion$/.test(track.name)))).filter(clip => clip.tracks.length);
    const openClip = clips.find(clip => clip.name === 'door-open' || clip.name === 'open'), closeClip = clips.find(clip => clip.name === 'door-close' || clip.name === 'close');
    if (!openClip || !closeClip) return;
    const mixer = new T.AnimationMixer(appliance.model), open = mixer.clipAction(openClip), close = mixer.clipAction(closeClip);
    for (const action of [open, close]) { action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; }
    // The new CC0 washer has its real drum and animated porthole built in.
    open.play(); mixer.update(openClip.duration);
    this.washerDoors.push({ root: appliance.model, mixer, open, close, closed: false });
  }
  private lemonade(parent: T.Object3D, x: number, y: number, z: number) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    const glass = new T.CylinderGeometry(.14, .11, .34, 12); glass.userData.generated = true;
    const cup = new T.Mesh(glass, this.material(0xffdc68)); cup.position.y = .17; cup.castShadow = true; g.add(cup);
    const rim = new T.Mesh(new T.TorusGeometry(.13, .02, 5, 12), this.material(0xfff7dd)); rim.geometry.userData.generated = true; rim.rotation.x = Math.PI / 2; rim.position.y = .35; g.add(rim);
    const straw = this.box(g, 0xee8065, .045, .4, 0, .035, .36, .035); straw.rotation.z = -.2;
    this.sphere(g, 0xffc93f, -.13, .3, 0, .09, .3, 1, 1);
  }
  private poolBar() {
    if (!this.sim.facility('pool').open) return;
    const g = this.group(BAR_CENTER);
    this.box(g, 0xc29567, 0, .08, 0, 4.6, .15, 2.6);
    if (!this.sim.state.bar?.open) return;
    this.box(g, 0xa7704c, 0, .7, 0, 3.8, 1.15, 1.8);
    for (let x = -1.7; x < 1.8; x += .4) this.box(g, 0xc59163, x, .75, .94, .3, .95, .06);
    this.box(g, 0x389c96, 0, 1.3, 0, 4.2, .18, 2.05);
    this.lemonade(g, .65, 1.4, .4); this.lemonade(g, 1.2, 1.4, .4);
    if (this.sim.facility('pool').level >= 2) { for (const x of [-1.45, -1.05]) { const cone = new T.Mesh(new T.ConeGeometry(.13, .35, 10), this.material(0xd8a45e)); cone.position.set(x, 1.52, .45); cone.rotation.z = Math.PI; g.add(cone); this.sphere(g, x, 1.78, .45, .18, 1, 1, 1); } this.prop(g, 'iceCream', -1.25, 1.35, .42, { height: .55 }); this.box(g, 0xe8f4ed, -1.25, 1.15, -.35, 1.15, .75, .65); for (const x of [-1.6, -1.15, -.7]) this.prop(g, 'barStool', x, .15, 1.65, { height: 1.05 }); }
    this.box(g, 0xffedb0, -1, 1.65, 0, .45, .5, .45); this.box(g, 0xfffbeb, -1, 1.96, 0, .5, .12, .5);
    this.sphere(g, 0xffcb42, -.45, 1.45, .45, .13); this.sphere(g, 0xffd951, -.2, 1.45, .45, .13);
    this.prop(g, 'plant', -2.4, .1, -.6, { height: 1.1 });
  }
  private pool() {
    const f = this.sim.facility('pool'), g = this.group({ x: 28.5, y: 4.5 });
    const upgraded = f.level >= 2, poolWidth = upgraded ? 14.4 : 11.2, poolDepth = upgraded ? 8.6 : 7.2;
    this.box(g, f.open ? 0xfff2d6 : 0xc7c6ad, 0, .1, 0, poolWidth, .2, poolDepth);
    const poolFloor = this.box(g, f.open ? 0xffffff : 0xd8d2b9, 0, .23, 0, poolWidth - 1.6, .06, poolDepth - 1.6);
    if (f.open) poolFloor.material = this.poolTileMaterial;
    if (!f.open) return;
    const water = this.box(g, 0x4bc7d2, 0, .31, 0, poolWidth - 1.72, .035, poolDepth - 1.72);
    water.material = this.poolWaterMaterial;
    for (let i = 0; i < 16; i++) {
      const leaf = this.sphere(g, i % 2 ? 0xb69542 : 0x799744, -3.8 + (i * 1.71 % 7.5), .34, -2.1 + (i * 1.13 % 4.2), .18, 1.8, .12, .85);
      leaf.rotation.y = i * 1.17; leaf.castShadow = false; this.poolLeaves.push(leaf);
      this.box(leaf, 0x6e7937, 0, .01, 0, .23, .012, .025);
    }
    for (const x of [-(poolWidth / 2 - .6), poolWidth / 2 - .6]) this.box(g, 0xfff7e4, x, .38, 0, .45, .32, poolDepth - .2);
    for (const z of [-(poolDepth / 2 - .6), poolDepth / 2 - .6]) this.box(g, 0xfff7e4, 0, .38, z, poolWidth - .7, .32, .45);
    // Stay clear of the expanded level-two pool while preserving the rear service point.
    const desk = this.group({ x: 19.5, y: 7.5 });
    this.box(desk, 0xb99168, 0, .65, 0, 2.7, 1.1, 1.25);
    this.box(desk, 0x389c96, 0, 1.28, 0, 3, .16, 1.45);
    this.box(desk, 0xfff7d6, .7, 1.42, 0, .35, .12, .35);
    const shelf = this.group(poolTowelRack(f.level)); this.prop(shelf, 'rack', 0, 0, 0, { height: 1.7 }); const rack = new TowelShelf(color => this.material(color), 1.7, false, false); shelf.add(rack.root); this.stockModels.set('pool', rack.towels);
    const dirtyShelf = this.group(poolDirtyRack(f.level)); this.prop(dirtyShelf, 'rack', 0, 0, 0, { height: 1.7 }); const dirtyRack = new TowelShelf(color => this.material(color === 0xfffcf0 ? 0x9a897d : color), 1.7, true, false); dirtyShelf.add(dirtyRack.root);
    dirtyRack.towels.forEach(t => t.material = this.material(0x9a897d)); this.stockModels.set('poolDirty', dirtyRack.towels);
    for (const r of SEAT_DEFS) {
      const seat = this.sim.state.seats.find(s => s.id === r.id)!, p = this.group({ x: r.x, y: r.y - 1 }); if (!seat.open) continue;
      const lounger = this.prop(p, 'sunLounger', 0, .2, 0, { width: 2.05 });
      if (!lounger) {
        this.box(p, 0xe9bc85, 0, .36, 0, 1.5, .2, 2); this.box(p, 0xfffaf0, 0, .5, .1, 1.35, .12, 1.9);
        const back = this.box(p, seat.dirty ? 0xaea195 : 0xfffaf0, 0, .95, -.85, 1.35, .12, 1.2); back.rotation.x = -.8;
      }
      if (seat.towel || seat.guest) this.box(p, 0x9cddd5, 0, .66, .3, 1.05, .055, 1.15);
      if (seat.dirty) { const marks: T.Mesh[] = []; for (let i = 0; i < 3; i++) marks.push(this.box(p, 0x9c8b77, -.3 + i * .3, .65, -.1 + i * .35, .3, .035, .3)); this.dirtModels.set(r.id, marks); }
      this.box(p, 0xb99168, 1, 1.6, -.9, .08, 3, .08);
      const umbrella = new T.Mesh(new T.ConeGeometry(1.6, .65, 8), this.material(r.id.endsWith('2') || r.id.endsWith('4') ? 0xeaa978 : 0x76bda8)); umbrella.position.set(1, 3.05, -.9); umbrella.castShadow = true; p.add(umbrella);
    }
    if (f.level >= 2) { this.sphere(g, 0xffb473, 2.7, .5, -1, .6, 1, .2, 1); this.prop(g, 'plant', -5.8, .1, -3.7, { height: 1.5 }); }
    if (f.level === 3) { this.prop(g, 'plant', 5.8, .1, -3.7, { height: 1.5 }); this.box(g, 0xf2d16e, 0, .4, -3.2, 5, .05, .2); }
  }
  private clearStructures() { this.structures.traverse(o => { if (o instanceof T.Mesh && o.geometry.userData.generated) o.geometry.dispose(); }); this.structures.clear(); for (const washer of this.washerDoors) { washer.mixer.stopAllAction(); washer.mixer.uncacheRoot(washer.root); } this.washerDoors = []; this.washerStates = []; for (const p of this.pads.values()) { p.label.remove(); (p.outline.material as T.Material).dispose(); (p.fill.material as T.Material).dispose(); } this.pads.clear(); for (const l of this.facilityLabels.values()) l.remove(); this.facilityLabels.clear(); this.tipModels.clear(); this.moneyModels.clear(); this.dirtModels.clear(); this.bedLinen.clear(); this.bathroomDoors.clear(); this.stockModels.clear(); this.drums = []; this.poolLeaves = []; }
  private rebuild() {
    const key = JSON.stringify([!!this.sim.state.bar?.open, !!this.sim.facility('pool').dirt, this.sim.state.guests.filter(wantsDrink).map(g => [g.id, g.orderProduct]), this.sim.state.workers.map(w => w.role), this.sim.state.workers.length,this.sim.state.facilities.map(f => [f.id, f.open, f.level, f.dirty, !!f.floorDirty, !!f.bathroomDirty, !!f.needsSheet, !!f.towels]), this.sim.state.laundry.remaining === 0, this.sim.state.seats.map(s => [s.open, s.dirty, !!s.towel, !!s.guest])]);
    if (key === this.layoutKey) return; this.layoutKey = key; this.clearStructures(); ROOM_DEFS.forEach(r => this.bungalow(r)); this.reception(); this.laundry(); this.pool(); this.poolBar();
    const machineAreaId = this.sim.state.laundry.remaining === 0 ? 'machineUnload' : 'machineLoad';
    for (const a of this.sim.areas) {
      if (a.taskKind === 'cleanTake' || a.taskKind === 'dirtyDrop' || a.taskKind === 'laundryDirtyTake') continue;
      if ((a.id === 'machineLoad' || a.id === 'machineUnload') && a.id !== machineAreaId) continue;
      const root = this.group(a), color = a.mode === 'buy' ? 0x72c891 : a.mode === 'upgrade' ? 0xd8c99c : a.mode === 'cash' ? 0x9eca86 : 0xffffff;
      const room = a.mode === 'work' && (a.taskKind === 'cleanRoom' || a.taskKind === 'restockRoom') ? ROOM_DEFS.find(r => r.id === a.target) : undefined;
      const rectangle = (w: number, d: number, holeW: number, holeD: number, holeZ = 0) => {
        const shape = new T.Shape(); shape.moveTo(-w, -d); shape.lineTo(w, -d); shape.lineTo(w, d); shape.lineTo(-w, d); shape.closePath();
        const hole = new T.Path(); hole.moveTo(-holeW, holeZ - holeD); hole.lineTo(-holeW, holeZ + holeD); hole.lineTo(holeW, holeZ + holeD); hole.lineTo(holeW, holeZ - holeD); hole.closePath(); shape.holes.push(hole); return shape;
      };
      const wideLaundryArea = a.target === 'laundry' && a.mode === 'work' && ['machineLoad', 'machineUnload', 'laundryTrash'].includes(a.id);
      let fill: T.Mesh;
      if (room) {
        root.position.copy(world({ x: room.x + 3, y: room.y + 3.2 }));
        const geometry = new T.ShapeGeometry(rectangle(2.4, 2.6, 1.4, 1.9, .2)); geometry.userData.generated = true;
        fill = new T.Mesh(geometry, new T.MeshBasicMaterial({ color, transparent: true, opacity: .12, side: T.DoubleSide })); fill.rotation.x = -Math.PI / 2; fill.position.y = .13; root.add(fill);
      } else {
        fill = this.box(root, color, 0, .13, 0, wideLaundryArea ? 1.5 : 1.12, .025, wideLaundryArea ? 1.5 : 1.12); fill.material = new T.MeshBasicMaterial({ color, transparent: true, opacity: a.mode === 'work' ? .12 : a.mode === 'upgrade' ? .18 : .55 });
      }
      const half = wideLaundryArea ? .82 : .62;
      const shape = room ? rectangle(2.4, 2.6, 2.34, 2.54) : rectangle(half, half, half - .07, half - .07);
      const geometry = new T.ShapeGeometry(shape); geometry.userData.generated = true;
      if (a.id === 'office') {
        fill.scale.set(2, 1, 2); (fill.material as T.MeshBasicMaterial).color.setHex(0xefc568);
        const ringGeometry = new T.RingGeometry(1.12, 1.22, 40); ringGeometry.userData.generated = true;
        const ring = new T.Mesh(ringGeometry, new T.MeshBasicMaterial({ color: 0xffdf83, side: T.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = .18; root.add(ring);
      }
      const outline = new T.Mesh(geometry, new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: a.mode === 'upgrade', opacity: a.mode === 'upgrade' ? .42 : 1 })); outline.rotation.x = -Math.PI / 2; outline.position.y = .17; root.add(outline);
      const label = document.createElement('button'); label.className = `floor-label ${a.mode}${a.id === 'office' ? ' office-marker' : ''}`; label.setAttribute('aria-label', a.id === 'office' ? 'Personel geliştirme ofisine git' : `${a.label} alanına yürü`); if (a.id === 'office') label.title = 'Personel geliştirme ofisi'; label.addEventListener('click', () => { this.sim.goToArea(a.id); this.follow = true; }, { signal: this.abort.signal }); this.labels.append(label); this.pads.set(a.id, { root, outline, fill, label, area: a });
      if (a.mode === 'cash') { const pile = new T.Group(); for (let i = 0; i < 4; i++) this.box(pile, i % 2 ? 0x9ad364 : 0x60a957, 0, .25 + i * .12, 0, .8, .1, .4); root.add(pile); this.moneyModels.set(a.target, pile); }
      if (HIDDEN_RECEPTION_MARKERS.has(a.id)) { fill.visible = false; outline.visible = false; label.style.display = 'none'; }
    }
    for (const f of this.sim.state.facilities) { if (f.kind === 'room' || f.kind === 'reception' || f.id === 'laundry' || f.id === 'pool') continue; const l = document.createElement('div'); l.className = 'facility-label'; l.addEventListener('click', () => this.inspect(f.id), { signal: this.abort.signal }); this.labels.append(l); this.facilityLabels.set(f.id, l); }
  }
  private character(a: Actor, worker: boolean) {
    const root = this.group(a, this.scene), load = new T.Group(); load.position.set(0, .85, .65); root.add(load);
    const role = this.sim.state.workers.find(w => w.id === a.id)?.role;
    const workerAsset: Record<string, AssetKey> = { reception: 'receptionStaff', rooms: 'roomStaff', hauling: 'laundryStaff', pool: 'poolStaff', bartender: 'poolStaff' };
    const guestAssets: AssetKey[] = ['guestA', 'guestB', 'guestC', 'guestD', 'guestE', 'guestF', 'guestG', 'guestH', 'guestI', 'guestJ'];
    const hash = [...a.id].reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 0);
    const characterAsset: AssetKey = a.id === 'player' ? 'player' : worker ? workerAsset[role ?? ''] ?? 'worker' : guestAssets[hash % guestAssets.length];
    const instance = this.assets.instantiate(characterAsset, { height: 1.65 });
    const actions = new Map<string, T.AnimationAction>(); let mixer: T.AnimationMixer | undefined;
    if (instance) { root.add(instance.root); if (instance.clips.length) { mixer = new T.AnimationMixer(instance.model); for (const clip of instance.clips) actions.set(clip.name, mixer.clipAction(clip)); } }
    else { this.sphere(root, 0xffd1a1, 0, 1.4, 0, .3); this.box(root, a.id === 'player' ? 0x3a9995 : 0xf1ac78, 0, .8, 0, .6, .9, .4); }
    if (a.id === 'player') { const dot = new T.Mesh(new T.RingGeometry(.45, .55, 24), new T.MeshBasicMaterial({ color: 0xfff6ca, side: T.DoubleSide })); dot.rotation.x = -Math.PI / 2; dot.position.y = .2; root.add(dot); }
    const broom = new T.Group(); broom.position.set(.55, .18, .4); broom.rotation.z = -.25; this.box(broom, 0xc59b63, 0, .75, 0, .08, 1.5, .08); this.box(broom, 0x4fb0a2, 0, .08, .1, .65, .15, .24); for (let i = 0; i < 6; i++) this.box(broom, 0xf1d58a, -.25 + i * .1, -.05, .1, .065, .15, .22); broom.visible = false; root.add(broom);
    const tray = new T.Group(); tray.position.set(0, .98, .65); this.box(tray, 0xa36d48, 0, 0, 0, .7, .07, .45); this.lemonade(tray, 0, .04, 0); root.add(tray);
    const iceCream = new T.Group(); iceCream.position.set(0, .98, .65); this.box(iceCream, 0xa36d48, 0, 0, 0, .7, .07, .45); const cone = new T.Mesh(new T.ConeGeometry(.13, .35, 10), this.material(0xd8a45e)); cone.position.y = .18; cone.rotation.z = Math.PI; iceCream.add(cone); this.sphere(iceCream, 0, .42, 0, .18, 1, 1, 1); root.add(iceCream);
    const net = new T.Group(); net.position.set(.5, .2, .4); net.rotation.z = -.35; this.box(net, 0xb28860, 0, .95, 0, .06, 1.9, .06);
    const hoop = new T.Mesh(new T.TorusGeometry(.32, .035, 6, 16), this.material(0x478e9e)); hoop.geometry.userData.generated = true; hoop.rotation.x = Math.PI / 2; hoop.position.set(0, 1.95, .25); net.add(hoop);
    for (const x of [-.18, 0, .18]) this.box(net, 0xc9e3dd, x, 1.93, .25, .018, .025, .46);
    for (const z of [.07, .25, .43]) this.box(net, 0xc9e3dd, 0, 1.93, z, .46, .025, .018);
    root.add(net);
    const c: Character = { root, load, broom, tray, iceCream, net, mixer, actions, mode: '', previous: world(a), bagKey: '' }; this.characters.set(a.id, c); return c;
  }
  private carriedLinen(parent: T.Group, sheet: boolean, dirty: boolean, index: number) {
    const item = new T.Group(); item.position.y = index * .115; parent.add(item);
    const cloth = dirty ? 0xa18a78 : sheet ? 0xfff6de : 0x81d1d8;
    if (sheet) {
      // Folded sheets and rolled towels share a compact footprint, not different scales.
      this.box(item, cloth, 0, 0, 0, .64, .105, .4);
      this.box(item, dirty ? 0x75614f : 0xd8ac56, -.19, .059, 0, .055, .012, .4);
      this.box(item, dirty ? 0x827060 : 0xddcfb2, .03, -.012, .205, .5, .018, .012);
    } else {
      const towel = foldedTowel(color => this.material(color), dirty);
      towel.scale.set(.84, .85, .63); item.add(towel);
    }
    if (dirty) for (const [x, z] of [[.12, .1], [-.12, -.09]]) this.sphere(item, 0x735e4c, x, sheet ? .06 : .087, z, .035, 1.6, .2, 1);
  }
  private updateCharacter(a: Actor, dt: number, bag: Towels = { clean: 0, dirty: 0 }, working = false) {
    const c = this.characters.get(a.id) ?? this.character(a, a.id.startsWith('worker')), p = world(a), delta = p.clone().sub(c.previous), walking = delta.lengthSq() > .00001;
    c.root.position.copy(p); c.root.position.y = .18; c.root.rotation.x = 0;
    if (walking) c.root.rotation.y = Math.atan2(delta.x, delta.z);
    else if (!a.id.startsWith('guest') && this.sim.inside(a, RECEPTION)) c.root.rotation.y = 0;
    const cleaning = working && this.sim.state.tasks.some(t => t.owner === a.id && (t.kind === 'cleanFloor' || t.kind === 'cleanBathroom' || t.kind === 'cleanSeat'));
    const actor = this.sim.actor(a.id), held = actor?.heldProduct ?? (actor?.drink ? 'lemonade' : undefined); c.tray.visible = held === 'lemonade'; c.iceCream.visible = held === 'icecream';
    c.load.visible = !c.tray.visible && !c.iceCream.visible;
    c.net.visible = working && this.sim.state.tasks.some(t => t.owner === a.id && t.kind === 'cleanPool');
    c.net.rotation.x = Math.sin(this.sim.state.elapsed * 5) * .3;
    c.broom.visible = cleaning; c.broom.rotation.x = Math.sin(this.sim.state.elapsed * 8) * .35; c.broom.rotation.y = Math.sin(this.sim.state.elapsed * 6) * .5;
    const mode = walking ? 'walk' : working ? 'interact-right' : linenCount(bag) || c.tray.visible || c.iceCream.visible ? 'holding-both' : 'idle';
    if (mode !== c.mode) { c.actions.get(c.mode)?.fadeOut(.12); c.actions.get(mode)?.reset().fadeIn(.12).play(); c.mode = mode; } c.mixer?.update(this.sim.state.settings.paused ? 0 : dt); c.previous.copy(p);
    const key = `${bag.clean}:${bag.dirty}:${bag.cleanSheets ?? 0}:${bag.dirtySheets ?? 0}`;
    if (key !== c.bagKey) {
      c.load.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); }); c.load.clear();
      let index = 0;
      for (const [count, sheet, dirty] of [[bag.clean, false, false], [bag.dirty, false, true], [bag.cleanSheets ?? 0, true, false], [bag.dirtySheets ?? 0, true, true]] as const) {
        for (let i = 0; i < count && index < 16; i++) this.carriedLinen(c.load, sheet, dirty, index++);
      }
      c.bagKey = key;
    }
  }
  private project(el: HTMLElement, p: T.Vector3) { const v = p.clone().project(this.camera), rect = this.host.getBoundingClientRect(); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = `${(v.x + 1) / 2 * rect.width}px`; el.style.top = `${(1 - v.y) / 2 * rect.height}px`; }
  private updateTaskMarkers(notices: TaskIndicator[]) {
    const alive = new Set(notices.map(n => n.id));
    for (const [id, marker] of this.taskMarkers) if (!alive.has(id)) { marker.button.remove(); this.taskMarkers.delete(id); }
    for (const notice of notices) {
      let marker = this.taskMarkers.get(notice.id);
      if (!marker) {
        const button = document.createElement('button'); button.className = 'task-indicator'; button.dataset.taskIcon = notice.icon;
        button.innerHTML = taskIconSvg(notice.icon); const progress = document.createElement('span'); progress.className = 'task-indicator-progress'; progress.setAttribute('aria-hidden', 'true'); button.append(progress);
        marker = { button, progress, notice }; this.taskMarkers.set(notice.id, marker); this.labels.append(button);
        button.addEventListener('click', () => { const current = this.taskMarkers.get(notice.id); if (current) { this.sim.goToArea(current.notice.areaId); this.follow = true; } }, { signal: this.abort.signal });
      }
      marker.notice = notice;
      const status = notice.state === 'working' ? notice.icon === 'wash' ? 'Yıkanıyor' : 'Çalışılıyor' : notice.state === 'waiting' ? 'Görev bekliyor' : 'Yapılacak iş';
      marker.button.setAttribute('aria-label', `${notice.label} · ${status} · alanına yürü`); marker.button.title = `${notice.label} · ${status}`;
      marker.button.classList.toggle('working', notice.state === 'working'); marker.button.classList.toggle('waiting', notice.state === 'waiting');
      marker.progress.hidden = notice.progress === undefined; marker.progress.style.setProperty('--task-progress', `${Math.round((notice.progress ?? 0) * 100)}%`);
      const p = world(notice); p.y = notice.height; this.project(marker.button, p);
      if (!this.follow || distance(this.sim.state.player, notice) > 20) marker.button.style.display = 'none';
    }
  }
  private animate = (now: number) => {
    const dt = this.last ? Math.min(.1, (now - this.last) / 1000) : 0; this.last = now;
    const dx = this.touch.x + Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')), dy = this.touch.y + Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    if (Math.hypot(dx, dy) > .05) { this.sim.movePlayer(dx, dy, dt); this.follow = true; }
    this.sim.tick(dt); this.rebuild(); const s = this.sim.state;
    const washerRunning = s.laundry.remaining !== null && s.laundry.remaining > 0;
    for (const washer of this.washerStates) { washer.open.visible = !washerRunning; washer.closed.visible = washerRunning; }
    for (const washer of this.washerDoors) {
      if (washer.closed !== washerRunning) {
        const previous = washer.closed ? washer.close : washer.open;
        previous.stop();
        const next = washerRunning ? washer.close : washer.open;
        next.reset().setLoop(T.LoopOnce, 1); next.clampWhenFinished = true; next.play();
        washer.closed = washerRunning;
      }
      washer.mixer.update(s.settings.paused ? 0 : dt * s.settings.speed);
    }
    if (this.follow) this.target.lerp(world(s.player).add(new T.Vector3(0, 0, -3)), 1 - Math.exp(-dt * 5));
    const d = this.follow ? 1 / this.zoom : Math.max(2.3, 2.1 / this.camera.aspect); this.camera.position.copy(this.target).add(new T.Vector3(0, 20 * d, 23 * d)); this.camera.lookAt(this.target);
    this.updateCharacter(s.player, dt, s.player.bag, s.tasks.some(t => t.owner === 'player' && this.sim.isTaskActive(t)));
    for (const w of s.workers) this.updateCharacter(w, dt, w.bag, s.tasks.some(t => t.owner === w.id && this.sim.isTaskActive(t)));
    for (const [roomId, door] of this.bathroomDoors) {
      const guest = s.guests.find(g => g.room === roomId && g.phase === 'staying');
      const room = ROOM_DEFS.find(r => r.id === roomId)!;
      const doorway = { x: room.x + 6.15, y: room.y + 3.35 };
      const playerApproaching = distance(s.player, doorway) < 2.2;
      const open = playerApproaching || !!guest && guest.remaining < 8.5 && guest.remaining > 3.5;
      door.rotation.y = T.MathUtils.lerp(door.rotation.y, open ? -Math.PI / 2 : 0, 1 - Math.exp(-dt * 7));
    }
    for (const g of s.guests) {
      this.updateCharacter(g, dt); const c = this.characters.get(g.id)!;
      if (g.phase === 'queue' && !g.path.length) c.root.rotation.y = Math.PI;
      if (g.phase === 'staying') {
        const r = ROOM_DEFS.find(r => r.id === g.room)!;
        const room = this.sim.facility(r.id);
        const bed = world({ x: r.x + (room.level === 1 ? 4.5 : 3), y: r.y + 4.5 });
        if (room.level >= 2 && g.remaining < 8 && g.remaining > 4) {
          const doorway = world({ x: r.x + 6.15, y: r.y + 3.35 });
          const bathroom = world({ x: r.x + 7.1, y: r.y + 1.8 });
          const position = g.remaining > 7 ? bed.clone().lerp(doorway, 8 - g.remaining)
            : g.remaining > 5 ? bathroom
              : bathroom.clone().lerp(bed, 5 - g.remaining);
          c.root.position.copy(position); c.root.position.y = .2;
          c.root.rotation.set(0, g.remaining > 5 ? -.55 : 2.6, 0);
        } else {
          c.root.position.copy(bed); c.root.position.y = 1.25; c.root.rotation.set(-Math.PI / 2, 0, 0);
        }
      }
      if (g.phase === 'swimming') {
        const seat = SEAT_DEFS.find(r => r.id === g.seat)!;
        if (guestInWater(g)) {
          c.root.position.copy(world({ x: seat.x + Math.sin(s.elapsed * .7) * .25, y: 5 + Math.sin(s.elapsed * .5) * .7 }));
          c.root.position.y = .32; c.root.rotation.set(-Math.PI / 2, 0, Math.sin(s.elapsed * .8) * .1);
        } else {
          c.root.position.copy(world({ x: seat.x, y: seat.y + .1 }));
          c.root.position.y = .68; c.root.rotation.set(-1.15, 0, 0);
        }
      }
    }
    const living = new Set(['player', ...s.workers.map(w => w.id), ...s.guests.map(g => g.id)]); for (const [id, c] of this.characters) if (!living.has(id)) { this.scene.remove(c.root); c.mixer?.stopAllAction(); c.load.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); }); this.characters.delete(id); }
    const notices = taskIndicators(s), noticeAreas = new Set(notices.map(n => n.areaId));
    const goal = resortGoal(s, this.sim.testMode), destination = this.sim.area(goal.area);
    this.beacon.visible = !!destination; if (destination) { this.beacon.position.copy(world(destination)); this.beacon.children[1].position.y = 1.4 + Math.sin(s.elapsed * 3) * .15; }
    this.footsteps.forEach((dot, i) => { const point = s.player.path[i * 2]; dot.visible = !!point; if (point) { dot.position.copy(world(point)); dot.position.y = .2; } });
    for (const [id, meshes] of this.dirtModels) { const task = s.tasks.find(t => t.target === id && t.kind === (id.startsWith('room') ? 'cleanFloor' : 'cleanSeat')), progress = task ? cleaningProgress(task.remaining, task.total) : 0; meshes.forEach((mesh, i) => { mesh.visible = progress < (i + 1) / meshes.length; }); }
    for (const [id, linen] of this.bedLinen) { const room = this.sim.facility(id), task = s.tasks.find(t => t.target === id && t.kind === 'cleanRoom'); linen.root.visible = room.dirty || !room.needsSheet; linen.update(room.dirty ? task ? cleaningProgress(task.remaining, task.total) : 0 : 1); }
    for (const [id, meshes] of this.stockModels) { const n = id === 'laundryClean' ? s.laundry.clean : id === 'laundrySheets' ? s.laundry.cleanSheets ?? 0 : id === 'laundryDirty' ? s.laundry.dirty + (s.laundry.dirtySheets ?? 0) : id === 'poolDirty' ? this.sim.facility('pool').dirtyTowels ?? 0 : this.sim.facility('pool').towels; meshes.forEach((mesh, i) => { mesh.visible = i < n; if (id === 'laundryDirty') { const sheet = i >= s.laundry.dirty; mesh.material = this.material(sheet ? 0x8a9da9 : 0x9a897d); mesh.scale.set(sheet ? 1.16 : 1, 1, sheet ? 1.3 : 1); } }); }
    const maintenance = s.tasks.find(t => t.kind === 'cleanPool');
    const cleanProgress = maintenance ? 1 - maintenance.remaining / maintenance.total : 0;
    this.poolLeaves.forEach((leaf, i) => { leaf.visible = i < (this.sim.facility('pool').dirt ?? 0) * 4 && cleanProgress < 1 - i / 16; });
    for (const [id, pile] of this.tipModels) pile.visible = (this.sim.facility(id).tips ?? 0) > 0;
    const visibleGuests = new Set(s.guests.map(g => g.id));
    for (const [id, marker] of this.guestMoods) if (!visibleGuests.has(id)) { marker.remove(); this.guestMoods.delete(id); }
    for (const guest of s.guests) {
      const mood = guestMood(guest); let marker = this.guestMoods.get(guest.id);
      if (!mood) { if (marker) marker.style.display = 'none'; continue; }
      if (!marker) { marker = document.createElement('div'); marker.className = 'guest-mood'; this.labels.append(marker); this.guestMoods.set(guest.id, marker); }
      marker.textContent = mood; marker.setAttribute('aria-label', mood === '😠' ? 'Misafir uzun beklediği için kızgın' : 'Misafir sabırsızlanıyor');
      this.project(marker, world(guest).add(new T.Vector3(0, 2.25, 0)));
    }
    for (const drum of this.drums) if (s.laundry.remaining !== null && s.laundry.remaining > 0) drum.rotation.y = s.elapsed * 3;
    for (const event of this.sim.feedback.splice(0)) this.feel.emit(event);
    this.feel.update(s.settings.paused ? 0 : dt * s.settings.speed, world(s.player));
    for (const p of this.pads.values()) {
      const a = p.area;
      if (HIDDEN_RECEPTION_MARKERS.has(a.id)) {
        p.fill.visible = false; p.outline.visible = false; p.label.style.display = 'none';
        if (a.mode === 'cash') { const cash = a.target === 'bar' ? s.bar!.cash : this.sim.facility(a.target).cash; this.moneyModels.get(a.target)!.visible = cash > 0; }
        continue;
      }
      const task = s.tasks.find(t => t.target === a.target && (a.taskKind === t.kind || a.id === `${t.target}Work` && (t.kind === 'cleanRoom' || t.kind === 'restockRoom'))), near = this.sim.inside(s.player, a);
      const progress = task ? 1 - task.remaining / task.total : near ? .3 : 0;
      const poolGateLocked = a.mode === 'buy' && a.target === 'pool' && !this.sim.facility('pool').open && (!this.sim.poolRoomsUnlocked() || this.sim.level < this.sim.requiredLevel(a));
      const buyLocked = !this.sim.testMode && a.mode === 'buy' && (poolGateLocked || this.sim.level < this.sim.requiredLevel(a));
      const unaffordable = !this.sim.testMode && (a.mode === 'buy' || a.mode === 'upgrade') && s.money < this.sim.cost(a);
      (p.outline.material as T.MeshBasicMaterial).color.set(near ? a.mode === 'upgrade' ? 0xd8d0b5 : 0xb7ef8d : a.mode === 'buy' ? buyLocked ? 0xb3b7a0 : 0x92e6a3 : a.mode === 'upgrade' ? 0xc8bb99 : 0xffffff);
      (p.outline.material as T.MeshBasicMaterial).opacity = a.mode === 'upgrade' ? near ? .58 : .42 : 1;
      (p.fill.material as T.MeshBasicMaterial).opacity = a.mode === 'work' ? .1 + progress * .4 : a.mode === 'upgrade' ? .18 : .55;
      p.label.classList.toggle('goal', a.id === goal.area); p.label.classList.toggle('locked', buyLocked || unaffordable);
      p.label.classList.toggle('reception-hire', !!staffRole(a.target));
      p.label.classList.toggle('upgrade-marker', a.mode === 'upgrade');
      const roomPurchase = a.mode === 'buy' && a.target.startsWith('room');
      const poolPurchase = a.mode === 'buy' && a.target === 'pool';
      const barPurchase = a.mode === 'buy' && a.target === 'bar';
      p.label.classList.toggle('purchase-marker', roomPurchase || poolPurchase || barPurchase);
      if (!!staffRole(a.target)) p.label.title = `${a.label} · ${this.sim.testMode ? 'Ücretsiz test' : this.sim.cost(a) + ' ₺'}`;
      const purchasePrice = this.sim.testMode ? '∞' : roomPurchase || poolPurchase || barPurchase ? `${this.sim.cost(a).toLocaleString('tr-TR')} ₺` : '';
      const purchaseText = poolPurchase && poolGateLocked
        ? purchaseIconSvg('lock')
        : roomPurchase ? `${purchaseIconSvg('bed')}<span class="purchase-price">${purchasePrice}</span>`
          : poolPurchase ? `${purchaseIconSvg('pool')}<span class="purchase-price">${purchasePrice}</span>`
            : barPurchase ? `${purchaseIconSvg('bar')}<span class="purchase-price">${purchasePrice}</span>` : '';
      const text = a.id === 'office' ? `${officeDevelopmentIconSvg()}<span class="office-caption">Personel<br>geliştir</span>` : !!staffRole(a.target) ? `${staffIconSvg(staffRole(a.target)!)}<span class="hire-price">${this.sim.testMode ? '∞' : this.sim.cost(a) + ' ₺'}</span>` : roomPurchase || poolPurchase || barPurchase ? purchaseText : a.mode === 'buy' ? `${this.sim.level < this.sim.requiredLevel(a) && !this.sim.testMode ? '🔒' : '＋'} ${a.label}<small>Sv. ${this.sim.requiredLevel(a)} · ${this.sim.testMode ? 'ÜCRETSİZ' : this.sim.cost(a) + ' ₺'}</small>` : a.mode === 'upgrade' ? `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27V7m-7 8 7-8 7 8M7 27h18"/></svg><span class="hire-price">${this.sim.testMode ? '∞' : this.sim.cost(a) + ' ₺'}</span>` : a.mode === 'cash' ? `💵 ${(a.target === 'bar' ? s.bar! : this.sim.facility(a.target)).cash} ₺` : `${a.taskKind === 'cleanTake' ? '☀' : a.taskKind === 'dirtyDrop' ? '♺' : '▢'} ${a.label}${task ? '<small>' + Math.round(progress * 100) + '%</small>' : ''}`;
      const purchaseProgress = this.sim.purchaseProgress(a);
      const labelText = text + (purchaseProgress === undefined ? '' : '<span class="purchase-progress" aria-hidden="true"></span>');
      if (p.label.innerHTML !== labelText) p.label.innerHTML = labelText;
      p.label.style.setProperty('--purchase-progress', `${Math.round((purchaseProgress ?? 0) * 100)}%`);
      if (a.mode === 'buy') p.label.setAttribute('aria-label', poolPurchase && poolGateLocked ? `Havuz kilitli · İlk 6 oda ve Seviye ${this.sim.requiredLevel(a)} gerekli` : `${a.label} · ${this.sim.cost(a)} ₺${purchaseProgress === undefined ? '' : ' · %' + Math.round(purchaseProgress * 100)}`);
      this.project(p.label, p.root.position.clone().add(new T.Vector3(0, .38, !!staffRole(a.target) ? 0 : .5)));
      const featuredTestUpgrade = this.sim.testMode && a.mode === 'upgrade' && (a.target.startsWith('room') || a.target === 'pool');
      if (a.id !== 'office' && (a.mode === 'work' && !near && distance(s.player, a) > 6 || a.mode === 'upgrade' && !featuredTestUpgrade && distance(s.player, a) > 6 || !this.follow && a.mode === 'work')) p.label.style.display = 'none';
      if (a.mode === 'work' && noticeAreas.has(a.id)) p.label.style.display = 'none';
      if (!near && a.id !== goal.area && a.mode === 'buy' && !this.sim.testMode && this.sim.requiredLevel(a) > this.sim.level + 1 && a.target !== 'pool') p.label.style.display = 'none';
      if (a.mode === 'work' && a.target.startsWith('room') && a.taskKind !== 'cleanFloor' && !this.sim.facility(a.target).dirty && this.sim.facility(a.target).towels && !near) { p.label.style.display = 'none'; p.root.visible = false; } else p.root.visible = true;
      if (a.mode === 'cash') { const cash = a.target === 'bar' ? s.bar!.cash : this.sim.facility(a.target).cash; this.moneyModels.get(a.target)!.visible = cash > 0; if (!cash) p.label.style.display = 'none'; }
      if (a.id !== 'office' && (a.mode === 'work' || a.mode === 'upgrade' && a.target !== 'laundry' && !featuredTestUpgrade)) p.label.style.display = 'none';
    }
    for (const [id, l] of this.facilityLabels) {
      const f = this.sim.facility(id), r = ROOM_DEFS.find(r => r.id === id), pos = r ? world({ x: r.x + 4.5, y: r.y + 1 }) : world(id === 'reception' ? { x: RECEPTION_VISUAL_X, y: 43 } : id === 'laundry' ? { x: 8, y: 44 } : { x: 28, y: 2 });
      const g = s.guests.find(g => g.id === f.guest), title = r?.name ?? (id === 'reception' ? 'Resepsiyon' : id === 'laundry' ? 'Çamaşırhane' : 'Havuz');
      const description = !f.open ? 'YENİ ALAN' : f.kind === 'room' ? g ? g.phase === 'staying' ? `Konaklıyor · ${Math.ceil(g.remaining)} sn` : 'Misafir geliyor' : f.dirty ? 'YATAĞI TOPLA' : f.floorDirty ? 'ZEMİNİ SÜPÜR' : f.bathroomDirty ? 'BANYOYU TEMİZLE' : f.needsSheet ? 'TEMİZ ÇARŞAF GEREKLİ' : f.towels ? 'MİSAFİRE HAZIR' : 'TEMİZ HAVLU GEREKLİ' : id === 'laundry' ? `${this.sim.testMode ? '∞' : s.laundry.clean} temiz · ${s.laundry.dirty} kirli${s.laundry.remaining !== null ? ' · ' + Math.ceil(s.laundry.remaining) + ' sn' : ''}` : id === 'reception' ? `${s.guests.filter(g => g.phase === 'queue').length} misafir sırada` : `${s.seats.filter(s => s.open && !s.guest && !s.dirty).length} boş şezlong`;
      const text = `<b>${title}</b><small>${description}${f.open ? ' · Sv. ' + f.level : ''}</small>${r && f.open ? `<small class="room-class">${['Standart oda · 40 ₺', 'Konfor oda · 50 ₺'][f.level - 1]}</small>` : ''}`; if (l.innerHTML !== text) l.innerHTML = text; l.classList.toggle('dirty', f.dirty); pos.y = r ? 3.5 : 4; this.project(l, pos); if (!this.follow || !f.open) l.style.display = 'none';
    }
    this.updateTaskMarkers(notices);
    this.wave.position.y = -.12 + Math.sin(now / 1500) * .025; this.renderer.render(this.scene, this.camera); this.frame = requestAnimationFrame(this.animate);
  };
  centerPlayer() { this.follow = true; }
  showAll() { this.follow = false; this.target.copy(world({ x: RECEPTION.x, y: 27 })); }
  setZoom(factor: number) { this.zoom = T.MathUtils.clamp(this.zoom * factor, .65, 1.6); this.follow = true; }
  private resize() { const r = this.host.getBoundingClientRect(); this.renderer.setSize(r.width, r.height); this.camera.aspect = r.width / Math.max(1, r.height); this.camera.updateProjectionMatrix(); }
  private ground(p: Point) { const r = this.host.getBoundingClientRect(), ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2((p.x - r.left) / r.width * 2 - 1, -(p.y - r.top) / r.height * 2 + 1), this.camera); const hit = new T.Vector3(); if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), hit)) return; return { x: Math.round(hit.x + 19), y: Math.round(hit.z + 27) }; }
  private events() {
    const opts = { signal: this.abort.signal }, canvas = this.renderer.domElement;
    window.addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName) || document.querySelector('dialog[open]')) return; const k = e.key.toLowerCase(); if (k === 'escape') return; this.keys.add(k); if (k === ' ' || k.startsWith('arrow')) e.preventDefault();  if (k === 'escape') document.querySelector('#drawer')!.classList.remove('open'); }, opts);
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()), opts); window.addEventListener('blur', () => { this.keys.clear(); this.touch = { x: 0, y: 0 }; }, opts);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(e.deltaY < 0 ? 1.08 : .92); }, { ...opts, passive: false });
    canvas.addEventListener('pointerdown', e => { this.origin = { x: e.clientX, y: e.clientY }; this.dragged = false; this.pointers.set(e.pointerId, this.origin); canvas.setPointerCapture(e.pointerId); }, opts);
    canvas.addEventListener('pointermove', e => { const prev = this.pointers.get(e.pointerId); if (!prev) return; const p = { x: e.clientX, y: e.clientY }; this.pointers.set(e.pointerId, p); if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()], d = distance(a, b); if (this.pinch) this.setZoom(d / this.pinch); this.pinch = d; this.dragged = true; return; } if (this.origin && distance(p, this.origin) > 7) this.dragged = true; if (this.dragged) { this.follow = false; this.target.x -= (p.x - prev.x) * .04 / this.zoom; this.target.z -= (p.y - prev.y) * .05 / this.zoom; this.target.x = T.MathUtils.clamp(this.target.x, MAP_MIN_X - 19, MAP_MAX_X - 19); this.target.z = T.MathUtils.clamp(this.target.z, -26, 25); } }, opts);
    canvas.addEventListener('pointerup', e => { if (!this.dragged && this.pointers.size === 1) { const p = this.ground({ x: e.clientX, y: e.clientY }); if (p) { const a = this.sim.areas.find(a => distance(a, p) < 1); this.sim.goTo(a ?? p); this.follow = true; } } this.pointers.delete(e.pointerId); this.pinch = 0; }, opts);
    canvas.addEventListener('pointercancel', e => this.pointers.delete(e.pointerId), opts);
    const joystick = document.querySelector<HTMLElement>('#joystick')!, knob = document.querySelector<HTMLElement>('#joystick-knob')!;
    const move = (e: PointerEvent) => { const r = joystick.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, l = Math.max(30, Math.hypot(x, y)); this.touch = { x: x / l, y: y / l }; knob.style.transform = `translate(${this.touch.x * 23}px, ${this.touch.y * 23}px)`; };
    joystick.addEventListener('pointerdown', e => { joystick.setPointerCapture(e.pointerId); move(e); }, opts); joystick.addEventListener('pointermove', e => { if (joystick.hasPointerCapture(e.pointerId)) move(e); }, opts); const release = () => { this.touch = { x: 0, y: 0 }; knob.style.transform = ''; }; joystick.addEventListener('pointerup', release, opts); joystick.addEventListener('pointercancel', release, opts);
  }
  dispose() { cancelAnimationFrame(this.frame); this.abort.abort(); this.observer.disconnect(); this.feel.dispose(); for (const m of this.taskMarkers.values()) m.button.remove(); this.taskMarkers.clear(); this.renderer.dispose(); this.roomFloorMaterial.dispose(); this.roomFloorTexture.dispose(); this.promenadeMaterial.dispose(); this.promenadeTexture.dispose(); this.poolTileMaterial.dispose(); this.poolWaterMaterial.dispose(); this.poolTileTexture.dispose(); this.poolTileNormal.dispose(); this.materials.forEach(m => m.dispose()); }
}
function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
