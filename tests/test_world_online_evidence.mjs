import assert from 'node:assert/strict';
import {runWorldOnlineReward,runWorldOnlineGuarded} from '../backend/wx-world-online.mjs';
const config={ModuleOpenCfg:{data:[{moduleId:'世界',playerLevel:6}]},GameplayOpenCfg:{data:[{gameplay:'国战',openDays:[2]}]},WorldOnlineRwdCfg:{data:[{stage:1,seconds:60},{stage:2,seconds:120}]}};
const at=Date.UTC(2026,9,30,12,3)/1000,day=Date.UTC(2026,9,29,16)/1000;
async function run({seconds=at,num=0,updated=at-61,wrong=false,enabled=true}={}){
 let count=0,result=null,logs=[],counter={type:'DAILY_WORLD_ONLINE_RWD',num,updateTime:updated};
 const client={connected:true,serverClockOffsetMs:seconds*1000-Date.now(),async request(req){assert.equal(req,'CounterInfoRequest');return {counters:[{...counter}]};},async sendWatch(req){assert.equal(req,'GotWorldOnlineRwdRequest');count++;if(!wrong){counter.num++;counter.updateTime=seconds;}}};
 const paused=new Set();const go=()=>runWorldOnlineGuarded({client,paused,log:m=>logs.push(m),run:()=>runWorldOnlineReward({client,settings:{ref_world_cityWar_enabled:true,ref_world_cityWar_online:enabled},state:{level:21,season:1,worldOpenTime:day-86400*20},act:async(k,f)=>{result=await f();return result;},log:m=>logs.push(m),config})});await go();return{count,result,logs,paused,go,getCount:()=>count};
}
const r=await run();assert.equal(r.count,1);assert.equal(r.result.status,'verified');assert.equal(r.result.counterBefore,0);assert.equal(r.result.counterAfter,1);assert.equal(r.result.counterTimeAfter,at);assert.equal(r.result.rewardStage,1);
assert.equal((await run({updated:at-10})).count,0);
assert.equal((await run({seconds:day+19*3600})).count,0);
assert.equal((await run({updated:day-1})).count,1); // Native counter may reset while its timestamp is still yesterday.
assert.equal((await run({updated:day+21*3600})).count,0);
assert.equal((await run({num:2})).count,0);
assert.equal((await run({enabled:false})).count,0);
const uncertain=await run({wrong:true});assert.ok(uncertain.paused.has('world-online'));assert.equal(uncertain.result.status,'unconfirmed');await uncertain.go();assert.equal(uncertain.getCount(),1);
console.log('PASS online reward stage timing, previous-day timestamp, exact counter evidence and no retry after unconfirmed');
