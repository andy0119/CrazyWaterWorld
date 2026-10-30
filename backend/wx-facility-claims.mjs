import {normalize} from './wx-game/worlds.mjs';
export async function runFacilityClaims({client,settings:s,state,act,log,onEquipClaimed=()=>{}}){
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const enabled=(key,master,level,label)=>{if(!s[key]||(master&&!s[master]))return false;if(!Number.isFinite(state.level)||state.level<level){log(`${label}需等级 ${level}，目前 ${state.level??'未知'}，本轮跳过`);return false;}return true;};
 const pets=enabled('beast_1','beast_0',23,'海兽培育领取');
 const equip=enabled('equipment_1','equipment_0',17,'装备厂领取');
 const museum=enabled('museum_0',null,28,'博物馆人气币');
 if(!pets&&!equip&&!museum)return;
 const now=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 async function perform(key,label,action){const r=await act(key,action);if(r?.status==='unconfirmed')throw Error('unconfirmed_facility_claim');}
 if(pets||equip){
  const water=await read('OnWaterRequest','OnWaterResponse');
  if(pets){
   const mature=(water.building??[]).flatMap(b=>b.petBreed?.maturePets??[]);
   if(mature.length){
    const before=await read('AllPetRequest','AllPetResponse');const ids=new Set((before.pets??[]).map(p=>String(p.uid)));
    await perform('mature-pet:'+JSON.stringify(mature),'海兽领取',async()=>{
     await client.sendWatch('GetMaturePetRequest',{}, {window:1000});
     const after=await read('AllPetRequest','AllPetResponse');const remaining=(await read('OnWaterRequest','OnWaterResponse')).building?.flatMap(b=>b.petBreed?.maturePets??[])??[];
     const added=(after.pets??[]).filter(p=>!ids.has(String(p.uid))).length;
     const verified=added>=mature.length&&remaining.length<mature.length;
     return{status:verified?'verified':'unconfirmed',message:verified?`海兽领取：已核对新增 ${added} 只及培育室状态`:'海兽领取结果未确认，停止本轮'};
    });
   }else log('海兽培育室没有可领取的成熟海兽');
  }
  if(equip)for(const b of water.building??[]){
   const job=b.equipMaking;if(!job?.equipId||!job.finishTime||job.finishTime>now)continue;
   await perform(`equip-made:${b.buildingId}:${job.finishTime}:${job.equipId}`,'装备领取',async()=>{
    const before=await read('EquipsRequest','EquipsResponse');const ids=new Set((before.equip??[]).map(x=>String(x.uid)));
    const reply=await read('PickMadeEquipRequest','PickMadeEquipResponse',{buildingId:b.buildingId});
    const after=await read('EquipsRequest','EquipsResponse');const current=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId)?.equipMaking;
    const verified=reply.equipId===job.equipId&&(after.equip??[]).some(x=>x.equipId===reply.equipId&&!ids.has(String(x.uid)))&&(!current?.equipId||current.finishTime!==job.finishTime);
    if(verified&&!current?.equipId&&!(current?.finishTime>0))onEquipClaimed();
    return{status:verified?'verified':'unconfirmed',message:verified?`装备厂 ${b.buildingId}：已核对新增装备与打造状态`:'装备领取结果未确认，停止本轮'};
   });
  }
 }
 if(museum){
  const info=await read('MuseumInfoRequest','MuseumInfoResponse');
  if(Number(info.uncollectedRevenue)>0)await perform(`museum-revenue:${info.revenueLastSettleTime}:${info.uncollectedRevenue}`,'博物馆领取',async()=>{
   const before=await read('AllItemRequest','AllItemResponse');const amount=x=>Number((x.items??[]).find(i=>i.itemId==='人气币')?.num??0);
   const reply=await read('MuseumCollectRevenueRequest','MuseumCollectRevenueResponse');
   const after=await read('AllItemRequest','AllItemResponse');const current=await read('MuseumInfoRequest','MuseumInfoResponse');
   const verified=Number(reply.collected)>0&&amount(after)-amount(before)>=Number(reply.collected)&&(Number(current.uncollectedRevenue)<Number(info.uncollectedRevenue)||current.revenueLastSettleTime>info.revenueLastSettleTime);
   return{status:verified?'verified':'unconfirmed',message:verified?`博物馆：已核对 ${reply.collected} 人气币入库`:'博物馆领取结果未确认，停止本轮'};
  });else log('博物馆暂无可领取人气币');
 }
}
