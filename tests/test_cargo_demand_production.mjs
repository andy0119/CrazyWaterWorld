import assert from 'node:assert/strict';
import {runProduction} from '../backend/wx-production.mjs';
import {loadProtocol} from '../backend/wx-game/proto.mjs';
const protocol=loadProtocol();
async function test({cargo=false,filled=false,arrived=false,radar=true,resident=false,skip=false,blocked=false}={}){
 const world={building:[{buildingId:'1厂',level:1,factory:{factoryQ:[]}}],workerOrder:resident?[{index:1,workerId:1,refreshTime:0,requirements:[{id:'需求品',num:2}]}]:[]};let items={木:10},made=[],logs=[];
 const client={request:async name=>{
 if(name==='OnWaterRequest')return structuredClone(world);
 if(name==='AllItemRequest')return {items:Object.entries(items).map(([itemId,num])=>({itemId,num}))};
 if(name==='CargoShipsRequest')return {ship:[{status:arrived?protocol.CargoShipStatus.ARRIVED:protocol.CargoShipStatus.IN_ORDER,orderItem:[{filled,asset:{id:'需求品',num:3}}]}]};
 if(name==='RadarInfoRequest')return {radarInfo:{level:1,events:[{uid:'1',state:protocol.RadarEventState.RADAR_EVENT_INIT,refugee:{requirements:[{id:'需求品',num:2}]}}]}};
 throw Error(name);
 },sendWatch:async(name,body)=>{made.push(body.productId);world.building[0].factory.factoryQ.push({productId:body.productId});}};
 const tables={BuildingProduceCfg:{data:[{buildType:'厂',itemId:'快速补库品',unlockLevel:1,produceTime:1,costItem:[['木',1]]},{buildType:'厂',itemId:'需求品',unlockLevel:1,produceTime:100,costItem:[['木',1]]}]},BuildingUnlockCfg:{data:[{buildingId:'1厂',buildingType:'厂'}]},GameParamCfg:{data:[{paramName:'产品存量初始上限',paramValue:50}]}};
 await runProduction({client,settings:{factory_0:true,ref_island_factory_autoProduce:true,trade_0:cargo,residents_0:resident,residents_2:skip,residents_3:blocked?['需求品']:[],ref_world_radar_enabled:radar,ref_world_radar_refugee:radar},state:{level:11},tables,act:async(k,fn)=>fn(),log:m=>logs.push(m)});
 return {made,logs};
}
let r=await test();assert.deepEqual(r.made,['需求品']);assert.ok(r.logs.some(x=>x.includes('需求品 缺 2')));
r=await test({radar:false,resident:true});assert.deepEqual(r.made,['需求品']);
r=await test({radar:false,resident:true,skip:true});assert.deepEqual(r.made,['快速补库品']);
r=await test({radar:false,resident:true,blocked:true});assert.deepEqual(r.made,['快速补库品']);
console.log('PASS radar/resident demand without priority toggle, task before fast restock, skipped/forbidden orders excluded');

r=await test({radar:false,cargo:true});assert.deepEqual(r.made,['需求品']);assert.ok(r.logs.some(x=>x.includes('需求品 缺 3')));
r=await test({radar:false,cargo:true,filled:true});assert.deepEqual(r.made,['快速补库品']);
r=await test({radar:false,cargo:true,arrived:true});assert.deepEqual(r.made,['快速补库品']);
console.log('PASS cargo shortage prioritized, filled holds and arrived ships excluded');
