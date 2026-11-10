// Fails unless the app version agrees in package.json, tauri.conf.json and src-tauri/Cargo.toml.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cargo = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const found = {
  'package.json': JSON.parse(read('package.json')).version,
  'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
  'src-tauri/Cargo.toml': cargo,
};
const versions = new Set(Object.values(found));
if (versions.size !== 1 || versions.has(undefined)) {
  console.error('Version mismatch:', found);
  process.exit(1);
}
console.log([...versions][0]);
