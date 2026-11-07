import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** 保存 API Key 到 .env.local，并立即在当前进程生效 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key ?? '').trim();

  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
    return NextResponse.json({ ok: false, error: '格式不像 DeepSeek Key（应以 sk- 开头）' }, { status: 400 });
  }

  const envFile = path.join(process.cwd(), '.env.local');
  let lines: string[] = [];
  if (fs.existsSync(envFile)) lines = fs.readFileSync(envFile, 'utf8').split('\n');

  const idx = lines.findIndex((l) => l.startsWith('DEEPSEEK_API_KEY='));
  const line = `DEEPSEEK_API_KEY=${key}`;
  if (idx >= 0) lines[idx] = line;
  else lines.unshift(line);

  if (!lines.some((l) => l.startsWith('DEEPSEEK_BASE_URL='))) {
    lines.push('DEEPSEEK_BASE_URL=https://api.deepseek.com');
  }
  fs.writeFileSync(envFile, lines.filter((l) => l !== undefined).join('\n'));

  process.env.DEEPSEEK_API_KEY = key;

  return NextResponse.json({ ok: true });
}
