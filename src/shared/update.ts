/**
 * The auto-updater's state, owned by the bun process and mirrored into the webview.
 *
 * The consent prompt deliberately lives in Vue rather than a native dialog: Electrobun's
 * Windows menu/dialog layer hands labels to the ANSI Win32 entry points, which mangles
 * Polish diacritics (`ź` arrives as `Ĺş`). Rendering it in the webview also keeps the
 * prompt consistent with the rest of the UI and lets it use vue-i18n.
 */
export type UpdatePhase =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "applying"
	| "upToDate"
	| "error";

export type UpdateState = {
	phase: UpdatePhase;
	/**
	 * True when the user asked for this check from the UI. The startup check leaves it
	 * false, which is what tells the webview to stay silent about "nothing to install"
	 * and about network failures — nobody wants a dialog on every launch saying so.
	 */
	userInitiated: boolean;
	/** The offered version on "available", the running version on "upToDate". */
	version?: string;
	/** Progress text while "downloading", the failure reason on "error". */
	detail?: string;
};

export const IDLE_UPDATE_STATE: UpdateState = {
	phase: "idle",
	userInitiated: false,
};
