<script lang="ts">
  import { ideUrl, type Instance } from '../types.ts';
  import { House, X, Settings } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';
  import { playChime, unlockAudio } from '../sound.ts';

  let { activeId, running }: { activeId: string; running: Instance[] } = $props();

  // Default to the requested instance when it's running, else the first running
  // one (e.g. arriving for an instance that has since stopped). Props are fixed
  // for the page's lifetime, so reading their initial value is intentional.
  // svelte-ignore state_referenced_locally
  const initial = running.some((i) => i.id === activeId) ? activeId : (running[0]?.id ?? '');
  let active = $state(initial);
  let closing = $state<string | null>(null);

  // Live attention signal per instance, raised by the in-container Claude hook:
  // 'done' (task finished) pulses green, 'waiting' (needs input) pulses amber.
  let attention = $state<Record<string, 'done' | 'waiting' | null>>({});

  const activeInstance = $derived(running.find((i) => i.id === active));

  // Unlock/resume the chime's audio context on the first interaction with the page
  // (browsers block audio until the page has been interacted with).
  $effect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  });

  // Track each instance's attention from the live instance-list stream, chiming when
  // a non-focused tab newly raises (or changes) its signal.
  $effect(() => {
    let primed = false; // skip the first frame so a reconnect doesn't replay sounds
    const source = new EventSource('/api/instances/stream');
    source.onmessage = (event) => {
      try {
        const next: Record<string, 'done' | 'waiting' | null> = {};
        for (const inst of JSON.parse(event.data) as Instance[]) next[inst.id] = inst.attention;
        if (primed) {
          for (const id in next) {
            const state = next[id];
            if (state && state !== attention[id] && id !== active) playChime(state);
          }
        }
        primed = true;
        attention = next;
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => source.close();
  });

  // The focused tab shouldn't pulse: dismiss its signal server-side (for all viewers)
  // as soon as it's active and carrying one.
  $effect(() => {
    if (active && attention[active]) {
      void fetch(`/api/instances/${active}/attention/clear`, { method: 'POST' });
    }
  });

  // Stop the container, then return to the dashboard (which reflects the new
  // state via its live stream). Navigating away tears down all the iframes too.
  async function stop(id: string) {
    closing = id;
    try {
      await fetch(`/api/instances/${id}/stop`, { method: 'POST' });
    } catch {
      /* navigate anyway — the dashboard shows the real state */
    }
    window.location.href = '/';
  }
</script>

<div class="shell">
  <header class="bar">
    <a class="home" href="/" title="All instances" aria-label="All instances"><House size={18} /></a>
    {#if running.length > 0}
      <nav class="tabs">
        {#each running as inst (inst.id)}
          <div
            class="tab"
            class:active={inst.id === active}
            class:attn-done={inst.id !== active && attention[inst.id] === 'done'}
            class:attn-waiting={inst.id !== active && attention[inst.id] === 'waiting'}
          >
            <button type="button" class="tab-label" onclick={() => (active = inst.id)} title={inst.name}>
              <Avatar id={inst.id} name={inst.name} scale={4} />
              <span class="tab-name">{inst.name}</span>
            </button>
            <button
              type="button"
              class="tab-close"
              onclick={() => stop(inst.id)}
              disabled={closing === inst.id}
              title="Stop and close"
              aria-label="Stop {inst.name}"
            >
              <X size={13} />
            </button>
          </div>
        {/each}
      </nav>
    {/if}
    <a class="cog" href="/settings" title="Settings" aria-label="Settings"><Settings size={18} /></a>
  </header>

  {#if running.length === 0}
    <div class="empty">No running instances.</div>
  {:else}
    <div class="panes">
      {#each running as inst (inst.id)}
        <div class="pane" class:active={inst.id === active}>
          <!-- All running IDEs are mounted at once; inactive panes are hidden via
               CSS so their code-server connection and editor state stay alive. -->
          <iframe src={ideUrl(inst)} title={inst.name}></iframe>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .bar {
    display: flex;
    align-items: stretch;
    gap: 0;
    height: 44px;
    border-bottom: 1px solid var(--rule);
    background: var(--bg-card);
  }
  .home {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    flex: none;
    color: var(--ink);
    border-right: 1px solid var(--rule);
  }
  .home:hover {
    background: var(--ink);
    color: var(--bg);
  }
  .cog {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    flex: none;
    margin-left: auto;
    color: var(--ink);
    border-left: 1px solid var(--rule);
  }
  .cog:hover {
    background: var(--ink);
    color: var(--bg);
  }
  .tabs {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    min-width: 0;
  }
  .tab {
    display: inline-flex;
    align-items: stretch;
    border-right: 1px solid var(--rule-soft);
  }
  .tab.active {
    background: var(--ink);
  }
  /* Attention pulse raised by the in-container Claude hook. The focused tab never
     gets these classes, so a pulsing tab always means "needs your eyes". */
  .tab.attn-done {
    animation: attn-pulse-green 1.8s ease-in-out infinite;
  }
  .tab.attn-waiting {
    animation: attn-pulse-amber 1.8s ease-in-out infinite;
  }
  @keyframes attn-pulse-green {
    0%,
    100% {
      background: transparent;
      box-shadow: inset 0 -2px 0 rgba(34, 197, 94, 0.4);
    }
    50% {
      background: rgba(34, 197, 94, 0.32);
      box-shadow: inset 0 -2px 0 rgba(34, 197, 94, 1);
    }
  }
  @keyframes attn-pulse-amber {
    0%,
    100% {
      background: transparent;
      box-shadow: inset 0 -2px 0 rgba(245, 158, 11, 0.4);
    }
    50% {
      background: rgba(245, 158, 11, 0.32);
      box-shadow: inset 0 -2px 0 rgba(245, 158, 11, 1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tab.attn-done,
    .tab.attn-waiting {
      animation-duration: 0s;
      background: rgba(34, 197, 94, 0.28);
    }
    .tab.attn-waiting {
      background: rgba(245, 158, 11, 0.28);
    }
  }
  .tab-label,
  .tab-close {
    appearance: none;
    background: transparent;
    border: 0;
    cursor: pointer;
    color: var(--ink-soft);
    font-family: var(--font-mono);
  }
  .tab-label {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 12px;
    max-width: 240px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .tab-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab-close {
    display: inline-flex;
    align-items: center;
    padding: 0 10px 0 4px;
    color: var(--ink-faint);
  }
  .tab-close:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .tab:not(.active) .tab-label:hover,
  .tab:not(.active) .tab-close:not(:disabled):hover {
    color: var(--ink);
  }
  .tab.active .tab-label,
  .tab.active .tab-close {
    color: var(--bg);
  }
  .tab.active .tab-close:not(:disabled):hover {
    opacity: 0.65;
  }
  .panes {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .pane {
    position: absolute;
    inset: 0;
  }
  .pane:not(.active) {
    display: none;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-faint);
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 13px;
  }
</style>
