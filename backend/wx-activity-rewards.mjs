import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const festivals={
 '五一活动':['LabourDaySignCfg','LabourDayActiveRewardCfg'],
 '端午节活动':['DuanwuDailySignCfg','DuanwuActiveRewardCfg'],
 '美人鱼联动活动':['MermaidSignCfg','MermaidActiveRewardCfg'],
 '半年庆活动':['GalaSignCfg','GalaActiveRewardCfg'],
 '中秋国庆活动':['NationalDaySignCfg','NationalDayActiveRewardCfg'],
};
export function captureActivityState(client){
 const state={festivals:null,trade:null};
 client.on('message',({name,body})=>{
  if(name==='SCAllActivity'){const value=normalize(body);state.festivals=value.festivalActivities??[];state.trade=value.trade??null;}
  if(name==='SCActivityActiveScoreUpdate'){
   const value=normalize(body),activity=state.festivals?.find(x=>String(x.activityId)===String(value.activityId));
   const sub=activity?.subActivity?.find(x=>x.subActivityType===11);
   if(sub?.dailyActive)sub.dailyActive.activeScore=value.activeScore;
  }
 });
 return state;
}
export async function runActivityRewards({client,settings:s,activityState,act,log,config=tables}){
 const all=s.ref_welfare_events===true,mid=s.ref_activity_midAutumn_enabled===true;
 const blind=s.ref_activity_blindBox_enabled===true;
 if(!all&&!(mid&&(s.ref_activity_midAutumn_signIn||s.ref_activity_midAutumn_activeReward||s.ref_activity_midAutumn_freeGift))&&!(blind&&(s.ref_activity_blindBox_scoreReward||s.ref_activity_blindBox_freeGift)))return;
 if(!Array.isArray(activityState?.festivals)){log('活动奖励：尚未收到服务器活动清单，暂不执行');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const inventory=async()=>{
  const items=await read('AllItemRequest','AllItemResponse'),res=await read('AllResourceRequest','AllResourceResponse');
  const out=Object.fromEntries((items.items??[]).map(x=>[x.itemId,Number(x.num)]));
  for(const x of res.list??[]){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 const gained=(before,after,reward)=>{
  const sums={};for(const a of reward?.asset??[])if(a.id&&Number(a.num)>0)sums[a.id]=(sums[a.id]??0)+Number(a.num);
  return Object.keys(sums).length>0&&Object.entries(sums).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
 };
 let count=0;
 for(const activity of activityState.festivals){
  const cfg=festivals[activity.type];if(!cfg||!activity.activityId)continue;
  if(!(activity.openTime<=now()&&activity.closeTime>now()))continue;
  const isMid=activity.type==='中秋国庆活动';
  if(!all&&!((mid||blind)&&isMid))continue;
  if(isMid&&(all||mid&&s.ref_activity_midAutumn_freeGift||blind&&s.ref_activity_blindBox_freeGift)&&activity.startTime<=now()&&activity.endTime>now()){
   const shop=activity.subActivity?.find(x=>x.subActivityType===10&&x.openTime<=now()&&x.closeTime>now())?.dailySelectGift;
   if(shop)for(const pack of config.NationalDayLimitPackCfg?.data??[]){
    if(pack.price!==0||pack.chargeId||!Number.isSafeInteger(pack.packId)||!(pack.fixedRewards?.length)||Number(shop.boughtTimes?.[String(pack.packId)]??0)>0)continue;
    const expected=pack.fixedRewards.map(([id,num])=>({id,num}));
    if(expected.some(x=>!x.id||!Number.isSafeInteger(x.num)||x.num<=0))continue;
    if(!all&&!(mid&&s.ref_activity_midAutumn_freeGift)&&!expected.some(x=>x.id==='活动26中秋_盲盒卡'))continue;
    const before=await inventory(),day=Math.floor((now()+28800)/86400);
    const result=await act(`activity-free-pack:${activity.activityId}:${pack.packId}:${day}`,async()=>{
     await client.sendWatch('ClaimFreeSelectGiftRequest',{activityId:activity.activityId,giftId:pack.packId},{window:1000});
     const verified=gained(before,await inventory(),{asset:expected});
     if(verified){shop.boughtTimes??={};shop.boughtTimes[String(pack.packId)]=1;}
     return {status:verified?'verified':'unconfirmed',message:verified?'中秋国庆免费礼包：已核对配置为零元及固定奖励入库':'活动免费礼包结果未确认，停止本轮'};
    });
    if(result&&result.status!=='verified')throw Error('unconfirmed_activity_free_pack');
    if(result&&++count>=10)return;
   }
  }
  if(isMid&&(all||blind&&s.ref_activity_blindBox_scoreReward)&&activity.subActivity?.some(x=>x.subActivityType===24&&x.openTime<=now()&&x.closeTime>now())){
   const info=await read('BlindBoxDetailRequest','BlindBoxDetailResponse',{activityId:activity.activityId});
   const eligible=(config.NationalDayBlindBoxScoreRewardCfg?.data??[]).filter(x=>x.id>info.claimedId&&x.score<=info.stat?.totalScore);
   if(eligible.length&&eligible.every(x=>x.rewards?.length&&x.rewards.every(a=>a[0]&&Number.isSafeInteger(a[1])&&a[1]>0))){
    const before=await inventory(),target=Math.max(...eligible.map(x=>x.id));
    const result=await act(`blind-score:${activity.activityId}:${info.claimedId}:${target}`,async()=>{
     await client.sendWatch('ClaimBlindBoxScoreRewardRequest',{activityId:activity.activityId},{window:1000});
     const current=await read('BlindBoxDetailRequest','BlindBoxDetailResponse',{activityId:activity.activityId});
     const expected=eligible.filter(x=>x.id<=current.claimedId).flatMap(x=>x.rewards.map(([id,num])=>({id,num})));
     const verified=current.claimedId>info.claimedId&&current.claimedId<=target&&gained(before,await inventory(),{asset:expected});
     return {status:verified?'verified':'unconfirmed',message:verified?`盲盒积分奖励：已核对档位 ${current.claimedId} 与库存`:'盲盒积分领取结果未确认，停止本轮'};
    });
    if(result&&result.status!=='verified')throw Error('unconfirmed_blind_score');
    if(result&&++count>=10)return;
   }
  }
  const sub=activity.subActivity?.find(x=>x.subActivityType===11&&x.openTime<=now()&&x.closeTime>now());
  const data=sub?.dailyActive;
  if(data){
   const elapsed=Math.floor((now()+28800)/86400)-Math.floor((activity.startTime+28800)/86400)+1;
   if((all||mid&&s.ref_activity_midAutumn_signIn)&&activity.startTime>0&&activity.startTime<=now()&&activity.endTime>now()){
    // Older missed days are paid makeup check-ins; never select them here.
    const row=config[cfg[0]]?.data?.find(x=>x.signDay===elapsed&&!(data.checkInId??[]).includes(x.rewardId??x.id));
    if(row){
     const id=row.rewardId??row.id,before=await inventory();
     const result=await act(`activity-sign:${activity.activityId}:${id}`,async()=>{
      const current=now(),today=Math.floor((current+28800)/86400)-Math.floor((activity.startTime+28800)/86400)+1;
      if(today!==row.signDay||86400-(current+28800)%86400<30||current>=activity.endTime)return {status:'rejected',message:'活动签到：已临近跨日或活动结束，跳过以避免补签消耗'};
      const reply=await read('ClaimActivityDailyCheckInRewardRequest','ClaimActivityDailyCheckInRewardResponse',{activityId:activity.activityId,checkId:id});
      const verified=reply.checkId?.includes(id)&&gained(before,await inventory(),reply.reward);
      if(verified)data.checkInId=reply.checkId;
      return {status:verified?'verified':'unconfirmed',message:verified?`${activity.type}：已核对今日签到及奖励入库`:'活动签到结果未确认，停止本轮'};
     });
     if(result?.status==='rejected')return;
     if(result&&result.status!=='verified')throw Error('unconfirmed_activity_sign');
     if(result&&++count>=10)return;
    }
   }
   if(all||mid&&s.ref_activity_midAutumn_activeReward){
    const eligible=(config[cfg[1]]?.data??[]).filter(x=>x.score<=data.activeScore&&(x.rewardId??x.id)>(data.claimedRewardId??0));
    if(eligible.length){
     const before=await inventory(),target=Math.max(...eligible.map(x=>x.rewardId??x.id));
     const result=await act(`activity-active:${activity.activityId}:${data.claimedRewardId??0}:${target}`,async()=>{
      const reply=await read('ClaimActivityDailyActiveRewardRequest','ClaimActivityDailyActiveRewardResponse',{activityId:activity.activityId});
      const verified=reply.claimedId>(data.claimedRewardId??0)&&reply.claimedId<=target&&gained(before,await inventory(),reply.reward);
      if(verified)data.claimedRewardId=reply.claimedId;
      return {status:verified?'verified':'unconfirmed',message:verified?`${activity.type}：已核对活跃奖励档位 ${reply.claimedId} 与入库`:'活动活跃奖励结果未确认，停止本轮'};
     });
     if(result&&result.status!=='verified')throw Error('unconfirmed_activity_active');
     if(result&&++count>=10)return;
    }
   }
  }
  // Relic-repair tasks use the common progress/reward interface in the client.
  if(all&&activity.subActivity?.some(x=>x.subActivityType===2&&x.openTime<=now()&&x.closeTime>now())){
   const tasks=(await read('ActivityTaskInfoRequest','ActivityTaskInfoResponse',{activityId:activity.activityId})).task??[];
   for(const task of tasks){
    if(task.rewardClaimed||!(task.targetProgress>0)||task.progress<task.targetProgress)continue;
    const before=await inventory();
    const result=await act(`activity-task:${activity.activityId}:${task.id}`,async()=>{
     const reply=await read('ClaimActivityTaskRewardRequest','ClaimActivityTaskRewardResponse',{activityId:activity.activityId,taskId:task.id});
     const after=(await read('ActivityTaskInfoRequest','ActivityTaskInfoResponse',{activityId:activity.activityId})).task?.find(x=>x.id===task.id);
     const verified=after?.rewardClaimed===true&&gained(before,await inventory(),reply.reward);
     return {status:verified?'verified':'unconfirmed',message:verified?`活动任务 ${task.id}：已核对领取标记与奖励入库`:'活动任务奖励结果未确认，停止本轮'};
    });
    if(result&&result.status!=='verified')throw Error('unconfirmed_activity_task');
    if(result&&++count>=10)return;
   }
  }
 }
}
