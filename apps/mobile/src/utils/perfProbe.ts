/**
 * PerfProbe — 性能探测工具
 * 
 * 用法：
 *   const handle = perfProbe.startTrace("创建钱包");
 *   handle.mark("生成助记词");           // 同步步骤，自动计时到下一个 mark
 *   await handle.markAsync("加密数据", promise); // 异步步骤，计时 promise 耗时
 *   perfProbe.endTrace(handle);          // 组装 PerfReport 并上报
 *
 * isEnabled=false 时所有方法为空操作（零开销）。
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { configService } from "../services/configService";
import { uploadLog } from "../services/logService";

// ── 数据结构 ──

export interface PerfItem {
  title: string;
  cost: number; // ms
  detail?: string;
}

export interface PerfReport {
  title: string;
  cost: number; // ms 总耗时
  items: PerfItem[];
  timestamp: number;
  platform: string;
  version: string;
}

// ── TraceHandle ──

export class TraceHandle {
  private title: string;
  private items: PerfItem[] = [];
  private lastMarkTime: number;
  private startTime: number;
  private enabled: boolean;

  constructor(title: string, enabled: boolean) {
    this.title = title;
    this.enabled = enabled;
    this.startTime = Date.now();
    this.lastMarkTime = this.startTime;
  }

  /** 记录从上一个 mark 到当前的时间差 */
  mark(title: string, detail?: string): void {
    if (!this.enabled) return;
    const now = Date.now();
    this.items.push({
      title,
      cost: now - this.lastMarkTime,
      detail,
    });
    this.lastMarkTime = now;
  }

  /** 记录异步操作的耗时，同时推进 lastMarkTime */
  async markAsync<T>(title: string, promise: Promise<T>, detail?: string): Promise<T> {
    if (!this.enabled) return promise;
    const t0 = Date.now();
    const result = await promise;
    const cost = Date.now() - t0;
    this.items.push({ title, cost, detail });
    this.lastMarkTime = Date.now();
    return result;
  }

  /** 组装 PerfReport（由 perfProbe.endTrace 调用） */
  buildReport(): PerfReport {
    return {
      title: this.title,
      cost: Date.now() - this.startTime,
      items: this.items,
      timestamp: this.startTime,
      platform: Platform.OS,
      version: Constants.expoConfig?.version || "unknown",
    };
  }
}

// ── PerfProbe 单例 ──

let _enabled: boolean | null = null; // null = 未初始化

async function checkEnabled(): Promise<boolean> {
  if (_enabled !== null) return _enabled;
  _enabled = await configService.getPerfProbeEnabled();
  return _enabled;
}

/** 外部调用：开关变更时刷新缓存 */
export function refreshPerfProbeEnabled(): void {
  _enabled = null;
}

export const perfProbe = {
  /** 开始一个业务追踪。isEnabled=false 时返回空操作 handle */
  async startTrace(title: string): Promise<TraceHandle> {
    const enabled = await checkEnabled();
    return new TraceHandle(title, enabled);
  },

  /** 结束追踪，组装 PerfReport 并上报 */
  async endTrace(handle: TraceHandle): Promise<void> {
    if (!handle) return;
    // 先同步 buildReport，确保 cost 在调用点记录，不受后续 await 延迟影响
    const report = handle.buildReport();
    const enabled = await checkEnabled();
    if (!enabled) return;

    // fire-and-forget 上报，不阻塞业务
    uploadLog("perf", JSON.stringify(report)).catch(() => {
      // 上报失败静默处理
    });
  },
};