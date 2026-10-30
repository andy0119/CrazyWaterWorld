import{normalize}from './wx-game/worlds.mjs';
export async function runIdleFleetRepair({client,protocol,settings:s,act,log,paused=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(s.ref_world_fleet_idleRepair===false||paused.has('idle-fleet-repair'))return;
 const read=async(req,res,body={})=>normalize(await client.request(req,body,res,8000)),now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const eligible=f=>f&&f.state===protocol.FleetState.IDLE&&!(f.curGridIdx>0)&&!(f.treasureLootUid>0)&&!f.chipWar&&!(f.repairing?.endTs>now())&&Number.isSafeInteger(f.maxDura)&&Number.isSafeInteger(f.durability)&&f.durability>=0&&f.maxDura>f.durability;
 const fuelStock=async()=>Number((await read('AllItemRequest','AllItemResponse')).items?.find(x=>x.itemId==='汽油')?.num??0);
 try{
  const fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets;if(!Array.isArray(fleets))throw Error('unknown_fleet_list');
  for(const fleet of fleets.filter(eligible)){
   const quote=await read('FleetRepairParamRequest','FleetRepairParamResponse',{buildingId:fleet.buildingId});const unit=Number(quote.unitRepairCost),cost=Math.ceil((fleet.maxDura-fleet.durability)*unit),before=await fuelStock();
   if(!Number.isFinite(unit)||unit<0||!Number.isSafeInteger(cost)||cost<0||!Number.isSafeInteger(before)||before<cost){log(`舰队 ${fleet.buildingId}：空闲待修，汽油不足或维修报价未确认`);continue;}
   const result=await act(`idle-fleet-repair:${Math.floor((now()+28800)/86400)}:${fleet.buildingId}:${fleet.durability}:${before}`,async()=>{
    const current=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId);
    if(!eligible(current)||current.durability!==fleet.durability||current.maxDura!==fleet.maxDura||(await fuelStock())!==before)return{status:'rejected',message:'舰队已出发、耐久或汽油已变，取消空闲修复'};
    await client.sendWatch('RepairFleetRequest',{buildingId:fleet.buildingId},{window:1000});let verified=false;
    for(const wait of [0,400,800]){if(wait)await sleep(wait);const after=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId),fuel=await fuelStock();verified=!!after&&(after.state===protocol.FleetState.REPAIRING&&after.repairing?.endTs>now()||after.durability>fleet.durability)&&before-fuel===cost;if(verified)break;}
    return{status:verified?'verified':'unconfirmed',message:verified?`舰队 ${fleet.buildingId}：无任务空闲，已开始普通修复，核对汽油 ${cost}；未请求加速`:'空闲舰队修复未确认，仅暂停自动修复，不重复发送'};
   });if(result?.status==='unconfirmed'){paused.add('idle-fleet-repair');return;}
  }
 }catch(e){if(client.connected===false)throw e;paused.add('idle-fleet-repair');log('空闲舰队修复：回覆未确认，暂停本功能');}
}
