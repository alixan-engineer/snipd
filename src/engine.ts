import { keymap } from './keys.ts';
import type { Config } from './config.ts';
const modifiers = new Set([29,97,56,100,125,126]);
export class Engine {
 private buffer=''; private pressed=new Set<number>(); private last=0;
 private pending: {erase:number;text:string}|undefined;
 private paused=false;
 private caps=false;
 public config: Config;
 constructor(config:Config) { this.config=config; }
 reset() { this.buffer=''; this.pending=undefined; }
 feed(code:number,value:number,now=Date.now()): {erase:number;text:string}|undefined {
  if(value===0) {
   this.pressed.delete(code);
   if(this.pressed.size===0 && this.pending) {const result=this.pending;this.reset();return result;}
   return;
  }
  if(value!==1 && value!==2) {this.reset();return;}
  this.pressed.add(code);
  if(code===58 && value===1) {this.caps=!this.caps;this.reset();return;}
  if(code===88 && value===1) {this.paused=!this.paused;this.reset();return;} // F12
  if(!this.config.enabled || this.paused || this.caps) {this.reset();return;}
  if(now-this.last>this.config.idleMs) this.reset(); this.last=now;
  if(modifiers.has(code)) {this.reset();return;}
  if(code===42 || code===54) return;
  if([...this.pressed].some(k=>modifiers.has(k))) {this.reset();return;}
  if(this.pending) this.reset();
  if(code===14) {this.buffer=this.buffer.slice(0,-1);return;}
  const pair=keymap.get(code);
  if(!pair || code===58) {this.reset();return;}
  const ch=pair[this.pressed.has(42)||this.pressed.has(54)?1:0];
  if(ch===':') this.buffer=':';
  else if(this.buffer && /^[a-z0-9_]$/.test(ch)) this.buffer+=ch;
  else this.reset();
  if(this.buffer.length>65) this.reset();
  const text=this.config.matches[this.buffer];
  if(Object.hasOwn(this.config.matches,this.buffer)) this.pending={erase:this.buffer.length,text};
 }
}
