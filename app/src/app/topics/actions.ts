'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { topic } from '@/db/schema';

const ALLOWED = new Set(['idea', 'planned', 'shot', 'published', 'dropped']);

export async function moveTopic(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !ALLOWED.has(status)) return;
  db.update(topic).set({ status }).where(eq(topic.id, id)).run();
  revalidatePath('/topics');
}

export async function addTopic(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const angle = String(formData.get('angle') ?? '').trim() || null;
  db.insert(topic)
    .values({
      id: `tp_manual_${Date.now()}`,
      title: title.slice(0, 120),
      angle,
      source: 'manual',
      status: 'idea',
      createdAt: Date.now(),
    })
    .run();
  revalidatePath('/topics');
}

/** 选题拍完发布后，关联到真实作品，才能回看「当初为什么拍它」和「实际跑成什么样」 */
export async function linkContent(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  if (!id || !contentId) return;
  db.update(topic)
    .set({ publishedContentId: contentId, status: 'published' })
    .where(eq(topic.id, id))
    .run();
  revalidatePath('/topics');
}

export async function unlinkContent(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  db.update(topic).set({ publishedContentId: null }).where(eq(topic.id, id)).run();
  revalidatePath('/topics');
}
