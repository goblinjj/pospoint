import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { ensureSchema } from "./schema";
import { hashPassword, verifyPassword, randomHex, inviteCode } from "./password";
import { resolveShareText } from "./amap";

interface SessionUser {
  id: number;
  username: string;
  nickname: string;
  is_admin: number;
}

type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };

const COOKIE = "pp_session";
const SESSION_DAYS = 180;

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "服务器开小差了，稍后再试" }, 500);
});

// ---------- 鉴权 ----------

async function currentUser(c: { env: Env; req: { raw: Request } }, token: string | undefined) {
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.nickname, u.is_admin, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
  )
    .bind(token)
    .first<SessionUser & { expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}

app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const open = ["/api/auth/login", "/api/auth/register", "/api/auth/status"];
  if (open.includes(path)) return next();
  const user = await currentUser(c, getCookie(c, COOKIE));
  if (!user) return c.json({ error: "请先登录" }, 401);
  c.set("user", user);
  return next();
});

async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randomHex(32);
  const now = Date.now();
  await db
    .prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(token, userId, now, now + SESSION_DAYS * 86400_000)
    .run();
  return token;
}

function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

app.get("/api/auth/status", async (c) => {
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
  return c.json({ needsInvite: (count?.n ?? 0) > 0 });
});

app.post("/api/auth/register", async (c) => {
  const body = await c.req.json<{ username?: string; nickname?: string; password?: string; invite?: string }>();
  const username = (body.username ?? "").trim().toLowerCase();
  const nickname = (body.nickname ?? "").trim();
  const password = body.password ?? "";
  const invite = (body.invite ?? "").trim().toUpperCase();

  if (!/^[a-z0-9_一-龥]{2,20}$/.test(username))
    return c.json({ error: "用户名需为 2-20 位中文、字母、数字或下划线" }, 400);
  if (nickname.length < 1 || nickname.length > 20) return c.json({ error: "昵称需为 1-20 个字" }, 400);
  if (password.length < 6) return c.json({ error: "密码至少 6 位" }, 400);

  const count = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>())?.n ?? 0;
  const isFirst = count === 0;

  if (!isFirst) {
    const code = await c.env.DB.prepare(`SELECT code, used_by FROM invite_codes WHERE code = ?`)
      .bind(invite)
      .first<{ code: string; used_by: number | null }>();
    if (!code || code.used_by !== null) return c.json({ error: "邀请码无效或已被使用" }, 400);
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
  if (existing) return c.json({ error: "用户名已被占用" }, 400);

  const { hash, salt } = await hashPassword(password);
  const now = Date.now();
  const result = await c.env.DB.prepare(
    `INSERT INTO users (username, nickname, pass_hash, pass_salt, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(username, nickname, hash, salt, isFirst ? 1 : 0, now)
    .run();
  const userId = result.meta.last_row_id as number;

  if (!isFirst) {
    await c.env.DB.prepare(`UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?`)
      .bind(userId, now, invite)
      .run();
  }

  const token = await createSession(c.env.DB, userId);
  setSessionCookie(c, token);
  return c.json({ id: userId, username, nickname, isAdmin: isFirst });
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();
  const username = (body.username ?? "").trim().toLowerCase();
  const row = await c.env.DB.prepare(
    `SELECT id, username, nickname, pass_hash, pass_salt, is_admin FROM users WHERE username = ?`
  )
    .bind(username)
    .first<{ id: number; username: string; nickname: string; pass_hash: string; pass_salt: string; is_admin: number }>();
  if (!row || !(await verifyPassword(body.password ?? "", row.pass_salt, row.pass_hash))) {
    return c.json({ error: "用户名或密码不对" }, 401);
  }
  const token = await createSession(c.env.DB, row.id);
  setSessionCookie(c, token);
  return c.json({ id: row.id, username: row.username, nickname: row.nickname, isAdmin: !!row.is_admin });
});

app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/me", (c) => {
  const u = c.get("user");
  return c.json({ id: u.id, username: u.username, nickname: u.nickname, isAdmin: !!u.is_admin });
});

// ---------- 邀请码 ----------

app.post("/api/invites", async (c) => {
  const u = c.get("user");
  if (!u.is_admin) return c.json({ error: "只有管理员可以生成邀请码" }, 403);
  const code = inviteCode();
  await c.env.DB.prepare(`INSERT INTO invite_codes (code, created_by, created_at) VALUES (?, ?, ?)`)
    .bind(code, u.id, Date.now())
    .run();
  return c.json({ code });
});

app.get("/api/invites", async (c) => {
  const u = c.get("user");
  const rows = await c.env.DB.prepare(
    `SELECT i.code, i.created_at, i.used_at, uu.nickname AS used_by_nickname
     FROM invite_codes i LEFT JOIN users uu ON uu.id = i.used_by
     WHERE i.created_by = ? ORDER BY i.created_at DESC LIMIT 50`
  )
    .bind(u.id)
    .all();
  return c.json(rows.results);
});

// ---------- 店铺 ----------

const CATEGORIES = ["餐馆", "小吃", "咖啡茶饮", "酒吧", "甜品", "玩乐", "其他"];

app.get("/api/shops", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.address, s.lng, s.lat, s.category, s.note, s.created_at,
            u.nickname AS creator_nickname,
            (SELECT COUNT(*) FROM reviews r WHERE r.shop_id = s.id) AS review_count,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.shop_id = s.id) AS avg_rating,
            (SELECT p.r2_key FROM photos p WHERE p.shop_id = s.id ORDER BY p.id DESC LIMIT 1) AS cover_key
     FROM shops s JOIN users u ON u.id = s.created_by
     ORDER BY s.id DESC`
  ).all();
  return c.json(rows.results);
});

