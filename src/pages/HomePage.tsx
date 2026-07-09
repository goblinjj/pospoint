import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, photoUrl, CATEGORIES, type ShopSummary } from "../api";
import { wgs84ToGcj02, distanceKm, fmtDistance } from "../geo";
import { Score } from "../App";

type GeoState = { status: "pending" | "ok" | "denied"; lng?: number; lat?: number };

export default function HomePage() {
  const nav = useNavigate();
  const [shops, setShops] = useState<ShopSummary[] | null>(null);
  const [error, setError] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "pending" });
  const [category, setCategory] = useState("全部");

  useEffect(() => {
    api.shops().then(setShops).catch((e) => setError(e.message));

    if (!navigator.geolocation) {
      setGeo({ status: "denied" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 浏览器给的是 WGS-84，店铺坐标是高德 GCJ-02，先转换再算距离
        const [lng, lat] = wgs84ToGcj02(pos.coords.longitude, pos.coords.latitude);
        setGeo({ status: "ok", lng, lat });
      },
      () => setGeo({ status: "denied" }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }, []);

  const sorted = useMemo(() => {
    if (!shops) return null;
    const filtered = category === "全部" ? shops : shops.filter((s) => s.category === category);
    if (geo.status !== "ok") return filtered;
    return [...filtered].sort((a, b) => {
      const da =
        a.lng !== null && a.lat !== null ? distanceKm(geo.lng!, geo.lat!, a.lng, a.lat) : Infinity;
      const db =
        b.lng !== null && b.lat !== null ? distanceKm(geo.lng!, geo.lat!, b.lng, b.lat) : Infinity;
      return da - db;
    });
  }, [shops, geo, category]);

  return (
    <>
      <header className="topbar">
        <div className="brand" aria-hidden>
          小众点评
        </div>
        <h1>
          小众点评
          <span className="sub">朋友们盖章推荐的地方</span>
        </h1>
        <Link className="topbar-link" to="/me">
          我的
        </Link>
      </header>

      <div className="filter-row">
        {["全部", ...CATEGORIES].map((c) => (
          <button key={c} className={`chip ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      {geo.status === "pending" && <p className="geo-note">正在定位，按由近及远排序 …</p>}
      {geo.status === "denied" && (
        <p className="geo-note">未获得定位权限，按最新添加排序。开启定位后可按距离排序。</p>
      )}

      {error && (
        <div className="page">
          <div className="error-msg">{error}</div>
        </div>
      )}

      {!sorted && !error && <div className="loading">翻菜单中 …</div>}

      {sorted && sorted.length === 0 && (
        <div className="empty-state">
          <div className="big">🍜</div>
          <p>菜单还空着。</p>
          <p>把你的私藏好店分享进来，朋友们等着抄作业。</p>
        </div>
      )}

      {sorted && sorted.length > 0 && (
        <div className="shop-list">
          {sorted.map((s) => {
            const dist =
              geo.status === "ok" && s.lng !== null && s.lat !== null
                ? fmtDistance(distanceKm(geo.lng!, geo.lat!, s.lng, s.lat))
                : null;
            return (
              <Link key={s.id} to={`/shop/${s.id}`} className="shop-card">
                {s.cover_key && <img className="thumb" src={photoUrl(s.cover_key)} alt="" loading="lazy" />}
                <div className="body">
                  <div className="name-row">
                    <h2>{s.name}</h2>
                    {dist && <span className="price-tag">{dist}</span>}
                  </div>
                  <div className="meta">
                    <span className="cat-label">{s.category}</span>
                    {s.avg_rating !== null ? (
                      <>
                        <Score value={s.avg_rating} />
                        <span>{s.review_count} 条评价</span>
                      </>
                    ) : (
                      <span>还没人评价</span>
                    )}
                  </div>
                  {s.note && <p className="note">{s.note}</p>}
                  <div className="meta">
                    <span>{s.creator_nickname} 分享</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <button className="fab" aria-label="添加店铺" onClick={() => nav("/add")}>
        ＋
      </button>
    </>
  );
}
