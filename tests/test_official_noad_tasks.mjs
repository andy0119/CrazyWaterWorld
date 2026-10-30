import assert from 'node:assert/strict';
import {runAdvertising} from '../backend/wx-advertising.mjs';
const flags={hero:'ref_advertising_heroRecruit',antique:'ref_advertising_antiqueRecruit',afk:'ref_advertising_afkReward',trial:'ref_advertising_trialSweep',factory:'ref_advertising_factorySpeedUp'};
async function test(kind,{vip=3,grant=true,inventory=true,count=true}={}){
 const stamp=Math.floor(Date.now()/1000);let items=0,heroCount=0,antiqueCount=0,finish=stamp+4000,afkStart=1,afkEnd=2,granted=new Set(),times={},calls=[],logs=[],results=[];
 const ids={hero:2,antique:7,afk:1,trial:4,factory:6};let currentId;
 const complete=()=>{if(count)times[currentId]=(times[currentId]??0)+1;granted.delete(currentId);if(inventory)items++;};
 const client={connected:true,request:async(req,body)=>{
 switch(req){
 case'OnWaterRequest':return {adv:[1,2,3,4,5,6,7].map(id=>({id,gotTimes:times[id]??0,reward:granted.has(id)})),building:[{buildingId:'1厂',factory:{factoryQ:[{idx:1,finishTime:finish}]}}]};
 case'AllItemRequest':return{items:[{itemId:'wood',num:items}]};
 case'AllResourceRequest':return{list:[{res:4,amount:100}]};
 case'RecruitInfoRequest':return{hero:{recruitTimes:heroCount},antique:{recruitTimes:antiqueCount}};
 case'AllHeroRequest':return{heroes:heroCount?[{heroId:'new'}]:[]};
 case'AllAntiqueRequest':return{antiques:antiqueCount?[{id:'new'}]:[]};
 case'AfkInfoRequest':return{afkInfo:{afkStartTime:afkStart,afkFinishTime:afkEnd}};
 case'TrialRaidInfoRequest':return {raid:{raidId:body.raidId,passedStage:1}};
 case'RecruitStartRequest':heroCount++;calls.push(req);complete();return{reward:[{heroId:'new'}]};
 case'AntiqueRecruitRequest':antiqueCount++;calls.push(req);complete();return{reward:[{antiqueId:'new'}]};
 case'DrawAfkRewardRequest':afkStart=stamp;afkEnd=stamp+999;calls.push(req);complete();return{reward:{asset:[{id:'wood',num:1}]}};
 case'TrialRaidBuySweepRequest':calls.push(req);complete();return{reward:{asset:[{id:'wood',num:1}]}};
 default:throw Error(req);
 }},sendWatch:async(req,body)=>{calls.push(req);if(req==='WatchAdvRequest'){currentId=body.id;if(grant)granted.add(body.id);}else if(req==='SpeedUpFactoryProduceRequest'){finish-=1800;complete();}else throw Error(req);}};
 const paused=new Set();await runAdvertising({client,protocol:{AdvType:{ADV_EFFECT:1},RecruitWay:{RECRUIT_ADV:5},AntiqueRecruitType:{RECRUIT_ANTIQUE:1},SpeedUpCost:{SPEED_UP_ADV:3}},settings:{[flags[kind]]:true,ref_battle_trial_enabled:true,factory_0:true},state:{vipLevel:vip},paused,config:{noAdVipLevels:[3],limits:[1,2,3,4,5,6,7].map(id=>({id,dailyLimit:3}))},log:m=>logs.push(m),sleep:async()=>{},act:async(k,fn)=>{const r=await fn();results.push(r);return r}});
 return{calls,results,paused,logs};
}
for(const kind of Object.keys(flags)){const r=await test(kind);assert.ok(r.results.length>0,kind);assert.ok(r.results.every(x=>x.status==='verified'),kind);}
assert.equal((await test('hero',{vip:1})).calls.length,0);
let r=await test('hero',{grant:false});assert.deepEqual(r.calls,['WatchAdvRequest']);assert.ok(r.paused.has('advertising:2'));
r=await test('afk',{inventory:false});assert.equal(r.results[0].status,'unconfirmed');
r=await test('hero',{count:false});assert.equal(r.results[0].status,'unconfirmed');
console.log('PASS 5 no-ad paths, no entitlement no request, server grant mandatory, counters AND reward/progress mandatory, uncertainty isolated');
