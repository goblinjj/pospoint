// 解析从地图 App「分享地点」得到的文本/链接，提取店名、地址和 GCJ-02 坐标。
// 支持高德（surl.amap.com 短链、wb.amap.com?p=…）、腾讯（apis.map.qq.com、map.qq.com）、
// 百度（j.map.baidu.com 短链等，坐标为 BD-09，解析后转成 GCJ-02）。
// 逐跳跟随重定向，对每一跳的 URL 和最终页面 HTML 依次尝试多种提取方式，尽力而为；
// 解析不全时由前端让用户手动补填。

export interface ResolvedPlace {
  name: string;
  address: string;
  lng: number | null;
  lat: number | null;
  sourceUrl: string;
}

function inChinaRange(lng: number, lat: number): boolean {
  return lng > 70 && lng < 140 && lat > 3 && lat < 55;
}

function pickCoords(a: number, b: number): { lng: number; lat: number } | null {
  // 自动判断两个数哪个是经度哪个是纬度
  if (inChinaRange(a, b)) return { lng: a, lat: b };
  if (inChinaRange(b, a)) return { lng: b, lat: a };
  return null;
}

// 百度地图用 BD-09 坐标系，入库前统一转成 GCJ-02
function bd09ToGcj02(bdLng: number, bdLat: number): { lng: number; lat: number } {
  const X_PI = (Math.PI * 3000.0) / 180.0;
  const x = bdLng - 0.0065;
  const y = bdLat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return { lng: z * Math.cos(theta), lat: z * Math.sin(theta) };
}

function isBaiduUrl(raw: string): boolean {
  try {
    return new URL(raw).hostname.endsWith("baidu.com");
  } catch {
    return false;
  }
}

function setCoords(out: ResolvedPlace, c: { lng: number; lat: number }, fromBaidu: boolean): void {
  if (out.lng !== null) return;
  const fixed = fromBaidu ? bd09ToGcj02(c.lng, c.lat) : c;
  out.lng = fixed.lng;
  out.lat = fixed.lat;
}

function tryParseUrl(raw: string, out: ResolvedPlace): void {
  const fromBaidu = isBaiduUrl(raw);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return;
  }
  const params = u.searchParams;

  // wb.amap.com/?p=B0FFxxx,纬度,经度,店名,地址
  const p = params.get("p");
  if (p) {
    const parts = p.split(",");
    if (parts.length >= 3) {
      const n1 = parseFloat(parts[1]);
      const n2 = parseFloat(parts[2]);
      const c = pickCoords(n1, n2);
      if (c) setCoords(out, c, fromBaidu);
      if (parts[3] && !out.name) out.name = decodeURIComponent(parts[3]);
      if (parts[4] && !out.address) out.address = decodeURIComponent(parts.slice(4).join(","));
    }
  }

  // 腾讯地图 URI：marker=coord:纬度,经度;title:店名;addr:地址
  const marker = params.get("marker");
  if (marker) {
    const cm = marker.match(/coord:([0-9.]+),([0-9.]+)/);
    if (cm) {
      const c = pickCoords(parseFloat(cm[1]), parseFloat(cm[2]));
      if (c) setCoords(out, c, fromBaidu);
    }
    const tm = marker.match(/title:([^;]+)/);
    if (tm && !out.name) out.name = decodeURIComponent(tm[1]);
    const am = marker.match(/addr:([^;]+)/);
    if (am && !out.address) out.address = decodeURIComponent(am[1]);
  }

  // 腾讯地图网页版：pointx=经度 pointy=纬度
  const pointx = params.get("pointx");
  const pointy = params.get("pointy");
  if (pointx && pointy) {
    const c = pickCoords(parseFloat(pointx), parseFloat(pointy));
    if (c) setCoords(out, c, fromBaidu);
  }

  // position=经度,纬度 / q=纬度,经度,店名 / 百度 location=纬度,经度 / center=…
  for (const key of ["position", "q", "to", "dest", "location", "center", "destination"]) {
    const v = params.get(key);
    if (!v) continue;
    const parts = v.split(",");
    if (parts.length >= 2) {
      const n1 = parseFloat(parts[0]);
      const n2 = parseFloat(parts[1]);
      const c = pickCoords(n1, n2);
      if (c) setCoords(out, c, fromBaidu);
      if (parts[2] && !out.name && isNaN(parseFloat(parts[2]))) {
        out.name = decodeURIComponent(parts[2]);
      }
    }
  }

  const lat = params.get("lat");
  const lng = params.get("lng") ?? params.get("lon");
  if (lat && lng) {
    const c = pickCoords(parseFloat(lng), parseFloat(lat));
    if (c) setCoords(out, c, fromBaidu);
  }
  const name = params.get("name");
  if (name && !out.name) out.name = name;
  const addr = params.get("address") ?? params.get("addr");
  if (addr && !out.address) out.address = addr;
}

