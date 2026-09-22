import {cp} from 'node:fs/promises';
export async function buildIcons() {
  for (const size of [180,192,512]) {
    await cp(`icons/modern-${size}.png`, `dist/icon-modern-${size}.png`);
  }
}
