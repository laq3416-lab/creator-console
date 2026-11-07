/**
 * 扫码登录（支持多平台）
 *
 * 用法：node scripts/login.mjs [douyin|xhs|xianyu]
 * 不传参数默认抖音。
 */
import { launch } from './lib/browser.mjs';
import { hasLogin, profileDir } from './lib/paths.mjs';

const TARGETS = {
  douyin: { name: '抖音创作者中心', url: 'https://creator.douyin.com/' },
  xhs: { name: '小红书（网页版，私信在这里）', url: 'https://www.xiaohongshu.com/' },
  xianyu: { name: '闲鱼', url: 'https://www.goofish.com/' },
  xygj: { name: '闲管家（闲鱼商家工作台）', url: 'https://www.goofish.pro/' },
};

const platform = process.argv[2] || 'douyin';
const target = TARGETS[platform];

if (!target) {
  console.error(`未知平台：${platform}。可选：${Object.keys(TARGETS).join(' / ')}`);
  process.exit(1);
}

const TIMEOUT_MIN = Number(process.env.LOGIN_TIMEOUT_MIN || 15);
const { ctx, channel } = await launch({ headless: false, platform });

console.log(`浏览器已启动（${channel}）· ${target.name}`);
console.log(`Profile: ${profileDir(platform)}`);
console.log('');

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(target.url, { waitUntil: 'domcontentloaded' }).catch(() => {});

console.log(`已打开 ${target.url}`);
console.log('请在窗口里扫码登录。');
console.log(`最多等 ${TIMEOUT_MIN} 分钟，登录成功后会自动关闭窗口。\n`);

const deadline = Date.now() + TIMEOUT_MIN * 60_000;
let ok = false;

while (Date.now() < deadline) {
  if (await hasLogin(platform)) {
    ok = true;
    break;
  }
  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, 3000));
}

console.log('');
if (ok) {
  await new Promise((r) => setTimeout(r, 2500));
  console.log(`✅ ${target.name} 登录成功，登录态已保存。`);
} else {
  console.log(`❌ 超时，没检测到 ${target.name} 的登录态。`);
  console.log('   可能原因：没扫码 / 扫的是别的号 / 页面被风控要求验证。');
}

await ctx.close();
process.exit(ok ? 0 : 1);
