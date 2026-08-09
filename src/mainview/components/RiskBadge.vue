<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
	<span
		class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
		:title="label"
	>
		⚠ {{ label }}
	</span>
</template>
