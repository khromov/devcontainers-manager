<script lang="ts">
  import '@fontsource-variable/fraunces';
  import '@fontsource-variable/public-sans';
  import '@fontsource-variable/jetbrains-mono';
  import type { Instance } from '../types.ts';
  import InstanceView from '../components/InstanceView.svelte';

  let { instance }: { instance: Instance } = $props();
</script>

<InstanceView {instance} mochi:hydrate />
