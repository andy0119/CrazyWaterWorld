import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./advertising-entitlements.json',import.meta.url),'utf8'));
export async function runAdvertising({client,protocol,settings:s,state,act,log,paused=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),config=defaults}){
 const flags=['ref_advertising_heroRecruit','ref_advertising_antiqueRecruit','ref_advertising_afkReward','ref_advertising_trialSweep','ref_advertising_factorySpeedUp'];
 if(!flags.some(k=>s[k]===true))return;
 if(!config.noAdVipLevels.includes(state.vipLevel)){log('广告任务：尚未确认官方免广告资格，等待真实播放完成回调；不发送奖励请求');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize),now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=Math.floor((now()+28800)/86400);
 const inventory=async()=>{const a=await read('AllItemRequest','AllItemResponse'),b=await read('AllResourceRequest','AllResourceResponse');if(!Array.isArray(a.items)||!Array.isArray(b.list))throw Error('unknown_ad_inventory');const out=Object.fromEntries(a.items.map(x=>[x.itemId,Number(x.num)]));for(const x of b.list)if([1,3,4].includes(Number(x.res)))out[({1:'EXP',3:'GOLD',4:'RUBY'})[x.res]]=Number(x.amount);return out;};
 const water=()=>read('OnWaterRequest','OnWaterResponse');
 const plans=[];
 for(const [flag,id,kind] of [['ref_advertising_heroRecruit',2,'hero'],['ref_advertising_antiqueRecruit',7,'antique']])if(s[flag]){
  const info=(await read('RecruitInfoRequest','RecruitInfoResponse'))[kind];if(!info||!Number.isSafeInteger(info.recruitTimes))continue;
  const owned=(await read(kind==='hero'?'AllHeroRequest':'AllAntiqueRequest',kind==='hero'?'AllHeroResponse':'AllAntiqueResponse'))[kind==='hero'?'heroes':'antiques'];if(!Array.isArray(owned))continue;
  plans.push({id,label:kind==='hero'?'英雄招募广告':'藏品招募广告',key:kind,execute:()=>read(kind==='hero'?'RecruitStartRequest':'AntiqueRecruitRequest',kind==='hero'?'RecruitStartResponse':'AntiqueRecruitResponse',kind==='hero'?{way:protocol.RecruitWay.RECRUIT_ADV}:{type:protocol.AntiqueRecruitType.RECRUIT_ANTIQUE,way:protocol.RecruitWay.RECRUIT_ADV}),check:async reply=>{
   const after=(await read('RecruitInfoRequest','RecruitInfoResponse'))[kind],list=(await read(kind==='hero'?'AllHeroRequest':'AllAntiqueRequest',kind==='hero'?'AllHeroResponse':'AllAntiqueResponse'))[kind==='hero'?'heroes':'antiques']??[];
   const ids=new Set(owned.map(x=>kind==='hero'?x.heroId:x.id));const added=list.some(x=>!ids.has(kind==='hero'?x.heroId:x.id));
   return {changed:after?.recruitTimes===info.recruitTimes+1,added};
  }});
 }
 if(s.ref_advertising_afkReward){const before=(await read('AfkInfoRequest','AfkInfoResponse')).afkInfo;if(before?.afkFinishTime>0&&before.afkFinishTime<=now())plans.push({id:1,label:'挂机收益广告',key:'afk',execute:()=>read('DrawAfkRewardRequest','DrawAfkRewardResponse',{useAdvCard:true}),check:async()=>{const x=(await read('AfkInfoRequest','AfkInfoResponse')).afkInfo;return{changed:x?.afkStartTime>before.afkStartTime||x?.afkFinishTime>before.afkFinishTime};}});}
 if(s.ref_advertising_trialSweep&&s.ref_battle_trial_enabled){for(const [raidId,id]of [[1,4],[2,3],[3,5]]){const before=(await read('TrialRaidInfoRequest','TrialRaidInfoResponse',{raidId})).raid;if(before?.raidId!==raidId||!(before.passedStage>0))continue;plans.push({id,label:'试炼扫荡广告 '+raidId,key:'trial:'+raidId,execute:()=>read('TrialRaidBuySweepRequest','GotRewardResponse',{raidId,useAdvCard:true}),check:async()=>{const x=(await read('TrialRaidInfoRequest','TrialRaidInfoResponse',{raidId})).raid;return{changed:x?.raidId===raidId&&x.passedStage===before.passedStage};}});}}
 if(s.ref_advertising_factorySpeedUp&&s.factory_0){const w=await water();for(const b of w.building??[]){const q=b.factory?.factoryQ?.[0];if(!q||!Number.isSafeInteger(q.idx)||!(q.finishTime>now()))continue;plans.push({id:6,label:'工厂加速广告 '+b.buildingId,key:'factory:'+b.buildingId+':'+q.idx,execute:()=>client.sendWatch('SpeedUpFactoryProduceRequest',{buildingId:b.buildingId,index:q.idx,speedUp:{type:protocol.SpeedUpCost.SPEED_UP_ADV,useNum:0}},{window:1000}),check:async()=>{const f=(await water()).building?.find(x=>x.buildingId===b.buildingId)?.factory;const job=f?.factoryQ?.find(x=>x.idx===q.idx);return{changed:!!f&&(!job||job.finishTime<q.finishTime),timerOnly:true};}});break;}}
 for(const plan of plans){
  const scope='advertising:'+plan.id;if(paused.has(scope))continue;
  try{
   const w=await water(),effect=(w.adv??[]).find(x=>x.id===plan.id),limit=config.limits.find(x=>x.id===plan.id)?.dailyLimit;
   if(!effect||!Number.isSafeInteger(effect.gotTimes)||effect.gotTimes<0||!Number.isSafeInteger(limit)||effect.gotTimes>=limit)continue;
   const before=await inventory();
   const result=await act(`advertising:${day}:${plan.id}:${effect.gotTimes}:${plan.key}`,async()=>{
    await client.sendWatch('WatchAdvRequest',{type:protocol.AdvType.ADV_EFFECT,id:plan.id},{window:1000});
    const granted=(await water()).adv?.find(x=>x.id===plan.id);
    if(granted?.reward!==true)return{status:'unconfirmed',message:plan.label+'：未读到服务器可领奖授权，仅暂停该广告任务'};
    const reply=normalize(await plan.execute());let verified=false;
    for(const wait of [0,400,800]){if(wait)await sleep(wait);const current=(await water()).adv?.find(x=>x.id===plan.id),domain=await plan.check(reply),after=await inventory(),assets={};const raw=reply?.reward;for(const row of Array.isArray(raw)?raw:[]){for(const a of row.reward?.asset??[])if(a.id&&Number(a.num)>0)assets[a.id]=(assets[a.id]??0)+Number(a.num);}for(const a of raw?.asset??[])if(a.id&&Number(a.num)>0)assets[a.id]=(assets[a.id]??0)+Number(a.num);
     const gained=Object.keys(assets).length>0&&Object.entries(assets).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
     const noRuby=(after.RUBY??0)===(before.RUBY??0),counted=current?.gotTimes===effect.gotTimes+1;
     verified=counted&&domain.changed&&noRuby&&(domain.timerOnly||domain.added||gained);if(verified)break;}
    return{status:verified?'verified':'unconfirmed',message:verified?plan.label+'：官方免广告资格、服务器授权、每日次数与结果已核对':plan.label+'：结算未确认，仅暂停该广告任务，不重送'};
   });
   if(result&&result.status!=='verified')paused.add(scope);
  }catch(e){if(client.connected===false)throw e;paused.add(scope);log(plan.label+' 读取或结算异常，仅暂停该广告任务，不重送');}
 }
}
