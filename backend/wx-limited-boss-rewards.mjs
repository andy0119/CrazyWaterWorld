import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./limited-boss-reward-tables.json',import.meta.url),'utf8'));
export async function runLimitedBossRewards({client,settings:s,state,act,log,paused=new Set(),config=defaults}){
 if(!s.ref_world_limitedBoss_enabled||!s.ref_world_limitedBoss_challengeReward||paused.has('limited-boss-rewards'))return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const rows=config.LimitedBossChallengeRewardCfg?.data?.filter(x=>x.season===state.season).sort((a,b)=>a.challengeTimes-b.challengeTimes)??[];
 if(!rows.length){log('机械蛞蝓奖励：本赛季奖励配置未确认，跳过');return;}
 const valid=x=>Number.isSafeInteger(x.challengeTimes)&&x.challengeTimes>0&&Array.isArray(x.reward)&&x.reward.length>0&&x.reward.every(a=>Array.isArray(a)&&typeof a[0]==='string'&&Number.isSafeInteger(a[1])&&a[1]>0);
 if(!rows.every(valid))return;
 const stock=async()=>{
  const items=await read('AllItemRequest','AllItemResponse'),resources=await read('AllResourceRequest','AllResourceResponse');
  if(!Array.isArray(items.items)||!Array.isArray(resources.list))throw Error('limited_boss_inventory_unknown');
  const out=Object.fromEntries(items.items.map(x=>[x.itemId,Number(x.num)]));
  for(const r of resources.list){const id={1:'EXP',3:'GOLD',4:'RUBY'}[r.res];if(id)out[id]=Number(r.amount);}
  return out;
 };
 for(let attempt=0;attempt<rows.length;attempt++){
  const info=await read('LimitedBossOpenRequest','LimitedBossOpenResponse');
  if(!(info.activityStartTs>0&&info.activityEndTs>info.activityStartTs&&now()>=info.activityStartTs&&now()<info.activityEndTs-10)){log('机械蛞蝓奖励：活动未开放或已接近结束');return;}
  if(!info.rewardInfo)return;
  const times=Number(info.rewardInfo.myTroopsNum??0),got=Number(info.rewardInfo.myGotRewardLevel??0);
  if(!Number.isSafeInteger(times)||!Number.isSafeInteger(got)||times<0||got<0)return;
  const eligible=rows.filter(x=>x.challengeTimes>got&&x.challengeTimes<=times);
  if(!eligible.length){log(`机械蛞蝓奖励：出征 ${times} 次，已领至 ${got} 次档，无可领奖励`);return;}
  const before=await stock();
  const result=await act(`limited-boss-reward:${info.activityStartTs}:${got}:${times}`,async()=>{
   const fresh=await read('LimitedBossOpenRequest','LimitedBossOpenResponse');
   if(fresh.activityStartTs!==info.activityStartTs||Number(fresh.rewardInfo?.myGotRewardLevel??0)!==got||Number(fresh.rewardInfo?.myTroopsNum??0)!==times||now()>=info.activityEndTs-10)return {status:'rejected',message:'机械蛞蝓奖励：活动或奖励档位已变化，留待下一轮重新读取'};
   await client.sendWatch('LimitedBossGetRewardRequest',{}, {window:1000});
   const afterInfo=await read('LimitedBossOpenRequest','LimitedBossOpenResponse'),after=await stock(),level=Number(afterInfo.rewardInfo?.myGotRewardLevel??0);
   const claimed=eligible.filter(x=>x.challengeTimes<=level),expected={};
   for(const r of claimed)for(const [id,n] of r.reward)expected[id]=(expected[id]??0)+n;
   const verified=afterInfo.activityStartTs===info.activityStartTs&&claimed.length>0&&claimed.at(-1).challengeTimes===level&&Object.entries(expected).every(([id,n])=>Number.isFinite(before[id]??0)&&Number.isFinite(after[id]??0)&&(after[id]??0)-(before[id]??0)>=n);
   return {status:verified?'verified':'unconfirmed',message:verified?`机械蛞蝓挑战奖励：已领至 ${level} 次档，物品与钻石入库已核对`:'机械蛞蝓奖励结果未确认，暂停本项以避免重复领取'};
  });
  if(!result||result.status==='rejected')return;
  if(result.status!=='verified'){paused.add('limited-boss-rewards');return;}
 }
}
