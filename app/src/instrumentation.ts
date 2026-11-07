/**
 * Next 启动时执行一次。
 * 作用：应用一起来，监控就跟着起来，不用另开终端敲 npm run watch。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ensureWatcher } = await import('./lib/watcher-boot');
  ensureWatcher();
}
