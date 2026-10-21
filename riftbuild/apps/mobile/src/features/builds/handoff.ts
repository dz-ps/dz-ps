import type { UserBuild } from '@riftbuild/shared';

// One-shot handoff of a build between screens (share link, "Aplicar no criador de build").
let pending: UserBuild | null = null;

export function setPendingBuild(build: UserBuild) {
  pending = build;
}

export function takePendingBuild(): UserBuild | null {
  const b = pending;
  pending = null;
  return b;
}
