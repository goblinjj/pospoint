// 解析从高德地图 App「分享地点」得到的文本/链接，提取店名、地址和 GCJ-02 坐标。
// 高德分享链接形态多变（surl.amap.com 短链、wb.amap.com?p=…、amap.com/place/…），
// 这里逐跳跟随重定向，对每一跳的 URL 和最终页面 HTML 依次尝试多种提取方式，尽力而为；
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

function tryParseUrl(raw: string, out: ResolvedPlace): void {
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
      if (c) {
        out.lng = out.lng ?? c.lng;
        out.lat = out.lat ?? c.lat;
      }
      if (parts[3] && !out.name) out.name = decodeURIComponent(parts[3]);
      if (parts[4] && !out.address) out.address = decodeURIComponent(parts.slice(4).join(","));
    }
  }

  // position=经度,纬度 / q=纬度,经度,店名
  for (const key of ["position", "q", "to", "dest"]) {
    const v = params.get(key);
    if (!v) continue;
    const parts = v.split(",");
    if (parts.length >= 2) {
      const n1 = parseFloat(parts[0]);
      const n2 = parseFloat(parts[1]);
      const c = pickCoords(n1, n2);
      if (c && out.lng === null) {
        out.lng = c.lng;
        out.lat = c.lat;
      }
      if (parts[2] && !out.name && isNaN(parseFloat(parts[2]))) {
        out.name = decodeURIComponent(parts[2]);
      }
    }
  }

  const lat = params.get("lat");
  const lng = params.get("lng") ?? params.get("lon");
  if (lat && lng && out.lng === null) {
    const c = pickCoords(parseFloat(lng), parseFloat(lat));
    if (c) {
      out.lng = c.lng;
      out.lat = c.lat;
    }
  }
  const name = params.get("name");
  if (name && !out.name) out.name = name;
  const addr = params.get("address") ?? params.get("addr");
  if (addr && !out.address) out.address = addr;
}

function tryParseHtml(html: string, out: ResolvedPlace): void {
  if (out.lng === null) {
    const m =
      html.match(/"lng"\s*:\s*"?(1[0-9]{2}\.[0-9]+|[7-9][0-9]\.[0-9]+)"?\s*,\s*"lat"\s*:\s*"?([1-5]?[0-9]\.[0-9]+)"?/) ??
      html.match(/"lat"\s*:\s*"?([1-5]?[0-9]\.[0-9]+)"?\s*,\s*"lng"\s*:\s*"?(1[0-9]{2}\.[0-9]+|[7-9][0-9]\.[0-9]+)"?/);
    if (m) {
      const a = parseFloat(m[1]);
      const b = parseFloat(m[2]);
      const c = pickCoords(a, b);
      if (c) {
        out.lng = c.lng;
        out.lat = c.lat;
      }
    }
  }
  if (out.lng === null) {
    const m = html.match(/"location"\s*:\s*"([0-9.]+),([0-9.]+)"/);
    if (m) {
      const c = pickCoords(parseFloat(m[1]), parseFloat(m[2]));
      if (c) {
        out.lng = c.lng;
        out.lat = c.lat;
      }
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

  const urlMatch = text.match(/https?:\/\/[^\s"'，。;；]+/);
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
        tryParseHtml(html, out);
      } catch {
        // 忽略，尽力而为
      }
    }
    break;
  }

  return out;
}
