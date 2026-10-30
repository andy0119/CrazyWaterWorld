import{normalize}from './wx-game/worlds.mjs';
export function chipMineInHours(windows,now){if(!windows?.length)return true;const minute=Math.floor(((now+28800)%86400)/60);return windows.some(x=>{const m=/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(x).replace(/\s/g,''));if(!m)return false;const [h,a,j,b]=m.slice(1).map(Number);if(h>23||j>23||a>59||b>59)return false;const start=h*60+a,end=j*60+b;return start===end||start<end?minute>=start&&minute<end:minute>=start||minute<end;});}
export function emptyChipPosition(info){const n=info.positionNum;if(!Number.isSafeInteger(n)||n<1||n>100||!Array.isArray(info.occupiedPositions)||!Number.isSafeInteger(info.occupiedNum??0))return null;const filled=new Set();for(const x of info.occupiedPositions){if(!Number.isSafeInteger(x.index)||x.index<0||x.index>=n)return null;if(x.player)filled.add(x.index);}if(filled.size!==(info.occupiedNum??0))return null;for(let i=0;i<n;i++)if(!filled.has(i))return i;return null;}
export async function runChipMines({client,protocol,settings:s,act,log,paused=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(s.ref_world_chipMine_enabled!==true||paused.has('chip-mine'))return;
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);if(!chipMineInHours(s.ref_world_chipMine_hours,now()))return;
 const read=async(req,res,body={})=>normalize(await client.request(req,body,res,8000));const ruby=async()=>{const b=await read('AllResourceRequest','AllResourceResponse');const n=Number(b.list?.find(x=>x.res===4)?.amount);if(!Number.isSafeInteger(n)||n<0)throw Error('unknown_chip_ruby');return n;};
 try{
  const remaining=(await read('ChipMineRewardRequest','ChipMineRewardResponse')).rewardInfo;if(!remaining||!Number.isSafeInteger(remaining.myRewardTimes??0)||!Number.isSafeInteger(remaining.maxRewardTimes))throw Error('unknown_chip_limit');if((remaining.myRewardTimes??0)>=remaining.maxRewardTimes){log('芯片矿：今日采集次数已满或尚未开放');return;}
  const mines=(await read('ChipMineListRequest','ChipMineListResponse')).chipMines;if(!Array.isArray(mines))throw Error('unknown_chip_list');
  const fleets=((await read('MyFleetsRequest','MyFleetsResponse')).fleets??[]).sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true}));let sent=0;
  for(const [i,fleet]of fleets.slice(0,3).entries()){
   const key=`ref_world_chipMine_fleets_${i}_`;if(s[key+'enabled']!==true||fleet.state!==protocol.FleetState.IDLE||!(fleet.durability>0)||!(fleet.power>0))continue;
   if(s[key+'chaseEnabled']===true){log(`芯片矿舰队 ${i+1}：追击规则尚未接通，保留该队不派遣`);continue;}
   const level=Number(s[key+'levels']);if(![3,4,5].includes(level))continue;
   let candidate;for(const mine of mines.filter(x=>x.color===level&&Number.isSafeInteger(x.gridId)&&x.gridId>0&&(x.occupiedNum??0)<x.positionNum).slice(0,12)){
    const detail=await read('ChipMineRequest','ChipMineResponse',{gridId:mine.gridId});const seat=emptyChipPosition(detail);if(seat!==null&&(detail.rewardInfo?.myRewardTimes??0)<detail.rewardInfo?.maxRewardTimes){candidate={mine,seat};break;}
   }
   if(!candidate){log(`芯片矿舰队 ${i+1}：未找到${({3:'蓝色矿',4:'紫色矿',5:'橙色矿'})[level]}的可确认空位，本轮不争夺已占位置`);continue;}
   const {mine,seat}=candidate;const result=await act(`chip-mine:${remaining.rewardResetTime}:${mine.gridId}:${seat}:${fleet.buildingId}:${remaining.myRewardTimes??0}`,async()=>{
    const before=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId),detail=await read('ChipMineRequest','ChipMineResponse',{gridId:mine.gridId});
    if(before?.state!==protocol.FleetState.IDLE||!(before.durability>0)||!(before.power>0)||emptyChipPosition(detail)!==seat||!((detail.rewardInfo?.myRewardTimes??0)<detail.rewardInfo?.maxRewardTimes))return{status:'rejected',message:'芯片矿空位、次数或舰队状态已变，取消派遣'};
    const balance=await ruby();await client.sendWatch('ChipMineSendFleetRequest',{gridId:mine.gridId,index:seat,fleetId:fleet.buildingId},{window:1000});let verified=false;
    for(const wait of [0,400,800]){if(wait)await sleep(wait);const after=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId),updated=await read('ChipMineRequest','ChipMineResponse',{gridId:mine.gridId});const own=updated.occupiedPositions?.some(x=>x.index===seat&&x.player?.fleetId===fleet.buildingId);verified=!!after&&(own||after.state===protocol.FleetState.MOVING&&after.targetGridIdx===mine.gridId)&&(await ruby())>=balance;if(verified)break;}
    return{status:verified?'verified':'unconfirmed',message:verified?`芯片矿舰队 ${i+1}：已核对前往矿点 ${mine.gridId} 空位 ${seat}，未耗钻；采集奖励尚待结算`:'芯片矿派遣结果未确认，仅暂停矿点任务，不重复出征'};
   });if(result?.status==='unconfirmed'){paused.add('chip-mine');return;}if(result?.status==='verified')sent++;
  }if(sent)log(`芯片矿：本轮确认派出 ${sent} 支舰队`);
 }catch(e){if(client.connected===false)throw e;paused.add('chip-mine');log('芯片矿：读取或派遣回覆未确认，仅暂停本功能');}
}
