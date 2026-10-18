import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8'));
export async function runProduction({client,settings:s,act,log,tables=config.tables}){
 if(!s.residents_0&&!(s.factory_0&&s.ref_island_factory_autoProduce))return;
 const read=(a,b,body={})=>client.request(a,body,b,8000).then(normalize);
 const water=()=>read('OnWaterRequest','OnWaterResponse');
 const inventory=async()=>{const x=await read('AllItemRequest','AllItemResponse');return Object.fromEntries((x.items??[]).map(v=>[v.itemId,Number(v.num)]));};
 const stamp=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const blocked=new Set(s.residents_3??[]);
 const recipes=tables.BuildingProduceCfg?.data??[];
 const crops=new Set(['小麦','玉米','土豆','番茄','胡萝卜','卷心菜','大豆','南瓜','辣椒','茄子','花菜','可可豆','橡胶']);
 let world=await water();let stock=await inventory();
 const needs=new Map();for(const order of world.workerOrder??[])for(const a of order.requirements??[])needs.set(a.id,(needs.get(a.id)??0)+Number(a.num));
 if(s.factory_0&&s.ref_island_factory_autoProduce){
  for(const b of (world.building??[]).slice(0,150)){
   if(!b.factory||b.buildFinishTime>stamp()||b.factory.autoProductId||(b.factory.factoryQ??[]).length)continue;
   const type=(tables.BuildingUnlockCfg?.data??[]).find(x=>x.buildingId===b.buildingId)?.buildingType;
   if(!type||(s.ref_island_factory_disabledFactories??[]).some(x=>x===type||x===b.buildingId))continue;
   let options=recipes.filter(x=>x.buildType===type&&x.unlockLevel<=b.level&&!x.limitType);
   const priority=s.ref_island_factory_proposedPriority??[];
   if(s.ref_island_factory_priorityProduce)options=options.filter(x=>priority.includes(x.itemId)).sort((a,b)=>priority.indexOf(a.itemId)-priority.indexOf(b.itemId));
   else options=options.filter(x=>(needs.get(x.itemId)??0)>(stock[x.itemId]??0));
   const recipe=options.find(x=>(x.costItem??[]).length&&(x.costItem??[]).every(([id,num])=>id!=='RUBY'&&!blocked.has(id)&&(stock[id]??0)-Number(num)>=(id==='淡水'?Number(s.ref_island_factory_freshWaterKeepStock)||0:0)));
   if(!recipe)continue;
   const before=JSON.stringify(b.factory.factoryQ??[]);
   const result=await act(`factory-start:${b.buildingId}:${recipe.itemId}:${Math.floor(stamp()/60)}`,async()=>{
    await client.sendWatch('StartFactoryProduceRequest',{buildingId:b.buildingId,productId:recipe.itemId},{window:1000});
    const after=(await water()).building?.find(x=>x.buildingId===b.buildingId)?.factory;
    const verified=!!after&&JSON.stringify(after.factoryQ??[])!==before&&(after.factoryQ??[]).some(x=>x.productId===recipe.itemId);
    return{status:verified?'verified':'unconfirmed',message:`工厂 ${b.buildingId} 生产 ${recipe.itemId}：${verified?'已核对生产队列':'结果未确认，停止检查'}`};
   });
   if(result?.status==='unconfirmed')throw Error('unconfirmed_factory');stock=await inventory();
  }log('自动生产检查完成：仅处理已建工厂、订单缺货或指定优先产品');
 }
 if(s.residents_0){
  for(let count=0;count<10;count++){
   world=await water();stock=await inventory();
   const daily=Number(world.orderOfTheDay?.orderNum);const cap=Number(s.residents_6)||0;
   if(cap>0&&(!Number.isFinite(daily)||daily>=cap)){log('居民需求已达到每日上限或计数尚未确认，跳过');break;}
   const order=(world.workerOrder??[]).find(o=>{
    const req=o.requirements??[];if(!req.length||(o.refreshTime>0&&o.refreshTime<=stamp()))return false;
    if(req.some(a=>blocked.has(a.id)||(s.residents_1&&crops.has(a.id))||(s.residents_2&&recipes.some(r=>r.itemId===a.id))||(stock[a.id]??0)<Number(a.num)))return false;
    const minExp=Number(s.residents_4)||0,minGold=Number(s.residents_5)||0;
    if(minExp||minGold){if(o.isSpecial)return false;const reward={};for(const a of req){const row=(tables.WorkerOrderCfg?.data??[]).find(r=>r.itemId===a.id);if(!row)return false;for(const [id,n] of row.reward??[])reward[id]=(reward[id]??0)+Number(n)*Number(a.num);}if((reward.EXP??0)<minExp||(reward.GOLD??0)<minGold)return false;}
    return true;
   });
   if(!order){log('居民需求：没有符合库存、禁用材料与奖励门槛的订单');break;}
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
