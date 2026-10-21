import * as SQLite from 'expo-sqlite';
import { createSqliteStore, type SqlDriver } from './sqliteStore';
import type { AppStore } from './types';

function expoDriver(db: SQLite.SQLiteDatabase): SqlDriver {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, params);
    },
    all: (sql, params = []) => db.getAllAsync(sql, params),
    transaction: (fn) => db.withTransactionAsync(fn),
  };
}

export async function openPlatformStore(): Promise<AppStore> {
  const db = await SQLite.openDatabaseAsync('riftbuild.db');
  return createSqliteStore(expoDriver(db));
}
