'use client';

import { useCallback, useEffect, useState } from 'react';

type PlatformState = { key: string; name: string; done: boolean };
type Step = { key: string; label: string; done: boolean; hint: string; platforms?: PlatformState[] };
type Status = { steps: Step[]; node: string; dataDir: string };

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const d = await fetch('/api/setup').then((r) => r.json());
    setStatus(d);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveKey() {
    setBusy('key');
    setMsg('');
    const r = await fetch('/api/setup/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }).then((x) => x.json());
    setBusy('');
    if (r.ok) {
      setMsg('已保存，立即可用');
      setKey('');
      load();
    } else {
      setMsg(r.error ?? '保存失败');
    }
  }

  async function login(platform: string) {
    setBusy('login:' + platform);
    setMsg('浏览器窗口已弹出，请在窗口里扫码（最多等 10 分钟）');
    await fetch('/api/setup/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    });
    const t = setInterval(async () => {
      const d = await fetch('/api/setup').then((r) => r.json());
      setStatus(d);
      const p = d.steps.find((s: Step) => s.key === 'login')?.platforms?.find((x: PlatformState) => x.key === platform);
      if (p?.done) {
        clearInterval(t);
        setBusy('');
        setMsg(`${p.name} 登录成功，登录态已保存到本机`);
      }
    }, 3000);
    setTimeout(() => {
      clearInterval(t);
      setBusy('');
    }, 11 * 60_000);
  }

  async function collect() {
    setBusy('collect');
    setMsg('正在采集，约 30 秒…');
    const r = await fetch('/api/refresh', { method: 'POST' }).then((x) => x.json());
    if (!r.started) {
      setBusy('');
      setMsg(r.reason ?? '没启动');
      return;
    }
    const t = setInterval(async () => {
      const s = await fetch('/api/refresh').then((x) => x.json());
      if (!s.refreshing) {
        clearInterval(t);
        setBusy('');
        setMsg('采集完成');
        load();
      }
    }, 2000);
  }

  if (!status) return <div className="empty-sm">读取环境…</div>;

  const doneCount = status.steps.filter((s) => s.done).length;

  return (
    <>
      <div className="card" style={{ padding: 22, marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 680 }}>首次配置</div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6, lineHeight: 1.7 }}>
          四步走完就能用。你的数据、登录态、API Key 全部只存在这台电脑上
          （<code>{status.dataDir}</code>），不会上传到任何服务器。
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}>
          已完成 {doneCount} / {status.steps.length} · Node {status.node}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {status.steps.map((s, i) => (
          <div className="card" key={s.key} style={{ padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                flex: '0 0 26px',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--mono)',
                color: s.done ? 'var(--on-accent)' : 'var(--text3)',
                background: s.done ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${s.done ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {s.done ? '✓' : String(i + 1).padStart(2, '0')}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 620 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.6 }}>{s.hint}</div>

              {s.key === 'apikey' && !s.done && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="sk-..."
                    style={{
                      flex: 1,
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: 'var(--text)',
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />
                  <button className="btn" onClick={saveKey} disabled={busy === 'key' || !key}>
                    保存
                  </button>
                </div>
              )}

              {s.key === 'login' && s.platforms && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {s.platforms.map((p) => (
                    <button
                      key={p.key}
                      className={p.done ? 'btn ghost' : 'btn'}
                      onClick={() => login(p.key)}
                      disabled={busy === 'login:' + p.key}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          background: p.done ? 'var(--green)' : 'currentColor',
                          opacity: p.done ? 1 : 0.35,
                        }}
                      />
                      {p.name}
                      {p.done ? ' 已登录' : ''}
                    </button>
                  ))}
                </div>
              )}

              {s.key === 'collect' && (
                <button
                  className={s.done ? 'btn ghost' : 'btn'}
                  style={{ marginTop: 10 }}
                  onClick={collect}
                  disabled={busy === 'collect' || !status.steps.find((x) => x.key === 'login')?.done}
                >
                  {s.done ? '再采一次' : '开始采集'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {msg && <div className="note">✦ {msg}</div>}

      <div className="note">
        全部完成之后，打开<a href="/">总览</a>就能看到数据。之后每 30 分钟自动更新，
        关掉浏览器也会继续（只要电脑没睡眠）。
      </div>
    </>
  );
}
