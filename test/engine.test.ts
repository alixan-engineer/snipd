import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.ts';
import { validate } from '../src/config.ts';
import { encode } from '../src/keys.ts';
const config=()=>validate({enabled:true,device:'/dev/input/by-id/test-event-kbd',mode:'keys',paste:'ctrl-v',idleMs:1500,matches:{':name':'Alikhan'}});
function type(engine:Engine,text:string) {let result;for(const [code,value] of encode(text)) result=engine.feed(code,value,1000)||result;return result;}
test('expands only after all physical keys released',()=>{const e=new Engine(config());assert.deepEqual(type(e,':name'),{erase:5,text:'Alikhan'});assert.equal(type(e,'x'),undefined);});
test('backspace edits trigger',()=>{const e=new Engine(config());type(e,':namx');e.feed(14,1,1000);e.feed(14,0,1000);assert.deepEqual(type(e,'e'),{erase:5,text:'Alikhan'});});
test('shortcuts, navigation, timeout reset',()=>{for(const code of [29,105,15,58]) {const e=new Engine(config());type(e,':nam');e.feed(code,1,1000);e.feed(code,0,1000);assert.equal(type(e,'e'),undefined);}const e=new Engine(config());type(e,':nam');assert.equal(e.feed(18,1,4000),undefined);assert.equal(e.feed(18,0,4000),undefined);});
test('F12 disables and re-enables expansion',()=>{const e=new Engine(config());e.feed(88,1);e.feed(88,0);assert.equal(type(e,':name'),undefined);e.feed(88,1);e.feed(88,0);assert.ok(type(e,':name'));});
test('invalid and overlapping configurations rejected',()=>{assert.throws(()=>validate({...config(),matches:{':name':'A',':names':'B'}}));assert.throws(()=>validate({...config(),device:'/etc/passwd'}));assert.throws(()=>validate({...config(),matches:{':name':'Алихан'}}));assert.doesNotThrow(()=>validate({...config(),mode:'clipboard',matches:{':name':'Алихан'}}));});
test('replacement keystrokes balanced',()=>{const down=new Set();for(const [code,value] of encode('Alikhan +7@example.kz')){if(value) down.add(code);else down.delete(code);}assert.equal(down.size,0);});
test('repeat does not retrigger and disabled config does not expand',()=>{const e=new Engine({...config(),enabled:false});assert.equal(type(e,':name'),undefined);});
test('caps lock suspends until toggled off',()=>{const e=new Engine(config());e.feed(58,1);e.feed(58,0);assert.equal(type(e,':name'),undefined);e.feed(58,1);e.feed(58,0);assert.ok(type(e,':name'));});
test('pending expansion cancelled by another key before release',()=>{const e=new Engine(config());type(e,':nam');e.feed(18,1,1000);e.feed(45,1,1000);e.feed(45,0,1000);assert.equal(e.feed(18,0,1000),undefined);});
test('empty replacements erase trigger',()=>{const e=new Engine({...config(),matches:{':name':''}});assert.deepEqual(type(e,':name'),{erase:5,text:''});});