app.post("/api/shops", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<{
    name?: string;
    address?: string;
    lng?: number | null;
    lat?: number | null;
    category?: string;
    note?: string;
    amapUrl?: string;
  }>();
  const name = (body.name ?? "").trim();
  if (!name || name.length > 60) return c.json({ error: "店名不能为空（60 字以内）" }, 400);
  const category = CATEGORIES.includes(body.category ?? "") ? body.category! : "其他";
  const lng = typeof body.lng === "number" && isFinite(body.lng) ? body.lng : null;
  const lat = typeof body.lat === "number" && isFinite(body.lat) ? body.lat : null;

  const result = await c.env.DB.prepare(
    `INSERT INTO shops (name, address, lng, lat, category, note, amap_url, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      name,
      (body.address ?? "").trim().slice(0, 200),
      lng,
      lat,
      category,
      (body.note ?? "").trim().slice(0, 500),
      (body.amapUrl ?? "").trim().slice(0, 500),
      u.id,
      Date.now()
    )
    .run();
  return c.json({ id: result.meta.last_row_id });
});

app.get("/api/shops/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const shop = await c.env.DB.prepare(
    `SELECT s.*, u.nickname AS creator_nickname,
            (SELECT COUNT(*) FROM reviews r WHERE r.shop_id = s.id) AS review_count,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.shop_id = s.id) AS avg_rating
     FROM shops s JOIN users u ON u.id = s.created_by WHERE s.id = ?`
  )
    .bind(id)
    .first();
  if (!shop) return c.json({ error: "店铺不存在" }, 404);

  const reviews = await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.content, r.created_at, r.user_id, u.nickname
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.shop_id = ? ORDER BY r.id DESC`
  )
    .bind(id)
    .all();

  const photos = await c.env.DB.prepare(
    `SELECT id, review_id, r2_key FROM photos WHERE shop_id = ? ORDER BY id ASC`
  )
    .bind(id)
    .all();

  return c.json({ shop, reviews: reviews.results, photos: photos.results });
});

