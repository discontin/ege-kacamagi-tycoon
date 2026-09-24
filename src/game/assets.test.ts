import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSET_CATALOG, assetPath, type AssetKey } from './assetCatalog';
import { AssetLibrary } from './AssetLibrary';

const keys = Object.keys(ASSET_CATALOG) as AssetKey[];
interface GlbMetadata { asset: { version: string }; images?: { uri?: string }[]; buffers?: { uri?: string }[]; skins?: unknown[]; nodes?: { name?: string; translation?: number[] }[]; animations?: { name: string; channels?: { target: { node: number; path: string } }[] }[] }
function metadata(key: AssetKey): GlbMetadata {
  const file = resolve('public', assetPath(key)), bytes = readFileSync(file);
  expect(bytes.toString('ascii', 0, 4), key).toBe('glTF');
  expect(bytes.readUInt32LE(4), key).toBe(2);
  expect(bytes.readUInt32LE(8), key).toBe(bytes.length);
  expect(bytes.readUInt32LE(16), key).toBe(0x4e4f534a);
  return JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
}

describe('shipped CC0 assets', () => {
  it('ships every catalog entry as a valid local GLB, including referenced textures', () => {
    expect(keys).toHaveLength(81);
    for (const key of keys) {
      const json = metadata(key);
      expect(json.asset.version).toBe('2.0');
      for (const dependency of [...(json.images ?? []), ...(json.buffers ?? [])]) {
        if (dependency.uri && !dependency.uri.startsWith('data:')) {
          expect(dependency.uri, key).not.toMatch(/^https?:/);
          expect(existsSync(resolve(dirname(resolve('public', assetPath(key))), dependency.uri)), `${key}: ${dependency.uri}`).toBe(true);
        }
      }
    }
  });
  it('retains the commercial CC0 license of each original pack', () => {
    for (const pack of new Set(Object.values(ASSET_CATALOG).map(([pack]) => pack))) {
      const root = pack.startsWith('3dassets/') ? 'public/assets' : 'public/assets/kenney';
      const license = readFileSync(resolve(root, pack, 'License.txt'), 'utf8');
      expect(license).toContain('CC0'); expect(license).toContain('commercial');
      if (!pack.startsWith('3dassets/')) expect(license).toContain('Kenney');
    }
  });
  it('ships the CC0 pool tile maps with their license', () => {
    const directory = resolve('public/assets/opengameart/blue-pool-tiles');
    expect(existsSync(resolve(directory, 'pooltiles_albedo.png'))).toBe(true);
    expect(existsSync(resolve(directory, 'pooltiles_normal.png'))).toBe(true);
    const license = readFileSync(resolve(directory, 'License.txt'), 'utf8');
    expect(license).toContain('CC0'); expect(license).toContain('commercial');
  });
  it('includes skeletons and every animation used by the player and workers', () => {
    for (const key of ['player', 'worker', 'workerAlt'] as AssetKey[]) {
      const json = metadata(key);
      expect(json.skins?.length, key).toBeGreaterThan(0);
      expect(json.animations?.map(a => a.name), key).toEqual(expect.arrayContaining(['idle', 'walk', 'interact-right', 'holding-both']));
    }
  });
  it('ships skating character variants with task and riding animations', () => {
    for (const key of ['skateBoy', 'skateGirl'] as AssetKey[]) {
      const json = metadata(key);
      expect(json.animations?.map(a => a.name), key).toEqual(expect.arrayContaining(['idle', 'walk', 'interact-right', 'holding-both', 'skate', 'skate-stand']));
    }
  });
  it('keeps the room-cleaner character distinct from every customer character', () => {
    const guests = ['guestA', 'guestB', 'guestC', 'guestD', 'guestE', 'guestF', 'guestG', 'guestH', 'guestI', 'guestJ'] as AssetKey[];
    const guestPaths = guests.map(assetPath);
    expect(new Set(guestPaths).size).toBe(guests.length);
    expect(guestPaths).not.toContain(assetPath('roomStaff'));
  });
  it('ships a washer with real door-open and door-close clips', () => {
    const json = metadata('washer');
    expect(json.animations?.map(a => a.name)).toEqual(expect.arrayContaining(['door-open', 'door-close']));
    for (const name of ['door-open', 'door-close']) {
      const targets = json.animations?.find(animation => animation.name === name)?.channels?.map(({ target }) => [json.nodes?.[target.node]?.name, target.path]);
      expect(targets).toContainEqual(['door-drum', 'rotation']);
    }
    const license = readFileSync(resolve('public/assets/3dassets/home-appliances-and-utility/License.txt'), 'utf8');
    expect(license).toContain('CC0 1.0'); expect(license).toContain('commercial');
  });
  it('ships a washer-open variant with the door visibly swung away from the drum', () => {
    const json = metadata('washerOpen');
    expect(json.nodes?.[0]?.name).toBe('washing-machine-open-drum-door');
    const doorPieces = json.nodes?.filter(node => node.name === 'door-drum' && node.translation);
    expect(doorPieces).toHaveLength(4);
    expect(doorPieces?.some(node => (node.translation?.[0] ?? 0) < -.25)).toBe(true);
  });
  it('ships an open rolling laundry cart that is distinct from the waste bin', () => {
    const json = metadata('laundryHamper');
    expect(json.nodes?.map(node => node.name)).toContain('laundry-cart-rolling');
    expect(assetPath('laundryHamper')).not.toBe(assetPath('bin'));
  });
});

