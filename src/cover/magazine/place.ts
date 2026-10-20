/**
 * 地名提取 for 地理志: the small place tag in the cover's corner, read from the title first, then the
 * summary. Coordinates written in the text win (`25.6°N 100.2°E`); otherwise a curated list of
 * well-known places (with their coordinates, so the tag can carry a lat/long) and a conservative
 * pattern for natural features (xx山 / xx峡谷 / xx冰川 …) that refuses anything with function words
 * in it. Nothing found → `null`, and the cover leaves the corner empty rather than guess.
 */
export interface Place {
  name: string;
  lat?: number;
  lng?: number;
}

type Known = [name: string, lat: number, lng: number];

/* Chinese names: provinces and regions, big cities, famous mountains / lakes / deserts, and the places
 * Chinese travel writing most often goes abroad. Ambiguous short names (阿里, 黄石 …) are left out. */
const KNOWN_CN: Known[] = [
  ['北京', 39.9, 116.4],
  ['上海', 31.2, 121.5],
  ['广州', 23.1, 113.3],
  ['深圳', 22.5, 114.1],
  ['杭州', 30.3, 120.2],
  ['成都', 30.6, 104.1],
  ['重庆', 29.6, 106.6],
  ['西安', 34.3, 108.9],
  ['南京', 32.1, 118.8],
  ['武汉', 30.6, 114.3],
  ['苏州', 31.3, 120.6],
  ['厦门', 24.5, 118.1],
  ['青岛', 36.1, 120.4],
  ['大连', 38.9, 121.6],
  ['天津', 39.1, 117.2],
  ['长沙', 28.2, 112.9],
  ['昆明', 25.0, 102.7],
  ['大理', 25.6, 100.3],
  ['丽江', 26.9, 100.2],
  ['香格里拉', 27.8, 99.7],
  ['拉萨', 29.7, 91.1],
  ['桂林', 25.3, 110.3],
  ['阳朔', 24.8, 110.5],
  ['敦煌', 40.1, 94.7],
  ['三亚', 18.3, 109.5],
  ['哈尔滨', 45.8, 126.6],
  ['乌鲁木齐', 43.8, 87.6],
  ['喀什', 39.5, 76.0],
  ['西宁', 36.6, 101.8],
  ['兰州', 36.1, 103.8],
  ['贵阳', 26.6, 106.7],
  ['南宁', 22.8, 108.4],
  ['福州', 26.1, 119.3],
  ['济南', 36.7, 117.0],
  ['郑州', 34.7, 113.6],
  ['合肥', 31.8, 117.2],
  ['南昌', 28.7, 115.9],
  ['太原', 37.9, 112.5],
  ['呼和浩特', 40.8, 111.7],
  ['银川', 38.5, 106.3],
  ['沈阳', 41.8, 123.4],
  ['长春', 43.9, 125.3],
  ['石家庄', 38.0, 114.5],
  ['海口', 20.0, 110.3],
  ['澳门', 22.2, 113.5],
  ['香港', 22.3, 114.2],
  ['台北', 25.0, 121.6],
  ['西藏', 29.7, 91.1],
  ['新疆', 43.8, 87.6],
  ['云南', 25.0, 102.7],
  ['青海', 36.6, 101.8],
  ['甘肃', 36.1, 103.8],
  ['内蒙古', 40.8, 111.7],
  ['四川', 30.6, 104.1],
  ['贵州', 26.6, 106.7],
  ['广西', 22.8, 108.4],
  ['海南', 20.0, 110.3],
  ['福建', 26.1, 119.3],
  ['浙江', 30.3, 120.2],
  ['江苏', 32.1, 118.8],
  ['山东', 36.7, 117.0],
  ['陕西', 34.3, 108.9],
  ['湖南', 28.2, 112.9],
  ['湖北', 30.6, 114.3],
  ['安徽', 31.8, 117.2],
  ['江西', 28.7, 115.9],
  ['河南', 34.7, 113.6],
  ['河北', 38.0, 114.5],
  ['山西', 37.9, 112.5],
  ['辽宁', 41.8, 123.4],
  ['吉林', 43.9, 125.3],
  ['黑龙江', 45.8, 126.6],
  ['宁夏', 38.5, 106.3],
  ['台湾', 23.7, 121.0],
  ['广东', 23.1, 113.3],
  ['黄山', 30.1, 118.2],
  ['泰山', 36.3, 117.1],
  ['华山', 34.5, 110.1],
  ['峨眉山', 29.5, 103.3],
  ['张家界', 29.1, 110.5],
  ['九寨沟', 33.2, 103.9],
  ['稻城亚丁', 28.4, 100.3],
  ['稻城', 29.0, 100.3],
  ['西湖', 30.2, 120.1],
  ['洱海', 25.8, 100.2],
  ['青海湖', 36.9, 100.2],
  ['纳木错', 30.7, 90.6],
  ['喀纳斯', 48.7, 87.0],
  ['呼伦贝尔', 49.2, 119.8],
  ['珠穆朗玛峰', 28.0, 86.9],
  ['珠峰', 28.0, 86.9],
  ['梅里雪山', 28.4, 98.7],
  ['玉龙雪山', 27.1, 100.2],
  ['长白山', 42.0, 128.1],
  ['武夷山', 27.7, 118.0],
  ['庐山', 29.6, 116.0],
  ['泸沽湖', 27.7, 100.8],
  ['鸣沙山', 40.1, 94.7],
  ['莫高窟', 40.0, 94.8],
  ['布达拉宫', 29.7, 91.1],
  ['壶口瀑布', 36.1, 110.4],
  ['黄果树瀑布', 25.9, 105.7],
  ['元阳梯田', 23.1, 102.8],
  ['婺源', 29.2, 117.9],
  ['乌镇', 30.7, 120.5],
  ['西塘', 30.9, 120.9],
  ['平遥', 37.2, 112.2],
  ['凤凰古城', 27.9, 109.6],
  ['塔克拉玛干', 38.9, 83.6],
  ['腾格里', 38.5, 104.0],
  ['巴丹吉林', 40.0, 101.8],
  ['祁连山', 38.5, 99.5],
  ['天山', 42.0, 80.0],
  ['贡嘎', 29.6, 101.9],
  ['四姑娘山', 31.1, 102.9],
  ['川西', 30.0, 102.0],
  ['可可西里', 35.3, 92.0],
  ['三江源', 34.0, 96.0],
  ['北疆', 46.0, 87.0],
  ['南疆', 40.0, 80.0],
  ['日本', 35.7, 139.7],
  ['东京', 35.7, 139.7],
  ['京都', 35.0, 135.8],
  ['北海道', 43.1, 141.3],
  ['富士山', 35.4, 138.7],
  ['冰岛', 64.1, -21.9],
  ['挪威', 60.4, 5.3],
  ['瑞士', 46.9, 7.4],
  ['阿尔卑斯', 46.5, 9.0],
  ['巴黎', 48.9, 2.4],
  ['伦敦', 51.5, -0.1],
  ['纽约', 40.7, -74.0],
  ['新西兰', -43.5, 170.1],
  ['澳大利亚', -25.3, 131.0],
  ['巴厘岛', -8.4, 115.2],
  ['马尔代夫', 4.2, 73.5],
  ['撒哈拉', 23.4, 13.0],
  ['巴塔哥尼亚', -49.3, -72.9],
  ['优胜美地', 37.9, -119.5],
  ['大峡谷', 36.1, -112.1],
  ['罗弗敦', 68.2, 13.9],
  ['圣托里尼', 36.4, 25.4],
  ['托斯卡纳', 43.4, 11.3],
  ['洛杉矶', 34.1, -118.2],
  ['旧金山', 37.8, -122.4],
  ['温哥华', 49.3, -123.1],
  ['班夫', 51.2, -115.6],
  ['曼谷', 13.8, 100.5],
  ['清迈', 18.8, 99.0],
  ['新加坡', 1.3, 103.8],
  ['首尔', 37.6, 127.0],
  ['济州岛', 33.4, 126.5],
  ['南极', -82.9, 135.0],
  ['北极', 90.0, 0.0],
];

