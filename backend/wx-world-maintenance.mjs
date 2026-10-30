import {normalize} from './wx-game/worlds.mjs';
export async function runWorldMaintenance({client,protocol,settings:s,state,act,log,history=new Set()}){
 if(!s.trade_0&&!s.ref_world_report&&!s.ref_world_fleet_repair)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const day=()=>new Date((now()+28800)*1000).toISOString().slice(0,10);
 const items=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 if(s.trade_0){
  if(state.level<10)log('贸易港口需等级10，本轮跳过');
  else{
   const water=await read('OnWaterRequest','OnWaterResponse');
   if(!(water.building??[]).some(x=>/(?:贸易港口|货轮港口)$/.test(x.buildingId)&&x.level>0&&!x.buildFinishTime))log('贸易港口尚未建成，本轮跳过');
   else{
    const prefix=`cargo:${day()}:`;let used=[...history].filter(k=>k.startsWith(prefix)).length;
    const cap=Math.max(0,Number(s.trade_1)||0);
    const ships=await read('CargoShipsRequest','CargoShipsResponse');
    for(const ship of ships.ship??[])if(ship.status===protocol.CargoShipStatus.ARRIVED){
     const result=await act(`cargo-reward:${ship.index}:${ship.arriveTime}`,async()=>{
      const reply=await read('DrawShipRewardRequest','DrawShipRewardResponse',{index:ship.index});
      const after=(await read('CargoShipsRequest','CargoShipsResponse')).ship?.find(x=>x.index===ship.index);
      const verified=!!reply.reward&&!!after&&(after.status!==ship.status||after.arriveTime!==ship.arriveTime);
      return{status:verified?'verified':'unconfirmed',message:verified?'港口运输奖励已核对领取状态':'港口奖励结果未确认，停止本轮'};
     });if(result?.status==='unconfirmed')throw Error('unconfirmed_cargo_reward');
    }
    for(const ship of ships.ship??[])for(let i=0;i<(ship.orderItem??[]).length;i++){
     if(cap&&used>=cap){log(`港口已达每日装货上限 ${used}/${cap}（含待确认尝试）`);break;}
     const order=ship.orderItem[i];if(ship.status!==protocol.CargoShipStatus.IN_ORDER||order.filled||!order.asset?.id||!(order.asset.num>0))continue;
     const stock=await items();if((stock[order.asset.id]??0)<order.asset.num)continue;
     const key=prefix+`${ship.index}:${ship.arriveTime}:${i+1}:${order.asset.id}:${order.asset.num}`;if(history.has(key))continue;
     history.add(key);used++;
     const result=await act(key,async()=>{
      const reply=await read('FillCargoShipRequest','FillCargoShipResponse',{shipIndex:ship.index,cargoIndex:[i+1]});
      const after=(await read('CargoShipsRequest','CargoShipsResponse')).ship?.find(x=>x.index===ship.index);
      const verified=!!reply.reward&&!!after&&(after.orderItem?.[i]?.filled===true||after.status!==ship.status||after.arriveTime!==ship.arriveTime);
      return{status:verified?'verified':'unconfirmed',message:verified?`港口装货 ${ship.index}/${i+1}：已核对装货状态；今日 ${used}${cap?'/'+cap:''} 次`:'港口装货结果未确认，停止本轮'};
     });if(result?.status==='unconfirmed')throw Error('unconfirmed_cargo');
    }
   }
  }
 }
 if(s.ref_world_report){
  for(let page=0;page<5;page++){
   const info=await read('CampaignReportsRequest','CampaignReportsResponse',{pageNo:page});if(!info.reports?.length)break;
   for(const report of info.reports.filter(x=>!x.received).slice(0,20)){
    const result=await act('report:'+report.uid,async()=>{
     await client.sendWatch('QuickGotCampaignReportRequest',{campaignId:[report.uid],all:false},{window:1000});
     const after=await read('CampaignReportsRequest','CampaignReportsResponse',{pageNo:page});const verified=after.reports?.some(x=>String(x.uid)===String(report.uid)&&x.received===true);
     return{status:verified?'verified':'unconfirmed',message:verified?`战报 ${report.uid}：已核对奖励领取标记`:'战报领取结果未确认，停止本轮'};
    });if(result?.status==='unconfirmed')throw Error('unconfirmed_report');
   }
  }
 }
 if(s.ref_world_fleet_repair){
  const fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets??[];
  const ordered=[...fleets].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true}));
  for(let i=0;i<ordered.length;i++){
   const fleet=ordered[i];const threshold=Number(s.ref_world_fleet_repairThresholds?.[i]??1600);
   if(fleet.state!==protocol.FleetState.IDLE||fleet.repairing?.endTs>now()||!(fleet.maxDura>0)||fleet.durability>=Math.min(fleet.maxDura,threshold))continue;
   const stock=await items();if(!(stock['汽油']>0)){log('舰队修复：汽油不足');break;}
   const result=await act(`fleet-repair:${fleet.buildingId}:${fleet.durability}:${stock['汽油']}`,async()=>{
    await client.sendWatch('RepairFleetRequest',{buildingId:fleet.buildingId},{window:1000});
    const after=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId);
    const verified=!!after&&(after.repairing?.endTs>now()||after.durability>fleet.durability);
    return{status:verified?'verified':'unconfirmed',message:verified?`舰队 ${fleet.buildingId}：已核对修复状态`:'舰队修复结果未确认，停止本轮'};
   });if(result?.status==='unconfirmed')throw Error('unconfirmed_fleet_repair');
  }
 }
}
