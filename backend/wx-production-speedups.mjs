import {normalize} from './wx-game/worlds.mjs';

// Only inventory speedup items are supported. Empty sources means no spending.
export async function runProductionSpeedups({client,settings:s,state,act,log}){
 const factory=s.factory_0&&s.ref_island_factory_speedUpForDemand;
 const farm=s.farm_0&&s.ref_island_farm_speedUp&&Number.isFinite(state.level)&&state.level>=11;
 if(!factory&&!farm)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const inventory=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 let water=await read('OnWaterRequest','OnWaterResponse'),stock=await inventory(),count=0;
 const needs={};
 for(const o of water.workerOrder??[]){
  if(o.refreshTime>0&&o.refreshTime<=now())continue;
  for(const a of o.requirements??[])needs[a.id]=(needs[a.id]??0)+Number(a.num);
 }
 for(const b of water.building??[]){
  if(b.buildFinishTime>now())continue;
  const jobs=[];
  if(factory&&(s.ref_island_factory_speedUpSources??[]).includes('加速器')&&!(s.ref_island_factory_disabledFactories??[]).some(x=>x===b.buildingId||b.buildingId.replace(/^\d+/,'')===x)){
   for(const job of b.factory?.factoryQ??[]){
    if(!Number.isSafeInteger(job.idx)||(needs[job.productId]??0)<=(stock[job.productId]??0))continue;
    if(job.finishTime-now()<Math.max(0,Number(s.ref_island_factory_speedUpForDemandMinRemainSecs)||0))continue;
    jobs.push({kind:'factory',product:job.productId,index:job.idx,finish:job.finishTime});
   }
  }
  if(farm&&(s.ref_island_farm_speedUpSources??[]).includes('加速器')&&b.farm?.productId)jobs.push({kind:'farm',product:b.farm.productId,finish:b.farm.ripeTime});
  for(const job of jobs){
   if(!Number.isFinite(job.finish)||job.finish<=now())continue;
   stock=await inventory();const before=stock['加速器']??0;
   const useNum=Math.min(Math.ceil((job.finish-now())/60),Math.floor(before));
   if(!Number.isSafeInteger(useNum)||useNum<=0){log('生产加速：库存没有可用加速器');return;}
   const result=await act(`production-speed:${job.kind}:${b.buildingId}:${job.index??''}:${job.product}:${job.finish}:${before}`,async()=>{
    const speed={type:2,useNum};
    await client.sendWatch(job.kind==='farm'?'FarmSpeedUpRequest':'SpeedUpFactoryProduceRequest',job.kind==='farm'?{buildingId:b.buildingId,param:speed}:{buildingId:b.buildingId,index:job.index,speedUp:speed},{window:1000});
    const after=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId);
    const current=job.kind==='farm'?after?.farm:(after?.factory?.factoryQ??[]).find(x=>x.idx===job.index&&x.productId===job.product);
    const finish=job.kind==='farm'?current?.ripeTime:current?.finishTime;
    stock=await inventory();
    // A vanished queue entry alone is not enough evidence for an acceleration.
    const progressed=!!current&&Number.isFinite(finish)&&finish<job.finish;
    const verified=progressed&&before-(stock['加速器']??0)===useNum;
    return {status:verified?'verified':'unconfirmed',message:verified?`${job.kind==='farm'?'农田':'订单生产'}加速：已核对时间与 ${useNum} 个加速器消耗`:'生产加速结果未确认，停止本轮'};
   });
   if(!result)return;
   if(result.status!=='verified')throw Error('unconfirmed_production_speedup');
   if(++count>=3)return;
  }
 }
}