const KNOWN_EN: Known[] = [
  ['Iceland', 64.1, -21.9],
  ['Norway', 60.4, 5.3],
  ['Switzerland', 46.9, 7.4],
  ['Alps', 46.5, 9.0],
  ['Dolomites', 46.4, 11.9],
  ['Patagonia', -49.3, -72.9],
  ['Yosemite', 37.9, -119.5],
  ['Yellowstone', 44.6, -110.5],
  ['Grand Canyon', 36.1, -112.1],
  ['Lofoten', 68.2, 13.9],
  ['Faroe', 62.0, -6.8],
  ['Scotland', 56.5, -4.2],
  ['Santorini', 36.4, 25.4],
  ['Tuscany', 43.4, 11.3],
  ['Tokyo', 35.7, 139.7],
  ['Kyoto', 35.0, 135.8],
  ['Hokkaido', 43.1, 141.3],
  ['Mount Fuji', 35.4, 138.7],
  ['Fuji', 35.4, 138.7],
  ['Bali', -8.4, 115.2],
  ['Maldives', 4.2, 73.5],
  ['Sahara', 23.4, 13.0],
  ['New Zealand', -43.5, 170.1],
  ['Banff', 51.2, -115.6],
  ['Paris', 48.9, 2.4],
  ['London', 51.5, -0.1],
  ['New York', 40.7, -74.0],
  ['Tibet', 29.7, 91.1],
  ['Lhasa', 29.7, 91.1],
  ['Xinjiang', 43.8, 87.6],
  ['Yunnan', 25.0, 102.7],
  ['Dali', 25.6, 100.3],
  ['Lijiang', 26.9, 100.2],
  ['Guilin', 25.3, 110.3],
  ['Dunhuang', 40.1, 94.7],
  ['Sanya', 18.3, 109.5],
  ['Shanghai', 31.2, 121.5],
  ['Beijing', 39.9, 116.4],
  ['Hangzhou', 30.3, 120.2],
  ['Chengdu', 30.6, 104.1],
  ['Chongqing', 29.6, 106.6],
  ['Shenzhen', 22.5, 114.1],
  ['Hong Kong', 22.3, 114.2],
  ['Taipei', 25.0, 121.6],
  ['Seoul', 37.6, 127.0],
  ['Singapore', 1.3, 103.8],
  ['Bangkok', 13.8, 100.5],
  ['Himalayas', 28.0, 86.9],
  ['Himalaya', 28.0, 86.9],
  ['Everest', 28.0, 86.9],
  ['Kilimanjaro', -3.1, 37.4],
  ['Antarctica', -82.9, 135.0],
  ['Greenland', 71.7, -42.6],
  ['Alaska', 64.2, -149.5],
  ['Hawaii', 19.9, -155.6],
  ['Namibia', -22.6, 17.1],
  ['Atacama', -24.5, -69.3],
  ['Uyuni', -20.1, -67.5],
  ['Cappadocia', 38.6, 34.8],
  ['Svalbard', 78.2, 15.6],
];

