import {normalize} from './wx-game/worlds.mjs';
export async function runFacilityActions({client,settings:s,state,act,log,history=new Set()}){
 const feed=s.beast_0&&s.beast_6&&Number.isFinite(state.level)&&state.level>=23;
 const speed=s.equipment_0&&s.equipment_6&&Number.isFinite(state.level)&&state.level>=17;
 if(!feed&&!speed)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 const world=await read('OnWaterRequest','OnWaterResponse');
 const prefix='pet-feed:'+new Date(Date.now()+(client.serverClockOffsetMs??0)+28800000).toISOString().slice(0,10)+':';
 const cap=Math.max(0,Math.floor(Number(s.ref_island_pet_feedDailyLimit)||0));
 let used=[...history].filter(x=>x.startsWith(prefix)).length,actions=0;
 for(const b of world.building??[]){
  if(b.buildFinishTime>now())continue;
  if(feed)for(const job of b.petBreed?.breedQ??[]){
   if(cap&&used>=cap){log('海兽喂养已达到每日上限（包含待确认操作）');break;}
   if(job.finishTime<=now()||!Number.isSafeInteger(job.idx))continue;
   const required=job.feedRequirements??[],cost={};
   if(!required.length||required.some(x=>!x.id||!Number.isSafeInteger(Number(x.num))||Number(x.num)<=0||['RUBY','GOLD'].includes(x.id)))continue;
   for(const a of required)cost[a.id]=(cost[a.id]??0)+Number(a.num);
   const before=await stock();if(Object.entries(cost).some(([id,n])=>(before[id]??0)<n))continue;
   const snapshot=JSON.stringify(job),key=prefix+`${b.buildingId}:${snapshot}`;
   if(history.has(key))continue;history.add(key);used++;
   const result=await act(key,async()=>{
    await client.sendWatch('PetFeedRequest',{jobIdx:job.idx},{window:1000});
    const current=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId)?.petBreed?.breedQ?.find(x=>x.idx===job.idx&&x.petId===job.petId&&x.startTime===job.startTime);
    const after=await stock();
    const progressed=!!current&&(current.star>job.star||current.finishTime<job.finishTime||JSON.stringify(current.feedRequirements??[])!==JSON.stringify(required));
    const verified=progressed&&Object.entries(cost).every(([id,n])=>(before[id]??0)-(after[id]??0)===n);
    return {status:verified?'verified':'unconfirmed',message:verified?`海兽喂养：已核对批次与材料，今日计数 ${used}${cap?'/'+cap:''}`:'海兽喂养结果未确认，停止本轮'};
   });
   if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_pet_feed');
   if(++actions>=3)return;
  }
  const job=b.equipMaking;
  if(!speed||!job?.equipId||!Number.isFinite(job.finishTime)||job.finishTime<=now()||job.finishTime-now()<Math.max(0,Number(s.equipment_7)||0))continue;
  const before=await stock(),have=before['加速器']??0,useNum=Math.min(Math.ceil((job.finishTime-now())/60),Math.floor(have));
  if(!Number.isSafeInteger(useNum)||useNum<=0)continue;
  const result=await act(`equip-speed:${b.buildingId}:${job.makeId}:${job.finishTime}:${have}`,async()=>{
   await client.sendWatch('SpeedMakeEquipRequest',{buildingId:b.buildingId,speedUp:{type:2,useNum}},{window:1000});
   const current=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId)?.equipMaking;
   const after=await stock();
   const verified=current?.makeId===job.makeId&&current.equipId===job.equipId&&Number.isFinite(current.finishTime)&&current.finishTime<job.finishTime&&have-(after['加速器']??0)===useNum;
   return {status:verified?'verified':'unconfirmed',message:verified?`装备加速：已核对打造时间与 ${useNum} 个加速器`:'装备加速结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_equip_speed');
  if(++actions>=3)return;
 }
}
