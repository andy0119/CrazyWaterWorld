import assert from 'node:assert/strict';
import{runCityWar,runCityWarGuarded,cityFuelCost}from '../backend/wx-city-war.mjs';
const map={mapInfo:{width:10,height:10,tileWidth:100,tileHeight:80},cityInfo:{1:{gridIdx:0},2:{gridIdx:2},3:{gridIdx:4}}};
const config={ModuleOpenCfg:{data:[{moduleId:'世界',playerLevel:10}]},GameplayOpenCfg:{data:[{gameplay:'国战',openDays:[2,1]}]},'1_CityCfg':{data:[{id:1,name:'Home',guildIndex:1},{id:2,name:'Target',guildIndex:0},{id:3,name:'Other',guildIndex:0}]},'1_AttackCityConsumeCfg':{data:[{dist:1,cost:0.4},{dist:6000,cost:0.5}]}};
const protocol={FleetState:{IDLE:1,MOVING:2,BATTLING:3,QUEUING:5},CityState:{CTS_BATTLING:2}};
assert.equal(cityFuelCost({map,config,guildIdx:1,targetId:2,friendly:false}),80);assert.equal(cityFuelCost({map,config,guildIdx:1,targetId:2,friendly:true}),0);assert.equal(cityFuelCost({map,config,guildIdx:99,targetId:2,friendly:false}),null);
async function run({speed=false,targetSeconds=10,rubyBalance=100,enabled=true,shipEnabled=true,online=false,repeat=false,scenarioId=1,expired=false,notStarted=false,declared=true,foreign=false,cityIdle=false,friendly=false,plan=['2'],stock=1000,durability=2000,busy=false,progress=true,debit=true,lag=0,history=new Set(),warChanges=false,unite=false,ambiguous=false,playerLevel=20,openDaysAgo=10}={}){
 const stamp=Math.floor(Date.now()/1000);let calls=[],fuel=stock,ruby=rubyBalance,warReads=0,fleetReads=0,logs=[];
 let fleet={buildingId:'1fleet',state:busy?2:1,cityId:1,maxDura:2000,durability};
 const declaration={attackGuildIdx:foreign?3:friendly?2:1,defenceGuildIdx:friendly?1:2,cityId:2};
 const client={connected:true,async request(req){switch(req){
 case 'WarDeclarationRequest':warReads++;return{startTime:notStarted?stamp+100:stamp-100,endTime:expired?stamp-1:stamp+1000,assembleCityId:2,declarations:declared&&!(warChanges&&warReads>1)?[declaration]:[]};
 case 'UniteWorldsPlanRequest':return unite?{executeTs:stamp+1800,worldIds:[1]}:{executeTs:0,worldIds:[]};
 case 'GuildInfoRequest':return{guild:{guildId:'1001'}};
 case 'WorldInfoRequest':return{cities:[{id:2,state:cityIdle?1:2,guildIdx:friendly?1:2}]};
 case 'AllResourceRequest':return {list:[{res:4,amount:ruby}]};
 case 'AllItemRequest':return{items:[{itemId:'汽油',num:fuel}]};
 case 'MyFleetsRequest':{const f={...fleet};if(calls.length&&++fleetReads<=lag)f.state=1;return{fleets:[f]};}
 default:throw Error(req);
 }},async sendWatch(req,body){if(req==='SpeedUpFleetRequest'){calls.push(req);ruby-=10;fleet.moveEndTs=stamp+Math.ceil((fleet.moveEndTs-stamp)/2);return;}assert.equal(req,'MoveFleetsToCityRequest');assert.deepEqual(body,{buildingId:['1fleet'],cityId:2});calls.push(req);if(debit)fuel-=friendly?0:80;if(progress)fleet={...fleet,state:2,targetCityId:2,moveEndTs:stamp+80};}};
 const cfg=structuredClone(config);cfg.WorldParamCfg={data:[{paramName:"行军加速消耗",paramValue:10}]};if(ambiguous)cfg['1_CityCfg'].data[2].name='Target';
 let error;try{await runCityWar({client,config:cfg,map,protocol,state:{scenarioId,level:playerLevel,season:1,worldOpenTime:stamp-openDaysAgo*86400},settings:{ref_world_cityWar_fleets_0_marchSpeedup:speed,ref_world_cityWar_fleets_0_marchSpeedupTargetSecs:targetSeconds,ref_world_cityWar_enabled:enabled,ref_world_cityWar_online:online,ref_world_cityWar_reattack:repeat,ref_world_cityWar_scenario:1,ref_world_cityWar_fleets_0_enabled:shipEnabled,ref_world_cityWar_fleets_0_plan:plan},history,act:async(k,fn)=>fn(),log:m=>logs.push(m),sleep:async()=>{}});}catch(e){error=e.message;}
 return{calls,error,history,logs,ruby,fleet};
}
assert.equal((await run()).calls.length,1);assert.equal((await run({friendly:true,stock:0})).calls.length,1);assert.equal((await run({plan:[]})).calls.length,1);assert.equal((await run({plan:['Target']})).calls.length,1);
for(const o of [{enabled:false},{playerLevel:1},{openDaysAgo:0},{shipEnabled:false},{scenarioId:2},{expired:true},{notStarted:true},{declared:false},{foreign:true},{cityIdle:true},{stock:79},{durability:100},{busy:true},{plan:['3']},{unite:true},{warChanges:true},{plan:['Target'],ambiguous:true}])assert.equal((await run(o)).calls.length,0,JSON.stringify(o));
assert.equal((await run({lag:2})).error,undefined);assert.equal((await run({progress:false})).error,'unconfirmed_city_war');assert.equal((await run({debit:false})).error,'unconfirmed_city_war');
const first=await run();assert.equal((await run({history:first.history})).calls.length,0);
let h=new Set();for(let i=0;i<3;i++){const x=await run({repeat:true,history:h});assert.equal(x.calls.length,1);h=x.history;}assert.equal((await run({repeat:true,history:h})).calls.length,0);
const online=await run({online:true,shipEnabled:false});assert.equal(online.calls.length,0);assert.ok(online.logs.some(x=>x.includes('保持在线')));
const paused=new Set();await runCityWarGuarded({run:async()=>{throw Error('unconfirmed_city_war')},client:{connected:true},paused,log:()=>{}});assert.ok(paused.has('cityWar'));await runCityWarGuarded({run:async()=>{throw Error('must not run')},client:{connected:true},paused,log:()=>{}});
await assert.rejects(()=>runCityWarGuarded({run:async()=>{throw Error('socket lost')},client:{connected:false},paused:new Set(),log:()=>{}}));
console.log('PASS city war: declared own-guild target, active window, merge lockout, fleet condition, exact fuel, rechecks/no resend, max repeats, online-only, module isolation');

let accelerated=await run({speed:true});assert.equal(accelerated.error,undefined);assert.equal(accelerated.calls.filter(x=>x==='SpeedUpFleetRequest').length,3);assert.equal(accelerated.ruby,70);
assert.equal((await run({speed:true,targetSeconds:100})).calls.includes('SpeedUpFleetRequest'),false);
assert.equal((await run({speed:true,rubyBalance:0})).calls.includes('SpeedUpFleetRequest'),false);
assert.equal((await run({speed:false})).calls.includes('SpeedUpFleetRequest'),false);
console.log('PASS city dispatch-to-speedup integration: resources-only diamonds, 80s-to-10s, exact debit, target reached/off/poor no spending');
