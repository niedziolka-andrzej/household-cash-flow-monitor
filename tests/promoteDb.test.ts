import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type AppDatabase, createDatabase } from "../src/bun/db/database";
import { createIncomeItem } from "../src/bun/db/repositories/itemsRepo";
import { createPlanCore } from "../src/bun/db/repositories/planRepo";
import { assertNotInUse, inspect, promote } from "../scripts/promote-db";
import { money } from "../src/shared/money";

let dir: string;

/**
 * Releases the OS file handle behind a Drizzle handle. `$client.close()` alone is not enough:
 * it maps to SQLite's *deferred* close, which keeps the file open until the last prepared
 * statement is finalized — and Drizzle caches its statements. Forcing a GC collects them so
 * the deferred close can complete. Only tooling and tests need this; the app holds its
 * database open for its whole lifetime.
 */
function closeDatabase(db: AppDatabase): void {
	db.$client.close();
	Bun.gc(true);
}

/**
 * Produces a database at `path` in the state the app actually leaves on disk: WAL mode with
 * the rows still sitting in `-wal`, and no live connection.
 *
 * Getting both at once takes a detour — closing the last connection checkpoints the WAL away
 * — so we write into a staging database and copy the `.sqlite` + `-wal` pair out *while the
 * handle is open*. Copying both files together is safe (there is no concurrent writer here)
 * and leaves exactly the un-checkpointed pair the running app has.
 */
function seedDatabase(path: string, planName: string, incomeCount: number): void {
	const staging = `${path}.staging`;
	const db = createDatabase(staging);
	const plan = createPlanCore(db, {
		name: planName,
		startMonth: "2026-01",
		endMonth: "2026-12",
		currency: "PLN",
		openingBalance: money(0, "PLN"),
	});
	for (let i = 0; i < incomeCount; i++) {
		createIncomeItem(db, plan.id, {
			name: `Income ${i}`,
			date: "2026-03-15",
			forecast: money(100_00 + i, "PLN"),
		});
	}
	copyFileSync(staging, path);
	copyFileSync(`${staging}-wal`, `${path}-wal`);
	closeDatabase(db);
	for (const suffix of ["", "-wal", "-shm"]) {
		rmSync(staging + suffix, { force: true });
	}
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "promote-db-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("promote", () => {
	test("moves every row into a target that has no WAL sidecars left", () => {
		const source = join(dir, "dev.sqlite");
		const target = join(dir, "stable.sqlite");
		seedDatabase(source, "Dev plan", 4);

		// Precondition: this is the case a naive file copy gets wrong — the data is in the WAL.
		expect(existsSync(`${source}-wal`)).toBe(true);
		expect(statSync(`${source}-wal`).size).toBeGreaterThan(statSync(source).size);

		const { result } = promote({ sourceDb: source, targetDb: target, stamp: "test" });

		expect(result.integrity).toBe("ok");
		expect(result.fkViolations).toBe(0);
		expect(result.counts.plans).toBe(1);
		expect(result.counts.income_items).toBe(4);
		expect(existsSync(`${target}-wal`)).toBe(false);
		expect(existsSync(`${target}-shm`)).toBe(false);
		expect(existsSync(`${target}.incoming`)).toBe(false);

		const db = new Database(target);
		expect(db.query<{ name: string }, []>("SELECT name FROM plans").get()!.name).toBe("Dev plan");
		db.close();
	});

	test("backs the target up before replacing it, and the backup is readable on its own", () => {
		const source = join(dir, "dev.sqlite");
		const target = join(dir, "stable.sqlite");
		seedDatabase(source, "Dev plan", 2);
		seedDatabase(target, "Existing prod plan", 7);

		const { backupPath } = promote({ sourceDb: source, targetDb: target, stamp: "stamp1" });

		expect(backupPath).toBe(`${target}.backup-stamp1`);
		const backup = inspect(backupPath!);
		expect(backup.counts.income_items).toBe(7);
		expect(backup.integrity).toBe("ok");
		expect(existsSync(`${backupPath}-wal`)).toBe(false);

		// And the target really is the dev data now, not a merge of the two.
		expect(inspect(target).counts.income_items).toBe(2);
		expect(inspect(target).counts.plans).toBe(1);
	});

	test("removes the target's stale -wal instead of letting it replay onto the new file", () => {
		const source = join(dir, "dev.sqlite");
		const target = join(dir, "stable.sqlite");
		seedDatabase(source, "Dev plan", 3);
		seedDatabase(target, "Prod plan", 9); // leaves target-wal on disk

		expect(existsSync(`${target}-wal`)).toBe(true);
		promote({ sourceDb: source, targetDb: target, stamp: "test" });

		// If the old -wal survived, reopening would splice 9 income rows back in.
		expect(inspect(target).counts.income_items).toBe(3);
	});

	test("dry run verifies a snapshot but leaves the target untouched", () => {
		const source = join(dir, "dev.sqlite");
		const target = join(dir, "stable.sqlite");
		seedDatabase(source, "Dev plan", 5);
		seedDatabase(target, "Prod plan", 1);

		const { result, backupPath } = promote({ sourceDb: source, targetDb: target, stamp: "test", dryRun: true });

		expect(result.counts.income_items).toBe(5); // the snapshot was built and checked
		expect(inspect(target).counts.income_items).toBe(1); // ...but not swapped in
		expect(existsSync(`${target}.incoming`)).toBe(false);
		expect(backupPath).toBeNull(); // a dry run leaves no backup file behind either
	});

	test("refuses a source from a newer schema than this checkout knows", () => {
		const source = join(dir, "dev.sqlite");
		const target = join(dir, "stable.sqlite");
		seedDatabase(source, "Future plan", 1);
		const db = new Database(source);
		db.exec("PRAGMA user_version = 99;");
		db.close();

		expect(() => promote({ sourceDb: source, targetDb: target, stamp: "test" })).toThrow(/schema version 99/);
		expect(existsSync(target)).toBe(false);
	});

	test("refuses a missing source", () => {
		expect(() => promote({ sourceDb: join(dir, "nope.sqlite"), targetDb: join(dir, "t.sqlite"), stamp: "x" })).toThrow(
			/No source database/,
		);
	});
});

describe("assertNotInUse", () => {
	test("passes for a closed database and for one that does not exist", () => {
		const path = join(dir, "closed.sqlite");
		seedDatabase(path, "Plan", 1);
		expect(() => assertNotInUse(path, "target")).not.toThrow();
		expect(() => assertNotInUse(join(dir, "absent.sqlite"), "target")).not.toThrow();
	});

	test("throws while another process holds the database open", async () => {
		const path = join(dir, "held.sqlite");
		seedDatabase(path, "Plan", 1);

		// A separate process, because an in-process handle wouldn't reproduce the real case
		// (the running app is its own process holding the -shm).
		const holder = join(dir, "holder.ts");
		await Bun.write(
			holder,
			[
				`import { Database } from "bun:sqlite";`,
				`const db = new Database(process.argv[2]);`,
				`db.exec("PRAGMA journal_mode = WAL;");`,
				`db.query("SELECT COUNT(*) FROM plans").get();`,
				`console.log("held");`,
				`await new Promise((r) => setTimeout(r, 30_000));`,
			].join("\n"),
		);

		const proc = Bun.spawn([process.execPath, holder, path], { stdout: "pipe" });
		try {
			// Wait for the holder to actually have the database open.
			const reader = proc.stdout.getReader();
			await reader.read();
			reader.releaseLock();

			expect(() => assertNotInUse(path, "target")).toThrow(/still running/);
		} finally {
			proc.kill();
			await proc.exited;
		}
	});
});
