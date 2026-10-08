#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { watch, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.ts';
import { Engine } from './engine.ts';
import { encode } from './keys.ts';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const configPath=join(process.env.XDG_CONFIG_HOME || join(process.env.HOME! ,'.config'),'snipd/config.json');
const command=process.argv[2] || 'help';
if(['start','stop','restart','status'].includes(command)) {
 const child=spawn('systemctl',['--user',command,'snipd.service'],{stdio:'inherit'});
 child.on('error',()=>process.exit(1));child.on('exit',code=>process.exit(code ?? 1));
} else if(command==='config') console.log(configPath);
else if(command==='init') {
 mkdirSync(dirname(configPath),{recursive:true,mode:0o700});
 if(!existsSync(configPath)) copyFileSync(join(root,'examples/config.json'),configPath,1);
 console.log(configPath);
} else if(command==='check') {
 try {readConfig(configPath);console.log('Configuration valid');} catch {console.error('Invalid configuration');process.exitCode=1;}
} else if(command==='run') await run().catch(()=>{console.error('snipd: startup failed; check configuration and session dependencies');process.exit(1);});
else console.log('snipd init | check | config | start | stop | restart | status | run');
async function run() {
 if(process.getuid?.()===0) throw new Error('Do not run snipd as root');
 const engine=new Engine(readConfig(configPath));
 let helper: ReturnType<typeof spawn>|undefined;
 let exiting=false,locked=true,checking=false;
 const stopHelper=()=>{engine.reset();helper?.kill('SIGTERM');};
 const startHelper=()=>{
  if(exiting || locked || helper || !engine.config.enabled) return;
  helper=spawn(join(root,'native/snipd-input'),[engine.config.device],{stdio:['pipe','pipe','inherit']});
  const current=helper;
  const lines=createInterface({input:current.stdout!});
  let queue=Promise.resolve();
  lines.on('line',line=>{
   queue=queue.then(async()=>{
    if(exiting || current!==helper) return;
    const [code,value]=line.split(' ').map(Number);
    if(!Number.isInteger(code)||!Number.isInteger(value)) throw new Error('Invalid helper event');
    const result=locked?undefined:engine.feed(code,value);
    let response='F';
    if(result) {
     let keys: [number,number][];
     if(engine.config.mode==='keys' || result.text==='') keys=encode(result.text);
     else {
      await clipboard(result.text);
      if(locked || !engine.config.enabled || current!==helper) return;
      keys=engine.config.paste==='ctrl-shift-v'?[[29,1],[42,1],[47,1],[47,0],[42,0],[29,0]]:[[29,1],[47,1],[47,0],[29,0]];
     }
     response=`R ${result.erase} ${keys.length} `+keys.map(k=>k.join(' ')).join(' ')+(keys.length?' ':'');
    }
    current.stdin!.write(response+'\n');
   }).catch(()=>{console.error('snipd: input operation failed; keyboard released');stopHelper();});
  });
  current.on('error',()=>{console.error('snipd: helper unavailable');shutdown(1);});
  current.on('exit',()=>{
   lines.close();if(helper===current) helper=undefined;
   // Exit instead of repeatedly grabbing a failing device. systemd retries.
   if(!exiting && !locked && engine.config.enabled) shutdown(1);
  });
 };
 const reload=()=>{
  try {const next=readConfig(configPath);const previous=engine.config;
   engine.config=next;engine.reset();
   if(next.device!==previous.device) {shutdown(1);return;}
   if(!next.enabled) stopHelper();else startHelper();
   console.log('snipd: configuration reloaded');
  } catch {console.error('snipd: invalid configuration; keeping previous settings');}
 };
 let timer: ReturnType<typeof setTimeout>;
 const watcher=watch(dirname(configPath),()=>{clearTimeout(timer);timer=setTimeout(reload,150);});
 // GNOME lock signals plus reconciliation. Never enable when lock state cannot be verified.
 const monitor=spawn('dbus-monitor',['--session',"type='signal',interface='org.gnome.ScreenSaver',member='ActiveChanged',path='/org/gnome/ScreenSaver'"],{stdio:['ignore','pipe','ignore']});
 const signals=createInterface({input:monitor.stdout!});
 signals.on('line',line=>{if(line.trim()==='boolean true') {locked=true;stopHelper();}});
 monitor.on('error',()=>shutdown(1));monitor.on('exit',()=>{if(!exiting) shutdown(1);});
 const checkLock=()=>{
  if(checking||exiting) return;checking=true;
  const child=spawn('gdbus',['call','--session','--dest','org.gnome.ScreenSaver','--object-path','/org/gnome/ScreenSaver','--method','org.gnome.ScreenSaver.GetActive'],{stdio:['ignore','pipe','ignore']});
  let output=''; child.stdout!.on('data',data=>{output+=data;});
  const timeout=setTimeout(()=>child.kill(),800);
  child.on('error',()=>{locked=true;stopHelper();});
  child.on('close',code=>{
   clearTimeout(timeout);checking=false;
   locked=code!==0 || output.trim()!=='(false,)';
   if(locked) stopHelper();else startHelper();
  });
 };
 const poll=setInterval(checkLock,1000);
 function shutdown(code:number) {
  if(exiting) return;exiting=true;clearInterval(poll);clearTimeout(timer);watcher.close();signals.close();monitor.kill();stopHelper();
  setTimeout(()=>process.exit(code),100).unref();
 }
 process.on('SIGTERM',()=>shutdown(0));process.on('SIGINT',()=>shutdown(0));process.on('SIGHUP',reload);
 checkLock();console.log('snipd: waiting for unlocked GNOME session');
}
function clipboard(text:string):Promise<void> {
 return new Promise((resolve,reject)=>{
  // --paste-once minimizes clipboard exposure, but clipboard managers may retain text.
  const child=spawn('wl-copy',['--paste-once','--type','text/plain;charset=utf-8'],{stdio:['pipe','ignore','ignore']});
  const timer=setTimeout(()=>{child.kill();reject(new Error('Clipboard timeout'));},1000);
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Clipboard unavailable'));});
  child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Clipboard failed'));});
  child.stdin!.on('error',()=>{});child.stdin!.end(text);
 });
}
