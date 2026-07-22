import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
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
  ): Promise<{ scene: THREE.Group; dispose: () => void }> {
    this._removeCurrent();

    return new Promise((resolve, reject) => {
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

          this.scene.add(gltf.scene);
          this.currentAvatar = wrapper;

          resolve(wrapper);
        },
        undefined,
        (error) => {
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
