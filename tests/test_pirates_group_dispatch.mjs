import assert from 'node:assert/strict';
import {runPirates,inPirateWindow} from '../backend/wx-pirates.mjs';
const config={WorldParamCfg:{data:[{paramName:'打野怪消耗汽油',paramValue:1}]},PirateParamCfg:{data:[{paramName:'每日野怪扫荡次数',paramValue:10}]},SeasonTaskCfg:{data:[{season:1,stage:1,maxPirateLevel:1}]},WorldPirateCfg:{data:[{season:'1',type:1,level:1,power:100,showName:'pirate',fixedReward:[['GOLD',2],['wood',1]]}]}};
async function run({sweep=false,power=200,fuel=10,dura=1600,history=new Set(),progress=true,multi=false,partial=false,counter=0,typeList=[],season=1,availableUntil=Infinity}={}){
 let wood=0,gold=0,calls=[],logs=[];const fleet={buildingId:'1fleet',state:1,power,durability:dura,maxDura:2000};
 const fleets=[fleet,...(multi?[{...fleet,buildingId:'2fleet'}]:[])];
 const client={async request(req){if(req==='SeasonTaskStageRequest')return{stage:1};if(req==='AllPirateRequest')return{pirates:counter<availableUntil?[{uid:1,type:1,level:1,cityId:2,gridIdx:3}]:[],sweepTimes:counter};if(req==='PirateKillRecordRequest')return{records:[{type:1,maxKilledLevel:sweep?1:0}]};if(req==='AllItemRequest')return{items:[{itemId:'汽油',num:fuel},{itemId:'wood',num:wood}]};if(req==='AllResourceRequest')return{list:[{res:3,amount:gold}]};if(req==='MyFleetsRequest')return{fleets:structuredClone(fleets)};throw Error(req);},async sendWatch(req,body){calls.push(req);if(!progress)return;if(req==='PirateSweepRequest'){counter++;wood++;gold+=2;}else{assert.deepEqual(body,{uid:1,fleetBuildingIds:multi?['1fleet','2fleet']:['1fleet'],cityId:2});fuel-=fleets.length;for(const f of (partial?[fleets[0]]:fleets)){f.state=2;f.targetCityId=2;f.targetGridIdx=3;}}}};
 let error;try{await runPirates({client,protocol:{FleetState:{IDLE:1,MOVING:2,BATTLING:3,QUEUING:5}},settings:{ref_world_pirate_attack:!sweep,ref_world_pirate_sweep:sweep,ref_world_pirate_attackTypes:typeList,ref_world_pirate_sweepTypes:typeList,ref_world_fleet_powerMarginPct:115},state:{season},config,history,act:async(k,fn)=>fn(),log:m=>logs.push(m)});}catch(e){error=e.message;}
 return {calls,error,history,counter,logs};
}
const first=await run();assert.deepEqual(first.calls,['ChallengePirateRequest']);
assert.equal((await run({history:new Set(first.history)})).calls.length,0);
for(const input of [{power:100},{fuel:0},{dura:100},{season:null},{typeList:['other']}])assert.equal((await run(input)).calls.length,0);
assert.deepEqual((await run({sweep:true})).calls,Array(10).fill('PirateSweepRequest'));
const partial=await run({sweep:true,counter:6});assert.equal(partial.calls.length,4);assert.equal(partial.counter,10);assert.ok(partial.logs.some(x=>x.includes('今日已完成 10/10')));
const exhausted=await run({sweep:true,counter:6,availableUntil:7});assert.equal(exhausted.calls.length,1);assert.equal(exhausted.counter,7);assert.ok(exhausted.logs.some(x=>x.includes('剩余 3 次')));
const noProgress=await run({sweep:true,progress:false});assert.equal(noProgress.calls.length,1);assert.equal(noProgress.error,'unconfirmed_pirate_sweep');
assert.equal((await run({sweep:true,counter:10})).calls.length,0);
assert.equal((await run({progress:false})).error,'unconfirmed_pirate_attack');
assert.equal((await run({sweep:true,progress:false})).error,'unconfirmed_pirate_sweep');
const utc=Date.parse('2026-10-19T15:00:00Z')/1000;
assert.equal(inPirateWindow('22:00','02:00',utc),true);
assert.equal(inPirateWindow('08:00','09:00',utc),false);
assert.equal(inPirateWindow('00:00','00:00',utc),true);
console.log('PASS sweep completion: 0-to-10, 6-to-10, no targets at 7 remains pending, unconfirmed never resent; pirates: season and progress gates, power/durability/fuel, type/time windows, persistent attempt guard, actual departure, sweep count and fixed rewards');

assert.equal((await run({multi:true})).error,undefined);
assert.equal((await run({multi:true})).calls.length,1);
assert.equal((await run({multi:true,fuel:1})).calls.length,0);
assert.equal((await run({multi:true,partial:true})).error,'unconfirmed_pirate_attack');
console.log('PASS one grouped request, total fuel preflight and debit, every fleet same-target confirmation');
