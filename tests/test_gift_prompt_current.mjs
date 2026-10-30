import assert from 'node:assert/strict';import {runGiftCodes} from '../backend/wx-gift-codes.mjs';
for(const mode of ['success','expired','used','unknown','timeout','no-increase','replayed']){
 let count=0,stock=0,waits=0;const paused=new Set(),logs=[];const outcomes=[];
 const client={async request(req){if(req==='AllItemRequest')return{items:[{itemId:'木材',num:stock}]};if(req==='AllResourceRequest')return{list:[]};if(req==='GotGiftCodeRequest'){count++;if(mode==='timeout')throw Error('timeout');if(['expired','used','unknown'].includes(mode))throw{prompt:{prompt:mode}};if(mode!=='no-increase')stock+=3;return{reward:{asset:[{id:'木材',num:1},{id:'木材',num:2}]}};}throw Error(req)}};
 await runGiftCodes({client,settings:{script_gift_codes:[' A ','A','B']},protocol:{Prompt:{expired:'GIFT_CODE_EXPIRED',used:'GIFT_CODE_USED',unknown:'OTHER'}},paused,log:m=>logs.push(m),sleep:async ms=>{assert.equal(ms,2500);waits++},act:async(k,fn)=>{if(mode==='replayed')return;const x=await fn();outcomes.push(x);return x}});
 const uncertain=['unknown','timeout','no-increase'].includes(mode);assert.equal(count,mode==='replayed'?0:uncertain?1:2,mode);assert.equal(paused.has('gift-codes'),uncertain,mode);assert.equal(waits,count);if(mode==='success')assert.ok(outcomes.every(x=>x.status==='verified'));if(['expired','used'].includes(mode))assert.ok(outcomes.every(x=>x.status==='rejected'));
}
console.log('PASS gift codes: dedup, case-preserving input, known rejections, timeout/unknown isolation, duplicate reward aggregation, pacing, durable replay skip');

for(const [text,expected] of [['兑换码已过期','rejected'],['该礼包码已领取','rejected'],['兑换码不存在','rejected'],['请求过于频繁','unconfirmed'],['BUSINESS_BLOCKING','unconfirmed']]){
 let count=0;const outcomes=[];const client={request:async req=>{if(req==='AllItemRequest')return{items:[]};if(req==='AllResourceRequest')return{list:[]};count++;throw{prompt:{prompt:999,args:[text]}};}};
 await runGiftCodes({client,settings:{script_gift_codes:['A','B']},protocol:{Prompt:{}},act:async(k,fn)=>{const r=await fn();outcomes.push(r);return r},log:()=>{},sleep:async()=>{}});
 assert.equal(outcomes[0].status,expected,text);assert.equal(count,expected==='rejected'?2:1);assert.equal(outcomes[0].promptCode,999);assert.equal(outcomes[0].promptText,text);
}
console.log('PASS explicit expired/used/invalid text continues; unknown/rate-limit remains paused with diagnostics');
