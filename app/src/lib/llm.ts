/** 服务端调用 DeepSeek。Key 从 Next 自动加载的 .env.local 里读，不出现在客户端。 */
const BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export function hasLlmKey() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export async function chat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {},
) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('未配置 DEEPSEEK_API_KEY');

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 900,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error('模型返回不是 JSON');
  }
}
