import * as THREE from 'three';

export const AVATAR_SCALE_DEFAULTS = {
  targetHeight: 3.05,
  verticalOffset: -1.2,
  forwardTiltX: -0.05,
};

export class AvatarScale {
  static measureHeight(model: THREE.Group): number {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).y;
    return isNaN(size) || size < 0.1 ? 1.6 : size;
  }

  static ground(
    model: THREE.Group,
    {
      verticalOffset = AVATAR_SCALE_DEFAULTS.verticalOffset,
      forwardTiltX = AVATAR_SCALE_DEFAULTS.forwardTiltX,
    }: { verticalOffset?: number; forwardTiltX?: number } = {},
  ): void {
    model.updateMatrixWorld(true);
    model.position.set(0, verticalOffset, 0);
    model.rotation.x = forwardTiltX;
    model.updateMatrixWorld(true);
  }

  static apply(
    model: THREE.Group,
    {
      scale = 1,
      targetHeight = AVATAR_SCALE_DEFAULTS.targetHeight,
      verticalOffset = AVATAR_SCALE_DEFAULTS.verticalOffset,
      forwardTiltX = AVATAR_SCALE_DEFAULTS.forwardTiltX,
    }: {
      scale?: number;
      targetHeight?: number;
      verticalOffset?: number;
      forwardTiltX?: number;
    } = {},
  ): { norm: number; sx: number; sy: number; sz: number } {
    model.scale.set(1, 1, 1);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);

    const rawHeight = this.measureHeight(model);
    const norm = rawHeight > 0.01 ? targetHeight / rawHeight : 1;
    const s = norm * scale;

    model.scale.set(s, s, s);
    this.ground(model, { verticalOffset, forwardTiltX });

    const userData = model.userData as Record<string, unknown>;
    userData.avatarScale = {
      norm,
      sx: s,
      sy: s,
      sz: s,
      scale,
      targetHeight,
      verticalOffset,
      forwardTiltX,
    };

    return { norm, sx: s, sy: s, sz: s };
  }

  static applyProportions(
    model: THREE.Group,
    scale = 1,
  ): void {
    const meta = (
      (model.userData as Record<string, unknown>).avatarScale as Record<string, number> | undefined
    ) ?? {};
    const base = (meta.norm as number) ?? 1;
    const s = base * scale;

    model.scale.set(s, s, s);
    this.ground(model, {
      verticalOffset: (meta.verticalOffset as number) ?? AVATAR_SCALE_DEFAULTS.verticalOffset,
      forwardTiltX: (meta.forwardTiltX as number) ?? AVATAR_SCALE_DEFAULTS.forwardTiltX,
    });

    const stored = (model.userData as Record<string, unknown>).avatarScale as Record<string, unknown> | undefined;
    if (stored) {
      stored.sx = s;
      stored.sy = s;
      stored.sz = s;
      stored.scale = scale;
    }
  }
}
