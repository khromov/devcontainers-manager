<script lang="ts">
  import { ideUrl, type Instance, type InstanceHealth } from '../types.ts';
  import { ArrowLeft, ArrowUpRight } from '@lucide/svelte';
  import HealthBox from './HealthBox.svelte';
  import { liveSocket } from '../live.ts';
  import type { StreamEvent } from '../lib/instances.server.ts';

  let { id }: { id: string } = $props();

  let instance = $state<Instance | null>(null);
  let health = $state<InstanceHealth | null>(null);
  let lastFetchedAt = $state<number | null>(null);
  let logs = $state('');

  // Auto-scroll the log box to the bottom whenever new output is appended.
  // Runs after the DOM updates, so scrollHeight is fresh (no tick() needed).
  function autoscroll(node: HTMLDivElement) {
    logs; // re-run whenever new log output is appended
    node.scrollTop = node.scrollHeight;
  }

  const statusLabel: Record<Instance['status'], string> = {
    creating: 'Booting…',
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error',
  };

  // Stream the boot/build log over its dedicated WebSocket. Reset on (re)connect
  // so the server's buffer replay doesn't duplicate output after a reconnect.
  $effect(() =>
    liveSocket(
      `/api/instances/${id}/logs`,
      (chunk) => (logs += chunk),
      () => (logs = ''),
    ),
  );

  // Track this instance's status and health from the central live stream.
  $effect(() =>
    liveSocket('/api/stream', (raw) => {
      try {
        const msg = JSON.parse(raw) as StreamEvent;
        if (msg.type === 'instances') {
          const found = msg.data.find((i) => i.id === id);
          if (found) instance = found;
        } else if (msg.type === 'health' && msg.data.id === id) {
          health = msg.data.health;
          lastFetchedAt = Date.now();
        }
      } catch {
        /* ignore malformed frame */
      }
    }),
  );

  const url = $derived(instance ? ideUrl(instance) : '#');
</script>

<header class="topbar">
  <a class="back" href="/"><ArrowLeft size={15} /> All instances</a>
  <div class="title">
    <span class="name">{instance?.name ?? 'Instance'}</span>
    {#if instance}
      <span class="status {instance.status}">{statusLabel[instance.status]}</span>
    {:else}
      <span class="skel skel-pill"></span>
    {/if}
  </div>
  {#if instance?.status === 'running'}
    <a class="open" href={url} target="_blank" rel="noopener">Open in new tab <ArrowUpRight size={15} /></a>
  {/if}
</header>

<main class="stage">
  <div class="meta">
    <span class="k">Source</span>
    {#if instance}<code>{instance.source_path}</code>{:else}<span class="skel skel-wide"></span>{/if}
    <span class="k">Port</span>
    {#if instance}<code>localhost:{instance.host_port}</code>{:else}<span class="skel skel-narrow"></span>{/if}
  </div>

  <div class="healthslot">
    <HealthBox {health} {lastFetchedAt} />
  </div>

  <div class="logwrap">
    <div class="logbar">Boot log</div>
    <div class="logs" {@attach autoscroll}><pre>{logs || 'Waiting for output…'}<span class="caret"></span></pre></div>
    {#if instance?.status === 'error' && instance.error}
      <div class="err">{instance.error}</div>
    {/if}
  </div>
</main>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--rule);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
    text-decoration: none;
    font-size: 12px;
  }
  .back:hover {
    color: var(--ink);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }
  .name {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 20px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  /* Monochrome theme: status reads via fill/pattern/animation, not hue. */
  .status {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 3px 7px;
    border: 1px solid var(--ink);
  }
  .status.running {
    background: var(--ink);
    color: var(--bg);
  }
  .status.stopped {
    background: transparent;
    color: var(--ink-soft);
    border-color: var(--ink-faint);
  }
  .status.creating {
    background: var(--ink);
    color: var(--bg);
    animation: lcd-blink 1.1s steps(1) infinite;
  }
  .status.error {
    background: repeating-linear-gradient(45deg, var(--ink) 0 3px, transparent 3px 6px);
    color: var(--ink);
    border-width: 2px;
    font-weight: 700;
  }
  @keyframes lcd-blink {
    50% {
      background: transparent;
      color: var(--ink);
    }
  }
  .open {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink);
    text-decoration: none;
    border: 1px solid var(--ink);
    padding: 7px 12px;
  }
  .open:hover {
    background: var(--ink);
    color: var(--bg);
  }
  .stage {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px 24px 40px;
  }
  .meta {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 14px;
    align-items: center;
    margin-bottom: 18px;
  }
  .meta .k {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .meta code {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--ink-soft);
  }
  .skel {
    display: inline-block;
    height: 0.95em;
    background: linear-gradient(90deg, var(--rule-soft) 25%, var(--bg-card) 50%, var(--rule-soft) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
    vertical-align: middle;
  }
  .skel-wide {
    width: min(420px, 60vw);
  }
  .skel-narrow {
    width: 120px;
  }
  .skel-pill {
    width: 64px;
    height: 18px;
    border-radius: 999px;
  }
  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
  .healthslot {
    margin-bottom: 18px;
  }
  .logwrap {
    border: 1px solid var(--ink);
    box-shadow: 4px 4px 0 var(--ink);
    overflow: hidden;
  }
  .logbar {
    padding: 9px 14px;
    background: var(--ink);
    color: var(--bg);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  /* The one "screen": a black LCD panel with faint scanlines. */
  .logs {
    position: relative;
    background:
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 3px),
      #0d0e0a;
    color: #d8d9cf;
    padding: 14px;
    height: calc(100vh - 320px);
    min-height: 360px;
    overflow: auto;
  }
  .logs pre {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  /* Blinking block cursor — the live-terminal tell. */
  .caret {
    display: inline-block;
    width: 0.6em;
    height: 1.05em;
    margin-left: 2px;
    background: #d8d9cf;
    vertical-align: text-bottom;
    animation: lcd-blink 1.05s steps(1) infinite;
  }
  .err {
    padding: 12px 14px;
    background: var(--bg-card);
    color: var(--ink);
    border-top: 2px solid var(--ink);
    font-family: var(--font-mono);
    font-size: 13px;
  }
</style>
