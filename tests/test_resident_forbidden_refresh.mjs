import assert from 'node:assert/strict';
import{runProduction,runProductionGuarded}from '../backend/wx-production.mjs';
async function scenario({blocked=false,skip=true,stock=5,level=21,wrong=false,crop=false,waiting=false,serverChanged=false}={}){
 let world={workerOrder:[{index:1,workerId:4,refreshTime:waiting?9999999999:0,requirements:[{id:crop?'小麦':'板',num:2}]}],building:[],orderOfTheDay:{orderNum:0}},calls=[],logs=[],reads=0;
 const client={connected:true,async request(req){if(req==='OnWaterRequest'){reads++;if(serverChanged&&reads===3)world.workerOrder[0].refreshTime=9999999999;return structuredClone(world);}if(req==='AllItemRequest')return {items:[{itemId:crop?'小麦':'板',num:stock}]};if(req==='FinishWorkerOrderRequest'){calls.push(req);world.workerOrder=[];world.orderOfTheDay.orderNum++;return{reward:{asset:[]}};}throw Error(req);},async sendWatch(req){assert.equal(req,'DenyOrderRequest');calls.push(req);if(!wrong)world.workerOrder[0].refreshTime=9999999999;}};
 const paused=new Set();await runProductionGuarded({client,paused,log:m=>logs.push(m),run:()=>runProduction({client,settings:{residents_0:true,residents_3:blocked?[crop?'小麦':'板']:[],residents_2:skip,residents_1:crop},state:{level},act:async(k,f)=>{assert.ok(k.length<=200);return f();},log:m=>logs.push(m),tables:{BuildingProduceCfg:{data:[{itemId:'板'}]}}})});return{calls,logs,paused};
}
assert.deepEqual((await scenario()).calls,['FinishWorkerOrderRequest']);
assert.deepEqual((await scenario({stock:0})).calls,['DenyOrderRequest']);
assert.deepEqual((await scenario({stock:0,skip:false})).calls,[]);
assert.deepEqual((await scenario({stock:0,level:11})).calls,[]);
assert.deepEqual((await scenario({waiting:true})).calls,[]);
assert.deepEqual((await scenario({crop:true})).calls,['DenyOrderRequest']);
assert.ok((await scenario({stock:0,wrong:true})).paused.has('production'));
assert.deepEqual((await scenario({stock:0,serverChanged:true})).calls,[]);
console.log('PASS residents: stocked crafted goods submit, insufficient refresh, disabled refresh, Lv11 skip, cooldown wait, crop refresh, uncertain isolation, changed-order recheck');

assert.deepEqual((await scenario({blocked:true,skip:false,stock:5})).calls,['DenyOrderRequest']);
assert.deepEqual((await scenario({blocked:true,skip:false,waiting:true})).calls,[]);
assert.deepEqual((await scenario({blocked:true,skip:false,level:11})).calls,[]);
assert.ok((await scenario({blocked:true,wrong:true})).paused.has('production'));
console.log('PASS forbidden stock refreshes even when fully stocked and shortage-skip disabled; cooldown/level/uncertainty protected');
