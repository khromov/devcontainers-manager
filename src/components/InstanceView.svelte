<script lang="ts">
  import { ideUrl, type Instance } from '../types.ts';

  let { instance: initial }: { instance: Instance } = $props();

  // svelte-ignore state_referenced_locally
  let instance = $state<Instance>(initial);
  let logs = $state('');
  let logBox = $state<HTMLDivElement | null>(null);

  const statusLabel: Record<Instance['status'], string> = {
    creating: 'Booting…',
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error',
  };

  async function refresh() {
    try {
      const res = await fetch('/api/instances/');
      if (!res.ok) return;
      const data = (await res.json()) as { instances: Instance[] };
      const found = data.instances.find((i) => i.id === instance.id);
      if (found) instance = found;
    } catch {
      /* retry next tick */
    }
  }

  // Stream the boot/build log over SSE.
  $effect(() => {
    const source = new EventSource(`/api/instances/${instance.id}/logs/`);
    source.onmessage = (event) => {
      try {
        logs += JSON.parse(event.data) as string;
      } catch {
        logs += event.data;
      }
      if (logBox) logBox.scrollTop = logBox.scrollHeight;
    };
    return () => source.close();
  });

  // Poll status so the iframe appears once the container is running.
  $effect(() => {
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  });

  const url = $derived(ideUrl(instance));
</script>

<header class="topbar">
  <a class="back" href="/">← All instances</a>
  <div class="title">
    <span class="name">{instance.name}</span>
    <span class="status {instance.status}">{statusLabel[instance.status]}</span>
  </div>
  {#if instance.status === 'running'}
    <a class="open" href={url} target="_blank" rel="noopener">Open in new tab ↗</a>
  {/if}
</header>

<main class="stage">
  <div class="meta">
    <span class="k">Source</span><code>{instance.source_path}</code>
    <span class="k">Port</span><code>localhost:{instance.host_port}</code>
  </div>

  {#if instance.status === 'running'}
    <div class="ide">
      <iframe src={url} title="code-server"></iframe>
    </div>
  {:else}
    <div class="logwrap">
      <div class="logbar">Boot log</div>
      <div class="logs" bind:this={logBox}><pre>{logs || 'Waiting for output…'}</pre></div>
      {#if instance.status === 'error' && instance.error}
        <div class="err">{instance.error}</div>
      {/if}
    </div>
  {/if}
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
    color: var(--ink-soft);
    text-decoration: none;
    font-size: 14px;
  }
  .back:hover {
    color: var(--green-700);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }
  .name {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 18px;
  }
  .status {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .status.running {
    background: var(--green-100);
    color: var(--green-700);
  }
  .status.stopped {
    background: var(--rule);
    color: var(--ink-soft);
  }
  .status.creating {
    background: var(--amber-100);
    color: var(--amber-600);
  }
  .status.error {
    background: var(--red-100);
    color: var(--red-600);
  }
  .open {
    font-size: 13px;
    color: var(--green-700);
    text-decoration: none;
    border: 1px solid var(--green-200);
    padding: 7px 12px;
    border-radius: 8px;
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
    font-family: var(--font-serif);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .meta code {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--ink-soft);
  }
  .ide {
    border: 1px solid var(--rule);
    border-radius: 12px;
    overflow: hidden;
    background: #1e1e1e;
    height: calc(100vh - 220px);
    min-height: 480px;
  }
  .ide iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .logwrap {
    border: 1px solid var(--rule);
    border-radius: 12px;
    overflow: hidden;
  }
  .logbar {
    padding: 10px 14px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--rule);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-soft);
  }
  .logs {
    background: #1e1c19;
    color: #e7e0d4;
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
  .err {
    padding: 12px 14px;
    background: var(--red-100);
    color: var(--red-600);
    font-size: 13px;
  }
</style>
