import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const vipCaps=JSON.parse(fs.readFileSync(new URL('./farm-vip-capacity.json',import.meta.url),'utf8'));
export async function runFarmPlant({client,settings:s,state,act,log,config=tables}){
 if(!s.farm_0||!s.farm_2)return;
 if(!Number.isFinite(state.level)||state.level<11){log('农田种植需等级 11，本轮跳过');return;}
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 let water=await read('OnWaterRequest','OnWaterResponse');
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const inventory=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 const isFarm=b=>!!b.farm||(config.BuildingUnlockCfg?.data??[]).some(u=>u.buildingId===b.buildingId&&u.buildingType==='农田');
 const initial=Number(config.GameParamCfg?.data?.find(r=>r.paramName==='产品存量初始上限')?.paramValue);
 const vip=vipCaps.find(r=>r.level===state.vipLevel)?.bonus??0;
 const capacity=Number.isSafeInteger(initial)&&initial>0?5*(initial+vip):0;
 let stock=await inventory();const orderMode=['orders','按订单种植'].includes(s.farm_3);const need={};
 for(const o of water.workerOrder??[])if(!o.refreshTime)for(const a of o.requirements??[])need[a.id]=(need[a.id]??0)+Number(a.num);
 let idle=0,planted=0,noSeed=0,atTarget=0;const pending={};for(const b of water.building??[])if(b.farm?.productId){const recipe=config.FarmlandPlantCfg?.data?.find(x=>x.id===b.farm.productId);if(recipe)pending[recipe.id]=(pending[recipe.id]??0)+Number(recipe.produceNum);}
 const requestSeed=async(seed)=>{
  if(!s.farm_5||!s.factory_0)return;
  if((water.building??[]).some(x=>(x.factory?.factoryQ??[]).some(j=>j.productId===seed)))return;
  const recipe=config.BuildingProduceCfg?.data?.find(x=>x.buildType==='种子厂'&&x.itemId===seed&&!x.limitType);
  if(!recipe)return;
  const factory=(water.building??[]).find(x=>x.factory&&!x.factory.autoProductId&&!(x.factory.factoryQ??[]).length&&!(x.buildFinishTime>now())&&x.level>=recipe.unlockLevel&&config.BuildingUnlockCfg?.data?.some(u=>u.buildingId===x.buildingId&&u.buildingType==='种子厂'));
  if(!factory)return;
  const costs=recipe.costItem??[];
  if(!costs.length||costs.some(([id,n])=>id==='RUBY'||(s.residents_3??[]).includes(id)||!Number.isFinite(Number(n))||Number(n)<=0||(stock[id]??0)-Number(n)<(id==='淡水'?Math.max(0,Number(s.ref_island_factory_freshWaterKeepStock)||0):0)))return;
  const result=await act(`farm-seed:${factory.buildingId}:${seed}:${Math.floor(now()/60)}`,async()=>{
   await client.sendWatch('StartFactoryProduceRequest',{buildingId:factory.buildingId,productId:seed},{window:1000});
   water=await read('OnWaterRequest','OnWaterResponse');stock=await inventory();
   const verified=!!water.building?.find(x=>x.buildingId===factory.buildingId)?.factory?.factoryQ?.some(x=>x.productId===seed);
   return {status:verified?'verified':'unconfirmed',message:verified?`缺种子：已在 ${factory.buildingId} 排程 ${seed}`:'按需生产种子结果未确认，停止本轮'};
  });
  if(result&&result.status!=='verified')throw Error('unconfirmed_seed_production');
 };
 for(const b of water.building??[]){
  if(!isFarm(b)||!(b.level>0)||b.farm?.productId||b.buildFinishTime>now())continue;
  idle++;let recipe;
  for(const choice of s.farm_4??[]){
   const r=config.FarmlandPlantCfg?.data?.find(x=>x.id===choice.name);if(!r||!Array.isArray(r.material)||r.material.length!==2)continue;
   const requested=orderMode?Number(need[r.id]??0):Number(choice.limit)||Infinity;
   const target=capacity>0?Math.min(requested,capacity):requested;
   if((stock[r.id]??0)+(pending[r.id]??0)>=target||(capacity>0&&(stock[r.id]??0)+(pending[r.id]??0)+Number(r.produceNum)>capacity)){atTarget++;continue;}
   if((stock[r.material[0]]??0)<Number(r.material[1])){noSeed++;await requestSeed(r.material[0]);continue;}
   recipe=r;break;
  }
  if(!recipe)continue;
  const result=await act(`farm-plant:${b.buildingId}:${recipe.id}:${Math.floor(now()/60)}`,async()=>{
   const beforeSeed=stock[recipe.material[0]]??0;
   await client.sendWatch('FarmPlantRequest',{args:[{buildingId:b.buildingId,productId:recipe.id}]},{window:1000});
   const current=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId)?.farm;stock=await inventory();
   const verified=current?.productId===recipe.id&&current.ripeTime>now()&&beforeSeed-(stock[recipe.material[0]]??0)>=Number(recipe.material[1]);
   return{status:verified?'verified':'unconfirmed',message:verified?`农田 ${b.buildingId}：已种植 ${recipe.id} 并核对种子消耗、成熟时间`:'种植结果未确认，停止本轮'};
  });
  if(result?.status==='rejected'){log('种植被服务器拒绝，本轮停止种植，等待下一轮重新读取库存与田地；其他任务继续');break;}
  if(result?.status==='unconfirmed')throw Error('unconfirmed_plant');
  if(result?.status==='verified')planted++;
  if(result?.status==='verified')pending[recipe.id]=(pending[recipe.id]??0)+Number(recipe.produceNum);
 }
 const farms=(water.building??[]).filter(isFarm);
 log(`农田识别：农作物上限 ${capacity>0?capacity:'未确认'}，共 ${farms.length} 块，生长／待收获 ${farms.filter(b=>b.farm?.productId).length} 块，建设中 ${farms.filter(b=>b.buildFinishTime>now()).length} 块；种子库存：${(config.FarmlandPlantCfg?.data??[]).map(r=>`${r.material?.[0]}=${stock[r.material?.[0]]??0}`).join('，')}`);
 log(`自动种植（${orderMode?'按订单':'按保存顺序与库存目标'}）：空闲田地 ${idle}，种植 ${planted}，缺种子候选 ${noSeed}，已达目标候选 ${atTarget}${noSeed&&!s.farm_5?'；缺种子自动生产未开启':noSeed&&!s.factory_0?'；工厂总开关未开启，未排程种子':''}`);
}
