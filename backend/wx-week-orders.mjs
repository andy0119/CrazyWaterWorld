import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runWeekOrders({client,settings:s,act,log,history=new Set(),config=tables}){
 if(!s.ref_activity_weekOrder_enabled)return;
 if(s.ref_activity_weekOrder_buyMissingMaterials){log('活动订单：购买缺料尚未接通，停止提交');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const day=()=>new Date((now()+28800)*1000).toISOString().slice(0,10);
 const time=(await read('WeekInfoRequest','WeekInfoResponse')).activityTime?.find(x=>x.type===5&&x.startTime<=now()&&x.endTime>now());
 if(!time)return;
 const rewards=(config.WeekOrderRwdCfg?.data??[]).filter(x=>x.periodId===time.period);
 const normal=rewards.filter(x=>x.rwdId>0),final=rewards.find(x=>x.rwdId===0);
 if(!normal.length||!final||rewards.some(x=>!Array.isArray(x.reward)||!x.reward[0]||!Number.isSafeInteger(x.reward[1])||x.reward[1]<=0))return;
 const detail=()=>read('WeekOrderInfoRequest','WeekOrderInfoResponse');
 const stock=async()=>{
  const items=await read('AllItemRequest','AllItemResponse'),resources=await read('AllResourceRequest','AllResourceResponse');
  if(!Array.isArray(items.items)||!Array.isArray(resources.list))throw Error('unknown_week_order_inventory');
  const out=Object.fromEntries(items.items.map(x=>[x.itemId,Number(x.num)]));
  for(const x of resources.list){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 const valid=info=>Array.isArray(info.gotRwdId)&&new Set(info.gotRwdId).size===info.gotRwdId.length&&info.gotRwdId.every(id=>normal.some(x=>x.rwdId===id));
 const gain=(before,after,costs,reward)=>{
  const delta={};for(const [id,n]of Object.entries(costs))delta[id]=-n;
  delta[reward[0]]=(delta[reward[0]]??0)+reward[1];
  return Object.entries(delta).every(([id,n])=>Number.isSafeInteger(after[id]??0)&&Number.isSafeInteger(before[id]??0)&&(after[id]??0)-(before[id]??0)===n);
 };
 for(let iteration=0;iteration<3;iteration++){
  if(time.endTime<=now())return;
  const info=await detail();if(!valid(info))return;
  if(info.gotRwdId.length===normal.length){
   if(info.isGotFinal)return;
   const before=await stock();
   const result=await act(`week-final:${time.period}:${time.startTime}`,async()=>{
    if(time.endTime<=now())return{status:'rejected',message:'活动订单已结束'};
    await client.sendWatch('WeekOrderGotFinalRequest',{});
    const current=await detail(),after=await stock();
    const ok=valid(current)&&current.isGotFinal===true&&gain(before,after,{},final.reward);
    return{status:ok?'verified':'unconfirmed',message:ok?'活动订单最终奖励已入库':'活动订单最终奖励未确认，停止本轮'};
   });
   if(result&& !['verified','rejected'].includes(result.status))throw Error('unconfirmed_week_final');
   return;
  }
  const prefix=`week-order:${day()}:`,cap=Math.max(0,Math.floor(Number(s.ref_activity_weekOrder_dailyLimit)||0));
  if(cap&&[...history].filter(x=>x.startsWith(prefix)).length>=cap){log('活动订单已达到每日设置上限');return;}
  const costs={};if(!info.order?.length)return;
  for(const x of info.order){if(!x.id||x.id==='RUBY'||!Number.isSafeInteger(Number(x.num))||x.num<=0)return;costs[x.id]=(costs[x.id]??0)+Number(x.num);}
  const before=await stock();if(Object.entries(costs).some(([id,n])=>!Number.isSafeInteger(n)||!Number.isSafeInteger(before[id]??0)||(before[id]??0)<n)){log('活动订单材料不足，等待生产，不购买缺料');return;}
  const key=prefix+`${time.period}:${time.startTime}:${[...info.gotRwdId].sort((a,b)=>a-b).join(',')}`;
  if(history.has(key))return;
  history.add(key);
  const result=await act(key,async()=>{
   if(time.endTime<=now())return{status:'rejected',message:'活动订单已结束'};
   const reply=await read('FinishWeekOrderRequest','FinishWeekOrderResponse');
   const current=await detail(),after=await stock(),reward=normal.find(x=>x.rwdId===reply.randomRwdId);
   const ok=!!reward&&!info.gotRwdId.includes(reply.randomRwdId)&&valid(current)&&current.gotRwdId.length===info.gotRwdId.length+1&&info.gotRwdId.every(id=>current.gotRwdId.includes(id))&&current.gotRwdId.includes(reply.randomRwdId)&&gain(before,after,costs,reward.reward);
   return{status:ok?'verified':'unconfirmed',message:ok?`活动订单完成：材料与奖励 ${reply.randomRwdId} 已核对`:'活动订单结果未确认，停止本轮'};
  });
  if(!result||result.status==='rejected')return;
  if(result.status!=='verified')throw Error('unconfirmed_week_order');
 }
}
