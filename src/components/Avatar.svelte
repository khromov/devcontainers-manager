<script lang="ts">
  let { name, size = 40 }: { name: string; size?: number } = $props();

  // One- or two-letter monogram for the square LCD avatar tile, derived from
  // the instance name (no server-side avatar needed for the monochrome theme).
  function initials(name: string): string {
    const parts = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const [first, second] = parts;
    if (!first) return '··';
    if (!second) return first.slice(0, 2).toUpperCase();
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
</script>

<span
  class="avatar"
  style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.42)}px"
>{initials(name)}</span>

<style>
  .avatar {
    display: grid;
    place-items: center;
    flex: none;
    border: 1px solid var(--ink);
    background: var(--bg);
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--ink);
  }
</style>
