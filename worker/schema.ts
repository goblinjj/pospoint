// 首次请求时自动建表，省去手动跑迁移的步骤（本地和线上 D1 都适用）。
let ensured = false;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (ensured) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      pass_salt TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_by INTEGER NOT NULL,
      used_by INTEGER,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      lng REAL,
      lat REAL,
      category TEXT NOT NULL DEFAULT '吃喝',
      note TEXT NOT NULL DEFAULT '',
      amap_url TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      review_id INTEGER,
      user_id INTEGER NOT NULL,
      r2_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    // 2026-07-09 分类从 7 类收成「吃喝 / 玩乐」两类，老数据除玩乐外全部归入吃喝
    db.prepare(`UPDATE shops SET category = '吃喝' WHERE category NOT IN ('吃喝', '玩乐')`),
  ]);
  ensured = true;
}
