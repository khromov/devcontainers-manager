<script lang="ts">
  import '@fontsource-variable/doto';
  import '@fontsource-variable/jetbrains-mono';
  import IdeShell from '../components/IdeShell.svelte';
  import type { Instance } from '../types.ts';

  let { activeId, running }: { activeId: string; running: Instance[] } = $props();
</script>

<IdeShell {activeId} {running} mochi:hydrate />
