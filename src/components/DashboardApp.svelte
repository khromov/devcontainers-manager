<script lang="ts">
  import { ideUrl, type Instance, type Preflight } from '../types.ts';
  import FolderBrowser from './FolderBrowser.svelte';

  let { preflight }: { preflight: Preflight } = $props();

  let instances = $state<Instance[]>([]);
  let loaded = $state(false);
  let browserOpen = $state(false);
  let creating = $state(false);
  let actionError = $state<string | null>(null);

  // svelte-ignore state_referenced_locally
  const ready = preflight.docker && preflight.cli;

  // Live instance list over SSE — the first message carries current state,
  // and the server pushes again on every change (boot progress, start/stop/delete).
  $effect(() => {
    const source = new EventSource('/api/instances/stream');
    source.onmessage = (event) => {
      try {
        instances = JSON.parse(event.data) as Instance[];
        loaded = true;
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => source.close();
  });

  async function createFrom(sourcePath: string) {
    browserOpen = false;
    creating = true;
    actionError = null;
    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath }),
      });
      const data = (await res.json()) as { instance?: Instance; error?: { message: string } };
      if (!res.ok || !data.instance) throw new Error(data.error?.message ?? 'Failed to create instance');
      // The SSE stream delivers the new instance; no manual insert needed.
    } catch (err) {
      actionError = (err as Error).message;
    } finally {
      creating = false;
    }
  }

  async function act(id: string, action: 'start' | 'stop' | 'delete') {
    actionError = null;
    if (action === 'delete' && !confirm('Delete this instance and its copied files?')) return;
    try {
      const res = await fetch(`/api/instances/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
        throw new Error(data?.error?.message ?? `Failed to ${action}`);
      }
      // The SSE stream reflects the resulting state.
    } catch (err) {
      actionError = (err as Error).message;
    }
  }

  async function deleteAll() {
    actionError = null;
    if (!confirm(`Delete all ${instances.length} instances and their copied files?`)) return;
    try {
      const res = await fetch('/api/instances/delete-all', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
        throw new Error(data?.error?.message ?? 'Failed to delete all');
      }
      // The SSE stream reflects the resulting empty state.
    } catch (err) {
      actionError = (err as Error).message;
    }
  }

  const statusLabel: Record<Instance['status'], string> = {
    creating: 'Booting…',
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error',
  };

  // Tailwind class fragments kept as constants so the markup stays readable.
  const statusBadge = 'font-mono text-[11px] px-2 py-[3px] rounded-full whitespace-nowrap';
  const statusColor: Record<Instance['status'], string> = {
    creating: 'bg-amber-100 text-amber-600',
    running: 'bg-green-100 text-green-700',
    stopped: 'bg-rule text-ink-soft',
    error: 'bg-red-100 text-red-600',
  };

  const btnBase = 'text-[13px] px-3 py-[7px] rounded-lg border cursor-pointer no-underline';
  const btn = `${btnBase} bg-white text-ink border-rule hover:border-ink-faint`;
  const btnOpen = `${btnBase} bg-green-700 text-white border-green-700`;
  const btnGhost = `${btnBase} bg-transparent text-ink border-rule hover:border-ink-faint`;
  const btnDanger = `${btnBase} bg-white text-red-600 border-rule hover:border-red-600`;
  const primary =
    'font-semibold text-sm px-4 py-[9px] rounded-[10px] border border-green-700 bg-green-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
</script>

<header class="flex items-center justify-between px-7 py-5 border-b border-rule">
  <div class="inline-flex items-center gap-2.5 font-serif font-semibold text-xl">
    <span>📦</span><span>Devcontainers Manager</span>
  </div>
  <div class="inline-flex items-center gap-3.5">
    <span
      class="inline-flex items-center font-mono text-xs px-[11px] py-[5px] rounded-full cursor-default whitespace-nowrap {preflight.claudeAuth
        ? 'bg-green-100 text-green-700'
        : 'bg-amber-100 text-amber-600'}"
      title={preflight.claudeAuth
        ? 'Your Claude Code credentials will be copied into each new instance.'
        : 'No Claude Code credentials found on this computer — new instances will not have Claude auth. Run `claude` and sign in.'}
    >
      {preflight.claudeAuth ? '✓ Claude credentials' : '⚠ No Claude credentials'}
    </span>
    {#if instances.length > 0}
      <button class={btnDanger} onclick={deleteAll}>Delete all</button>
    {/if}
    <button class={primary} onclick={() => (browserOpen = true)} disabled={!ready || creating}>
      {creating ? 'Creating…' : '+ New instance'}
    </button>
  </div>
</header>

<main class="max-w-[1080px] mx-auto px-6 pt-7 pb-20">
  {#if !ready}
    <div class="rounded-[10px] px-4 py-3 mb-5 flex gap-2 flex-wrap bg-red-100 text-red-600">
      <strong>Setup needed.</strong>
      {#if !preflight.docker}<span>Docker daemon is not reachable.</span>{/if}
      {#if !preflight.cli}<span>The devcontainer CLI is not available.</span>{/if}
    </div>
  {/if}

  {#if actionError}
    <div class="rounded-[10px] px-4 py-3 mb-5 flex gap-2 flex-wrap bg-red-100 text-red-600">
      <strong>Error.</strong> <span>{actionError}</span>
    </div>
  {/if}

  {#if !loaded}
    <div class="text-center px-5 py-20"><p class="text-ink-soft m-0">Loading…</p></div>
  {:else if instances.length === 0}
    <div class="text-center px-5 py-20">
      <p class="font-serif text-2xl mt-0 mb-1.5">No instances yet</p>
      <p class="text-ink-soft mt-0 mb-[22px]">Pick a project folder to spin up an isolated devcontainer.</p>
      <button class={primary} onclick={() => (browserOpen = true)} disabled={!ready}>
        + New instance
      </button>
    </div>
  {:else}
    <ul class="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-[18px]">
      {#each instances as instance (instance.id)}
        <li
          class="bg-bg-card border border-rule rounded-[14px] px-[18px] pt-[18px] pb-4 shadow-[0_18px_36px_-28px_rgba(42,40,37,0.22)]"
        >
          <div class="flex items-center justify-between gap-2.5">
            <!-- Trusted: server-generated SVG from boring-avatars-vanilla, seeded by instance id (avatar.server.ts) -->
            <span class="inline-flex flex-none w-10 h-10 rounded-full overflow-hidden [&_svg]:block">{@html instance.avatar}</span>
            <div class="flex-1 min-w-0 font-semibold text-base truncate">{instance.name}</div>
            <span class="{statusBadge} {statusColor[instance.status]}">{statusLabel[instance.status]}</span>
          </div>
          <div class="mt-2.5 font-mono text-xs text-ink-soft truncate" title={instance.source_path}>{instance.source_path}</div>
          <div class="mt-1 font-mono text-xs text-ink-faint">localhost:{instance.host_port}</div>
          {#if instance.status === 'error' && instance.error}
            <div class="mt-2.5 text-xs text-red-600 bg-red-100 rounded-lg px-2.5 py-2 max-h-20 overflow-auto">{instance.error}</div>
          {/if}
          <div class="mt-4 flex flex-wrap gap-2">
            {#if instance.status === 'running'}
              <a class={btnOpen} href={ideUrl(instance)} target="_blank" rel="noopener">
                Open IDE
              </a>
              <button class={btn} onclick={() => act(instance.id, 'stop')}>Stop</button>
            {:else if instance.status === 'stopped'}
              <button class={btn} onclick={() => act(instance.id, 'start')}>Start</button>
            {:else if instance.status === 'creating'}
              <a class={btn} href={`/instances/${instance.id}`}>View logs</a>
            {/if}
            <a class={btnGhost} href={`/instances/${instance.id}`}>Details</a>
            <button class={btnDanger} onclick={() => act(instance.id, 'delete')}>Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>

{#if browserOpen}
  <FolderBrowser onpick={createFrom} onclose={() => (browserOpen = false)} />
{/if}
