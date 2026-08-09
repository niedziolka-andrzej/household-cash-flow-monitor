import Electrobun, { Electroview } from "electrobun/view";
import type { DomainErrorParams, ErrorCode } from "../../shared/errors";
import type { CashflowRPC } from "../../shared/rpc";
import type { UpdateState } from "../../shared/update";

/**
 * Normalized error surfaced to the store/UI. The bun-side handlers (src/bun/rpc/handlers.ts)
 * encode a DomainError as `Error(JSON.stringify({code, params}))` before throwing, because
 * only `.message` is guaranteed to survive the RPC bridge. `toRpcError` reverses that, falling
 * back to `"unknown"` for anything that doesn't parse as our own payload shape (a programming
 * error, a timeout, ...).
 */
export class RpcError extends Error {
	readonly code: ErrorCode | "unknown";
	readonly params?: DomainErrorParams;

	constructor(code: ErrorCode | "unknown", params?: DomainErrorParams) {
		super(code);
		this.name = "RpcError";
		this.code = code;
		this.params = params;
	}
}

function toRpcError(error: unknown): RpcError {
	if (error instanceof Error) {
		try {
			const parsed = JSON.parse(error.message);
			if (parsed && typeof parsed.code === "string") {
				return new RpcError(parsed.code as ErrorCode, parsed.params);
			}
		} catch {
			// Not our structured payload (e.g. a timeout or transport error) — fall through.
		}
	}
	return new RpcError("unknown");
}

/**
 * Set by the update store at import time. Indirection rather than importing the store here
 * on purpose: the store needs `sendMessage` from this module, and a direct import both ways
 * would make the pair depend on module evaluation order.
 */
let updateStateListener: ((state: UpdateState) => void) | null = null;

export function onUpdateState(listener: (state: UpdateState) => void): void {
	updateStateListener = listener;
}

const rpc = Electroview.defineRPC<CashflowRPC>({
	maxRequestTime: 5000,
	handlers: {
		requests: {},
		messages: {
			updateStateChanged: (state) => updateStateListener?.(state),
		},
	},
});

export const electrobun = new Electrobun.Electroview({ rpc });

type Requests = CashflowRPC["bun"]["requests"];
type Messages = CashflowRPC["bun"]["messages"];

/**
 * Fire-and-forget counterpart to `call`, for work that outlives `maxRequestTime` — the
 * updater's download runs for minutes, so it reports back through messages instead.
 */
export function sendMessage<K extends keyof Messages>(name: K, payload: Messages[K]): void {
	const send = electrobun.rpc!.send as unknown as {
		[Key in K]: (p: Messages[K]) => void;
	};
	send[name](payload);
}

/** Typed call wrapper over the raw RPC bridge — same request names, errors normalized to RpcError. */
export async function call<K extends keyof Requests>(
	name: K,
	params: Requests[K]["params"],
): Promise<Requests[K]["response"]> {
	try {
		const request = electrobun.rpc!.request as unknown as {
			[Key in K]: (p: Requests[K]["params"]) => Promise<Requests[K]["response"]>;
		};
		return await request[name](params);
	} catch (error) {
		throw toRpcError(error);
	}
}
