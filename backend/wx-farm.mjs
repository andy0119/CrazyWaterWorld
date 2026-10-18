import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runFarmPlant({client,settings:s,state,act,log,config=tables}){
 if(!s.farm_0||!s.farm_2)return;
 if(!Number.isFinite(state.level)||state.level<11){log('农田种植需等级 11，本轮跳过');return;}
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 let water=await read('OnWaterRequest','OnWaterResponse');
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const inventory=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 let stock=await inventory();const orderMode=s.farm_3==='按订单种植';const need={};
 for(const o of water.workerOrder??[])for(const a of o.requirements??[])need[a.id]=(need[a.id]??0)+Number(a.num);
 const pending={};for(const b of water.building??[])if(b.farm?.productId){const recipe=config.FarmlandPlantCfg?.data?.find(x=>x.id===b.farm.productId);if(recipe)pending[recipe.id]=(pending[recipe.id]??0)+Number(recipe.produceNum);}
 for(const b of water.building??[]){
  if(!b.farm||b.farm.productId||b.buildFinishTime>now())continue;
  let recipe;
  for(const choice of s.farm_4??[]){
   const r=config.FarmlandPlantCfg?.data?.find(x=>x.id===choice.name);if(!r||!Array.isArray(r.material)||r.material.length!==2)continue;
   const target=orderMode?Number(need[r.id]??0):Number(choice.limit)||Infinity;
   if((stock[r.id]??0)+(pending[r.id]??0)>=target)continue;
   if((stock[r.material[0]]??0)<Number(r.material[1]))continue;
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
  if(result?.status==='unconfirmed')throw Error('unconfirmed_plant');
  if(result?.status==='verified')pending[recipe.id]=(pending[recipe.id]??0)+Number(recipe.produceNum);
 }
 log(`自动种植检查完成（${orderMode?'按订单':'按保存顺序与库存目标'}）`);
}
