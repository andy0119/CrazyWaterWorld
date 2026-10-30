import assert from 'node:assert/strict';
import {runFreeTasks} from '../backend/wx-free-tasks.mjs';
async function scenario(mode){
 const paused=new Set(),calls=[],results=[],logs=[];let wood=0,pending=false;
 const buildings=[{buildingId:'bad',factory:{finishedProducts:[{}]}},{buildingId:'good',factory:{finishedProducts:[{}]}}];
 const client={connected:true,async request(req,body){
  if(req==='OnWaterRequest')return{building:structuredClone(buildings)};
  if(req==='AllItemRequest')return{items:[{itemId:'木',num:wood}]};
  if(req==='AllResourceRequest')return{list:[]};
  if(req==='GainFactoryProduceRequest'){calls.push(body.buildingId);if(mode==='disconnect')this.connected=false;
   if(body.buildingId==='good'){if(mode==='delayed')pending=true;else{wood+=2;buildings[1].factory.finishedProducts=[];}}
   return{products:{asset:[{id:'木',num:2}]}};
  }throw Error(req);
 }};
 const run=()=>runFreeTasks({client,protocol:{},settings:{factory_0:true,ref_island_factory_gain:true},paused,config:{BuildingUnlockCfg:{data:[]}},sleep:async()=>{if(pending){pending=false;wood+=2;buildings[1].factory.finishedProducts=[];}},act:async(k,fn)=>{const r=await fn();results.push(r);return r;},log:m=>logs.push(m)});
 if(mode==='disconnect'){await assert.rejects(run(),/connection_lost/);return;}
 await run();assert.deepEqual(calls,['bad','good']);assert.equal(results[0].status,'unconfirmed');assert.equal(results[1].status,'verified');assert.ok(paused.has('free-factory:bad'));assert.ok(!paused.has('free-factory:good'));
 await run();assert.deepEqual(calls,['bad','good'],'never resend an uncertain factory claim on next cycle');
}
await scenario('normal');await scenario('delayed');await scenario('disconnect');
console.log('PASS uncertain factory isolated, other factory continues, delayed confirmation succeeds without re-send, next cycle does not repeat, real disconnect propagates');
