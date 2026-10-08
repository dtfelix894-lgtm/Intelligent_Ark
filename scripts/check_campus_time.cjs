// Execute the actual TypeScript helper without introducing test dependencies.
const fs = require('fs');
const ts = require('../frontend/node_modules/typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('path').join(__dirname, '../frontend/src/lib/campus-companion.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const scope = { exports: {} };
new Function('exports', compiled)(scope.exports);
const { buildCampusTimeContext, buildCampusGreeting } = scope.exports;
const expected = ['exam_season','term_start','term_start','term_time','exam_season','exam_season','break','break','term_start','term_time','term_time','exam_season'];
let cases = 0;
for (let month = 0; month < 12; month++) {
  for (const hour of [0,4,5,7,8,11,12,13,14,17,18,21,22,23]) {
    const date = new Date(2026, month, 15, hour);
    assert.equal(buildCampusTimeContext(date).phase, expected[month]);
    const greeting = buildCampusGreeting(date, 'senior_sister');
    assert.ok(greeting.eyebrow.includes('月份推测'));
    assert.ok(greeting.description.includes('未接入个人课表或学校校历'));
    assert.ok(!greeting.eyebrow.includes('闭馆后'));
    assert.ok(!greeting.title.includes('考试周很卷'));
    cases++;
  }
}
console.log(`Passed ${cases} month/hour boundary combinations`);
