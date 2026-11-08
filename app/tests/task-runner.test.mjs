import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChild } from '../scripts/lib/task-runner.mjs';

test('正常任务记录输出和成功状态', async () => {
  const r = await runChild('-e', ['console.log("completed")'], { timeoutMs: 3000 });
  assert.equal(r.ok, true);
  assert.match(r.output, /completed/);
});

test('异常退出不会标为成功', async () => {
  const r = await runChild('-e', ['console.error("bad"); process.exit(2)'], { timeoutMs: 3000 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 2);
});

test('卡住的任务会超时并标为失败', async () => {
  const start = Date.now();
  const r = await runChild('-e', ['setInterval(() => {}, 1000)'], { timeoutMs: 200, graceMs: 100 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.match(r.output, /已停止/);
  assert.ok(Date.now() - start < 5000);
});