app.delete("/api/shops/:id", async (c) => {
  const u = c.get("user");
  const id = Number(c.req.param("id"));
  const shop = await c.env.DB.prepare(`SELECT created_by FROM shops WHERE id = ?`)
    .bind(id)
    .first<{ created_by: number }>();
  if (!shop) return c.json({ error: "店铺不存在" }, 404);
  if (shop.created_by !== u.id && !u.is_admin) return c.json({ error: "只有添加者或管理员可以删除" }, 403);
  const keys = await c.env.DB.prepare(`SELECT r2_key FROM photos WHERE shop_id = ?`).bind(id).all<{ r2_key: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM photos WHERE shop_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM reviews WHERE shop_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM shops WHERE id = ?`).bind(id),
  ]);
  for (const k of keys.results) await c.env.PHOTOS.delete(k.r2_key);
  return c.json({ ok: true });
});

// ---------- 评价（人人可打分） ----------

app.post("/api/shops/:id/reviews", async (c) => {
  const u = c.get("user");
  const shopId = Number(c.req.param("id"));
  const shop = await c.env.DB.prepare(`SELECT id FROM shops WHERE id = ?`).bind(shopId).first();
  if (!shop) return c.json({ error: "店铺不存在" }, 404);

  const body = await c.req.json<{ rating?: number; content?: string; photoKeys?: string[] }>();
  const rating = Math.round(body.rating ?? 0);
  if (rating < 1 || rating > 5) return c.json({ error: "评分需在 1-5 星之间" }, 400);
  const content = (body.content ?? "").trim().slice(0, 1000);

  const now = Date.now();
  const result = await c.env.DB.prepare(
    `INSERT INTO reviews (shop_id, user_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(shopId, u.id, rating, content, now)
    .run();
  const reviewId = result.meta.last_row_id as number;

  const keys = (body.photoKeys ?? []).filter((k) => /^[0-9a-f-]{36}\.(jpg|webp|png)$/.test(k)).slice(0, 9);
  for (const key of keys) {
    await c.env.DB.prepare(
      `INSERT INTO photos (shop_id, review_id, user_id, r2_key, created_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(shopId, reviewId, u.id, key, now)
      .run();
  }
  return c.json({ id: reviewId });
});

app.delete("/api/reviews/:id", async (c) => {
  const u = c.get("user");
  const id = Number(c.req.param("id"));
  const review = await c.env.DB.prepare(`SELECT user_id FROM reviews WHERE id = ?`)
    .bind(id)
    .first<{ user_id: number }>();
  if (!review) return c.json({ error: "评价不存在" }, 404);
  if (review.user_id !== u.id && !u.is_admin) return c.json({ error: "只能删除自己的评价" }, 403);
  const keys = await c.env.DB.prepare(`SELECT r2_key FROM photos WHERE review_id = ?`).bind(id).all<{ r2_key: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM photos WHERE review_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM reviews WHERE id = ?`).bind(id),
  ]);
  for (const k of keys.results) await c.env.PHOTOS.delete(k.r2_key);
  return c.json({ ok: true });
});

// ---------- 照片 ----------

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
};

app.post("/api/photos", async (c) => {
  const type = c.req.header("content-type") ?? "";
  const ext = IMAGE_TYPES[type];
  if (!ext) return c.json({ error: "仅支持 JPG / PNG / WebP 图片" }, 400);
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: "图片为空" }, 400);
  if (body.byteLength > 6 * 1024 * 1024) return c.json({ error: "图片太大（上限 6MB）" }, 400);
  const key = `${crypto.randomUUID()}.${ext}`;
  await c.env.PHOTOS.put(key, body, { httpMetadata: { contentType: type } });
  return c.json({ key });
});

app.get("/api/photos/:key", async (c) => {
  const key = c.req.param("key");
  if (!/^[0-9a-f-]{36}\.(jpg|webp|png)$/.test(key)) return c.json({ error: "无效图片" }, 400);
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) return c.json({ error: "图片不存在" }, 404);
  return new Response(obj.body as ReadableStream, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

// ---------- 高德分享解析 ----------

app.post("/api/resolve-share", async (c) => {
  const body = await c.req.json<{ text?: string }>();
  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "请粘贴高德地图的分享内容" }, 400);
  const place = await resolveShareText(text);
  return c.json(place);
});

app.all("/api/*", (c) => c.json({ error: "接口不存在" }, 404));

export default app;
