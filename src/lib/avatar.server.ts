import boring from 'boring-avatars-vanilla';

// An avatar is fully determined by its id, so cache the generated SVG and reuse
// it across reconcile ticks instead of regenerating on every list broadcast.
// Pinned to globalThis so dev-mode hot reload keeps the cache.
const globalForAvatars = globalThis as unknown as { __dcmAvatars?: Map<string, string> };
const cache: Map<string, string> = (globalForAvatars.__dcmAvatars ??= new Map());

/**
 * A unique SVG avatar for an instance, seeded by its id so it stays stable.
 * Rendered server-side so the avatar library never ships to the client.
 */
export function avatarFor(id: string): string {
  let svg = cache.get(id);
  if (svg === undefined) {
    svg = boring({ name: id, variant: 'beam', size: 40 });
    cache.set(id, svg);
  }
  return svg;
}

/** Drop a cached avatar (called when its instance is deleted). */
export function forgetAvatar(id: string): void {
  cache.delete(id);
}
