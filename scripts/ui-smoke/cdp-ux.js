/* 引导层 UI 实测：首页任务卡 / 「？」浮层 / Ctrl+K 命令面板 / 首启进首页 —— 真实渲染层断言 + 截图 */
'use strict';
const fs = require('fs'); const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
(async () => {
  let target = null;
  for (let i = 0; i < 30 && !target; i++) { try { const list = await (await fetch('http://127.0.0.1:9224/json')).json(); target = list.find(t => t.type === 'page' && /index\.html/.test(t.url || '')); } catch (e) {} if (!target) await sleep(1000); }
  if (!target) { console.log('FAIL 连不上 CDP'); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let mid = 0; const pend = new Map();
  ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: ++mid, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } catch (e) {} };
  const send = (method, params) => new Promise((res) => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return { err: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || '').slice(0, 300) }; return { v: r.result && r.result.result && r.result.result.value }; };
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); if (s.result && s.result.data) fs.writeFileSync(path.join(__dirname, name), Buffer.from(s.result.data, 'base64')); };
  await new Promise(r => { ws.onopen = r; });
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 30; i++) { const r = await ev("!!(window.UxGuide && typeof switchView==='function')"); if (r.v === true) break; await sleep(1000); }
  // 模拟首次启动：清计数后重新 boot（切到首页）
  await ev("localStorage.removeItem('sb.ui.homeSeen'); localStorage.removeItem('sb.ui.lastView'); switchView('home'); 1"); await sleep(800);
  await ev("(function(){ const l=document.getElementById('loading'); if(l) l.classList.add('hidden'); return 1; })()");
  const home = await ev("JSON.stringify({active: !!document.querySelector('#view-home.active'), cards: document.querySelectorAll('#view-home .ux-card').length, steps: document.querySelectorAll('#view-home .ux-step').length, navHome: !!document.querySelector('.nav-item[data-view=\"home\"]'), guideBtn: !!document.getElementById('btnGuide'), title: (document.getElementById('viewTitle')||{}).textContent})");
  console.log('首页: ' + home.v);
  let h = {}; try { h = JSON.parse(home.v); } catch (e) {}
  ok('首页视图激活', h.active === true);
  ok('12 张任务卡', h.cards === 12);
  ok('三步上手', h.steps === 3);
  ok('侧栏有「首页」项', h.navHome === true);
  ok('顶栏有「?」按钮', h.guideBtn === true);
  await shot('ui-ux-home.png');
  // 任务卡直达
  await ev("[...document.querySelectorAll('#view-home .ux-card')].find(c=>/路标/.test(c.textContent)).click(); 1"); await sleep(1200);
  const v1 = await ev("!!document.querySelector('#view-roadmap.active')");
  ok('点「管产品路标」卡片直达路标看板', v1.v === true);
  // 「?」浮层
  await ev("document.getElementById('btnGuide').click(); 1"); await sleep(400);
  const popTxt = await ev("(document.querySelector('.ux-pop')||{}).innerText || ''");
  ok('「?」浮层出现且含三句话', /看什么/.test(popTxt.v || '') && /先做什么/.test(popTxt.v || '') && /常用操作/.test(popTxt.v || ''));
  await shot('ui-ux-pop.png');
  await ev("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1"); await sleep(200);
  // Ctrl+K 命令面板
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})); 1"); await sleep(400);
  const palOpen = await ev("!!document.querySelector('.ux-pal')");
  ok('Ctrl+K 打开命令面板', palOpen.v === true);
  await ev("(function(){ const i=document.getElementById('uxPalIn'); i.value='周报'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()"); await sleep(200);
  const first = await ev("(document.querySelector('#uxPalList .it.on .n')||{}).textContent || ''");
  ok('输入「周报」首项是产业周报', /周报/.test(first.v || ''));
  await shot('ui-ux-palette.png');
  await ev("document.getElementById('uxPalIn').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); 1"); await sleep(1200);
  const v2 = await ev("!!document.querySelector('#view-audio.active')");
  ok('Enter 直达产业周报看板', v2.v === true);
  // 自然语言 → 问 AI 选项存在
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})); 1"); await sleep(300);
  await ev("(function(){ const i=document.getElementById('uxPalIn'); i.value='墨西哥平板今年卖了多少'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()"); await sleep(200);
  const aiOpt = await ev("[...document.querySelectorAll('#uxPalList .it .n')].map(n=>n.textContent).join('|')");
  ok('自然语言出现「问 AI：…」选项', /问 AI：墨西哥/.test(aiOpt.v || ''));
  await ev("document.getElementById('uxPalIn').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1");
  // 路标图工具栏文案已去黑话
  await ev("switchView('roadmap'); 1"); await sleep(800);
  await ev("(function(){ const b=document.getElementById('rmViewChart'); if(b) b.click(); return 1; })()"); await sleep(600);
  const tb = await ev("(document.getElementById('rmChartTools')||{}).innerText || ''");
  ok('路标工具栏文案：价格轴/按型号拆开/卡片样式/缺价用FOB估算', /价格轴/.test(tb.v || '') && /按型号拆开/.test(tb.v || '') && /卡片样式/.test(tb.v || '') && /缺价用 FOB 估算/.test(tb.v || ''));
  ws.close(); console.log(fails ? ('FAILURES: ' + fails) : '===== 引导层 UI ALL PASS ====='); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL 异常: ' + e.message); process.exit(1); });