function tryParseHtml(html: string, out: ResolvedPlace, fromBaidu: boolean): void {
  if (out.lng === null) {
    const m =
      html.match(/"lng"\s*:\s*"?(1[0-9]{2}\.[0-9]+|[7-9][0-9]\.[0-9]+)"?\s*,\s*"lat"\s*:\s*"?([1-5]?[0-9]\.[0-9]+)"?/) ??
      html.match(/"lat"\s*:\s*"?([1-5]?[0-9]\.[0-9]+)"?\s*,\s*"lng"\s*:\s*"?(1[0-9]{2}\.[0-9]+|[7-9][0-9]\.[0-9]+)"?/);
    if (m) {
      const c = pickCoords(parseFloat(m[1]), parseFloat(m[2]));
      if (c) setCoords(out, c, fromBaidu);
    }
  }
  if (out.lng === null) {
    const m = html.match(/"location"\s*:\s*"([0-9.]+),([0-9.]+)"/);
    if (m) {
      const c = pickCoords(parseFloat(m[1]), parseFloat(m[2]));
      if (c) setCoords(out, c, fromBaidu);
    }
  }
  if (!out.name) {
    const m = html.match(/"name"\s*:\s*"([^"]{1,60})"/) ?? html.match(/<title>([^<|]{1,60})/);
    if (m) out.name = m[1].trim();
  }
  if (!out.address) {
    const m = html.match(/"address"\s*:\s*"([^"]{1,120})"/);
    if (m) out.address = m[1].trim();
  }
}

export async function resolveShareText(text: string): Promise<ResolvedPlace> {
  const out: ResolvedPlace = { name: "", address: "", lng: null, lat: null, sourceUrl: "" };

  // 分享文本里的【店名】
  const bracket = text.match(/【([^】]{1,60})】/) ?? text.match(/「([^」]{1,60})」/);
  if (bracket) out.name = bracket[1].trim();

  // 纯坐标输入：如 "104.06,30.65"
  const bare = text.trim().match(/^(-?\d{1,3}\.\d+)\s*[,，]\s*(-?\d{1,3}\.\d+)$/);
  if (bare) {
    const c = pickCoords(parseFloat(bare[1]), parseFloat(bare[2]));
    if (c) {
      out.lng = c.lng;
      out.lat = c.lat;
      return out;
    }
  }

  // 注意：不能把半角分号当结束符，腾讯地图 URI 用 ; 分隔 marker 参数
  const urlMatch = text.match(/https?:\/\/[^\s"'，。；]+/);
  if (!urlMatch) return out;

  let current = urlMatch[0];
  out.sourceUrl = current;
  tryParseUrl(current, out);

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  };

  for (let hop = 0; hop < 6; hop++) {
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", headers });
    } catch {
      break;
    }
    const loc = res.headers.get("location");
    if (loc && res.status >= 300 && res.status < 400) {
      current = new URL(loc, current).toString();
      tryParseUrl(current, out);
      if (out.lng !== null && out.name) break;
      continue;
    }
    // 最后一跳：尝试从页面内容提取
    if (res.ok && (out.lng === null || !out.name)) {
      try {
        const html = (await res.text()).slice(0, 500_000);
        tryParseHtml(html, out, isBaiduUrl(current));
      } catch {
        // 忽略，尽力而为
      }
    }
    break;
  }

  return out;
}
