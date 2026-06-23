import boring from 'boring-avatars-vanilla';

/**
 * A unique SVG avatar for an instance, seeded by its id so it stays stable.
 * Rendered server-side so the avatar library never ships to the client.
 */
export function avatarFor(id: string): string {
  return boring({ name: id, variant: 'beam', size: 40 });
}
