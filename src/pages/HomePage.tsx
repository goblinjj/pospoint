import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, photoUrl, CATEGORIES, type ShopSummary } from "../api";
import { wgs84ToGcj02, distanceKm, fmtDistance } from "../geo";
import { Score } from "../App";

type GeoState = { status: "pending" | "ok" | "denied"; lng?: number; lat?: number };

export default function HomePage() {
  const nav = useNavigate();
  const [items, setItems] = useState<ShopSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "pending" });
  const [filter, setFilter] = useState("全部");

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeo({ status: "denied" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 浏览器给的是 WGS-84，店铺坐标是高德 GCJ-02，先转换再交给后端按距离排序
        const [lng, lat] = wgs84ToGcj02(pos.coords.longitude, pos.coords.latitude);
        setGeo({ status: "ok", lng, lat });
      },
      () => setGeo({ status: "denied" }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }, []);

  const baseParams = {
    lng: geo.status === "ok" ? geo.lng : undefined,
    lat: geo.status === "ok" ? geo.lat : undefined,
    category: CATEGORIES.includes(filter) ? filter : undefined,
    mine: filter === "我的" || undefined,
  };
  const queryKey = `${baseParams.lng ?? ""},${baseParams.lat ?? ""}|${filter}`;
  const activeKey = useRef("");

  useEffect(() => {
    // 等定位有结果（成功或拒绝）再发首个请求：有坐标只带坐标请求一次，被拒绝才发无坐标请求
    if (geo.status === "pending") return;
    if (activeKey.current === queryKey) return;
    activeKey.current = queryKey;
    setItems(null);
    setHasMore(false);
    setError("");
    api
      .shops(baseParams)
      .then((res) => {
        if (activeKey.current !== queryKey) return;
        setItems(res.items);
        setHasMore(res.hasMore);
      })
      .catch((e) => {
        if (activeKey.current !== queryKey) return;
        setError(e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, geo.status]);

  const loadMoreRef = useRef<() => void>(() => {});
  loadMoreRef.current = () => {
    if (!items || !hasMore || loadingMore) return;
    const key = queryKey;
    setLoadingMore(true);
    api
      .shops({ ...baseParams, offset: items.length })
      .then((res) => {
        if (activeKey.current !== key) return;
        setItems((prev) => [...(prev ?? []), ...res.items]);
        setHasMore(res.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "400px" }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [items !== null && hasMore]);

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
        {["全部", ...CATEGORIES, "我的"].map((c) => (
          <button key={c} className={`chip ${filter === c ? "on" : ""}`} onClick={() => setFilter(c)}>
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

      {!items && !error && <div className="loading">翻菜单中 …</div>}

      {items && items.length === 0 && (
        <div className="empty-state">
          <div className="big">🍜</div>
          <p>菜单还空着。</p>
          <p>把你的私藏好店分享进来，朋友们等着抄作业。</p>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="shop-list">
          {items.map((s) => {
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

      {items && hasMore && <div ref={sentinelRef} className="load-more" aria-hidden />}
      {loadingMore && <div className="loading" style={{ padding: 20 }}>还有好店，继续翻 …</div>}

      <button className="fab" aria-label="添加店铺" onClick={() => nav("/add")}>
        ＋
      </button>
    </>
  );
}
