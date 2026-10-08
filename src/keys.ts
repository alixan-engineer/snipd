// Explicit US physical layout. This is NOT the active compositor XKB layout.
const rows: [number,string,string][] = [
 [2,'1234567890-=','!@#$%^&*()_+'],[16,'qwertyuiop[]','QWERTYUIOP{}'],
 [30,"asdfghjkl;'",'ASDFGHJKL:"'],[44,'zxcvbnm,./','ZXCVBNM<>?'],[41,'`','~'],[43,'\\','|'],[57,' ',' ']
];
export const keymap = new Map<number,[string,string]>();
for (const [start,plain,shift] of rows) for(let i=0;i<plain.length;i++) keymap.set(start+i,[plain[i],shift[i]]);
export function encode(text:string): [number,number][] {
 const out: [number,number][]=[];
 for(const ch of text) {
  let found=false;
  for(const [code,pair] of keymap) { const index=pair.indexOf(ch); if(index<0) continue;
   if(index===1) out.push([42,1]); out.push([code,1],[code,0]); if(index===1) out.push([42,0]); found=true; break; }
  if(!found) throw new Error('Unsupported output character');
 }
 return out;
}
