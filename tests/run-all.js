/*
 * run-all.js — 统一测试运行器
 * 逐个运行 tests/*.test.js，通过退出码判断成功/失败，汇总结果。
 * 用法：
 *   node tests/run-all.js            # 运行全部测试
 *   node tests/run-all.js --only xxx # 只运行文件名含 xxx 的测试
 */
'use strict';

var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var only = null;
process.argv.forEach(function (a, i) {
  if (a === '--only' && process.argv[i + 1]) only = process.argv[i + 1];
});

var testDir = __dirname;
var files = fs.readdirSync(testDir)
  .filter(function (f) { return /\.test\.js$/.test(f); })
  .sort();

if (only) {
  files = files.filter(function (f) { return f.indexOf(only) >= 0; });
  if (!files.length) {
    console.error('未找到匹配 --only "' + only + '" 的测试文件');
    process.exit(2);
  }
}

var passed = 0, failed = 0, failedFiles = [];
var totalAssertions = 0;

files.forEach(function (f) {
  var p = path.join(testDir, f);
  process.stdout.write('▶ ' + f + ' … ');
  var r;
  try {
    r = cp.spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 120000 });
  } catch (e) {
    failed++; failedFiles.push(f);
    console.log('运行异常: ' + e.message);
    return;
  }
  var out = (r.stdout || '') + (r.stderr || '');
  var ok = r.status === 0;
  if (ok) {
    passed++;
    // 提取断言数（最后一行 "X passed, Y failed" 或 "X 通过, Y 失败"）
    var m = out.match(/(\d+)\s+(?:passed|通过)/g);
    if (m && m.length) {
      var n = parseInt(m[m.length - 1].match(/\d+/)[0], 10);
      totalAssertions += n;
    }
    console.log('通过');
  } else {
    failed++; failedFiles.push(f);
    console.log('失败 (exit ' + r.status + ')');
    // 打印失败摘要（最后几行）
    var lines = out.trim().split('\n');
    console.log(lines.slice(-8).map(function (l) { return '    ' + l; }).join('\n'));
  }
});

console.log('\n========================================');
console.log('测试文件: ' + (passed + failed) + ' 个，通过 ' + passed + '，失败 ' + failed);
if (totalAssertions) console.log('断言合计: ' + totalAssertions + ' 项');
if (failedFiles.length) {
  console.log('失败文件:');
  failedFiles.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('>>> 全部测试通过 <<<');
  process.exit(0);
}
