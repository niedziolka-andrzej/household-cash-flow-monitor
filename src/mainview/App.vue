<script setup lang="ts">
import { computed, onMounted } from "vue";
import { call } from "./rpc/client";
import { route } from "./store/navigation";
import PlanListView from "./views/PlanListView.vue";
import PlanView from "./views/PlanView.vue";

const isPlanView = computed(() => route.value.view === "plan");

// Only the webview can see which display it ended up on; tell the main process so the
// window can be sized to the available space instead of rendering a viewport that doesn't
// match the visible client area. Best-effort — a failure here is purely cosmetic.
onMounted(() => {
	call("fitWindowToScreen", { availWidth: screen.availWidth, availHeight: screen.availHeight }).catch(() => {});
});
</script>

<template>
	<div class="min-h-screen bg-canvas text-ink">
		<PlanView v-if="isPlanView" />
		<PlanListView v-else />
	</div>
</template>
