<script lang="ts">
  import { ideUrl, type Instance } from '../types.ts';

  let { id }: { id: string } = $props();

  let instance = $state<Instance | null>(null);
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

  const statusBadge = 'font-mono text-[11px] px-2 py-[3px] rounded-full';
  const statusColor: Record<Instance['status'], string> = {
    creating: 'bg-amber-100 text-amber-600',
    running: 'bg-green-100 text-green-700',
    stopped: 'bg-rule text-ink-soft',
    error: 'bg-red-100 text-red-600',
  };

  // Stream the boot/build log over SSE.
  $effect(() => {
    const source = new EventSource(`/api/instances/${id}/logs`);
    source.onmessage = (event) => {
      try {
        logs += JSON.parse(event.data) as string;
      } catch {
        logs += event.data;
      }
    };
    return () => source.close();
  });

  // Track this instance's status from the live instance-list stream.
  $effect(() => {
    const source = new EventSource('/api/instances/stream');
    source.onmessage = (event) => {
      try {
        const found = (JSON.parse(event.data) as Instance[]).find((i) => i.id === id);
        if (found) instance = found;
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => source.close();
  });

  const url = $derived(instance ? ideUrl(instance) : '#');
</script>

<header class="flex items-center gap-[18px] px-6 py-4 border-b border-rule">
  <a class="text-ink-soft no-underline text-sm hover:text-green-700" href="/">← All instances</a>
  <div class="flex items-center gap-2.5 flex-1">
    <span class="font-serif font-semibold text-lg">{instance?.name ?? 'Instance'}</span>
    {#if instance}
      <span class="{statusBadge} {statusColor[instance.status]}">{statusLabel[instance.status]}</span>
    {:else}
      <span class="skel w-16 h-[18px] rounded-full"></span>
    {/if}
  </div>
  {#if instance?.status === 'running'}
    <a
      class="text-[13px] text-green-700 no-underline border border-green-200 px-3 py-[7px] rounded-lg"
      href={url}
      target="_blank"
      rel="noopener">Open in new tab ↗</a
    >
  {/if}
</header>

<main class="max-w-[1200px] mx-auto px-6 pt-5 pb-10">
  <div class="grid grid-cols-[max-content_1fr] gap-x-3.5 gap-y-1.5 items-center mb-[18px]">
    <span class="font-serif text-[11px] tracking-[0.14em] uppercase text-ink-faint">Source</span>
    {#if instance}<code class="font-mono text-[13px] text-ink-soft">{instance.source_path}</code>{:else}<span class="skel h-[0.95em] w-[min(420px,60vw)] rounded"></span>{/if}
    <span class="font-serif text-[11px] tracking-[0.14em] uppercase text-ink-faint">Port</span>
    {#if instance}<code class="font-mono text-[13px] text-ink-soft">localhost:{instance.host_port}</code>{:else}<span class="skel h-[0.95em] w-[120px] rounded"></span>{/if}
  </div>

  <div class="border border-rule rounded-xl overflow-hidden">
    <div class="px-3.5 py-2.5 bg-bg-card border-b border-rule font-mono text-xs text-ink-soft">Boot log</div>
    <div
      class="bg-[#1e1c19] text-[#e7e0d4] p-3.5 h-[calc(100vh-320px)] min-h-[360px] overflow-auto"
      {@attach autoscroll}
    >
      <pre class="m-0 font-mono text-[12.5px] leading-[1.5] whitespace-pre-wrap break-words">{logs || 'Waiting for output…'}</pre>
    </div>
    {#if instance?.status === 'error' && instance.error}
      <div class="px-3.5 py-3 bg-red-100 text-red-600 text-[13px]">{instance.error}</div>
    {/if}
  </div>
</main>
