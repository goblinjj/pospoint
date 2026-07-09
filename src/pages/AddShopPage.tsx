import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, CATEGORIES } from "../api";

export default function AddShopPage() {
  const nav = useNavigate();
  const [shareText, setShareText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState(""); // "经度,纬度"
  const [category, setCategory] = useState("餐馆");
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function resolve() {
    if (!shareText.trim()) return;
    setResolving(true);
    setResolveMsg("");
    setError("");
    try {
      const place = await api.resolveShare(shareText);
      if (place.name) setName(place.name);
      if (place.address) setAddress(place.address);
      if (place.lng !== null && place.lat !== null) {
        setCoords(`${place.lng.toFixed(6)},${place.lat!.toFixed(6)}`);
      }
      if (place.sourceUrl) setSourceUrl(place.sourceUrl);
      if (place.lng !== null) {
        setResolveMsg("✓ 解析成功，核对一下信息再保存");
      } else if (place.name) {
        setResolveMsg("解析出店名，但没拿到坐标 —— 可在下方手动粘贴坐标");
      } else {
        setResolveMsg("没解析出来。试试直接粘贴「经度,纬度」，或手动填写");
      }
    } catch (e) {
      setResolveMsg(e instanceof Error ? e.message : "解析失败");
    } finally {
      setResolving(false);
    }
  }

  function parseCoords(): { lng: number | null; lat: number | null } {
    const m = coords.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,，]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return { lng: null, lat: null };
    let a = parseFloat(m[1]);
    let b = parseFloat(m[2]);
    // 中国范围内经度(70~140)一定大于纬度(3~55)，自动纠正顺序
    if (a < b) [a, b] = [b, a];
    return { lng: a, lat: b };
  }

  async function save() {
    setError("");
    if (!name.trim()) {
      setError("店名不能为空");
      return;
    }
    const { lng, lat } = parseCoords();
    if (coords.trim() && lng === null) {
      setError("坐标格式不对，应为「经度,纬度」，例如 104.06,30.65");
      return;
    }
    setSaving(true);
    try {
      const res = await api.addShop({
        name: name.trim(),
        address: address.trim(),
        lng,
        lat,
        category,
        note: note.trim(),
        amapUrl: sourceUrl,
      });
      nav(`/shop/${res.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      setSaving(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <button className="back-btn" onClick={() => nav(-1)}>
          ‹ 返回
        </button>
        <h1>分享好店</h1>
      </header>

      <div className="page">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>从高德地图粘贴</label>
            <textarea
              value={shareText}
              onChange={(e) => setShareText(e.target.value)}
              placeholder={"在高德地图找到店铺 → 分享 → 复制链接，\n把复制的内容整段粘贴到这里"}
              rows={3}
            />
          </div>
          <button className="btn secondary" onClick={resolve} disabled={resolving || !shareText.trim()}>
            {resolving ? "解析中 …" : "解析店铺信息"}
          </button>
          {resolveMsg && (
            <p className="hint" style={{ marginTop: 10 }}>
              {resolveMsg}
            </p>
          )}
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="field">
          <label>店名 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="比如：巷口刘记冒烤鸭" />
        </div>
        <div className="field">
          <label>分类</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>地址</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <label>坐标（经度,纬度 · 高德坐标系）</label>
          <input
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            placeholder="104.065735,30.657342"
            inputMode="decimal"
          />
        </div>
        <div className="field">
          <label>推荐语（为什么值得去？）</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句话安利给朋友们" />
        </div>

        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "保存中 …" : "保存到饭点"}
        </button>
      </div>
    </>
  );
}
