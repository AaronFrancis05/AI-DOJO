import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { AvatarScale } from './AvatarScale';

function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value && typeof (value as THREE.Texture).dispose === 'function') {
          (value as THREE.Texture).dispose();
        }
      });
      material.dispose();
    });
  });
}

export class AvatarManager {
  scene: THREE.Scene;
  currentAvatar: { scene: THREE.Group; dispose: () => void } | null = null;
  loader: GLTFLoader;
  private _loadToken = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  get avatarModel() {
    return this.currentAvatar;
  }

  setTransform({
    scale,
    verticalOffset,
  }: { scale?: number; verticalOffset?: number } = {}): void {
    if (!this.currentAvatar) return;
    const meta = (
      this.currentAvatar.scene.userData as Record<string, unknown>
    ).avatarScale as Record<string, number> | undefined;
    if (meta && verticalOffset !== undefined) meta.verticalOffset = verticalOffset;
    AvatarScale.applyProportions(
      this.currentAvatar.scene,
      scale ?? (meta?.scale as number) ?? 1,
    );
  }

  private _removeCurrent(): void {
    if (!this.currentAvatar) return;
    if (this.currentAvatar.scene) this.scene.remove(this.currentAvatar.scene);
    try {
      this.currentAvatar.dispose?.();
    } catch { /* ignore */ }
    this.currentAvatar = null;
  }

  async loadAvatar(
    url: string,
    _personaName?: string | null,
    customization?: { scale?: number; verticalOffset?: number },
    timeoutMs = 30000,
  ): Promise<{ scene: THREE.Group; dispose: () => void }> {
    this._removeCurrent();

    this._loadToken += 1;
    const myToken = this._loadToken;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Avatar load timed out after ${timeoutMs}ms for "${url}" — check your connection.`));
      }, timeoutMs);

      this.loader.load(
        url,
        (gltf) => {
          gltf.scene.rotation.y = Math.PI;
          gltf.scene.traverse((obj) => {
            obj.frustumCulled = false;
            obj.castShadow = true;
          });

          const wrapper = {
            scene: gltf.scene,
            dispose: () => disposeObject3D(gltf.scene),
          };

          AvatarScale.apply(wrapper.scene, customization);

          if (settled) {
            disposeObject3D(gltf.scene);
            return;
          }
          if (myToken !== this._loadToken) {
            settled = true;
            clearTimeout(timeoutId);
            disposeObject3D(gltf.scene);
            reject(new Error('Superseded by a newer avatar load'));
            return;
          }

          this.scene.add(gltf.scene);
          this.currentAvatar = wrapper;

          settled = true;
          clearTimeout(timeoutId);
          resolve(wrapper);
        },
        undefined,
        (error) => {
          if (settled) return;
          if (myToken !== this._loadToken) {
            settled = true;
            clearTimeout(timeoutId);
            reject(new Error('Superseded by a newer avatar load'));
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          const errorObj = error as Error | null;
          const raw = (errorObj?.message) || String(error || '');
          const friendly =
            /Unexpected token|JSON|DOCTYPE/i.test(raw)
              ? `Avatar file not found at "${url}" (server returned a web page instead of a model). Check that the file exists under public${url}.`
              : `Avatar load error for "${url}": ${raw}`;
          reject(new Error(friendly));
        },
      );
    });
  }
}
