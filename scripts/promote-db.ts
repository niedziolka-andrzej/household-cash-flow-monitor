#!/usr/bin/env bun
/**
 * `bun run db:promote` — seeds an installed release build's database with the data you
 * typed into the dev app. Run it once, after installing the release; every later release
 * reuses the same file, because the database lives in the per-channel user-data directory
 * (`<appData>/<identifier>/<channel>/`), not inside the app bundle.
 *
 * Why this isn't `copy the file`: WAL mode (see db/database.ts) means the `.sqlite` file
 * can be nearly empty while the rows live in `-wal`. Copying just the `.sqlite` loses
 * everything; copying a `-wal` next to a *different* database silently grafts its pages
 * onto that file — SQLite never checks that a WAL belongs to the database beside it, so
 * `integrity_check` still says "ok" while rows end up re-parented onto unrelated ids.
 * So we always move a single consistent snapshot produced by `VACUUM INTO`, and remove
 * the target's stale `-wal`/`-shm` rather than leaving them to be replayed.
 *
 * Usage:
 *   bun run db:promote                       # dev -> stable
 *   bun run db:promote -- --dry-run          # snapshot + verify, then discard; nothing replaced
 *   bun run db:promote -- --from=dev --to=canary
 */
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import config from "../electrobun.config";
import { LATEST_SCHEMA_VERSION } from "../src/bun/db/migrate";

const DB_FILENAME = "cash-flow-monitor.sqlite";
/** Files SQLite keeps beside the database in WAL mode. Both must go when we replace it. */
const SIDECARS = ["-wal", "-shm"] as const;

/** Mirrors electrobun's own `Utils.paths.userData` root, so we resolve the same directory
 * the app does without booting the framework. */
export function appDataDir(): string {
	const home = homedir();
	switch (process.platform) {
		case "win32":
			return process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
		case "darwin":
			return join(home, "Library", "Application Support");
		default:
			return process.env.XDG_DATA_HOME ?? join(home, ".local", "share");
	}
}

export function channelDbPath(channel: string): string {
	return join(appDataDir(), config.app.identifier, channel, DB_FILENAME);
}

export type DbFacts = {
	version: number;
	counts: Record<string, number>;
	totalRows: number;
	integrity: string;
	fkViolations: number;
};

/** Opens read-write on purpose: a database left with an unclean `-wal` needs recovery on
 * first open, and a readonly connection cannot perform it. Recovery doesn't change logical
 * content, so this is still non-destructive. */
