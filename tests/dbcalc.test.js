/*
 * dbcalc.test.js - Acoustic unit & level conversion kernel (node tests/dbcalc.test.js)
 */
var D = require('../public/js/dbcalc.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.02 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(4)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (+-' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

console.log('Level energy sum / subtract');
approx('two 80 dB -> 83.01', D.energySum([80, 80]), 83.01);
approx('90+80 -> 90.41', D.energySum([90, 80]), 90.41);
approx('three 70 -> 74.77', D.energySum([70, 70, 70]), 74.77);
approx('addLevels(80,80)', D.addLevels(80, 80), 83.01);
approx('subtractLevels(85,80) -> 83.35', D.subtractLevels(85, 80), 83.35, 0.05);
approx('subtractLevels(82,80) -> 77.67', D.subtractLevels(82, 80), 77.67, 0.05);
assert('subtractLevels(80,80) -> null', D.subtractLevels(80, 80) === null);
assert('subtractLevels(78,80) -> null', D.subtractLevels(78, 80) === null);
approx('deltaAdd(0) -> 3.01', D.deltaAdd(0), 3.0103, 0.01);
approx('deltaAdd(10) -> 0.414', D.deltaAdd(10), 0.4140, 0.01);

console.log('Unit conversions');
approx('splToPressure(94) ~ 1.002 Pa', D.splToPressure(94), 1.0024, 0.001);
approx('pressureToSpl(1.0024) ~ 94', D.pressureToSpl(1.0024), 94, 0.05);
approx('intensityToLevel(1e-6) = 60', D.intensityToLevel(1e-6), 60);
approx('levelToIntensity(60) = 1e-6', D.levelToIntensity(60), 1e-6, 1e-9);
approx('powerToLevel(1) = 120', D.powerToLevel(1), 120);
approx('levelToPower(120) = 1 W', D.levelToPower(120), 1, 1e-9);

console.log('Distance attenuation');
approx('pointSourceLp(100,1,1) -> 89.01', D.pointSourceLp(100, 1, 1), 89.011, 0.01);
approx('pointSourceLp(100,2,1) -> 82.99', D.pointSourceLp(100, 2, 1), 82.989, 0.01);
approx('pointSourceLp(100,1,2) -> 92.02', D.pointSourceLp(100, 1, 2), 92.020, 0.01);
approx('distanceAttenPoint(90,1,2) -> 83.98', D.distanceAttenPoint(90, 1, 2), 83.979, 0.01);
approx('distanceAttenLine(90,1,2) -> 86.99', D.distanceAttenLine(90, 1, 2), 86.989, 0.01);
var pl1 = D.distanceAttenPlane(90, 1, 2, 1);
assert('plane far regime', pl1.regime === 'far');
approx('plane far L2 -> 83.98', pl1.L2, 83.979, 0.01);
var pl2 = D.distanceAttenPlane(90, 0.1, 0.2, 10);
assert('plane near regime', pl2.regime === 'near');
approx('plane near L2 = 90', pl2.L2, 90, 0.01);

console.log('Octave synthesis & weighting table');
var third = D.THIRD.map(function () { return null; });
third[18] = 80; // 1000 Hz band
var oct = D.octaveFromThird(third);
approx('single 1/3 band 80 -> octave 1000 = 80', oct[6], 80, 0.01);
assert('other octave bands null', oct[0] === null && oct[3] === null);
var third2 = D.THIRD.map(function () { return null; });
third2[17] = 90; third2[18] = 90; third2[19] = 90; // 800,1000,1250 Hz
var oct2 = D.octaveFromThird(third2);
approx('800+1000+1250 all 90 -> octave 1000 = 94.77', oct2[6], 94.771, 0.01);
assert('WEIGHT A@1000 = 0', D.WEIGHT.A[6] === 0);
assert('WEIGHT length 11', D.WEIGHT.freq.length === 11);

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
