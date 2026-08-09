/// <reference types="vite/client" />

declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent<object, object, unknown>;
	export default component;
}

/** Bun's `with { type: "text" }` import attribute (src/bun/db/migrate.ts). */
declare module "*.sql" {
	const content: string;
	export default content;
}

/** electrobun/bun re-exports a WebGPU helper that imports `three` without shipping
 * types for it; we don't use that part of the API, this just silences the noise. */
declare module "three";