/* Natural features by suffix: `prefix + suffix` is a place only when the prefix is 2–5 Chinese characters
 * with none of the function words / verbs / counters below in it (一座山, 走进群山, 我们的湖 … are not places). */
const FEATURE =
  /([一-龥]{2,5})(雪山|峡谷|沙漠|草原|冰川|高原|海滩|森林|古镇|火山|瀑布|温泉|海岸|半岛|群岛|盆地|湿地|山脉|山|湖|岛|峰|湾)/g;
const STOP =
  '的了在是有和与这那些个座片很最我你他她它们把被从向对为以及着又也都就只还没不什么怎样如何于之其而所里中外上下前后左右间内边旁次第年月日天时分种件事人家路街走进看见望爬登游到来回过去说想要能会可做用给让' +
  '一二三四五六七八九十百千万几两半每各另此该某';
const stopRe = new RegExp(`[${STOP}]`);

const COORDS = /(\d{1,2}(?:\.\d+)?)\s*°\s*([NSns])[\s,，、·]*(\d{1,3}(?:\.\d+)?)\s*°\s*([EWew])/;

function fromCoords(text: string): Place | null {
  const m = COORDS.exec(text);
  if (!m) return null;
  const lat = Number(m[1]) * (m[2].toUpperCase() === 'S' ? -1 : 1);
  const lng = Number(m[3]) * (m[4].toUpperCase() === 'W' ? -1 : 1);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { name: '', lat, lng };
}

function fromKnown(text: string): Place | null {
  let best: { at: number; k: Known } | null = null;
  for (const k of KNOWN_CN) {
    const at = text.indexOf(k[0]);
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && k[0].length > best.k[0].length))
      best = { at, k };
  }
  for (const k of KNOWN_EN) {
    const re = new RegExp(`(?<![A-Za-z])${k[0].replace(/\s+/g, '\\s+')}(?![A-Za-z])`, 'i');
    const m = re.exec(text);
    if (!m) continue;
    if (!best || m.index < best.at || (m.index === best.at && m[0].length > best.k[0].length))
      best = { at: m.index, k };
  }
  return best ? { name: best.k[0], lat: best.k[1], lng: best.k[2] } : null;
}

function fromFeature(text: string): Place | null {
  FEATURE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FEATURE.exec(text))) {
    // Shrink the prefix from the left until it is free of function words; keep at least two characters.
    let prefix = m[1];
    while (prefix.length >= 2 && stopRe.test(prefix)) prefix = prefix.slice(1);
    if (prefix.length >= 2) return { name: prefix + m[2] };
  }
  return null;
}

/** The place a text is about: coordinates in it, a known place, or a natural feature by name. */
export function placeIn(text: string): Place | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return fromCoords(t) ?? fromKnown(t) ?? fromFeature(t);
}

/** Title first, then the summary; `null` when neither names a place. */
export function placeFrom(title: string, summary?: string): Place | null {
  return placeIn(title) ?? (summary ? placeIn(summary) : null);
}

export function formatCoords(lat: number, lng: number): string {
  const f = (v: number) => (Math.round(Math.abs(v) * 10) / 10).toFixed(1);
  return `${f(lat)}°${lat < 0 ? 'S' : 'N'} ${f(lng)}°${lng < 0 ? 'W' : 'E'}`;
}

/** The corner tag: `大理  25.6°N 100.3°E`, a bare name, bare coordinates, or '' for nothing. */
export function placeLabel(p: Place | null): string {
  if (!p) return '';
  const coords = p.lat !== undefined && p.lng !== undefined ? formatCoords(p.lat, p.lng) : '';
  return [p.name, coords].filter(Boolean).join('  ');
}
