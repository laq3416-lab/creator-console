/**
 * 建议契约：一条建议必须长这样，否则不许入库。
 *
 * 规则不是写在 prompt 里就靠得住——模型总有一半概率偷懒。
 * 所以这里做硬校验：不合格就打回重写，重写两次还不行就丢掉，
 * 宁可不给建议，也不给「建议提升完播率」这种废话。
 */

/** 空话动词：单独出现时没有信息量 */
const VAGUE_VERBS = [
  '优化', '提升', '提高', '加强', '注意', '改善', '丰富', '完善', '改进',
  '多互动', '增加互动', '保持', '持续输出', '多尝试', '多更新', '增强',
  '调整', '聚焦', '强化', '打磨', '深耕',
];

/** 出现这些词，说明动作落到了具体对象上 */
const CONCRETE_MARKERS = [
  '第', '句', '秒', '镜头', '景别', '机位', '标题', '封面', '台词', '开头',
  '结尾', '评论区', '字幕', '画面', '特写', '录屏', '切', '删', '换成',
  '改成', '提到', '放到', '压到', '拆成', '加一句', '缩到',
];

/** 校验一条建议，返回错误列表；空数组表示通过 */
export function validateAdvice(a) {
  const errors = [];

  // 1) 必须有证据
  const ev = Array.isArray(a.evidence) ? a.evidence : [];
  if (ev.length === 0) {
    errors.push('缺少 evidence：每条建议必须至少给一条「我的值 vs 同行值」的对比');
  }
  for (const [i, e] of ev.entries()) {
    if (!e?.label) errors.push(`evidence[${i}] 缺 label`);
    if (e?.mine == null || e?.mine === '') errors.push(`evidence[${i}] 缺 mine（我自己的数值）`);
    if (e?.peer == null || e?.peer === '') errors.push(`evidence[${i}] 缺 peer（同行基准）`);
  }

  // 2) 动作必须具体
  const action = String(a.action ?? '').trim();
  if (action.length < 8) {
    errors.push('action 太短，必须写出具体做什么');
  } else {
    const hasNumber = /\d/.test(action);
    const hasConcrete = CONCRETE_MARKERS.some((k) => action.includes(k));
    if (!hasNumber && !hasConcrete) {
      errors.push('action 没有数字也没有具体对象，属于空话，必须改成可执行动作');
    }
    // 只由一个空话动词开头 + 无细节 → 判废话
    const stripped = action.replace(/[，。、；：,.\s]/g, '');
    const onlyVague = VAGUE_VERBS.some((v) => stripped.startsWith(v)) && !hasNumber && !hasConcrete;
    if (onlyVague) errors.push('action 是空话（如「优化内容」「提升完播率」），必须落到具体动作');
  }

  // 3) 必须说清差在哪
  const why = String(a.rationale ?? a.why ?? '').trim();
  if (why.length < 10) errors.push('rationale 太短，必须说明差距在哪');

  return errors;
}

/** 给失败的建议生成一条返工指令，回传给模型 */
export function repairInstruction(errors, previous) {
  return [
    '你上一次的输出不合格，问题如下：',
    ...errors.map((e) => `- ${e}`),
    '',
    '按下面的格式重写，只输出 JSON：',
    JSON.stringify(previous, null, 1),
    '',
    '要求：',
    '1. evidence 至少一条，mine 是你自己的真实数字，peer 是同行的基准数字',
    '2. action 必须能直接执行，包含具体对象（第几句、几秒、什么镜头、换什么画面）',
    '3. 禁止出现「优化/提升/加强/丰富」这类没有对象的动词',
  ].join('\n');
}

/** 判断一段文案是不是空话，用于规则引擎自查 */
export function isVague(text) {
  const t = String(text ?? '');
  const hasNumber = /\d/.test(t);
  const hasConcrete = CONCRETE_MARKERS.some((k) => t.includes(k));
  const startsVague = VAGUE_VERBS.some((v) => t.trim().startsWith(v));
  return !hasNumber && !hasConcrete && (startsVague || t.length < 10);
}
