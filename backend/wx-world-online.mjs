import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./world-online-tables.json',import.meta.url),'utf8'));
export async function runWorldOnlineReward({client,settings:s,state,act,log,config=defaults}){
 if(!s.ref_world_cityWar_enabled||!s.ref_world_cityWar_online)return;
 const now=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const dayStart=Math.floor((now+28800)/86400)*86400-28800,start=dayStart+20*3600,end=dayStart+21*3600;
 const unlock=config.ModuleOpenCfg?.data?.find(x=>x.moduleId==='世界')?.playerLevel;
 const openDays=config.GameplayOpenCfg?.data?.find(x=>x.gameplay==='国战')?.openDays;
 if(!Number.isSafeInteger(unlock)||!(state.level>=unlock)||!(state.worldOpenTime>0)||!Number.isSafeInteger(state.season)||state.season<1||!Array.isArray(openDays)||!openDays.length){log('城战在线奖励：开放条件未确认，跳过');return;}
 const day=Math.floor((now+28800)/86400)-Math.floor((state.worldOpenTime+28800)/86400)+1;
 if(day<openDays[Math.min(state.season,openDays.length)-1]||now<=start){log('城战在线奖励：尚未到开放时间');return;}
 const read=()=>client.request('CounterInfoRequest',{},'CounterInfoResponse',8000).then(normalize);
 const get=x=>{if(!Array.isArray(x.counters))return null;const row=x.counters.find(c=>c.type==='DAILY_WORLD_ONLINE_RWD');return row?{...row,num:row.num??0,updateTime:row.updateTime??0}:{num:0,updateTime:0};};
 const before=get(await read());
 const first=before?.num===0&&before.updateTime===0;
 if(!before||!Number.isSafeInteger(Number(before.num))||Number(before.num)<0||!Number.isSafeInteger(before.updateTime)||(!first&&(before.updateTime<dayStart||before.updateTime>=end))){log(`城战在线奖励：本日计数或计时未就绪（次数 ${before?.num??'未返回'}，计时 ${before?.updateTime??'未返回'}，本日起点 ${dayStart}）`);return;}

 const stage=Number(before.num),row=config.WorldOnlineRwdCfg?.data?.find(x=>x.stage===stage+1);
 if(!row){log('城战在线奖励：本日所有阶段已领取');return;}
 const timer=first?start:before.updateTime;
 if(!(row.seconds>0)||now<timer+row.seconds){log(`城战在线奖励：第 ${stage+1} 阶段还需 ${Math.max(0,timer+row.seconds-now)} 秒`);return;}
 const result=await act(`world-online:${dayStart}:${stage+1}`,async()=>{
  const current=get(await read());
  if(!current||Number(current.num)!==stage||current.updateTime!==before.updateTime)return {status:'rejected',message:'城战在线奖励：领取阶段已变化，下一轮重新读取，未重复领取'};
  await client.sendWatch('GotWorldOnlineRwdRequest',{}, {window:1000});
  const after=get(await read());const verified=Number(after?.num)===stage+1&&Number.isSafeInteger(after.updateTime)&&after.updateTime>=Math.max(before.updateTime,start);
  return {status:verified?'verified':'unconfirmed',message:verified?`城战在线奖励：第 ${stage+1} 阶段已领取，服务器领取计数已确认`:'城战在线奖励：领取结果未确认，暂停本模块，其他任务继续'};
 });
 if(result?.status==='unconfirmed')throw Error('unconfirmed_world_online');
}
export async function runWorldOnlineGuarded({run,client,paused,log}){
 if(paused.has('world-online'))return;
 try{await run();}catch(e){if(client?.connected===false)throw e;if(/^timeout waiting for CounterInfoResponse/.test(e.message)){log('城战在线奖励：读取计数逾时，下一轮再查；其他任务继续');return;}if(e.message!=='unconfirmed_world_online')throw e;paused.add('world-online');log('在线奖励已暂停，避免重复领取；其他任务继续');}
}
