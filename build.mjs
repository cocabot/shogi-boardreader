import {build} from 'esbuild';
import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
await rm('dist', {recursive:true, force:true});
await mkdir('dist/vendor/pdfjs', {recursive:true});
await build({entryPoints:['app.js'], bundle:true, format:'esm', target:['safari16'], outfile:'dist/app.js',
  external:['./vendor/pdfjs/*'], minify:true, legalComments:'linked'});
for (const file of ['index.html','styles.css','icon.svg','manifest.webmanifest']) await cp(file,`dist/${file}`);
for (const file of ['pdf.min.mjs','pdf.worker.min.mjs']) await cp(`node_modules/pdfjs-dist/legacy/build/${file}`,`dist/vendor/pdfjs/${file}`);
for (const dir of ['cmaps','standard_fonts','wasm']) await cp(`node_modules/pdfjs-dist/${dir}`,`dist/vendor/pdfjs/${dir}`,{recursive:true});
await cp('node_modules/pdfjs-dist/LICENSE','dist/vendor/pdfjs/LICENSE');
await cp('node_modules/tsshogi/LICENSE','dist/vendor/tsshogi-LICENSE');
await writeFile('dist/.nojekyll','');
console.log('Built static site with local PDF.js resources.');
