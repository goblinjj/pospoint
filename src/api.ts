export interface User {
  id: number;
  username: string;
  nickname: string;
  isAdmin: boolean;
}

export interface ShopSummary {
  id: number;
  name: string;
  address: string;
  lng: number | null;
  lat: number | null;
  category: string;
  note: string;
  created_at: number;
  creator_nickname: string;
  review_count: number;
  avg_rating: number | null;
  cover_key: string | null;
}

export interface ShopDetail {
  shop: ShopSummary & { amap_url: string; created_by: number };
  reviews: Array<{
    id: number;
    rating: number;
    content: string;
    created_at: number;
    user_id: number;
    nickname: string;
  }>;
  photos: Array<{ id: number; review_id: number | null; r2_key: string }>;
}

export interface ResolvedPlace {
  name: string;
  address: string;
  lng: number | null;
  lat: number | null;
  sourceUrl: string;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 非 JSON 响应
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `请求失败（${res.status}）`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const api = {
  me: () => request<User>("/api/me"),
  authStatus: () => request<{ needsInvite: boolean }>("/api/auth/status"),
  register: (b: { username: string; nickname: string; password: string; invite: string }) =>
    post<User>("/api/auth/register", b),
  login: (b: { username: string; password: string }) => post<User>("/api/auth/login", b),
  logout: () => post<{ ok: true }>("/api/auth/logout", {}),

  shops: (p: { lng?: number; lat?: number; category?: string; offset?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (p.lng !== undefined && p.lat !== undefined) {
      qs.set("lng", String(p.lng));
      qs.set("lat", String(p.lat));
    }
    if (p.category) qs.set("category", p.category);
    if (p.offset) qs.set("offset", String(p.offset));
    if (p.limit) qs.set("limit", String(p.limit));
    const s = qs.toString();
    return request<{ items: ShopSummary[]; hasMore: boolean }>(`/api/shops${s ? `?${s}` : ""}`);
  },
  shop: (id: number | string) => request<ShopDetail>(`/api/shops/${id}`),
  addShop: (b: {
    name: string;
    address: string;
    lng: number | null;
    lat: number | null;
    category: string;
    note: string;
    amapUrl: string;
  }) => post<{ id: number }>("/api/shops", b),
  updateShop: (
    id: number,
    b: {
      name: string;
      address: string;
      lng: number | null;
      lat: number | null;
      category: string;
      note: string;
      amapUrl: string;
    }
  ) =>
    request<{ ok: true }>(`/api/shops/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  deleteShop: (id: number) => request<{ ok: true }>(`/api/shops/${id}`, { method: "DELETE" }),

  addReview: (shopId: number, b: { rating: number; content: string; photoKeys: string[] }) =>
    post<{ id: number }>(`/api/shops/${shopId}/reviews`, b),
  updateReview: (id: number, b: { rating: number; content: string }) =>
    request<{ ok: true }>(`/api/reviews/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  deleteReview: (id: number) => request<{ ok: true }>(`/api/reviews/${id}`, { method: "DELETE" }),

  resolveShare: (text: string) => post<ResolvedPlace>("/api/resolve-share", { text }),

  createInvite: () => post<{ code: string }>("/api/invites", {}),
  invites: () =>
    request<Array<{ code: string; created_at: number; used_at: number | null; used_by_nickname: string | null }>>(
      "/api/invites"
    ),

  uploadPhoto: async (blob: Blob): Promise<string> => {
    const res = await request<{ key: string }>("/api/photos", {
      method: "POST",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
    return res.key;
  },
};

export const CATEGORIES = ["餐馆", "小吃", "咖啡茶饮", "酒吧", "甜品", "玩乐", "其他"];

export function photoUrl(key: string): string {
  return `/api/photos/${key}`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameYear ? md : `${d.getFullYear()}年${md}`;
}