function fixture(): GLTF {
  const scene = new T.Group(), bone = new T.Bone(); bone.name = 'root';
  const geometry = new T.BoxGeometry(1, 2, 1);
  const vertices = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Uint16Array(vertices * 4), 4));
  const weights = new Float32Array(vertices * 4); for (let i = 0; i < vertices; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  const mesh = new T.SkinnedMesh(geometry, new T.MeshStandardMaterial());
  mesh.name = 'body'; mesh.add(bone); mesh.bind(new T.Skeleton([bone])); scene.add(mesh);
  return { scene, scenes: [scene], animations: [new T.AnimationClip('walk', 1, [new T.NumberKeyframeTrack('root.rotation[y]', [0, 1], [0, 1])])], cameras: [], asset: { version: '2.0' }, parser: {} as GLTF['parser'], userData: {} };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('model loading and instance isolation', () => {
  it('reports complete progress, grounds and normalizes independent character skeletons', async () => {
    vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' });
    const source = fixture(); vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(source);
    const library = new AssetLibrary(), progress = vi.fn(); await library.load(progress);
    expect(library.loaded).toBe(81); expect(library.failed).toEqual([]);
    expect(progress).toHaveBeenLastCalledWith(81, 81);
    const a = library.instantiate('player', { height: 1.65 })!, b = library.instantiate('worker', { height: 1.65 })!;
    const bounds = new T.Box3().setFromObject(a.root);
    expect(bounds.min.y).toBeCloseTo(0); expect(bounds.getSize(new T.Vector3()).y).toBeCloseTo(1.65);
    const meshA = a.model.getObjectByName('body') as T.SkinnedMesh, meshB = b.model.getObjectByName('body') as T.SkinnedMesh;
    expect(meshA.skeleton).not.toBe(meshB.skeleton);
    expect(meshA.skeleton.bones[0]).not.toBe(meshB.skeleton.bones[0]);
    const mixer = new T.AnimationMixer(a.model); mixer.clipAction(a.clips[0]).play(); mixer.update(.5);
    expect(meshA.skeleton.bones[0].rotation.y).toBeCloseTo(.5);
    expect(meshB.skeleton.bones[0].rotation.y).toBe(0);
    expect(source.scene.getObjectByName('root')!.rotation.y).toBe(0);
    library.dispose();
  });
  it('settles a failed asset without aborting other models and exposes fallback availability', async () => {
    vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' });
    const source = fixture(); vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async url => {
      if (url.endsWith(assetPath('machine'))) throw new Error('missing model'); return source;
    });
    const library = new AssetLibrary(), progress = vi.fn(); await library.load(progress);
    expect(library.loaded).toBe(80); expect(library.failed).toEqual(['machine']);
    expect(library.has('machine')).toBe(false); expect(library.instantiate('machine')).toBeUndefined();
    expect(library.has('player')).toBe(true); expect(progress).toHaveBeenLastCalledWith(81, 81);
    library.dispose();
  });
});
