<script lang="ts">
  import '@fontsource-variable/doto';
  import '@fontsource-variable/jetbrains-mono';
  import type { Preflight } from '../types.ts';
  import DashboardApp from '../components/DashboardApp.svelte';

  let { preflight }: { preflight: Preflight } = $props();
</script>

<DashboardApp {preflight} mochi:hydrate />
