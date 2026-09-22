import {deflateSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));
  return Buffer.concat([length,tag,data,crc]);
}
export async function buildIcons() {
  for (const size of [180,192,512]) {
    const pixels = Buffer.alloc((size*3+1)*size);
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const u=x/size, v=y/size;
      let color=[35,45,41];
      // A wooden shogi piece and a clear 王 mark, inside the maskable safe area.
      if (v>=.18 && v<=.81 && Math.abs(u-.5)<Math.min((v-.18)*1.9,.19+(v-.28)*.12)) color=[226,187,122];
      if (((v>.36&&v<.40&&u>.38&&u<.62)||(v>.51&&v<.55&&u>.38&&u<.62)||(v>.68&&v<.72&&u>.35&&u<.65)||(u>.48&&u<.52&&v>.38&&v<.7))) color=[42,38,27];
      const offset=y*(size*3+1)+1+x*3;
      pixels.set(color,offset);
    }
    const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
    await writeFile(`dist/icon-${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
  }
}
