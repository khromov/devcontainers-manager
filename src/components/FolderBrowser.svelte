<script lang="ts">
  import type { BrowseResult, FolderHistoryEntry } from '../types.ts';

  let { onpick, onclose }: { onpick: (path: string) => void; onclose: () => void } = $props();

  let result = $state<BrowseResult | null>(null);
  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let query = $state('');
  let history = $state<FolderHistoryEntry[]>([]);
  let showAll = $state(false);

  const filtered = $derived(
    result
      ? result.entries.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
      : [],
  );

  const shownHistory = $derived(showAll ? history : history.slice(0, 5));

  // Shared Tailwind fragments for the repeated navigable rows and the CTA.
  const navItem =
    'flex flex-1 items-center gap-2.5 px-2.5 py-[9px] text-left rounded-lg text-ink hover:bg-green-100';
  const primary =
    'font-semibold text-sm px-4 py-[9px] rounded-[10px] border border-green-700 bg-green-700 text-white whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';

  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const data = (await res.json()) as { history?: FolderHistoryEntry[] };
      history = data.history ?? [];
    } catch {
      /* history is a convenience; ignore failures */
    }
  }

  async function removeHistory(path: string) {
    const prev = history;
    history = history.filter((h) => h.source_path !== path);
    try {
      await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: path }),
      });
    } catch {
      history = prev; // restore on failure
    }
  }

  async function load(path: string | null = null) {
    loading = true;
    errorMsg = null;
    query = '';
    try {
      const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
      const res = await fetch(url);
      const data = (await res.json()) as BrowseResult & { error?: { message: string } };
      if (!res.ok) throw new Error(data.error?.message ?? 'Could not list folder');
      result = data;
    } catch (err) {
      errorMsg = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
    loadHistory();
  });
</script>

<div
  class="fixed inset-0 bg-[rgba(42,40,37,0.4)] grid place-items-center p-6 z-50"
  role="button"
  tabindex="0"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
>
  <div
    class="w-[min(620px,100%)] max-h-[80vh] flex flex-col bg-bg-card border border-rule rounded-[14px] overflow-hidden shadow-[0_40px_80px_-30px_rgba(42,40,37,0.5)]"
    role="dialog"
    aria-modal="true"
    aria-label="Pick a project folder"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
  >
    <div class="flex items-center justify-between px-[18px] py-4 border-b border-rule">
      <h2 class="m-0 font-serif text-lg">Pick a project folder</h2>
      <button class="text-[15px] text-ink-soft" onclick={onclose} aria-label="Close">✕</button>
    </div>

    <div class="px-[18px] py-2.5 border-b border-rule overflow-auto">
      <code class="font-mono text-xs text-ink-soft whitespace-nowrap">{result?.path ?? '…'}</code>
    </div>

    {#if history.length > 0}
      <div class="p-2 border-b border-rule flex-shrink-0 max-h-[40vh] overflow-auto">
        <div class="text-[11px] uppercase tracking-[0.06em] text-ink-faint px-2.5 pt-0.5 pb-1.5">Recent</div>
        {#each shownHistory as entry (entry.source_path)}
          <div class="group relative flex items-center">
            <button class="flex flex-1 items-center gap-2.5 min-w-0 px-2.5 py-2 text-left rounded-lg text-ink hover:bg-green-100" onclick={() => onpick(entry.source_path)}>
              <span class="text-sm">🗂️</span>
              <span class="flex flex-col min-w-0">
                <span class="truncate">{entry.name}</span>
                <span class="font-mono text-[11px] text-ink-faint truncate">{entry.source_path}</span>
              </span>
            </button>
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 bg-bg-card text-ink-soft text-xs leading-none px-[7px] py-[5px] rounded-md opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-green-100"
              aria-label="Remove {entry.name} from history"
              title="Remove from history"
              onclick={(e) => {
                e.stopPropagation();
                removeHistory(entry.source_path);
              }}
            >
              ✕
            </button>
          </div>
        {/each}
        {#if history.length > 5}
          <button class="mx-1.5 mt-1 mb-0.5 px-1.5 py-1 text-xs text-green-700 hover:underline" onclick={() => (showAll = !showAll)}>
            {showAll ? 'Show fewer' : `Show all (${history.length})`}
          </button>
        {/if}
      </div>
    {/if}

    <div class="px-[18px] py-2.5 border-b border-rule">
      <input
        class="w-full font-sans text-[13px] px-3 py-2 rounded-lg border border-rule bg-white text-ink focus:outline-none focus:border-green-600"
        type="text"
        placeholder="Filter folders…"
        bind:value={query}
        spellcheck="false"
        autocomplete="off"
      />
    </div>

    <div class="flex-1 overflow-auto p-2">
      {#if loading}
        <div class="p-[18px] text-ink-faint text-center">Loading…</div>
      {:else if errorMsg}
        <div class="p-[18px] text-red-600 text-center">{errorMsg}</div>
      {:else if result}
        {#if result.parent && !query}
          <button class={navItem} onclick={() => load(result?.parent ?? null)}>
            <span class="text-sm">↑</span> ..
          </button>
        {/if}
        {#if filtered.length === 0}
          <div class="p-[18px] text-ink-faint text-center">{query ? 'No folders match.' : 'No subfolders here.'}</div>
        {/if}
        {#each filtered as entry (entry.path)}
          <div class="flex items-center gap-1.5">
            <button class={navItem} onclick={() => load(entry.path)}>
              <span class="text-sm">📁</span>
              <span class="truncate">{entry.name}</span>
              {#if entry.hasDevcontainer}<span class="font-mono text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">devcontainer</span>{/if}
            </button>
            <button class="text-xs px-2.5 py-1.5 rounded-[7px] border border-rule bg-white text-green-700 hover:border-green-700" onclick={() => onpick(entry.path)}>Select</button>
          </div>
        {/each}
      {/if}
    </div>

    {#if result && !result.hasDevcontainer}
      <div class="px-[18px] py-2.5 bg-amber-100 text-amber-600 text-[12.5px] border-t border-rule">
        ⚠ No <code class="font-mono text-[0.9em] bg-[rgba(154,106,30,0.12)] px-[5px] py-px rounded">devcontainer.json</code> in this folder — a default image will be used if you select it.
      </div>
    {/if}

    <div class="flex items-center justify-between gap-3 px-[18px] py-3.5 border-t border-rule">
      <span class="text-xs text-ink-faint">Browse to a folder, then select this folder or any subfolder.</span>
      <button class={primary} disabled={!result} onclick={() => result && onpick(result.path)}>
        Select this folder
      </button>
    </div>
  </div>
</div>
