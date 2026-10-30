import assert from 'node:assert/strict';
import {runGiftCodes,GIFT_CODES_PER_CYCLE} from '../backend/wx-gift-codes.mjs';
assert.equal(GIFT_CODES_PER_CYCLE,10);
const history=new Set(Array.from({length:12},(_,i)=>'gift:OLD'+i)),sent=[],logs=[];let stock=0;
const codes=[...Array.from({length:12},(_,i)=>'OLD'+i),...Array.from({length:25},(_,i)=>'NEW'+i)];
const client={request:async(req,body)=>{if(req==='AllItemRequest')return{items:[{itemId:'wood',num:stock}]};if(req==='AllResourceRequest')return{list:[]};assert.equal(req,'GotGiftCodeRequest');sent.push(body.giftCode);stock++;return{reward:{asset:[{id:'wood',num:1}]}};}};
const act=async(key,fn)=>{if(history.has(key))return;history.add(key);return fn();};
for(const expected of [10,20,25]){await runGiftCodes({client,settings:{script_gift_codes:codes},protocol:{Prompt:{}},act,log:m=>logs.push(m),sleep:async()=>{}});assert.equal(sent.length,expected);}
assert.equal(new Set(sent).size,25);assert.ok(sent.every(c=>c.startsWith('NEW')));
let uncertainCalls=0;const paused=new Set();
await runGiftCodes({client:{request:async req=>{if(req==='AllItemRequest')return{items:[]};if(req==='AllResourceRequest')return{list:[]};uncertainCalls++;throw Error('timeout');}},settings:{script_gift_codes:codes},protocol:{Prompt:{}},act:async(k,fn)=>fn(),log:()=>{},sleep:async()=>{},paused});
assert.equal(uncertainCalls,1);assert.equal(paused.has('gift-codes'),true);
console.log('PASS 10 new attempts per cycle, old attempts excluded, remaining 10/10/5 across cycles, no duplicates, uncertain result stops early');
