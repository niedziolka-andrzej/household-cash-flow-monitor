import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

/**
 * Opens (creating if needed) the SQLite file at `path`, applies any pending
 * migrations, and returns a Drizzle handle typed against our schema. Pass
 * `":memory:"` for tests — WAL mode is skipped for it (meaningless on an
 * in-memory DB and SQLite errors if you try).
 */
export function createDatabase(path: string) {
	const sqlite = new Database(path, { create: true });
	sqlite.exec("PRAGMA foreign_keys = ON;");
	if (path !== ":memory:") {
		sqlite.exec("PRAGMA journal_mode = WAL;");
	}
	runMigrations(sqlite);
	return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDatabase>;
