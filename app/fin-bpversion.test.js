// fin-bpversion.test.js — 验证「工作底稿口径」选择器驱动 BP 取数。
// 真实场景: BP 表同时有 代表处工作底稿 / 地区部工作底稿 两套版本。
// 视图把所选口径作为 bpVersion 传给 financeOverview/ProductBoard/RepBoard。
// 期望: bpVersion=代表处工作底稿 → 取代表处那套BP; =地区部工作底稿 → 取地区部那套; 默认=代表处工作底稿。
const os = require('os'), fs = require('fs'), path = require('path');
const { Engine } = require('../engine-core'); require('../engine-finance');
let f = 0;
const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  <<< ' + JSON.stringify(d))); if (!c) f++; };
const near = (a, b, e) => a != null && b != null && Math.abs(a - b) <= (e || 1e-6);

const e = new Engine(fs.mkdtempSync(path.join(os.tmpdir(), 'bpv-')));
const fin = [];
// 实际(13元素,无版本): 2026 1~3月 净销售收入 → rev26=300000, curYear=2026
const A = (metric, ym, v) => fin.push(['A', 'ACME', '拉美地区部', '巴西代表处', '巴西', '平板', '平板', 'Slate Pro', 'Tarvos', metric, 1110, ym, v]);
// BP(14元素,末位版本): 全年12月 净销售收入
const B = (metric, ym, v, ver) => fin.push(['B', '', '拉美地区部', '巴西代表处', '', '平板', '平板', 'Slate Pro', 'Tarvos', metric, 0, ym, v, ver]);
for (let m = 1; m <= 12; m++) {
  if (m <= 3) A('净销售收入', 2026 * 100 + m, 100000);
  B('净销售收入', 2026 * 100 + m, 100, '代表处工作底稿');   // 代表处 BP 全年 = 1200
  B('净销售收入', 2026 * 100 + m, 90, '地区部工作底稿');     // 地区部 BP 全年 = 1080
}
e._buildFin(fin);
ok('bpVersions 两套都在', JSON.stringify(e.finMeta.bpVersions) === JSON.stringify(['代表处工作底稿', '地区部工作底稿'].sort()), e.finMeta.bpVersions);

const U = { actual: 'USD', forecast: 'USD', bp: 'USD' }, Q = { actual: '台', forecast: '台', bp: '台' };
const ovRep = e.financeOverview({ year: 2026, fromM: 1, toM: 3, bpVersion: '代表处工作底稿', finUnits: U, finQtyUnits: Q });
const ovReg = e.financeOverview({ year: 2026, fromM: 1, toM: 3, bpVersion: '地区部工作底稿', finUnits: U, finQtyUnits: Q });
const ovDef = e.financeOverview({ year: 2026, fromM: 1, toM: 3, finUnits: U, finQtyUnits: Q });

ok('代表处工作底稿: 全年BP=1200', near(ovRep.metrics.rev.bp, 1200), ovRep.metrics.rev.bp);
ok('地区部工作底稿: 全年BP=1080', near(ovReg.metrics.rev.bp, 1080), ovReg.metrics.rev.bp);
ok('两口径BP不同(选择器确实生效)', !near(ovRep.metrics.rev.bp, ovReg.metrics.rev.bp), { rep: ovRep.metrics.rev.bp, reg: ovReg.metrics.rev.bp });
ok('默认=代表处工作底稿(=1200)', near(ovDef.metrics.rev.bp, 1200), ovDef.metrics.rev.bp);
// BP达成率随口径变: act=300000, 代表处达成=300000/1200, 地区部=300000/1080
ok('代表处 BP达成率=250', near(ovRep.metrics.rev.bpAttain, 250), ovRep.metrics.rev.bpAttain);
ok('地区部 BP达成率≈277.78', near(ovReg.metrics.rev.bpAttain, 300000 / 1080, 1e-3), ovReg.metrics.rev.bpAttain);

console.log(f === 0 ? 'ALL PASS' : ('FAILED ' + f));
if (f) process.exitCode = 1;
