import fs from 'node:fs';
import {normalize}from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./world-boss-tables.json',import.meta.url),'utf8'));
export async function runWorldBoss({client,protocol,settings:s,state,act,log,history=new Set(),config=defaults,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!s.ref_world_worldBoss_enabled)return;
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=()=>Math.floor((now()+28800)/86400);
 const read=(a,b,body={})=>client.request(a,body,b,8000).then(normalize);
 const info=async()=>{const x=(await read('WorldBossInfoRequest','WorldBossInfoResponse')).info;return x?{...x,bossId:x.bossId??0,gridIdx:x.gridIdx??0,bestDamage:x.bestDamage??0,gotRewardLevel:x.gotRewardLevel??0}:null;};
 const allFleets=async()=>{const x=await read('MyFleetsRequest','MyFleetsResponse');if(!Array.isArray(x.fleets))throw Error('unknown_world_boss_fleets');return x.fleets;};
 const stock=async()=>{const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');if(!Array.isArray(i.items)||!Array.isArray(r.list))throw Error('unknown_world_boss_inventory');const result=Object.fromEntries(i.items.map(x=>[x.itemId,Number(x.num)]));for(const x of r.list){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)result[id]=Number(x.amount);}return result;};
 const poll=async(id,condition)=>{for(const wait of [0,400,800]){if(wait)await sleep(wait);const f=(await allFleets()).find(x=>x.buildingId===id);if(f&&condition(f))return f;}return null;};
 const doAction=async(key,fn)=>{history.add(key);const x=await act(key,fn);if(x?.status==='rejected')history.delete(key);if(x?.status==='unconfirmed')throw Error('unconfirmed_world_boss');return x;};
 const level=config.ModuleOpenCfg?.data?.find(x=>x.moduleId==='世界')?.playerLevel,days=config.GameplayOpenCfg?.data?.find(x=>x.gameplay==='世界BOSS')?.openDays;
 const age=day()-Math.floor((state.worldOpenTime+28800)/86400)+1;
 if(!Number.isSafeInteger(level)||!(state.level>=level)||!Number.isSafeInteger(state.season)||state.season<1||!(state.worldOpenTime>0)||!Array.isArray(days)||!days.length||age<days[Math.min(state.season,days.length)-1]){log('世界首领：角色等级／本赛季开服条件未达到或尚未确认');return;}
 let boss=await info();
 if(!Number.isSafeInteger(boss?.bossId)||boss.bossId<=0||!Number.isSafeInteger(boss.gridIdx)||boss.gridIdx<=0){log('世界首领：当前没有开放的首领');return;}
 const known=config.WorldBossCfg?.data?.find(x=>x.bossId===boss.bossId);if(!known){log('世界首领：未确认本场首领配置');return;}
 // Claim already-earned tiers even when the strongest fleet is still on its way home.
 if(Number.isSafeInteger(boss.gotRewardLevel)&&boss.gotRewardLevel>=0&&Number.isFinite(Number(boss.bestDamage))){
  const eligible=(config.WorldBossDamageRewardCfg?.data??[]).filter(x=>x.bossId===boss.bossId&&x.season===state.season&&x.level>boss.gotRewardLevel&&Number(boss.bestDamage)>=x.damage).sort((a,b)=>a.level-b.level);
  if(eligible.length){
   const expected={};let valid=true;for(const row of eligible)for(const[id,n]of row.reward??[]){if(!id||!Number.isSafeInteger(n)||n<=0)valid=false;else expected[id]=(expected[id]??0)+n;}
   if(valid&&Object.keys(expected).length){
    const before=await stock(),old=boss,top=eligible.at(-1).level,startedDay=day();
    const result=await doAction(`world-boss:reward:${startedDay}:${old.bossId}:${old.gotRewardLevel}:${top}`,async()=>{
     const current=await info();if(day()!==startedDay||current?.bossId!==old.bossId||current.gotRewardLevel!==old.gotRewardLevel)return{status:'rejected',message:'世界首领奖励已变化，取消重复领取'};
     await client.sendWatch('WorldBossGetDamageRewardRequest',{}, {window:1000});
     const after=await info(),items=await stock();const verified=after?.bossId===old.bossId&&after.gotRewardLevel===top&&Object.entries(expected).every(([id,n])=>(items[id]??0)-(before[id]??0)>=n);
     if(verified)boss=after;
     return{status:verified?'verified':'unconfirmed',message:verified?`世界首领：伤害奖励领取至 ${top} 档，领取标记与奖励入库已确认`:'世界首领奖励入库或领取标记未确认，暂停首领模块'};
    });if(result&&result.status!=='verified')return;
   }
  }
 }
 const requested=Number(s.ref_world_worldBoss_attackTimes??1),limit=Number.isSafeInteger(requested)&&requested>=1&&requested<=20?requested:1;
 const stamp=day(),stem=`world-boss:attack:${stamp}:`,attempted=[...history].filter(k=>k.startsWith(stem)).length;
 const counters=await read('CounterInfoRequest','CounterInfoResponse');if(!Array.isArray(counters.counters)){log('世界首领：每日计数未确认');return;}
 const counter=counters.counters.find(x=>x.type==='DAILY_WORLD_BOSS_TIMES');
 const recorded=counter?Number(counter.num??0):0;
 if(!Number.isSafeInteger(recorded)||recorded<0){log('世界首领：每日计数异常，本轮跳过');return;}
 // Some game versions report a participation flag (0/1), not every replay.
 // Durable intent history always counts toward the configured daily script limit.
 if(Math.max(attempted,recorded)>=limit){log(`世界首领：已达到每日挑战上限 ${limit}，仅检查可领奖励`);return;}
 const unite=await read('UniteWorldsPlanRequest','UniteWorldsPlanResponse');
 if((unite.matchMaking||unite.executeTs>0&&unite.worldIds?.length)&&now()>=unite.executeTs-3600){log('世界首领：合服禁止操作时段');return;}
 const rows=await allFleets();
 if(!rows.length||rows.some(x=>!Number.isSafeInteger(Number(x.power??0))||Number(x.power??0)<0)){log('世界首领：舰队战力名单不完整，不猜测最强舰队');return;}
 const strongest=[...rows].sort((a,b)=>Number(b.power??0)-Number(a.power??0)||a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true}))[0];
 if(!(strongest.power>0)){log('世界首领：尚无可用战力');return;}
 if(strongest.chipWar&&strongest.curGridIdx){
  const mine=await read('ChipMineRequest','ChipMineResponse',{gridId:strongest.curGridIdx}),player=mine.occupiedPositions?.map(x=>x.player).find(x=>x?.fleetId===strongest.buildingId);
  if(!player||!(player.rewardTimes>0)){log('世界首领：最强舰队在硅矿中，暂不满足撤回条件');return;}
  await doAction(`world-boss:recall:${stamp}:${strongest.buildingId}:${strongest.curGridIdx}:${Math.floor(now()/60)}`,async()=>{
   await client.sendWatch('ChipMineRetreatRequest',{fleetId:strongest.buildingId},{window:1000});
   const after=await poll(strongest.buildingId,x=>!x.chipWar&&(!x.curGridIdx||x.state===protocol.FleetState.MOVING));
   return{status:after?'verified':'unconfirmed',message:after?`世界首领：已从硅矿召回最强舰队 ${strongest.buildingId}，等待回港`:'世界首领召回结果未确认，暂停首领模块'};
  });return;
 }
 if(strongest.state!==protocol.FleetState.IDLE||strongest.curGridIdx||strongest.treasureLootUid||strongest.repairing?.endTs>now()||!(strongest.durability>0)){log(`世界首领：最强舰队 ${strongest.buildingId} 忙碌／回港／维修中，等待，不改派较弱舰队`);return;}
 const fuel=config.WorldParamCfg?.data?.find(x=>x.paramName==='进攻首领消耗汽油')?.paramValue;
 if(!Number.isSafeInteger(fuel)||fuel<=0)return;
 const items=await stock();if((items['汽油']??0)<fuel){log(`世界首领：汽油不足 ${fuel}`);return;}
 const result=await doAction(stem+boss.bossId+':'+attempted+':'+Math.floor(now()/60),async()=>{
  const live=await info(),current=(await allFleets()).find(x=>x.buildingId===strongest.buildingId);
  if(day()!==stamp||live?.bossId!==boss.bossId||live.gridIdx!==boss.gridIdx||current?.state!==protocol.FleetState.IDLE||current.curGridIdx||current.treasureLootUid||!(current.durability>0))return{status:'rejected',message:'世界首领或最强舰队状态已变化，取消派遣'};
  await client.sendWatch('ChallengeWorldBossRequest',{bossId:boss.bossId,fleetBuildingIds:[strongest.buildingId]},{window:1000});
  const after=await poll(strongest.buildingId,x=>x.state!==protocol.FleetState.IDLE&&(x.targetGridIdx===boss.gridIdx||x.curGridIdx===boss.gridIdx)),remaining=await stock();
  const verified=!!after&&(items['汽油']??0)-(remaining['汽油']??0)===fuel;
  return{status:verified?'verified':'unconfirmed',message:verified?`世界首领：最强舰队 ${strongest.buildingId} 已出征 ${known.actName??boss.bossId}，目标和汽油 ${fuel} 已核对；伤害稍后再查`:'世界首领派遣或汽油扣款未确认，暂停首领模块'};
 });
 if(result?.status==='verified')log(`世界首领：本次已确认出征；本日脚本出征记录 ${attempted+1}/${limit}`);
}
export async function runWorldBossGuarded({run,client,paused,log}){
 if(paused.has('world-boss'))return;
 try{await run();}catch(e){
  if(client?.connected===false)throw e;
  if(/^timeout waiting for /.test(e.message)){log('世界首领状态查询超时，本轮跳过，其他任务继续');return;}
  if(!e.prompt&&!/^(unconfirmed_world_boss|unknown_world_boss_.*)$/.test(e.message))throw e;
  paused.add('world-boss');log('世界首领结果或开放条件未确认，仅暂停首领模块；其他任务继续');
 }
}
