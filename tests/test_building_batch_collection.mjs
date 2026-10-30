import assert from 'node:assert/strict';
import {runFreeTasks} from '../backend/wx-free-tasks.mjs';
async function scenario(partial=false){let qty=0,calls=0,outcome;const ids=['1训练营','1精铁厂','1宠物训练营'];
const client={request:async(name,body)=>{
 if(name==='OnWaterRequest')return {building:ids.map(buildingId=>({buildingId,product:{asset:[{id:'energy',num:1}]}}))};
 if(name==='AllItemRequest')return {items:[{itemId:'energy',num:qty}]};
 if(name==='AllResourceRequest')return {list:[]};
 if(name==='CollectBuildingProductRequest'){calls++;assert.deepEqual(body.buildingId,[...ids].sort());qty+=partial?2:3;return {reward:ids.slice(0,partial?2:3).map(buildingId=>({buildingId,product:{asset:[{id:'energy',num:1}]}}))};}
 throw Error(name);
}};
try{await runFreeTasks({client,protocol:{},settings:{building_0:true,building_1:true},act:async(k,fn)=>{outcome=await fn();return outcome},log:()=>{}});}catch(e){assert.ok(partial);}
assert.equal(calls,1);assert.equal(outcome.status,partial?'unconfirmed':'verified');}
await scenario();await scenario(true);console.log('PASS grouped collection: one request, all buildings required, summed inventory verified');
