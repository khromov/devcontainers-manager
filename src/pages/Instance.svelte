<script lang="ts">
  import '@fontsource-variable/doto';
  import '@fontsource-variable/jetbrains-mono';
  import InstanceView from '../components/InstanceView.svelte';

  let { id }: { id: string } = $props();
</script>

<InstanceView {id} mochi:hydrate />
