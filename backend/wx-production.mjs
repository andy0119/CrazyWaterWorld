import {expandProductionNeeds} from './wx-production-plan.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {loadProtocol} from './wx-game/proto.mjs';
const protocol=loadProtocol();
import {normalize} from './wx-game/worlds.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8'));
const vipCaps=JSON.parse(fs.readFileSync(new URL('./farm-vip-capacity.json',import.meta.url),'utf8'));
export async function runProduction({client,settings:s,act,log,state={},tables=config.tables}){
 if(!s.residents_0&&!(s.factory_0&&s.ref_island_factory_autoProduce))return;
 const read=(a,b,body={})=>client.request(a,body,b,8000).then(normalize);
 const water=()=>read('OnWaterRequest','OnWaterResponse');
 const inventory=async()=>{const x=await read('AllItemRequest','AllItemResponse');return Object.fromEntries((x.items??[]).map(v=>[v.itemId,Number(v.num)]));};
 const stamp=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const blocked=new Set(s.residents_3??[]);
 const recipes=tables.BuildingProduceCfg?.data??[];
 const crops=new Set(['小麦','玉米','土豆','番茄','胡萝卜','卷心菜','大豆','南瓜','辣椒','茄子','花菜','可可豆','橡胶']);
 let world=await water();let stock=await inventory();
 let needs=new Map();let demandOrder=new Map();
 const addNeed=(id,num,rank)=>{if(!id||!Number.isFinite(Number(num))||Number(num)<=0)return;needs.set(id,(needs.get(id)??0)+Number(num));demandOrder.set(id,Math.min(demandOrder.get(id)??Infinity,rank));};
 const sourceOrder=s.ref_island_factory_proposedPriority??[];
 const knownSources=['building','guild','guildShip','cargo','resident','museum','radar','pet','petAdvance','activity','heroRaid'];
 const categoryMode=!sourceOrder.length||sourceOrder.some(x=>knownSources.includes(x));
 const rank=source=>{const selected=sourceOrder.indexOf(source);return selected>=0?selected:sourceOrder.length+knownSources.indexOf(source);};
 // Empty legacy priority lists must not suppress all resident demand.
 if(s.residents_0)
  for(const order of world.workerOrder??[])if(!order.refreshTime&&!(order.requirements??[]).some(a=>blocked.has(a.id))&&!(s.residents_1&&(order.requirements??[]).some(a=>crops.has(a.id)))&&!(s.residents_2&&(order.requirements??[]).some(a=>(stock[a.id]??0)<Number(a.num))))for(const a of order.requirements??[])addNeed(a.id,a.num,rank('resident'));
 if(s.factory_0&&s.ref_island_factory_autoProduce&&s.trade_0){
  try{const cargo=await read('CargoShipsRequest','CargoShipsResponse');for(const ship of cargo.ship??[])if((ship.status==='IN_ORDER'||ship.status===protocol.CargoShipStatus.IN_ORDER))for(const item of ship.orderItem??[])if(!item.filled)addNeed(item.asset?.id,item.asset?.num,rank('cargo'));}
  catch{log('自动生产：货船需求读取失败，本轮仅使用已确认的需求');}
 }
 if(s.factory_0&&s.ref_island_factory_autoProduce&&s.ref_island_factory_priorityProduce&&categoryMode){
  if(rank('guild')>=0&&s.ref_guild_order_enabled){
   try{const guild=(await read('GuildInfoRequest','GuildInfoResponse')).guild;
    if(guild){const order=(await read('GuildOrderRequest','GuildOrderResponse')).order;
     if(order?.nextRefreshTime>stamp())for(const a of order.requirements??[])if(!['RUBY','GOLD'].includes(a.id))addNeed(a.id,a.num,rank('guild'));}
   }catch{log('自动生产：联盟订单读取失败，跳过该需求来源');}
  }
  if(rank('building')>=0&&s.building_0&&Number.isFinite(state.level)){
   const unlocks=tables.BuildingUnlockCfg?.data??[],rows=tables.BuildingUpgradeCfg?.data??[];
   const type=b=>unlocks.find(u=>u.buildingId===b.buildingId)?.buildingType;
   const population=(world.building??[]).reduce((n,b)=>n+(rows.find(r=>r.buildingType===type(b)&&r.level===b.level)?.effect??[]).filter(e=>e[0]==='人口增加').reduce((v,e)=>v+Number(e[1]),0),0);
   const candidates=(world.building??[]).flatMap(b=>{
    const kind=type(b);if(!kind||b.buildFinishTime>0||(s.building_5??[]).some(v=>v===kind||v===b.buildingId)||!(b.level===0?s.building_2:s.building_3))return[];
    const row=rows.find(r=>r.buildingType===kind&&r.level===b.level+1);
    return row&&row.playerLevel<=state.level&&Number(row.curPeople)<=population&&!(row.condition??[]).length?[row]:[];
   }).sort((a,b)=>a.playerLevel-b.playerLevel||a.curPeople-b.curPeople);
   // Stage the next eligible project only; don't fill warehouses for every upgrade.
   for(const [id,n] of candidates[0]?.consume??[])if(!['GOLD','RUBY'].includes(id))addNeed(id,n,rank('building'));
  }
 }
 if(s.factory_0&&s.ref_island_factory_autoProduce&&s.ref_world_radar_enabled&&s.ref_world_radar_refugee){
   try{const info=(await read('RadarInfoRequest','RadarInfoResponse')).radarInfo;
    if(info?.level>0){for(const e of info.events??[]){
     if(e.state!==protocol.RadarEventState.RADAR_EVENT_INIT||!e.refugee||!e.uid||String(e.uid)==='0')continue;
     const req=e.refugee.requirements??[];
     if(!req.length||req.some(a=>!a.id||['RUBY','GOLD'].includes(a.id)||!Number.isSafeInteger(Number(a.num))||Number(a.num)<=0))continue;
     for(const a of req)addNeed(a.id,a.num,rank('radar'));
    }}
   }catch{log('自动生产：雷达流民需求读取失败，跳过该来源');}
  }
 if(s.factory_0&&s.ref_island_factory_autoProduce&&s.ref_guild_ship_enabled)for(const a of state.guildShipNeeds??[])if(!blocked.has(a.id))addNeed(a.id,a.num,rank('guildShip'));
 if(s.factory_0&&s.ref_island_factory_autoProduce){
  const plan=expandProductionNeeds({needs,rank:demandOrder,recipes,buildings:world.building??[],unlocks:tables.BuildingUnlockCfg?.data??[],stock,disabled:s.ref_island_factory_disabledFactories??[]});
  needs=plan.needs;demandOrder=plan.rank;
  const missing=[...needs].filter(([id,n])=>!blocked.has(id)&&n>(stock[id]??0));
  if(missing.length)log('需求生产排程：'+missing.slice(0,12).map(([id,n])=>`${id} 缺 ${n-(stock[id]??0)}`).join('、')+'；先补任务缺料（含可生产的前置原料），再补仓库');
  if(plan.cycles.size)log('自动生产：检测到循环配方，跳过循环依赖 '+[...plan.cycles].join('、'));
 }
 const initialCapacity=Number(tables.GameParamCfg?.data?.find(x=>x.paramName==='产品存量初始上限')?.paramValue);
 const vipCapacity=vipCaps.find(x=>x.level===state.vipLevel)?.bonus??0;
 const productCapacity=Number.isSafeInteger(initialCapacity)&&initialCapacity>0?initialCapacity+vipCapacity:0;
 const rejectedRecipes=state.productionRejected??=new Map();
 const signature=(b,r,items)=>JSON.stringify({level:b.level,buildFinishTime:b.buildFinishTime??0,auto:b.factory?.autoProductId??'',queue:b.factory?.factoryQ??[],product:items[r.itemId]??0,cost:(r.costItem??[]).map(([id])=>[id,items[id]??0]),capacity:productCapacity});
 const ready=(b,r,items)=>!!b?.factory&&b.level>=r.unlockLevel&&!(b.buildFinishTime>stamp())&&!b.factory.autoProductId&&!(b.factory.factoryQ??[]).length&&(productCapacity<=0||(items[r.itemId]??0)<productCapacity)&&(r.costItem??[]).length>0&&(r.costItem??[]).every(([id,n])=>Number.isSafeInteger(Number(n))&&Number(n)>0&&id!=='RUBY'&&!blocked.has(id)&&(items[id]??0)-Number(n)>=(id==='淡水'?Number(s.ref_island_factory_freshWaterKeepStock)||0:0));
 let started=0,idle=0,missingDemand=0,missingMaterials=0,queuedFactories=0,autoFactories=0;
 if(s.factory_0&&s.ref_island_factory_autoProduce){
  for(const b of (world.building??[]).slice(0,150)){
   if(!b.factory||b.buildFinishTime>stamp()||!(b.level>0))continue;
   if(b.factory.autoProductId){autoFactories++;continue;}
   if((b.factory.factoryQ??[]).length){queuedFactories++;continue;}
   const type=(tables.BuildingUnlockCfg?.data??[]).find(x=>x.buildingId===b.buildingId)?.buildingType;
   if(!type||(s.ref_island_factory_disabledFactories??[]).some(x=>x===type||x===b.buildingId))continue;
   idle++;const queued=new Set((world.building??[]).flatMap(x=>x.factory?.factoryQ??[]).map(x=>x.productId));const available=recipes.filter(x=>x.buildType===type&&x.unlockLevel<=b.level&&!x.limitType&&!queued.has(x.itemId)&&(productCapacity<=0||(stock[x.itemId]??0)<productCapacity));let options=[...available];
   const priority=s.ref_island_factory_proposedPriority??[];
   if(s.ref_island_factory_priorityProduce&&!categoryMode)options=options.filter(x=>needs.has(x.itemId)&&(needs.get(x.itemId)??0)>(stock[x.itemId]??0)).sort((a,b)=>priority.indexOf(a.itemId)-priority.indexOf(b.itemId));
   else if(s.ref_island_factory_priorityProduce)options=options.filter(x=>(needs.get(x.itemId)??0)>(stock[x.itemId]??0)).sort((a,b)=>(demandOrder.get(a.itemId)??Infinity)-(demandOrder.get(b.itemId)??Infinity));
   else options=options.filter(x=>(needs.get(x.itemId)??0)>(stock[x.itemId]??0));
   // Seed targets override order/priority selection only for explicitly configured seeds.
   // Wait for an existing batch to be collected before planning another one: the
   // protocol queue does not expose a reliable batch yield for every recipe.
   if(type==='种子厂'){
    const targets=s.ref_island_factory_seedStockTargets??{};
    const farm=tables.FarmlandPlantCfg?.data??[];
    const queued=new Set((world.building??[]).flatMap(x=>x.factory?.factoryQ??[]).map(x=>x.productId));
    const targetFor=id=>Object.hasOwn(targets,id)?Number(targets[id]):Number(targets[farm.find(x=>x.material?.[0]===id)?.id]);
    const hasTarget=id=>Object.hasOwn(targets,id)||farm.some(x=>x.material?.[0]===id&&Object.hasOwn(targets,x.id));
    const eligible=recipes.filter(x=>x.buildType===type&&x.unlockLevel<=b.level&&!x.limitType);
    const restock=eligible.filter(x=>hasTarget(x.itemId)&&Number.isSafeInteger(targetFor(x.itemId))&&targetFor(x.itemId)>0&&(stock[x.itemId]??0)<targetFor(x.itemId)&&!queued.has(x.itemId));
    options=[...restock,...options.filter(x=>!hasTarget(x.itemId)&&!queued.has(x.itemId))];
   }
   // Demand is a priority, not a requirement for an enabled automatic factory.
   // Only use the client-confirmed product storage cap; never stock without a cap.
   const fallback=productCapacity>0?available.filter(x=>{
    if(type!=='种子厂')return true;
    const targets=s.ref_island_factory_seedStockTargets??{};
    const crop=(tables.FarmlandPlantCfg?.data??[]).find(r=>r.material?.[0]===x.itemId)?.id;
    // Explicit seed targets (including 0) are handled above and never overridden.
    return !Object.hasOwn(targets,x.itemId)&&(!crop||!Object.hasOwn(targets,crop));
   }).sort((a,b)=>(stock[a.itemId]??0)-(stock[b.itemId]??0)||Number(a.produceTime)-Number(b.produceTime)):[];
   const demanded=new Set(options.map(x=>x.itemId));
   options=[...options,...fallback.filter(x=>!demanded.has(x.itemId))];
   // Shortest recipes first; stable ties retain configured demand priority.
   options.sort((a,b)=>Number((needs.get(b.itemId)??0)>(stock[b.itemId]??0))-Number((needs.get(a.itemId)??0)>(stock[a.itemId]??0))||(Number(a.produceTime)>0?Number(a.produceTime):Infinity)-(Number(b.produceTime)>0?Number(b.produceTime):Infinity));
   const recipe=options.find(x=>rejectedRecipes.get(b.buildingId+':'+x.itemId)!==signature(b,x,stock)&&(x.costItem??[]).length&&(x.costItem??[]).every(([id,num])=>Number.isSafeInteger(Number(num))&&Number(num)>0&&id!=='RUBY'&&!blocked.has(id)&&(stock[id]??0)-Number(num)>=(id==='淡水'?Number(s.ref_island_factory_freshWaterKeepStock)||0:0)));
   if(!recipe){if(options.length)missingMaterials++;else missingDemand++;continue;}
   const result=await act(`factory-start:${b.buildingId}:${recipe.itemId}:${Math.floor(stamp()/60)}`,async()=>{
    // act() may wait before executing: refresh immediately before the write.
    const fresh=(await water()).building?.find(x=>x.buildingId===b.buildingId),beforeStock=await inventory();
    if(!ready(fresh,recipe,beforeStock))return{status:'rejected',message:`工厂 ${b.buildingId} 生产 ${recipe.itemId}：送出前佇列、材料、库存或建筑状态已变，本轮取消`};
    const before=JSON.stringify(fresh.factory.factoryQ??[]);
    try{await client.sendWatch('StartFactoryProduceRequest',{buildingId:b.buildingId,productId:recipe.itemId},{window:1000});}
    catch(e){
     if(!e.prompt||protocol.Prompt[e.prompt.prompt]!=='BUSINESS_BLOCKING')throw e;
     let current=fresh,items=beforeStock;
     try{current=(await water()).building?.find(x=>x.buildingId===b.buildingId)??fresh;items=await inventory();}catch{}
     rejectedRecipes.set(b.buildingId+':'+recipe.itemId,signature(current,recipe,items));
     return{status:'rejected',message:`工厂 ${b.buildingId} 生产 ${recipe.itemId}：服务器 BUSINESS_BLOCKING；佇列 ${(current.factory?.factoryQ??[]).length}，自动生产 ${current.factory?.autoProductId||'无'}，制品库存 ${items[recipe.itemId]??0}/${productCapacity||'未知'}；相同状态暂不重试，其他配方与工厂继续`};
    }
    const after=(await water()).building?.find(x=>x.buildingId===b.buildingId)?.factory;
    const verified=!!after&&JSON.stringify(after.factoryQ??[])!==before&&(after.factoryQ??[]).some(x=>x.productId===recipe.itemId);
    return{status:verified?'verified':'unconfirmed',message:`工厂 ${b.buildingId} 生产 ${recipe.itemId}：${verified?'已核对生产队列':'结果未确认，停止检查'}`};
   });
   if(result?.status==='unconfirmed')throw Error('unconfirmed_factory');if(result?.status==='verified')started++;stock=await inventory();world=await water();
  }log(`自动生产：空闲工厂 ${idle}，启动 ${started}，库存达标／无可用配方 ${missingDemand}，材料不足 ${missingMaterials}，队列生产中 ${queuedFactories}，游戏内自动生产中 ${autoFactories}，制品库存上限 ${productCapacity||'未确认'}（短耗时优先补满，库存上限内生产；同耗时沿用需求顺序；已含前置原料生产；需求来源：居民／货船／已启用联盟订单、建筑与雷达流民，其余类别尚未接入）`);
 }
 if(s.residents_0){
  let refreshed=0;
  for(let count=0;count<10;count++){
   world=await water();stock=await inventory();
   const daily=Number(world.orderOfTheDay?.orderNum);const cap=Number(s.residents_6)||0;
   if(cap>0&&(!Number.isFinite(daily)||daily>=cap)){log('居民需求已达到每日上限或计数尚未确认，跳过');break;}
   const order=(world.workerOrder??[]).find(o=>{
    const req=o.requirements??[];if(!req.length||o.refreshTime>0)return false;
    if(req.some(a=>blocked.has(a.id)||(s.residents_1&&crops.has(a.id))||(stock[a.id]??0)<Number(a.num)))return false;
    const minExp=Number(s.residents_4)||0,minGold=Number(s.residents_5)||0;
    if(minExp||minGold){if(o.isSpecial)return false;const reward={};for(const a of req){const row=(tables.WorkerOrderCfg?.data??[]).find(r=>r.itemId===a.id);if(!row)return false;for(const [id,n] of row.reward??[])reward[id]=(reward[id]??0)+Number(n)*Number(a.num);}if((reward.EXP??0)<minExp||(reward.GOLD??0)<minGold)return false;}
    return true;
   });
   if(!order){
    const orders=world.workerOrder??[];let waiting=0,crop=0,forbidden=0,missing=0,reward=0;const shortages=new Map();
    for(const o of orders){
     if(o.refreshTime>0){waiting++;continue;}const req=o.requirements??[];
     if(req.some(a=>blocked.has(a.id))){forbidden++;continue;}
     if(s.residents_1&&req.some(a=>crops.has(a.id))){crop++;continue;}
     const absent=req.filter(a=>(stock[a.id]??0)<Number(a.num));
     if(absent.length){missing++;for(const a of absent)shortages.set(a.id,Math.max(shortages.get(a.id)??0,Number(a.num)-(stock[a.id]??0)));continue;}
     reward++;
    }
    log(`居民需求：订单 ${orders.length}，刷新等待 ${waiting}，缺货 ${missing}，农作物跳过 ${crop}，禁用材料 ${forbidden}，奖励门槛或资料不符 ${reward}`);
    if(shortages.size)log('居民缺货：'+[...shortages].slice(0,8).map(([id,n])=>`${id} 缺 ${n}`).join('、')+(s.residents_2?'；已开启「库存不足跳过」，库存足够的工厂制品订单仍会提交':''));
    const unwanted=orders.find(o=>!(o.refreshTime>0)&&(o.requirements??[]).length&&(
     (o.requirements??[]).some(a=>blocked.has(a.id))||
     s.residents_1&&(o.requirements??[]).some(a=>crops.has(a.id))||
     s.residents_2&&(o.requirements??[]).some(a=>(stock[a.id]??0)<Number(a.num))
    ));
    if(unwanted&&Number.isFinite(state.level)&&state.level>=12&&refreshed<3){
     const old=JSON.stringify(unwanted),key=`resident-refresh:${unwanted.index}:${unwanted.workerId}:${Math.floor(stamp()/60)}:${createHash('sha256').update(JSON.stringify(unwanted.requirements)).digest('hex').slice(0,16)}`;
     const result=await act(key,async()=>{
      const current=(await water()).workerOrder?.find(o=>o.index===unwanted.index);
      if(!current||JSON.stringify(current)!==old||current.refreshTime>0)return{status:'rejected',message:'居民需求已变化或正在刷新，取消重复刷新'};
      await client.sendWatch('DenyOrderRequest',{index:unwanted.index},{window:1000});
      const after=(await water()).workerOrder?.find(o=>o.index===unwanted.index);
      const verified=!!after&&(after.refreshTime>stamp()||JSON.stringify(after)!==old);
      return{status:verified?'verified':'unconfirmed',message:verified?`居民订单 ${unwanted.index}：${(unwanted.requirements??[]).some(a=>blocked.has(a.id))?'含不准消耗材料，':''}已刷新，核对订单内容／刷新冷却`:'居民订单刷新未确认，停止本轮避免重复刷新'};
     });
     if(result?.status==='unconfirmed')throw Error('unconfirmed_resident_refresh');
     if(result?.status==='verified'){refreshed++;continue;}
    }else if(unwanted&&!(state.level>=12))log('居民需求：自动刷新需等级 12，库存不足时等待，不消耗加速器或钻石');
    break;
   }
   const fingerprint=JSON.stringify(order);
   const result=await act(`resident:${order.index}:${order.workerId}:${order.refreshTime}:${JSON.stringify(order.requirements)}:${daily}`,async()=>{
    const reply=await read('FinishWorkerOrderRequest','FinishWorkerOrderResponse',{index:order.index});const after=await water();
    const changed=JSON.stringify((after.workerOrder??[]).find(o=>o.index===order.index))!==fingerprint;
    const verified=!!reply.reward&&(changed||Number(after.orderOfTheDay?.orderNum)>daily);
    return{status:verified?'verified':'unconfirmed',message:`居民订单 ${order.index}：${verified?'已完成并核对订单／每日计数':'结果未确认，停止检查'}`};
   });
   if(!result||result.status!=='verified'){if(result?.status==='unconfirmed')throw Error('unconfirmed_order');break;}
  }
 }
}

export function afkDue(info,hours){const h=Math.max(0,Number(hours)||0);return h>0&&info?.afkStartTime>0?Math.min(info.afkFinishTime,info.afkStartTime+h*3600):info?.afkFinishTime;}

export async function runProductionGuarded({run,client,paused,log}){
 if(paused.has('production'))return;
 try{await run();}catch(e){if(!/^unconfirmed_(factory|order|resident_refresh)$/.test(e.message)||client?.connected===false)throw e;paused.add('production');log('生产／居民订单结果未确认，仅暂停此模块，其他任务继续');}
}
