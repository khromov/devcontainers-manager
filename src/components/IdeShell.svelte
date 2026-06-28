<script lang="ts">
  import { ideUrl, type Instance } from '../types.ts';
  import { House } from '@lucide/svelte';

  let { activeId, running }: { activeId: string; running: Instance[] } = $props();

  // Default to the requested instance when it's running, else the first running
  // one (e.g. arriving for an instance that has since stopped). Props are fixed
  // for the page's lifetime, so reading their initial value is intentional.
  // svelte-ignore state_referenced_locally
  const initial = running.some((i) => i.id === activeId) ? activeId : (running[0]?.id ?? '');
  let active = $state(initial);
</script>

<div class="shell">
  <header class="bar">
    <a class="home" href="/" title="All instances" aria-label="All instances"><House size={18} /></a>
    {#if running.length > 0}
      <nav class="tabs">
        {#each running as inst (inst.id)}
          <button
            type="button"
            class="tab"
            class:active={inst.id === active}
            onclick={() => (active = inst.id)}
            title={inst.name}
          >
            {inst.name}
          </button>
        {/each}
      </nav>
    {/if}
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
  .tabs {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    min-width: 0;
  }
  .tab {
    appearance: none;
    background: transparent;
    border: 0;
    border-right: 1px solid var(--rule-soft);
    padding: 0 16px;
    max-width: 220px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    color: var(--ink-soft);
    font-family: var(--font-mono);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .tab:hover {
    color: var(--ink);
  }
  .tab.active {
    background: var(--ink);
    color: var(--bg);
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
