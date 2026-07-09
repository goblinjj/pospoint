import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, photoUrl, fmtDate, type ShopDetail } from "../api";
import { compressImage } from "../image";
import { Stars, useUser } from "../App";

export default function ShopPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useUser();
  const [data, setData] = useState<ShopDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .shop(id!)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (error)
    return (
      <div className="page" style={{ paddingTop: 24 }}>
        <div className="error-msg">{error}</div>
      </div>
    );
  if (!data) return <div className="loading">翻菜单中 …</div>;

  const { shop, reviews, photos } = data;
  const hasCoords = shop.lng !== null && shop.lat !== null;
  const encName = encodeURIComponent(shop.name);

  // 高德 URI API：手机上会直接唤起高德 App，没装则打开网页版
  const markerUrl = hasCoords
    ? `https://uri.amap.com/marker?position=${shop.lng},${shop.lat}&name=${encName}&src=pospoint&coordinate=gaode&callnative=1`
    : shop.amap_url || null;
  const navUrl = hasCoords
    ? `https://uri.amap.com/navigation?to=${shop.lng},${shop.lat},${encName}&coordinate=gaode&callnative=1`
    : null;
  // 腾讯用 GCJ-02（同高德）；百度 URI 支持 coord_type=gcj02，由它自己转 BD-09
  const qqUrl = hasCoords
    ? `https://apis.map.qq.com/uri/v1/marker?marker=coord:${shop.lat},${shop.lng};title:${encName};addr:${encodeURIComponent(shop.address || shop.name)}&referer=pospoint`
    : null;
  const baiduUrl = hasCoords
    ? `https://api.map.baidu.com/marker?location=${shop.lat},${shop.lng}&title=${encName}&content=${encodeURIComponent(shop.address || shop.name)}&coord_type=gcj02&output=html&src=pospoint`
    : null;

  async function deleteShop() {
    if (!confirm(`确定删除「${shop.name}」？所有评价和照片会一并删除。`)) return;
    try {
      await api.deleteShop(shop.id);
      nav("/", { replace: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <>
      <header className="topbar">
        <button className="back-btn" onClick={() => nav(-1)}>
          ‹ 返回
        </button>
      </header>

      <div className="page">
        <div className="shop-head">
          <h1>{shop.name}</h1>
          {shop.address && <p className="addr">{shop.address}</p>}
          <div className="score-row">
            <span className="cat-label">{shop.category}</span>
            {shop.avg_rating !== null ? (
              <>
                <Stars rating={shop.avg_rating} />
                <span className="rating-num">{shop.avg_rating.toFixed(1)}</span>
                <span className="hint">{shop.review_count} 条评价</span>
              </>
            ) : (
              <span className="hint">还没人打分，来盖第一章</span>
            )}
          </div>
          {shop.note && (
            <p style={{ marginTop: 10, fontSize: 15 }}>
              „{shop.note}“ <span className="hint">—— {shop.creator_nickname}</span>
            </p>
          )}
        </div>

        <div className="map-actions">
          {markerUrl && (
            <a className="btn amap" href={markerUrl} target="_blank" rel="noreferrer">
              在高德地图打开
            </a>
          )}
          {navUrl && (
            <a className="btn" href={navUrl} target="_blank" rel="noreferrer">
              导航去这里
            </a>
          )}
        </div>
        {qqUrl && baiduUrl && (
          <p className="alt-maps">
            也可以用：
            <a href={qqUrl} target="_blank" rel="noreferrer">
              腾讯地图
            </a>
            <span aria-hidden> · </span>
            <a href={baiduUrl} target="_blank" rel="noreferrer">
              百度地图
            </a>
          </p>
        )}
        {!hasCoords && <p className="hint" style={{ marginBottom: 16 }}>这家店没有坐标，无法唤起地图。</p>}
        {hasCoords && (
          <p className="coords">
            {shop.lng!.toFixed(6)}, {shop.lat!.toFixed(6)}（GCJ-02）
          </p>
        )}

        <ReviewForm shopId={shop.id} onDone={load} />

        <div className="section-title">大家的评价</div>
        {reviews.length === 0 && <p className="hint">还没有评价。</p>}
        {reviews.map((r) => {
          const rPhotos = photos.filter((p) => p.review_id === r.id);
          return (
            <div key={r.id} className="review">
              <div className="head">
                <span className="who">{r.nickname}</span>
                <Stars rating={r.rating} />
                <span className="when">{fmtDate(r.created_at)}</span>
              </div>
              {r.content && <p className="content">{r.content}</p>}
              {rPhotos.length > 0 && (
                <div className="photo-grid">
                  {rPhotos.map((p) => (
                    <a key={p.id} href={photoUrl(p.r2_key)} target="_blank" rel="noreferrer">
                      <img src={photoUrl(p.r2_key)} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              {(r.user_id === user.id || user.isAdmin) && (
                <button
                  className="btn danger-link"
                  onClick={async () => {
                    if (!confirm("删除这条评价？")) return;
                    await api.deleteReview(r.id).catch(() => {});
                    load();
                  }}
                >
                  删除
                </button>
              )}
            </div>
          );
        })}

        {(shop.created_by === user.id || user.isAdmin) && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button className="btn danger-link" onClick={deleteShop}>
              删除这家店
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function ReviewForm({ shopId, onDone }: { shopId: number; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 9 - photoKeys.length)) {
        const blob = await compressImage(file);
        const key = await api.uploadPhoto(blob);
        setPhotoKeys((prev) => [...prev, key]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (rating === 0) {
      setError("先点星星打个分");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.addReview(shopId, { rating, content: content.trim(), photoKeys });
      setRating(0);
      setContent("");
      setPhotoKeys([]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-form">
      <div className="field" style={{ marginBottom: 10 }}>
        <label>盖个章 · 打分</label>
        <div className="star-input">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              className={i <= rating ? "on" : ""}
              onClick={() => setRating(i)}
              aria-label={`${i} 星`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="吃了什么？值不值？（可不填）"
          rows={2}
        />
      </div>
      <div className="photo-row">
        {photoKeys.map((k) => (
          <img key={k} src={photoUrl(k)} alt="" />
        ))}
        {photoKeys.length < 9 && (
          <button
            type="button"
            className="add-photo-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="添加照片"
          >
            {uploading ? "…" : "📷"}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => pickPhotos(e.target.files)}
        />
      </div>
      {error && <div className="error-msg">{error}</div>}
      <button className="btn" onClick={submit} disabled={busy || uploading}>
        {busy ? "提交中 …" : "发布评价"}
      </button>
    </div>
  );
}
