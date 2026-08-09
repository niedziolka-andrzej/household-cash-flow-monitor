import { ref } from "vue";

export type PlanTab = "assumptions" | "monthly";

export type Route = { view: "plan-list" } | { view: "plan"; planId: number; tab: PlanTab };

/** No vue-router: three screens, no URL bar in a webview to deep-link to anyway. */
export const route = ref<Route>({ view: "plan-list" });

export function goToPlanList(): void {
	route.value = { view: "plan-list" };
}

export function goToPlan(planId: number, tab: PlanTab = "monthly"): void {
	route.value = { view: "plan", planId, tab };
}

export function setTab(tab: PlanTab): void {
	if (route.value.view === "plan") {
		route.value = { ...route.value, tab };
	}
}
