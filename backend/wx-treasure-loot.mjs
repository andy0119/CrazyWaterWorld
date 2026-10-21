import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./treasure-loot-tables.json',import.meta.url),'utf8'));
const defaultMap=JSON.parse(fs.readFileSync(new URL('./wx-game/world-map1.json',import.meta.url),'utf8'));
const prefix='ref_world_treasureLoot_fleets_';
const clean=x=>String(x??'').normalize('NFC').trim().toLocaleLowerCase();
const words=x=>Array.isArray(x)?[...new Set(x.map(clean).filter(Boolean))]:[];
const guildIndex=x=>{try{return Number(BigInt(String(x))%1000n);}catch{return null;}};
const matches=(value,list)=>list.some(w=>clean(value).includes(w));
const finite=x=>Number.isFinite(Number(x));
export function lootWindow(s,p,now){
 const date=new Date((now+28800)*1000),hour=date.getUTCHours(),seconds=date.getUTCMinutes()*60+date.getUTCSeconds();
 const selected=words(s[p+'hours']).map(Number);
 const allowed=h=>h>=8&&h<=22&&(!selected.length||selected.includes(h));
 const lead=Math.min(30,Math.max(0,Number(s[p+'recallChipMineLeadMin'])||0));
 return {active:allowed(hour),preRecall:!!s[p+'recallChipMine']&&lead>0&&allowed((hour+1)%24)&&3600-seconds<=lead*60};
}
export function lootMatches(t,s,p){
 if(t.color!==Number(s[p+'levels'])||!Number.isSafeInteger(t.uid)||t.uid<=0||!Number.isFinite(t.progress)||t.progress<0||t.progress>=100)return false;
 const namedFollow=s[p+'followAlly']&&words(s[p+'followWord']).length>0;
 const namedChase=!s[p+'followAlly']&&s[p+'chaseEnabled']&&words(s[p+'chaseWord']).length>0;
 if(!namedFollow&&!namedChase&&t.progress>Number(s[p+'maxProgress']??100))return false;
 if(!Array.isArray(t.reward?.asset))return false;
 const assets=new Set(t.reward.asset.filter(x=>Number(x.num)>0).map(x=>x.id));
 if((s[p+'rewardBlock']??[]).some(x=>assets.has(x)))return false;
 const wanted=[...new Set(s[p+'rewardFilter']??[])];
 if(s[p+'filterReward']&&wanted.length){const hits=wanted.filter(x=>assets.has(x)).length,mode=s[p+'rewardFilterMode']??'all';if(!['all','any','count'].includes(mode)||mode==='all'&&hits!==wanted.length||mode==='any'&&hits===0||mode==='count'&&(wanted.length<2||hits<Math.max(2,Number(s[p+'rewardFilterCount'])||2)))return false;}
 return true;
}
export function lootOwnerMatches(t,defence,s,p,myGuild,guilds=[]){
 const following=!!s[p+'followAlly']&&words(s[p+'followWord']).length>0;
 const chasing=!s[p+'followAlly']&&!!s[p+'chaseEnabled']&&words(s[p+'chaseWord']).length>0;
 const safe=words(s[p+'safeWord']),mode=s[p+'safeBy']??'nickname';
 if(!Number.isSafeInteger(t.ownerFleetNum)||t.ownerFleetNum<0)return false;
 if(t.ownerFleetNum===0)return !following&&!chasing;
 if(!Array.isArray(defence)||defence.length<t.ownerFleetNum)return false;
 const current=defence.filter(f=>!f.isNpc);
 const lookup=idx=>guilds.find(g=>guildIndex(g.id)===Number(idx));
 const matchGuild=(idx,list)=>{const g=lookup(idx);return list.some(w=>w===String(idx)||w===String(g?.id)||g&&matches(g.name,[w]));};
 if(safe.length){
  if(!['nickname','guild'].includes(mode))return false;
  if(current.some(f=>mode==='nickname'?(!f.name||matches(f.name,safe)):(!Number.isSafeInteger(f.guildIdx)||(!lookup(f.guildIdx)&&!safe.every(w=>/^\d+$/.test(w)))||matchGuild(f.guildIdx,safe))))return false;
 }
 if(following)return current.some(f=>f.guildIdx===myGuild&&matches(f.name,words(s[p+'followWord'])));
 if(chasing){const list=words(s[p+'chaseWord']);return current.some(f=>s[p+'chaseBy']==='guild'?matchGuild(f.guildIdx,list):matches(f.name,list));}
 return true;
}
export function nearestLootCity({world,map,config,myGuild}){
 const rows=config['1_CityCfg']?.data??[],max=Math.max(...rows.map(x=>x.level));
 const centers=rows.filter(x=>x.level===max);if(centers.length!==1)return null;
 const point=id=>{const idx=map.cityInfo?.[id]?.gridIdx,m=map.mapInfo;if(!Number.isSafeInteger(idx)||!(m?.width>0&&m.tileWidth>0&&m.tileHeight>0))return null;const row=Math.floor(idx/m.width);return[(idx%m.width+(row%2===0?.5:1))*m.tileWidth,-(row+1)*m.tileHeight/2];};
 const center=point(centers[0].id);if(!center)return null;
 return (world.cities??[]).filter(c=>c.guildIdx===myGuild&&point(c.id)).sort((a,b)=>{const dist=id=>{const p=point(id);return Math.hypot(p[0]-center[0],p[1]-center[1]);};return dist(a.id)-dist(b.id)||a.id-b.id;})[0]??null;
}
export async function runTreasureLoot({client,protocol,settings:s,state,act,log,history=new Set(),config=defaults,map=defaultMap,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!s.ref_world_treasureLoot_enabled)return;
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const fleets=async()=>{const x=await read('MyFleetsRequest','MyFleetsResponse');if(!Array.isArray(x.fleets))throw Error('unknown_loot_fleets');return [...x.fleets].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true}));};
 const fleet=async id=>(await fleets()).find(f=>f.buildingId===id);
 const stock=async()=>{const x=await read('AllItemRequest','AllItemResponse');if(!Array.isArray(x.items))throw Error('unknown_loot_inventory');return Object.fromEntries(x.items.map(i=>[i.itemId,Number(i.num)]));};
 const ruby=async()=>{const x=await read('AllResourceRequest','AllResourceResponse'),res=protocol.Resource?.RUBY??4,v=x.list?.find(i=>i.res===res);return v&&finite(v.amount)?Number(v.amount):null;};
 const checked=async(key,action)=>{
  // Persist intents even when their response is uncertain. Never replay the same action key.
  history.add(key);const result=await act(key,action);if(result?.status==='rejected')history.delete(key);if(result?.status==='unconfirmed')throw Error('unconfirmed_treasure_loot');return result;
 };
 const poll=async(id,predicate)=>{for(const wait of [0,400,800]){if(wait)await sleep(wait);const f=await fleet(id);if(f&&predicate(f))return f;}return null;};
 const unlock=config.ModuleOpenCfg?.data?.find(x=>x.moduleId==='世界')?.playerLevel;
 if(!Number.isSafeInteger(unlock)||!(state.level>=unlock)){log('搁浅货轮：世界尚未开放');return;}
 const opening=config.GameplayOpenCfg?.data?.find(x=>x.gameplay==='世界宝藏')?.openDays;
 if(Array.isArray(opening)&&opening.length){
  const age=Math.floor((now()+28800)/86400)-Math.floor((state.worldOpenTime+28800)/86400)+1;
  if(!Number.isSafeInteger(state.season)||state.season<1||!(state.worldOpenTime>0)||age<opening[Math.min(state.season,opening.length)-1]){log('搁浅货轮：本赛季世界宝藏尚未开放或开服时间未确认');return;}
 }
 const enabled=[0,1,2].filter(i=>s[prefix+i+'_enabled']);
 if(!enabled.length){log('搁浅货轮：没有开启出征舰队');return;}
 if(!enabled.some(i=>{const w=lootWindow(s,prefix+i+'_',now());return w.active||w.preRecall;})){log('搁浅货轮：不在所选时段或整点前召回时段');return;}
 const guild=await read('GuildInfoRequest','GuildInfoResponse'),myGuild=guildIndex(guild.guild?.guildId);
 if(!(myGuild>0)||config.GuildTitleCfg?.data?.find(x=>x.title===guild.myTitle)?.treasureLoot!==1){log('搁浅货轮：联盟身份尚无占领权限');return;}
 const unite=await read('UniteWorldsPlanRequest','UniteWorldsPlanResponse');
 if((unite.matchMaking||unite.executeTs>0&&unite.worldIds?.length)&&now()>=unite.executeTs-3600){log('搁浅货轮：合服禁止操作时段');return;}
 const cost=config.WorldParamCfg?.data?.find(x=>x.paramName==='进攻宝藏消耗汽油')?.paramValue;
 const cap=config.TreasureLootParamCfg?.data?.find(x=>x.paramName==='每日宝藏奖励次数')?.paramValue;
 if(!Number.isSafeInteger(cost)||cost<=0||!Number.isSafeInteger(cap)||cap<=0)return;
 let guilds=null;
 const qualify=async(t,p)=>{
  if(!lootMatches(t,s,p))return false;
  const needGuild=words(s[p+'safeWord']).length&&s[p+'safeBy']==='guild'||words(s[p+'chaseWord']).length&&s[p+'chaseBy']==='guild';
  if(needGuild&&guilds===null){const x=await read('AllGuildAbstractionRequest','AllGuildAbstractionResponse');if(!Array.isArray(x.guilds))return false;guilds=x.guilds;}
  const defence=t.ownerFleetNum>0?(await read('TreasureLootDefenceRequest','TreasureLootDefenceResponse',{uid:t.uid})).fleets:[];
  return lootOwnerMatches(t,defence,s,p,myGuild,guilds??[]);
 };
 const accelerate=async(f,p)=>{
  const target=Number(s[p+'marchSpeedupTargetSecs']??100),cost=config.WorldParamCfg?.data?.find(x=>x.paramName==='行军加速消耗')?.paramValue;
  if(!s[p+'marchSpeedup']||!(target>=0&&target<=100)||!Number.isSafeInteger(cost)||cost<=0)return f;
  for(let count=0;count<8&&f?.state===protocol.FleetState.MOVING&&f.treasureLootUid>0&&f.moveEndTs-now()>target;count++){
   const balance=await ruby();if(balance===null||balance<cost){log('货轮行军加速：钻石不足或余额未确认，正常行军');break;}
   const old=f,end=f.moveEndTs,key=`loot-speed:${f.buildingId}:${f.treasureLootUid}:${end}:${balance}`;
   const result=await checked(key,async()=>{
    const current=await fleet(old.buildingId);if(current?.state!==protocol.FleetState.MOVING||current.moveEndTs!==end||current.treasureLootUid!==old.treasureLootUid)return{status:'rejected',message:'货轮行军状态已变，取消加速'};
    await client.sendWatch('SpeedUpFleetRequest',{buildingId:old.buildingId},{window:800});
    const after=await poll(old.buildingId,x=>x.moveEndTs<end||x.state!==protocol.FleetState.MOVING),afterRuby=await ruby();
    return{status:after&&afterRuby!==null&&balance-afterRuby===cost?'verified':'unconfirmed',message:after&&afterRuby!==null&&balance-afterRuby===cost?`货轮行军加速：已核对耗钻 ${cost} 与行军状态`:'货轮行军加速未确认，停止本模块'};
   });if(result?.status!=='verified')break;f=await fleet(old.buildingId);
  }return f;
 };
 const repair=async(f,p)=>{
  if(!s[p+'fullRepair'])return f;
  if(!(f.maxDura>0)||!finite(f.durability))return null;
  if(f.durability>=f.maxDura)return f;
  if(f.state===protocol.FleetState.IDLE&&!f.curGridIdx&&!f.treasureLootUid){
   const quote=await read('FleetRepairParamRequest','FleetRepairParamResponse',{buildingId:f.buildingId});
   const fuel=Math.ceil((f.maxDura-f.durability)*Number(quote.unitRepairCost)),items=await stock();
   if(!finite(quote.unitRepairCost)||quote.unitRepairCost<0||!Number.isSafeInteger(fuel)||fuel<0||(items['汽油']??0)<fuel){log('货轮修复：维修汽油不足或报价未确认');return null;}
   const old=f;const result=await checked(`loot-repair:${f.buildingId}:${f.durability}:${now()}`,async()=>{
    await client.sendWatch('RepairFleetRequest',{buildingId:old.buildingId},{window:800});
    const after=await poll(old.buildingId,x=>x.repairing?.endTs>now()||x.durability>old.durability),itemsAfter=await stock();
    const verified=!!after&&(items['汽油']??0)-(itemsAfter['汽油']??0)===fuel;
    return{status:verified?'verified':'unconfirmed',message:verified?`货轮 ${old.buildingId}：已开始修复并核对汽油 ${fuel}`:'货轮修复未确认，停止本模块'};
   });if(result?.status!=='verified')return null;f=await fleet(old.buildingId);
  }
  if(f?.repairing?.endTs>now()){
   // Conservative upper bound: every minute priced at the highest fleet rate.
   const rates=config.SpeedUpRubyCfg?.data?.map(x=>Number(x.fleet));
   const minutes=Math.ceil((f.repairing.endTs-now())/60),upper=Array.isArray(rates)&&rates.length&&rates.every(x=>finite(x)&&x>0)?Math.ceil(minutes*Math.max(...rates)):null;
   const balance=await ruby();
   if(!upper||balance===null||balance<upper){log('货轮修复：钻石不足以覆盖维修加速上限，等待自然修复');return null;}
   const old=f;const result=await checked(`loot-repair-speed:${f.buildingId}:${f.repairing.endTs}`,async()=>{
    await client.sendWatch('SpeedUpRepairRequest',{buildingId:old.buildingId,speedUp:{type:protocol.SpeedUpCost.SPEED_UP_RUBY,useNum:0}},{window:800});
    const after=await poll(old.buildingId,x=>x.durability>=x.maxDura&&x.state===protocol.FleetState.IDLE),afterRuby=await ruby(),used=balance-afterRuby;
    const verified=!!after&&afterRuby!==null&&used>=0&&used<=upper;
    return{status:verified?'verified':'unconfirmed',message:verified?`货轮 ${old.buildingId}：已修满，核对耗钻 ${used}（预算上限 ${upper}）`:'货轮加速修复未确认，停止本模块'};
   });if(result?.status!=='verified')return null;f=await fleet(old.buildingId);
  }
  if(f?.durability<f?.maxDura){log('货轮修复：尚未修满，等待下一轮');return null;}return f;
 };
 const position=async(f,i,p)=>{
  if(!s[p+'moveNearCenter']||f.state!==protocol.FleetState.IDLE||f.curGridIdx||f.treasureLootUid||!(f.durability>0))return false;
  if(state.scenarioId!==1){log('货轮前移：当前场景地图未确认，保留原位置');return false;}
  const world=await read('WorldInfoRequest','WorldInfoResponse',{screenCenter:{x:0,y:0}}),city=nearestLootCity({world,map,config,myGuild});
  if(!city||city.id===f.cityId)return false;
  const items=await stock(),old=f;
  const result=await checked(`loot-center:${f.buildingId}:${city.id}:${f.cityId}`,async()=>{
   const latest=await read('WorldInfoRequest','WorldInfoResponse',{screenCenter:{x:0,y:0}}),current=await fleet(old.buildingId);
   if(current?.state!==protocol.FleetState.IDLE||current.curGridIdx||current.treasureLootUid||!latest.cities?.some(x=>x.id===city.id&&x.guildIdx===myGuild))return{status:'rejected',message:'前移城市或舰队状态已变，取消移动'};
   await client.sendWatch('MoveFleetsToCityRequest',{buildingId:[old.buildingId],cityId:city.id},{window:1000});
   const after=await poll(old.buildingId,x=>x.state===protocol.FleetState.MOVING&&x.targetCityId===city.id||x.state===protocol.FleetState.IDLE&&x.cityId===city.id),itemsAfter=await stock();
   const verified=!!after&&(items['汽油']??0)===(itemsAfter['汽油']??0);
   return{status:verified?'verified':'unconfirmed',message:verified?`货轮舰队 ${i+1}：已免费前移至靠近中心的本盟城市 ${city.id}`:'货轮前移或免费条件未确认，停止本模块'};
  });
  return result?.status==='verified';
 };
 const ordered=await fleets();let dispatched=0;
 for(const i of enabled){
  const p=prefix+i+'_',original=ordered[i];if(!original){log(`货轮舰队 ${i+1} 尚未解锁`);continue;}
  let f=await fleet(original.buildingId);if(!f)continue;
  const window=lootWindow(s,p,now()),named=s[p+'followAlly']&&words(s[p+'followWord']).length||!s[p+'followAlly']&&s[p+'chaseEnabled']&&words(s[p+'chaseWord']).length;
  if(!window.active&&!window.preRecall)continue;
  const stats=await read('TreasureLootStatsRequest','TreasureLootStatsResponse');
  if(!Number.isSafeInteger(stats.todayRewardTimes)||!Number.isSafeInteger(stats.nextRefreshTime))continue;
  if(s[p+'attackMode']!=='unlimited'&&stats.todayRewardTimes>=cap){log(`货轮舰队 ${i+1}：今日奖励已领满，不再出征`);continue;}
  // Maintain an already dispatched voyage regardless of target filters changing.
  if(window.active&&f.state===protocol.FleetState.MOVING&&f.treasureLootUid){await accelerate(f,p);continue;}
  const list=await read('TreasureLootListRequest','TreasureLootListResponse');if(!Array.isArray(list.treasure))continue;
  const previously=[...history].filter(k=>k.startsWith(`loot:${f.buildingId}:`));
  const pinned=s[p+'repeatAttack']?[...previously].reverse().map(k=>Number(k.split(':')[2])).find(id=>list.treasure.some(t=>t.uid===id&&t.progress<100)):null;
  const candidates=(pinned?list.treasure.filter(t=>t.uid===pinned):[...list.treasure]).sort((a,b)=>Number(b.uid===pinned)-Number(a.uid===pinned)||a.progress-b.progress||a.uid-b.uid);
  let target=null;
  for(const t of candidates){if(!s[p+'repeatAttack']&&previously.some(k=>k.startsWith(`loot:${f.buildingId}:${t.uid}:`)))continue;if(await qualify(t,p)){target=t;break;}}
  if(f.chipWar&&f.curGridIdx&&s[p+'recallChipMine']&&((!named&&window.preRecall)||(window.active&&target))){
   const mine=await read('ChipMineRequest','ChipMineResponse',{gridId:f.curGridIdx});
   const mining=mine.occupiedPositions?.map(x=>x.player).find(x=>x?.fleetId===f.buildingId);
   if(!mining||!(mining.rewardTimes>0)){log(`货轮舰队 ${i+1}：硅矿撤回条件未满足或尚未确认，等待`);continue;}
   const old=f,key=`loot-recall:${f.buildingId}:${f.curGridIdx}:${stats.nextRefreshTime}`;
   await checked(key,async()=>{
    await client.sendWatch('ChipMineRetreatRequest',{fleetId:old.buildingId},{window:800});
    const after=await poll(old.buildingId,x=>!x.chipWar&&(!x.curGridIdx||x.state===protocol.FleetState.MOVING));
    return{status:after?'verified':'unconfirmed',message:after?`货轮舰队 ${i+1}：已从硅矿召回，等待回港`:'硅矿召回未确认，停止货轮模块'};
   });continue;
  }
  if(!window.active)continue;
  if(f.state!==protocol.FleetState.IDLE&&f.state!==protocol.FleetState.REPAIRING||f.curGridIdx||f.treasureLootUid)continue;
  if(!target){log(`货轮舰队 ${i+1}：没有符合名单、档位、奖励及进度的目标`);}
  if(await position(f,i,p))continue;
  if(target){f=await repair(f,p);if(!f)continue;}
  if(f.state!==protocol.FleetState.IDLE||!(f.durability>0)||f.repairing?.endTs>now())continue;
  if(target){
   const items=await stock();if((items['汽油']??0)<cost){log('货轮出征：汽油不足');continue;}
   const stem=`loot:${f.buildingId}:${target.uid}:${stats.nextRefreshTime}`,attempt=[...history].filter(k=>k===stem||k.startsWith(stem+':')).length;
   const key=stem+':'+(s[p+'repeatAttack']?attempt:0)+':'+Math.floor(now()/60);const old=f;
   const result=await checked(key,async()=>{
    const current=await fleet(old.buildingId),fresh=await read('TreasureLootListRequest','TreasureLootListResponse'),live=fresh.treasure?.find(t=>t.uid===target.uid);
    if(!lootWindow(s,p,now()).active||current?.state!==protocol.FleetState.IDLE||current.curGridIdx||current.treasureLootUid||!live||!await qualify(live,p))return{status:'rejected',message:'货轮目标、名单或舰队状态已变化，取消派遣'};
    await client.sendWatch('TreasureLootSendFleetsRequest',{uid:live.uid,fleetBuildingIds:[old.buildingId]},{window:1000});
    const after=await poll(old.buildingId,x=>x.treasureLootUid===live.uid&&x.state!==protocol.FleetState.IDLE),itemsAfter=await stock();
    const verified=!!after&&(items['汽油']??0)-(itemsAfter['汽油']??0)===cost;
    return{status:verified?'verified':'unconfirmed',message:verified?`搁浅货轮：舰队 ${i+1} → ${live.uid} 已确认，汽油 ${cost}${s[p+'repeatAttack']?'，反复攻占已开启':''}`:'货轮派遣或汽油扣款未确认，停止本模块'};
   });
   if(result?.status==='verified'){dispatched++;await accelerate(await fleet(old.buildingId),p);}continue;
  }

 }
 log(`搁浅货轮：本轮确认新派遣 ${dispatched} 条舰队`);
}
export async function runTreasureLootGuarded({run,client,paused,log}){
 if(paused.has('treasure-loot'))return;
 try{await run();}catch(e){
  if(client?.connected===false)throw e;
  if(/^timeout waiting for /.test(e.message)){log('货轮状态查询超时，本轮跳过，下一轮重查；其他任务继续');return;}
  if(!e.prompt&&!/^(unconfirmed_treasure_loot|unknown_loot_.*)$/.test(e.message))throw e;
  paused.add('treasure-loot');log(e.prompt?'服务器拒绝货轮状态查询，暂停货轮模块；其他任务继续':'货轮动作结果未确认，仅暂停货轮模块，避免重复发包；其他任务继续');
 }
}
