import { createSqliteStore, type SqlDriver } from '@/data/store/sqliteStore';
import { testRelease } from '@/test/fixtures';

// sql.js (pure JS build) runs the real SQL the app runs on expo-sqlite.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js/dist/sql-asm.js') as () => Promise<{
  Database: new () => SqlJsDb;
}>;
type SqlJsDb = {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): {
    bind(p: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  };
};

async function sqlJsDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return {
    exec: async (sql) => db.exec(sql),
    run: async (sql, params = []) => db.run(sql, params),
    all: async <T>(sql: string, params: unknown[] = []) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
    transaction: async (fn) => {
      db.exec('begin');
      try {
        await fn();
        db.exec('commit');
      } catch (err) {
        db.exec('rollback');
        throw err;
      }
    },
  };
}

describe('SQLite store', () => {
  it('stores the catalog release and keeps user data separate', async () => {
    const store = await createSqliteStore(await sqlJsDriver());
    expect(await store.loadRelease()).toBeNull();
    await store.saveRelease(testRelease());
    const loaded = await store.loadRelease();
    expect(loaded?.catalog.patch).toBe('9.9z');

    await store.saveBuild({
      id: 'b1',
      name: 'Teste',
      favorite: false,
      patch: '9.9z',
      build: {
        championId: null,
        role: null,
        items: [],
        runes: { keystone: null, primaryPath: null, primary: [], secondary: null },
        spells: [null, null],
        skillOrder: [],
        purchaseOrder: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    await store.setLossLog({ fx_tank: 2 });
    await store.saveRelease(testRelease({ gamePatch: '10.0' }));
    expect(await store.listBuilds()).toHaveLength(1);
    expect(await store.getLossLog()).toEqual({ fx_tank: 2 });

    await store.wipeUserData();
    expect(await store.listBuilds()).toHaveLength(0);
    expect(await store.getLossLog()).toEqual({});
    expect((await store.loadRelease())?.manifest.game_patch.version).toBe('10.0');
  });
});
