'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { benchmarkContent } from '@/db/schema';
import { getBenchmarkById, getRhythm } from '@/db/queries';
import { chat, parseJson, hasLlmKey } from '@/lib/llm';

/** 让模型拆解这条爆款的「能借鉴的点」，存进库，下次直接读 */
export async function buildTakeaway(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id || !hasLlmKey()) return;

  const b = getBenchmarkById(id);
  if (!b) return;
  const r = getRhythm('benchmark', id);

  const facts = {
    标题: b.title,
    作者粉丝: b.followerCount,
    点赞: b.likes,
    评论: b.comments,
    收藏: b.saves,
    时长秒: b.durationSec,
    赞粉比: +b.ratio.toFixed(1),
    话题: b.tagList,
    ...(r
      ? {
          镜头切换次数: r.cuts,
          每秒切镜: r.cutsPerSec,
          平均镜头秒: r.avgShotSec,
          前3秒切镜: r.first3sCuts,
        }
      : {}),
  };

  const content = await chat(
    [
      {
        role: 'system',
        content:
          '你是短视频结构分析师。只输出 JSON。每条结论必须能对上给定数字，不许编造视频里没给的信息。',
      },
      {
        role: 'user',
        content: `这条抖音爆款的数据：

${JSON.stringify(facts, null, 1)}

给我 4 条「能借鉴的点」，每条必须是可直接执行的结构动作，格式：
{"points":[{"what":"借鉴什么（一句话）","how":"具体怎么做（写到秒/镜头/句式）","why":"依据哪个数字"}]}

要求：不许说「内容优质」「节奏好」这类空话；没有的维度不要写。`,
      },
    ],
    { json: true, temperature: 0.4, maxTokens: 800 },
  );

  try {
    const out = parseJson<{ points: { what: string; how: string; why: string }[] }>(content);
    const points = (out.points ?? []).filter((p) => p?.what && p?.how);
    if (!points.length) return;
    db.update(benchmarkContent)
      .set({ takeaway: JSON.stringify(points), takeawayAt: Date.now() })
      .where(eq(benchmarkContent.id, id))
      .run();
    revalidatePath(`/bench/${id}`);
  } catch {
    /* 解析失败就不写，页面保持原样 */
  }
}
