/**
 * LLM 适配层：默认 DeepSeek，接口是 OpenAI 兼容格式，
 * 换别家只要改 DEEPSEEK_BASE_URL / MODEL，代码不用动。
 *
 * Key 只从 .env.local 读，不写进代码、不进日志。
 */
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const f = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

export const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

export function hasKey() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/** 调一次对话。json=true 时要求模型只返回 JSON 对象。 */
export async function chat(messages, { json = false, temperature = 0.3, maxTokens = 2000 } = {}) {
  if (!hasKey()) throw new Error('没有 DEEPSEEK_API_KEY，检查 app/.env.local');

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage ?? {};
  return { content, usage };
}

/* 解析 JSON 时容错：模型偶尔会把结果包在 markdown 代码块里 */
export function parseJson(text) {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('模型返回不是合法 JSON');
  }
}
