import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./trial-sweep-tables.json',import.meta.url),'utf8'));
export async function runTrialSweeps({client,settings:s,state,act,log,config=defaults}){
 if(!s.ref_battle_trial_enabled)return;
 state.trialSweepPaused??=new Set();
 const read=async(id)=>normalize(await client.request('TrialRaidInfoRequest',{raidId:id},'TrialRaidInfoResponse',8000)).raid;
 const balance=async()=>{const list=normalize(await client.request('AllResourceRequest',{},'AllResourceResponse',8000)).list;const row=list?.find(x=>x.res===4);return row?Number(row.amount):null;};
 const limit=Number(config.limit);if(!Number.isSafeInteger(limit)||limit<1)return;
 for(const [field,id] of [['heroExp',1],['forge',2],['petExp',3]]){
  if(s[`ref_battle_trial_${field}_rubySweep`]!==true||state.trialSweepPaused.has(id))continue;
  const before=await read(id),count=before?.buySweepTimes??0;
  if(before?.raidId!==id||!(before.passedStage>0)||!Number.isSafeInteger(count)||count<0||count>=limit)continue;
  const cost=config.costs.find(x=>x.buyTimes===count+1)?.costRuby;
  if(!Number.isSafeInteger(cost)||cost<0)continue;
  const ruby=await balance();if(!Number.isSafeInteger(ruby)||ruby<cost){log('试炼扫荡：钻石不足或余额未确认');continue;}
  const now=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=Math.floor((now+28800)/86400);
  const result=await act(`trial-sweep:${day}:${id}:${count}`,async()=>{
   const fresh=await read(id),money=await balance();
   if(fresh?.raidId!==id||(fresh.buySweepTimes??0)!==count||fresh.passedStage!==before.passedStage||money!==ruby)return{status:'rejected',message:'试炼进度或钻石余额已变，取消扫荡'};
   await client.sendWatch('TrialRaidBuySweepRequest',{raidId:id,useAdvCard:false},{window:1000});
   const after=await read(id),remaining=await balance();
   const verified=after?.raidId===id&&after.buySweepTimes===count+1&&Number.isSafeInteger(remaining)&&ruby-remaining===cost;
   return{status:verified?'verified':'unconfirmed',message:verified?`试炼 ${id} 扫荡：次数 ${count+1}/${limit}、耗钻 ${cost} 已核对`:'试炼扫荡结果未确认，暂停该试炼扫荡，不重送'};
  });
  if(result?.status==='unconfirmed')state.trialSweepPaused.add(id);
 }
}