export function inspect(path: string): DbFacts {
	const db = new Database(path);
	try {
		const tables = db
			.query<{ name: string }, []>(
				`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
			)
			.all();
		const counts: Record<string, number> = {};
		for (const { name } of tables) {
			counts[name] = db.query<{ c: number }, []>(`SELECT COUNT(*) AS c FROM "${name}"`).get()!.c;
		}
		return {
			version: db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version,
			counts,
			totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
			integrity: db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").all().map((r) => r.integrity_check).join(", "),
			// integrity_check is structural only — it passes on a database whose foreign keys
			// dangle, which is exactly what a botched transfer produces. Check both.
			fkViolations: db.query("PRAGMA foreign_key_check").all().length,
		};
	} finally {
		db.close();
	}
}

/** Detects "the app is still running". A plain write lock is useless here: WAL mode lets a
 * writer in alongside the app's reader. `locking_mode = EXCLUSIVE` is the real test — it
 * demands sole ownership of the database and its `-shm`, so it fails while the app holds
 * either. The write itself is a no-op (user_version set to the value it already has). */
export function assertNotInUse(path: string, label: string): void {
	if (!existsSync(path)) return;
	let db: Database;
	try {
		db = new Database(path);
	} catch (error) {
		throw new Error(`Could not open the ${label} database (${path}): ${(error as Error).message}`);
	}
	try {
		db.exec("PRAGMA locking_mode = EXCLUSIVE;");
		const { user_version } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
		db.exec(`PRAGMA user_version = ${user_version};`);
	} catch (error) {
		throw new Error(
			`The ${label} app looks like it is still running — could not take an exclusive lock on ${path}.\n` +
				`Quit it and run this again. (SQLite said: ${(error as Error).message})`,
		);
	} finally {
		db.close();
	}
}

/** `VACUUM INTO` folds the WAL in and writes one self-contained file. It is read-only with
 * respect to the source, so the dev app may stay open while this runs. */
export function snapshot(source: string, dest: string): void {
	if (existsSync(dest)) rmSync(dest);
	const db = new Database(source);
	try {
		db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
	} finally {
		db.close();
	}
}

export type PromoteResult = {
	source: DbFacts;
	result: DbFacts;
	backupPath: string | null;
	dryRun: boolean;
};

export function promote(opts: {
	sourceDb: string;
	targetDb: string;
	stamp: string;
	dryRun?: boolean;
	log?: (message: string) => void;
}): PromoteResult {
	const { sourceDb, targetDb, stamp } = opts;
	const dryRun = opts.dryRun ?? false;
	const log = opts.log ?? (() => {});

	if (!existsSync(sourceDb)) {
		throw new Error(`No source database at ${sourceDb}. Run the dev app and enter some data first.`);
	}
	if (sourceDb === targetDb) {
		throw new Error("Source and target are the same database — nothing to do.");
	}

	// Guard the destructive side before touching anything.
	assertNotInUse(targetDb, "target");

	const source = inspect(sourceDb);
	if (source.version > LATEST_SCHEMA_VERSION) {
		throw new Error(
			`Source database is at schema version ${source.version} but this checkout only knows ${LATEST_SCHEMA_VERSION}.\n` +
				`Rebuild and reinstall the release from the current commit before transferring.`,
		);
	}
	if (source.fkViolations > 0) {
		throw new Error(`Source database has ${source.fkViolations} foreign-key violations — refusing to copy it.`);
	}
	log(`source  ${sourceDb}`);
	log(`        schema v${source.version}, ${source.totalRows} rows`);
	if (source.version < LATEST_SCHEMA_VERSION) {
		log(`        (older than v${LATEST_SCHEMA_VERSION}; the app will migrate it forward on first launch)`);
	}

	mkdirSync(join(targetDb, ".."), { recursive: true });

	// Snapshot the target's current contents to a timestamped backup before replacing it —
	// as a VACUUM'd single file, so the backup has no sidecars to lose either. A dry run
	// skips this: it must leave nothing behind.
	let backupPath: string | null = null;
	if (existsSync(targetDb)) {
		const existing = inspect(targetDb);
		log(`target  ${targetDb}`);
		log(`        schema v${existing.version}, ${existing.totalRows} rows (will be replaced)`);
		if (!dryRun) {
			backupPath = `${targetDb}.backup-${stamp}`;
			snapshot(targetDb, backupPath);
			log(`backup  ${backupPath}`);
		}
	} else {
		log(`target  ${targetDb} (does not exist yet)`);
	}

	// Build the replacement beside the target first, verify it, and only then swap. A failed
	// snapshot therefore never leaves the target half-written.
	const incoming = `${targetDb}.incoming`;
	snapshot(sourceDb, incoming);
	const result = inspect(incoming);
	if (result.integrity !== "ok" || result.fkViolations > 0) {
		rmSync(incoming);
		throw new Error(
			`Snapshot failed verification (integrity: ${result.integrity}, fk violations: ${result.fkViolations}) — target left untouched.`,
		);
	}
	if (result.totalRows !== source.totalRows) {
		rmSync(incoming);
		throw new Error(`Snapshot has ${result.totalRows} rows but source has ${source.totalRows} — target left untouched.`);
	}

	if (dryRun) {
		rmSync(incoming);
		for (const s of SIDECARS) rmSync(incoming + s, { force: true });
		log(`\nDry run: verified a snapshot of ${result.totalRows} rows, then discarded it. Target not modified.`);
		return { source, result, backupPath, dryRun };
	}

	for (const suffix of ["", ...SIDECARS]) {
		rmSync(targetDb + suffix, { force: true });
	}
	renameSync(incoming, targetDb);

	log(`\nDone. ${result.totalRows} rows now at ${targetDb} (${statSync(targetDb).size} bytes, no -wal/-shm).`);
	for (const [name, count] of Object.entries(result.counts)) {
		if (count > 0) log(`  ${name}: ${count}`);
	}
	return { source, result, backupPath, dryRun };
}

/** `--from=x` style flags; `--` separated args from `bun run` land here verbatim. */
function flag(args: string[], name: string, fallback: string): string {
	const hit = args.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const from = flag(args, "from", "dev");
	const to = flag(args, "to", "stable");
	const dryRun = args.includes("--dry-run");

	// Not Date.now()-sensitive logic, just a unique-per-run backup suffix.
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

	console.log(`Promoting ${from} -> ${to}${dryRun ? " (dry run)" : ""}\n`);
	try {
		promote({
			sourceDb: channelDbPath(from),
			targetDb: channelDbPath(to),
			stamp,
			dryRun,
			log: (m) => console.log(m),
		});
	} catch (error) {
		console.error(`\n${(error as Error).message}`);
		process.exit(1);
	}
}
