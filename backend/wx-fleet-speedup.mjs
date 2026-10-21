import {normalize} from './wx-game/worlds.mjs';
export async function runFleetSpeedup({client,protocol,settings:s,act,log}){
 if(!s.ref_world_fleet_repairSpeedUp)return;
 // Gameplay-specific routing needs a confirmed task association, not a guessed fleet label.
 if((s.ref_world_fleet_repairSpeedGameplays??[]).length){log('舰队加速：当前无法核对玩法归属，按限制跳过');return;}
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const have=async()=>Number(((await read('AllItemRequest','AllItemResponse')).items??[]).find(x=>x.itemId==='加速器')?.num??0);
 const fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets??[];
 const ordered=[...fleets].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true}));
 const allowed=s.ref_world_fleet_repairSpeedFleets??[],minimum=Math.max(0,Number(s.ref_world_fleet_repairSpeedUpMinRemainSecs)||0);
 let count=0;
 for(const [index,fleet] of ordered.entries()){
  if(allowed.length&&!allowed.includes(fleet.buildingId)&&!allowed.includes(String(index+1)))continue;
  if(fleet.state!==protocol.FleetState.REPAIRING||!Number.isFinite(fleet.repairing?.endTs)||fleet.repairing.endTs<=now()||fleet.repairing.endTs-now()<minimum)continue;
  const before=await have(),useNum=Math.min(Math.ceil((fleet.repairing.endTs-now())/60),Math.floor(before));
  if(!Number.isSafeInteger(useNum)||useNum<=0){log('舰队加速：没有可用加速器');return;}
  const result=await act(`fleet-speed:${fleet.buildingId}:${fleet.repairing.endTs}:${before}`,async()=>{
   await client.sendWatch('SpeedUpRepairRequest',{buildingId:fleet.buildingId,speedUp:{type:2,useNum}},{window:1000});
   const current=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId);
   const progressed=!!current&&(current.durability>fleet.durability||Number.isFinite(current.repairing?.endTs)&&current.repairing.endTs<fleet.repairing.endTs);
   const verified=progressed&&before-(await have())===useNum;
   return {status:verified?'verified':'unconfirmed',message:verified?`舰队 ${fleet.buildingId} 加速：已核对修复进度与 ${useNum} 个加速器`:'舰队加速结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_fleet_speedup');
  if(++count>=3)return;
 }
}
