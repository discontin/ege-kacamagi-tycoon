import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ASSET_CATALOG, assetPath, type AssetKey } from './assetCatalog';

export interface AssetInstance { root: T.Group; model: T.Object3D; clips: T.AnimationClip[] }
export class AssetLibrary {
  private templates = new Map<AssetKey, GLTF>();
  readonly failed: AssetKey[] = [];
  get loaded() { return this.templates.size; }
  has(key: AssetKey) { return this.templates.has(key); }
  async load(progress: (loaded: number, total: number) => void, keys = Object.keys(ASSET_CATALOG) as AssetKey[]) {
    const loader = new GLTFLoader(); let finished = 0;
    // Bounded concurrent loading avoids flooding mobile browsers.
    let cursor = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (cursor < keys.length) {
        const key = keys[cursor++];
        try {
          const gltf = await loader.loadAsync(new URL(assetPath(key), document.baseURI).href);
          gltf.scene.traverse(o => {
            if (!(o instanceof T.Mesh)) return;
            o.castShadow = true; o.receiveShadow = true;
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of materials) if (m instanceof T.MeshStandardMaterial) {
              m.metalness = 0; m.roughness = .86;
              if (ASSET_CATALOG[key][0] === 'nature-kit') {
                if (/leaf|grass/i.test(m.name)) m.color.set(/corn|lettuce/.test(key) ? 0x64b94b : 0x9ccc4b);
                if (/wood/i.test(m.name)) m.color.set(0xa47a50);
              }
            }
          });
          this.templates.set(key, gltf);
        } catch (error) { this.failed.push(key); console.warn(`Model yüklenemedi: ${key}`, error); }
        progress(++finished, keys.length);
      }
    }));
  }
  instantiate(key: AssetKey, size: { height?: number; width?: number } = {}): AssetInstance | undefined {
    const gltf = this.templates.get(key); if (!gltf) return;
    const model = clone(gltf.scene), bounds = new T.Box3().setFromObject(model), extent = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
    const factor = size.height ? size.height / Math.max(extent.y, .001) : size.width ? size.width / Math.max(extent.x, extent.z, .001) : 1;
    const root = new T.Group(), scaled = new T.Group(), offset = new T.Group();
    offset.position.set(-center.x, -bounds.min.y, -center.z); offset.add(model);
    scaled.scale.setScalar(factor); scaled.add(offset); root.add(scaled); root.userData.asset = key;
    return { root, model, clips: gltf.animations };
  }
  dispose() {
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    this.templates.forEach(g => g.scene.traverse(o => { if (o instanceof T.Mesh) { geometries.add(o.geometry); for (const material of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(material); if (material instanceof T.MeshStandardMaterial && material.map) textures.add(material.map); } } }));
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.templates.clear();
  }
}
