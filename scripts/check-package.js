#!/usr/bin/env node
/*
 * Catches the packaging mistakes that otherwise only surface when you run
 * electron-builder on a Mac: a file listed in build.files that no longer
 * exists, a renamed icon, a main entry point that moved.
 *
 * No dependencies - runs anywhere Node runs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

let failures = 0;

function check(ok, message) {
  if (ok) {
    console.log('  ✓ ' + message);
  } else {
    console.error('  ✗ ' + message);
    failures++;
  }
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

console.log('package.json');
check(!!pkg.name, 'name is set');
check(!!pkg.version && /^\d+\.\d+\.\d+/.test(pkg.version), 'version looks like semver (' + pkg.version + ')');
check(!!pkg.license, 'license is declared (' + pkg.license + ')');
check(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE file is present');

console.log('\nEntry points');
check(!!pkg.main && exists(pkg.main), 'main entry exists: ' + pkg.main);

console.log('\nelectron-builder configuration');
const build = pkg.build || {};
check(!!build.appId, 'appId is set (' + build.appId + ')');
check(!!build.productName, 'productName is set (' + build.productName + ')');

const files = build.files || [];
check(files.length > 0, 'build.files lists at least one file');
for (const entry of files) {
  // Only plain paths are verified; globs and negations are left alone.
  if (/[*!{}]/.test(entry)) continue;
  check(exists(entry), 'build.files entry exists: ' + entry);
}

if (!files.includes(pkg.main) && !files.some(function (f) { return /[*{}]/.test(f); })) {
  check(false, 'build.files must include the main entry (' + pkg.main + '), or the app will not start');
}

const buildResources = (build.directories && build.directories.buildResources) || 'build';
check(exists(buildResources), 'buildResources directory exists: ' + buildResources + '/');

const macIcon = build.mac && build.mac.icon;
if (macIcon) check(exists(macIcon), 'mac icon exists: ' + macIcon);

for (const assoc of build.fileAssociations || []) {
  check(Array.isArray(assoc.ext) && assoc.ext.length > 0, 'file association "' + assoc.name + '" lists extensions');
}

console.log('\nRenderer');
const html = files.filter(function (f) { return f.endsWith('.html'); });
check(html.length > 0, 'an HTML entry is packaged');
for (const f of html) {
  const source = fs.readFileSync(path.join(root, f), 'utf8');
  const remote = [...source.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(function (m) { return m[1]; });
  check(
    remote.length === 0,
    remote.length === 0
      ? f + ' loads nothing from the network (stays offline)'
      : f + ' pulls in remote resources, which breaks offline use: ' + remote.slice(0, 3).join(', ')
  );
}

if (failures) {
  console.error('\n' + failures + ' problem(s) found.');
  process.exit(1);
}
console.log('\nAll checks passed.');
