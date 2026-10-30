import assert from 'node:assert/strict';
import {runShops}from'../backend/wx-shops.mjs';
async function test({vipLevel=3,grant=true,credit=true,counter=true,used=0,max=1,on=true}={}){
 let count=used,wood=0,granted=false,calls=[],results=[],logs=[];const paused=new Set();
 const client={connected:true,request:async(req)=>{
 if(req==='AdvShopInfoRequest')return{product:[{id:9,asset:{id:'wood',num:5},gotTimes:count,max,reward:granted}]};
 if(req==='AllItemRequest')return{items:[{itemId:'wood',num:wood}]};
 if(req==='AllResourceRequest')return{list:[{res:4,amount:100}]};
 if(req==='GotAdvRewardRequest'){calls.push(req);if(credit)wood+=5;if(counter)count++;return{reward:{asset:[{id:'wood',num:5}]}};}
 throw Error(req);
 },sendWatch:async(req,body)=>{assert.equal(req,'WatchAdvRequest');assert.deepEqual(body,{type:2,id:9});calls.push(req);granted=grant;}};
 const args={client,protocol:{AdvType:{ADV_SHOP:2}},settings:{ref_shop_enabled:true,ref_shop_advertisement:on},state:{vipLevel},act:async(k,fn)=>{const r=await fn();results.push(r);return r},log:m=>logs.push(m),paused,sleep:async()=>{}};
 await runShops(args);if(paused.has('shop:advertisement'))await runShops(args);return{calls,results,logs,paused};
}
assert.equal((await test()).results[0].status,'verified');
for(const opts of [{vipLevel:1},{used:1},{on:false}])assert.equal((await test(opts)).calls.length,0);
let r=await test({grant:false});assert.deepEqual(r.calls,['WatchAdvRequest']);assert.equal(r.results[0].status,'unconfirmed');assert.ok(r.paused.has('shop:advertisement'));
for(const opts of [{credit:false},{counter:false}]){r=await test(opts);assert.equal(r.results[0].status,'unconfirmed');assert.equal(r.calls.filter(x=>x==='GotAdvRewardRequest').length,1);}
console.log('PASS ad shop entitlement, grant prerequisite, count AND inventory, daily cap, no uncertain resend');
