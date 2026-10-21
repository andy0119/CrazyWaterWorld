import {normalize} from './wx-game/worlds.mjs';
export async function runBlindBox({client,settings:s,activityState,act,log}){
 if(!s.ref_activity_blindBox_enabled||!s.ref_activity_blindBox_play)return;
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const activity=activityState?.festivals?.find(x=>x.type==='中秋国庆活动'&&x.startTime<=now()&&x.endTime>now()&&x.subActivity?.some(t=>t.subActivityType===24&&t.openTime<=now()&&t.closeTime>now()));
 if(!activity){log('盲盒：尚未确认实际开放的活动');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const detail=()=>read('BlindBoxDetailRequest','BlindBoxDetailResponse',{activityId:activity.activityId});
 const stock=async()=>{
  const items=await read('AllItemRequest','AllItemResponse'),res=await read('AllResourceRequest','AllResourceResponse');
  const out=Object.fromEntries((items.items??[]).map(x=>[x.itemId,Number(x.num)]));
  for(const x of res.list??[]){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 let info=await detail();if(!Number.isSafeInteger(info.stat?.totalRound)||info.stat.totalRound<0)return;
 if(!info.round?.prizeType?.length){
  const before=await stock(),cards=before['活动26中秋_盲盒卡']??0,reserve=Math.max(0,Math.floor(Number(s.ref_activity_blindBox_keepCards)||0));
  if(!Number.isSafeInteger(cards)||cards-1<reserve){log('盲盒：卡片不足或已达到保留数量');return;}
  const result=await act(`blind-start:${activity.activityId}:${info.stat.totalRound}:${cards}`,async()=>{
   const reply=await read('BlindBoxStartRequest','BlindBoxStartResponse',{activityId:activity.activityId});
   info=await detail();const after=await stock();
   const verified=reply.prizeType?.length>0&&info.round?.prizeType?.length>0&&cards-(after['活动26中秋_盲盒卡']??0)===1;
   return {status:verified?'verified':'unconfirmed',message:verified?'盲盒：已核对新回合与一张卡片消耗':'盲盒开始结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_blind_start');
 }
 // Each opening is decided by the server; no client-generated rewards or scores.
 for(let count=0;count<12;count++){
  if(!info.round?.prizeType?.length)return;
  const opened=info.round.opened??[],index=Array.from({length:12},(_,i)=>i+1).find(i=>!opened.some(x=>x.boxIndex===i));
  if(!index)return;
  const before=await stock(),round=info.stat.totalRound;
  const result=await act(`blind-open:${activity.activityId}:${round}:${index}`,async()=>{
   const reply=await read('BlindBoxOpenRequest','BlindBoxOpenResponse',{activityId:activity.activityId,boxIndex:index});
   const current=await detail(),after=await stock(),assets={};
   for(const a of reply.reward?.asset??[])if(a.id&&Number(a.num)>0)assets[a.id]=(assets[a.id]??0)+Number(a.num);
   const rewardVerified=Object.entries(assets).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   const progressed=reply.finished===true?!!reply.stat&&current.stat?.totalRound===reply.stat.totalRound&&current.stat?.totalScore===reply.stat.totalScore&&(current.stat.totalRound>round||current.stat.totalScore>info.stat.totalScore):current.round?.opened?.some(x=>x.boxIndex===index&&x.prizeType===reply.prizeType&&x.prizeType>0);
   const verified=progressed&&rewardVerified;
   if(verified)info=current;
   return {status:verified?'verified':'unconfirmed',finished:reply.finished===true,message:verified?`盲盒第 ${index} 箱：已核对服务器开启状态${Object.keys(assets).length?'与奖励入库':''}${reply.finished?'，本回合结束':''}`:'盲盒开启结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_blind_open');
  if(result.finished)return;
 }
}
