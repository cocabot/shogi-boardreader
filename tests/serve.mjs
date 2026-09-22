import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/shogi-boardreader/')){res.writeHead(404).end();return;}
 const relative=decodeURIComponent(url.pathname.slice('/shogi-boardreader/'.length)) || 'index.html';
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{const body=await readFile(file);res.setHeader('Content-Type',({'html':'text/html','js':'text/javascript','mjs':'text/javascript','css':'text/css','wasm':'application/wasm','svg':'image/svg+xml'})[file.split('.').pop()]||'application/octet-stream');res.end(body);}
 catch{res.writeHead(404).end();}
}).listen(8000,'0.0.0.0');
