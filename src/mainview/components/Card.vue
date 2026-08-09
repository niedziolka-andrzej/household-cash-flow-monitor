<script setup lang="ts">
defineProps<{
	title: string;
	/** Rendered as a pill next to the title, e.g. "5 pozycji". */
	badge?: string;
	subtitle?: string;
}>();
</script>

<template>
	<section class="rounded-card bg-surface p-6 shadow-card sm:px-7">
		<div class="mb-4 flex items-baseline justify-between gap-3">
			<div>
				<h2 class="font-display text-lg font-bold text-ink">{{ title }}</h2>
				<p v-if="subtitle" class="mt-0.5 text-xs text-ink-subtle">{{ subtitle }}</p>
			</div>
			<span
				v-if="badge"
				class="shrink-0 rounded-full bg-neutralSoft px-2.5 py-1 text-xs font-semibold text-ink-muted"
				>{{ badge }}</span
			>
		</div>
		<slot />
	</section>
</template>
