import {createHash} from 'node:crypto';
import {buildIcons} from './build-icons.mjs';
import {build} from 'esbuild';
import {cp, mkdir, rm, writeFile, readdir, readFile} from 'node:fs/promises';
await rm('dist', {recursive:true, force:true});
await mkdir('dist/vendor/pdfjs', {recursive:true});
await build({entryPoints:['app.js'], bundle:true, format:'esm', target:['safari16'], outfile:'dist/app.js',
  external:['./vendor/pdfjs/*'], minify:true, legalComments:'linked'});
for (const file of ['index.html','styles.css','icon.svg','manifest.webmanifest','offline.js']) await cp(file,`dist/${file}`);
for (const file of ['pdf.min.mjs','pdf.worker.min.mjs']) await cp(`node_modules/pdfjs-dist/legacy/build/${file}`,`dist/vendor/pdfjs/${file}`);
for (const dir of ['cmaps','standard_fonts','wasm']) await cp(`node_modules/pdfjs-dist/${dir}`,`dist/vendor/pdfjs/${dir}`,{recursive:true});
await cp('node_modules/pdfjs-dist/LICENSE','dist/vendor/pdfjs/LICENSE');
await cp('node_modules/tsshogi/LICENSE','dist/vendor/tsshogi-LICENSE');
await writeFile('dist/.nojekyll','');
console.log('Built static site with local PDF.js resources.');

await buildIcons();
async function listFiles(dir) {
  const entries = await readdir(dir, {withFileTypes:true});
  const paths = await Promise.all(entries.map(entry => entry.isDirectory() ? listFiles(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
  return paths.flat().sort();
}
const files = (await listFiles('dist')).filter(file => !file.split('/').some(part => part.startsWith('.')));
const template = await readFile('service-worker.js','utf8');
const hash = createHash('sha256').update(template);
for (const file of files) hash.update(file).update(await readFile(file));
const version = hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js', template.replace('__VERSION__',version).replace('__ASSETS__',JSON.stringify(files.map(file => './'+file.slice(5)))));
console.log(`Offline bundle ${version}: ${files.length} files`);
