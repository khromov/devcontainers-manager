<script lang="ts">
  import '@fontsource-variable/fraunces';
  import '@fontsource-variable/public-sans';
  import '@fontsource-variable/jetbrains-mono';
  import type { Instance, Preflight } from '../types.ts';
  import DashboardApp from '../components/DashboardApp.svelte';

  let { instances, preflight }: { instances: Instance[]; preflight: Preflight } = $props();
</script>

<DashboardApp {instances} {preflight} mochi:hydrate />
