import assert from 'node:assert/strict';
import {runDiving,runDivingGuarded} from '../backend/wx-diving.mjs';
const cfg={DiveParamCfg:{data:[{paramName:'自动潜水',paramValue:2}]},DiveItemsDefinitionCfg:{data:['玻璃','金属','海藻'].map(id=>({type:'拾取',produce:[id,1]}))},BuildingUnlockCfg:{data:[{buildingId:'仓库',buildingType:'仓库'}]},BuildingUpgradeCfg:{data:[{buildingType:'仓库',level:1,effect:[['资源储量上限',100]]}]}};
async function test({off=false,level=2,full=false,reject=false,reward=true,increase=true,late=false}={}){
 let items={'玻璃':full?100:0,'金属':100,'海藻':100},sent=0,waits=0,result;const paused=new Set();
 const client={connected:true,request:async(name,body)=>{
 if(name==='OnWaterRequest')return{divingLevel:{level},building:[{buildingId:'1潜水船',level:1},{buildingId:'仓库',level:1}]};
 if(name==='AllItemRequest')return{items:Object.entries(items).map(([itemId,num])=>({itemId,num}))};
 if(name==='DivingRequest'){sent++;assert.deepEqual(body,{reward:{asset:[{type:0,id:'玻璃',num:1}]}});if(reject)throw{prompt:{prompt:99}};if(increase&&!late)items.玻璃++;return{reward:{asset:reward?[{id:'玻璃',num:1}]:[]}};}throw Error(name);
 }};
 const args={client,protocol:{DisplayAssetType:{ITEM:0},Prompt:{}},settings:{gather_4:!off,ref_gather_diving_batchSize:1},config:cfg,paused,log:()=>{},sleep:async()=>{waits++;if(late&&waits===1&&increase)items.玻璃++;},act:async(k,fn)=>{result=await fn();return result}};
 await runDivingGuarded(args);if(paused.size)await runDivingGuarded(args);return {sent,result,paused};
}
assert.equal((await test()).result.status,'verified');assert.equal((await test({late:true})).result.status,'verified');
for(const a of [{off:true},{level:1},{full:true}])assert.equal((await test(a)).sent,0);
for(const a of [{reward:false},{increase:false}]){const r=await test(a);assert.equal(r.result.status,'unconfirmed');assert.equal(r.sent,1);assert.ok(r.paused.has('diving'));}
const r=await test({reject:true});assert.equal(r.result.status,'rejected');assert.equal(r.sent,1);
console.log('PASS diving trial: explicit toggle, unlock, cap, expected reward AND inventory, delayed readback, reject/uncertainty pause without resend');
