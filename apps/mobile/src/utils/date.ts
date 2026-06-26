/**
 * 日期解析与格式化工具 — 兼容 React Native Hermes 引擎
 *
 * 问题背景：
 *   Android Hermes 引擎对 ISO 8601 格式（如 "2026-06-25T11:43:07.577Z"）
 *   的 new Date() 解析存在已知 bug，可能返回 Invalid Date (NaN)。
 *
 * 解决方案：
 *   使用正则提取日期各分量，通过 Date.UTC() 构造 Date 对象，
 *   绕过 Hermes 的字符串解析问题。
 */

/**
 * 安全解析 ISO 8601 日期字符串，返回 Date 对象。
 * 兼容 Hermes / JSC / V8 等引擎。
 *
 * @param iso ISO 8601 字符串，如 "2026-06-25T11:43:07.577Z"
 * @returns Date 对象，解析失败返回 null
 */
export function parseISODate(iso: string): Date | null {
  if (!iso) return null;

  // 正则匹配 ISO 8601：YYYY-MM-DDTHH:mm:ss(.sss)?(Z|+offset)?
  // 毫秒部分单独捕获为 group 7，保证精度不丢失
  const m = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (m) {
    // Date.UTC() 返回 UTC 毫秒数，构造 Date 对象不受 Hermes 字符串解析 bug 影响
    // 毫秒最多取 3 位（.577 → 577），不足 3 位自动补零（.5 → 500）
    const ms = m[7] ? parseInt(m[7].slice(0, 3).padEnd(3, "0"), 10) : 0;
    const utcMs = Date.UTC(
      +m[1],       // year
      +m[2] - 1,   // month (0-based)
      +m[3],       // day
      +m[4],       // hour
      +m[5],       // minute
      +m[6],       // second
      ms,          // millisecond
    );
    return new Date(utcMs);
  }

  // 回退：尝试原生解析（兼容非 ISO 格式，如 "2026-06-25 11:43:07"）
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 格式化日期为 "YYYY-MM-DD"。
 * 用于钱包详情页的创建时间等场景。
 */
export function formatDate(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return "--";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 格式化日期为 "YYYY-MM-DD HH:mm"。
 * 用于交易记录列表、充值记录等场景。
 */
export function formatTime(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return "--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 格式化日期为本地化长格式："2026年6月25日 星期四 上午11点43分"。
 * 用于交易详情页等场景。
 */
export function formatFullTime(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return "--";
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = d.getMinutes();
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
  const w = weekDays[d.getDay()];
  const period = h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${y}年${m}月${day}日 星期${w} ${period}${h12}点${min}分`;
}

/**
 * 格式化日期为本地化短格式（等价于 toLocaleString）。
 * 用于通知列表等场景。
 */
export function formatDateTime(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return "--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
