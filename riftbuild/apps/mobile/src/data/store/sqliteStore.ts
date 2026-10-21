import type { AppStore, SavedBuild, SavedDraft, StoredRelease } from './types';

/** The minimal SQL surface the store needs; adapters exist for expo-sqlite (app) and sql.js (tests). */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: (string | number | null)[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
  transaction(fn: () => Promise<void>): Promise<void>;
}

const SCHEMA = `
create table if not exists release (id integer primary key check (id = 1), json text not null, saved_at text not null);
create table if not exists builds (id text primary key, json text not null, updated_at text not null);
create table if not exists drafts (id text primary key, json text not null, created_at text not null);
create table if not exists kv (key text primary key, value text not null);
`;

export async function createSqliteStore(db: SqlDriver): Promise<AppStore> {
  await db.exec(SCHEMA);
  return {
    async loadRelease() {
      const rows = await db.all<{ json: string }>('select json from release where id = 1');
      return rows[0] ? (JSON.parse(rows[0].json) as StoredRelease) : null;
    },
    async saveRelease(release) {
      // One row, replaced atomically: the app never sees half of a release.
      await db.transaction(async () => {
        await db.run('insert or replace into release (id, json, saved_at) values (1, ?, ?)', [
          JSON.stringify(release),
          release.savedAt,
        ]);
      });
    },
    async listBuilds() {
      const rows = await db.all<{ json: string }>(
        'select json from builds order by updated_at desc',
      );
      return rows.map((r) => JSON.parse(r.json) as SavedBuild);
    },
    async saveBuild(build) {
      await db.run('insert or replace into builds (id, json, updated_at) values (?, ?, ?)', [
        build.id,
        JSON.stringify(build),
        build.updatedAt,
      ]);
    },
    async deleteBuild(id) {
      await db.run('delete from builds where id = ?', [id]);
    },
    async listDrafts(limit = 30) {
      const rows = await db.all<{ json: string }>(
        'select json from drafts order by created_at desc limit ?',
        [limit],
      );
      return rows.map((r) => JSON.parse(r.json) as SavedDraft);
    },
    async saveDraft(draft) {
      await db.run('insert or replace into drafts (id, json, created_at) values (?, ?, ?)', [
        draft.id,
        JSON.stringify(draft),
        draft.createdAt,
      ]);
    },
    async getLossLog() {
      const rows = await db.all<{ value: string }>("select value from kv where key = 'loss_log'");
      return rows[0] ? (JSON.parse(rows[0].value) as Record<string, number>) : {};
    },
    async setLossLog(log) {
      await db.run("insert or replace into kv (key, value) values ('loss_log', ?)", [
        JSON.stringify(log),
      ]);
    },
    async wipeUserData() {
      await db.transaction(async () => {
        await db.run('delete from builds');
        await db.run('delete from drafts');
        await db.run('delete from kv');
      });
    },
  };
}
