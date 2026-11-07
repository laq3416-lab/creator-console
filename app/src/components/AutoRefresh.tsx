'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const STALE_MINUTES = 30;
const THROTTLE_KEY = 'auto-refresh-at';
const THROTTLE_MS = 10 * 60_000;

/**
 * 打开页面时自动检查数据新不新：
 *  · 超过 30 分钟 → 后台触发一次采集，采完自动刷新页面
 *  · 10 分钟内不重复触发，避免来回切页面反复采
 *  · 采集是全自动的，只在右下角显示一个小提示
 */
export default function AutoRefresh() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const last = Number(sessionStorage.getItem(THROTTLE_KEY) || 0);
      if (Date.now() - last < THROTTLE_MS) return;

      let st: { ageMinutes: number | null; refreshing: boolean };
      try {
        st = await fetch('/api/refresh').then((r) => r.json());
      } catch {
        return;
      }
      if (cancelled || st.refreshing) return;
      if (st.ageMinutes != null && st.ageMinutes < STALE_MINUTES) return;

      sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));
      setState('running');
      try {
        const r = await fetch('/api/refresh', { method: 'POST' }).then((x) => x.json());
        if (!r.started) {
          setState('idle');
          return;
        }
        for (let i = 0; i < 45; i++) {
          await new Promise((res) => setTimeout(res, 2000));
          const s = await fetch('/api/refresh').then((x) => x.json());
          if (!s.refreshing) break;
        }
        setState('done');
        router.refresh();
      } catch {
        setState('idle');
      } finally {
        setTimeout(() => setState('idle'), 3000);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === 'idle') return null;

  return (
    <div className="toast">
      <span className="dot pulse" />
      {state === 'running' ? '数据过期，正在自动采集…' : '数据已更新'}
    </div>
  );
}
