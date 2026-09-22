import {cp} from 'node:fs/promises';
export async function buildIcons() {
  for (const size of [180,192,512]) {
    // Cached HTML and existing Web Clips can still reference previous filenames.
    for (const name of [`icon-book-${size}.png`, `icon-modern-${size}.png`, `icon-${size}.png`]) {
      await cp(`icons/book-${size}.png`, `dist/${name}`);
    }
  }
  await cp('icons/book-180.png','dist/apple-touch-icon.png');
  await cp('icons/book-180.png','dist/apple-touch-icon-precomposed.png');
}
