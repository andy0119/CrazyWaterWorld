import assert from 'node:assert/strict';
import {runGather} from '../backend/wx-gather.mjs';
async function scenario(glassLow){
 const state={},batches=[],logs=[],floaters=Array.from({length:25},(_,i)=>({floaterId:'f'+i,num:1}));
 const config={GarbageProductionCfg:{data:floaters.map((f,i)=>({id:f.floaterId,type:'拾取',production:[i===24?'玻璃':'木材',1]}))},BuildingUnlockCfg:{data:[{buildingId:'仓',buildingType:'仓库'}]},BuildingUpgradeCfg:{data:[{buildingType:'仓库',level:1,effect:[['资源储量上限',10]]}]}};
 const client={request:async(name,body)=>{
 if(name==='OnWaterRequest')return {building:[{buildingId:'仓',level:1}],floater:floaters};
 if(name==='AllItemRequest')return {items:[{itemId:'木材',num:10},{itemId:'玻璃',num:glassLow?0:10}]};
 if(name==='PickUpFloaterRequest'){batches.push(body.floaterId);return {deniedFloaterIds:body.floaterId};}
 throw Error(name);
 }};
 for(let i=0;i<2;i++)await runGather({client,settings:{gather_1:true,gather_2:true},state,config,act:async(k,f)=>f(),log:m=>logs.push(m)});
 return {batches,logs};
}
let r=await scenario(true);assert.equal(r.batches[0][0],'f24');assert.ok(r.logs.some(x=>x.includes('玻璃库存 0/10')));
r=await scenario(false);assert.equal(new Set(r.batches.flat()).size,25);assert.notDeepEqual(r.batches[0],r.batches[1]);
console.log('PASS glass below-cap prioritized past first20, full inventory batches rotate across all materials, denied requests not retried within batch');
