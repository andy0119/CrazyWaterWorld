import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runTradeClaims({client,settings:s,state,activityState,act,log,config=tables}){
 if(!s.ref_world_trade_claim)return;
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),activity=activityState?.trade;
 const unlock=(config.ModuleOpenCfg?.data??[]).find(x=>x.moduleId==='海商王')?.playerLevel;
 if(!Number.isSafeInteger(unlock)||!Number.isSafeInteger(state.level)||state.level<unlock||!Number.isSafeInteger(activity?.period)||activity.period<=0||!(activity.startTime<=now()&&activity.endTime>now())){log('商船奖励：尚未确认角色解锁及开放活动');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const detail=()=>read('TradeInfoRequest','TradeInfoResponse');
 const stock=async()=>{const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');if(!Array.isArray(i.items)||!Array.isArray(r.list))throw Error('unknown_trade_reward_inventory');const out=Object.fromEntries(i.items.map(x=>[x.itemId,Number(x.num)]));for(const x of r.list){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}return out;};
 const assets=rows=>{const sum={};for(const[id,n]of rows){if(!id||!Number.isSafeInteger(n)||n<=0)return null;sum[id]=(sum[id]??0)+n;}return Object.keys(sum).length?sum:null;};
 const gained=(before,after,sum)=>!!sum&&Object.entries(sum).every(([id,n])=>Number.isSafeInteger(before[id]??0)&&Number.isSafeInteger(after[id]??0)&&(after[id]??0)-(before[id]??0)>=n);
 let info=await detail();if(info.period!==activity.period||!info.player||!info.cargo)return;
 for(const kind of ['achievement','report']){
  for(let count=0;count<5;count++){
   if(activity.endTime<=now())return;
   const field=kind==='achievement'?'gotAchieveRwdId':'gotReportRwdId',old=info[field];
   if(!Number.isSafeInteger(old)||old<0)break;
   const rows=(kind==='achievement'?(config.TradeAchieveRewardCfg?.data??[]).filter(x=>x.id===info.period):config.TradeDayRewardCfg?.data??[]);
   const eligible=rows.filter(x=>(kind==='achievement'?x.rewardId:x.id)>old&&(kind==='achievement'?info.player.profit>=x.target:info.guildReportNum>=x.roleNum)).sort((a,b)=>(kind==='achievement'?a.rewardId:a.id)-(kind==='achievement'?b.rewardId:b.id));
   if(!eligible.length)break;
   const before=await stock(),req=kind==='achievement'?'GotTradeAchievementRequest':'GotTradeReportRequest',res=kind==='achievement'?'GotTradeAchievementResponse':'GotTTradeReportResponse';
   const result=await act(`trade-${kind}:${activity.period}:${activity.startTime}:${kind==='report'?Math.floor((now()+28800)/86400):'period'}:${old}`,async()=>{
    if(activity.endTime<=now())return{status:'rejected',message:'商船活动已结束'};
    const reply=await read(req,res);const current=await detail(),after=await stock(),claimed=eligible.filter(x=>(kind==='achievement'?x.rewardId:x.id)<=reply[field]);
    const reward=assets(claimed.flatMap(x=>x.rewards??[]));
    const ok=Number.isSafeInteger(reply[field])&&reply[field]>old&&claimed.length>0&&claimed.some(x=>(kind==='achievement'?x.rewardId:x.id)===reply[field])&&current.period===info.period&&current[field]===reply[field]&&gained(before,after,reward);
    if(ok)info=current;
    return{status:ok?'verified':'unconfirmed',message:ok?`商船${kind==='achievement'?'利润成就':'情报回报'}：领取档位与奖励已核对`:'商船奖励未确认，停止本轮'};
   });
   if(!result||result.status==='rejected')return;if(result.status!=='verified')throw Error('unconfirmed_trade_reward');
  }
 }
 const task=(await read('TradeTaskRequest','TradeTaskResponse')).guildTask;if(!task||!Array.isArray(task.gotTaskId))return;
 // Each day unlocks a further task group; only use the actual activity start day.
 const day=Math.floor((now()+28800)/86400)-Math.floor((activity.startTime+28800)/86400)+1;
 const rows=(config.TradeGuildTaskCfg?.data??[]).filter(x=>x.day<=day&&!task.gotTaskId.includes(x.id)&&(x.taskType===0?task.profit>=x.tragetCount:x.taskType===1&&task.tradeTimes>=x.tragetCount));
 for(const row of rows.slice(0,5)){
  const reward=assets(row.rewards??[]);if(!reward)continue;
  const before=await stock();
  const result=await act(`trade-task:${activity.period}:${activity.startTime}:${row.id}`,async()=>{
   if(activity.endTime<=now())return{status:'rejected',message:'商船活动已结束'};
   const reply=await read('TradeGotTaskRequest','TradeGotTaskResponse',{taskId:row.id});
   const current=(await read('TradeTaskRequest','TradeTaskResponse')).guildTask,after=await stock();
   const ok=reply.gotTaskId?.includes(row.id)&&current?.gotTaskId?.includes(row.id)&&gained(before,after,reward);
   return{status:ok?'verified':'unconfirmed',message:ok?`商船联盟任务 ${row.id}：领取记录与奖励已核对`:'商船联盟任务奖励未确认，停止本轮'};
  });
  if(!result||result.status==='rejected')return;if(result.status!=='verified')throw Error('unconfirmed_trade_task');
 }
}
