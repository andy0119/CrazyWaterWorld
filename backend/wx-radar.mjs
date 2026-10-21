import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runRadar({client,protocol,settings:s,state,act,log,history=new Set(),claimsOnly=false,config=tables,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!s.ref_world_radar_enabled)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const radar=async()=>(await read('RadarInfoRequest','RadarInfoResponse')).radarInfo;
 const stock=async()=>{
  const items=await read('AllItemRequest','AllItemResponse'),res=await read('AllResourceRequest','AllResourceResponse');
  const out=Object.fromEntries((items.items??[]).map(x=>[x.itemId,Number(x.num)]));
  for(const x of res.list??[]){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const phases=protocol.RadarEventState;
 const list=info=>[...(info?.events??[]).map(e=>({e,fixed:false})),...(info?.fixedEvent?[{e:info.fixedEvent,fixed:true}]:[])];
 const enabled=({e,fixed})=>s['ref_world_radar_'+(fixed?'fixed':e.pirate?'pirate':e.collectRes?'collectRes':e.citySpy?'citySpy':e.refugee?'refugee':'other')]===true;
 const locate=(info,entry)=>entry.fixed?info?.fixedEvent?.eventId===entry.e.eventId?info.fixedEvent:null:info?.events?.find(x=>String(x.uid)===String(entry.e.uid)&&x.eventId===entry.e.eventId);
 let info=await radar();if(!info||!(info.level>0))return;
 let claims=0;
 for(const entry of list(info).filter(enabled)){
  const {e,fixed}=entry;if(e.state!==phases.RADAR_EVENT_FINISHED)continue;
  const reward=fixed?(config.RadarFixedEventCfg?.data?.find(x=>x.eventId===e.eventId)?.reward??[]).map(([id,num])=>({id,num})):e.reward?.asset??[];
  if(!reward.length||reward.some(x=>!x.id||!Number.isSafeInteger(Number(x.num))||Number(x.num)<=0))continue;
  const before=await stock();
  const result=await act(`radar-reward:${fixed?'fixed':String(e.uid)}:${e.eventId}:${e.createTime}`,async()=>{
   await client.sendWatch('RadarGetRewardRequest',fixed?{}:{uid:e.uid},{window:1000});
   const current=await radar(),after=await stock(),remaining=locate(current,entry),sum={};
   for(const a of reward)sum[a.id]=(sum[a.id]??0)+Number(a.num);
   const verified=!!current&&current.level>0&&(!remaining||remaining.state!==phases.RADAR_EVENT_FINISHED)&&Object.entries(sum).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   if(verified)info=current;
   return {status:verified?'verified':'unconfirmed',message:verified?`雷达${fixed?'固定':''}情报 ${e.eventId}：已核对领奖状态与库存`:'雷达奖励结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_radar_reward');
  if(++claims>=5)return;
 }
 if(claimsOnly){log('雷达：新派遣暂停中，仍检查已完成情报并领取奖励');return;}
 const fuel=Number(config.WorldParamCfg?.data?.find(x=>x.paramName==='情报事件消耗汽油')?.paramValue);
 if(!Number.isSafeInteger(fuel)||fuel<=0)return;
 const fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets??[];
 const ready=[...fleets].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true})).filter((f,i)=>f.state===protocol.FleetState.IDLE&&!(f.repairing?.endTs>now())&&f.maxDura>0&&f.durability>=Math.min(f.maxDura,Number(s.ref_world_fleet_repairThresholds?.[i]??1600))&&Number(f.power)>0);
 if(!ready.length){log(`雷达派遣：舰队共 ${fleets.length} 支，可用 0；需空闲、未维修、耐久达标且战力大于0`);return;}
 let waiting=0,missing=0,weak=0,done=0;
 for(const entry of list(info).filter(enabled)){
  const {e,fixed}=entry;if(e.state!==phases.RADAR_EVENT_INIT){waiting++;continue;}
  if(!fixed&&(!e.uid||String(e.uid)==='0'))continue;
  const row=fixed?config.RadarFixedEventCfg?.data?.find(x=>x.eventId===e.eventId):config.RadarRandEventCfg?.data?.find(x=>x.eventId===e.eventId);
  if(!row)continue;
  let power=0;
  if(fixed){if(!(row.power>0))continue;power=row.power;}
  else if(e.pirate){const target=config.WorldPirateCfg?.data?.find(x=>Number(x.season)===state.season&&x.type===e.pirate.type&&x.level===e.pirate.level);if(!(target?.power>0))continue;power=target.power;}
  const costs={'汽油':fuel};
  if((e.refugee?.requirements??[]).some(x=>!x.id||x.id==='RUBY'||!Number.isSafeInteger(Number(x.num))||Number(x.num)<=0))continue;
  for(const a of e.refugee?.requirements??[])costs[a.id]=(costs[a.id]??0)+Number(a.num);
  const before=await stock();const absent=Object.entries(costs).filter(([id,n])=>(before[id]??0)<n);if(absent.length){missing++;log(`雷达事件 ${e.eventId} 缺少：`+absent.map(([id,n])=>`${id} ${n-(before[id]??0)}`).join('、'));continue;}
  const eventPrefix=`radar-start:${fixed?'fixed':String(e.uid)}:${e.eventId}:${e.createTime}:`;
  // A prior dispatch applies to the event, not only to one fleet.
  if([...history].some(key=>key.startsWith(eventPrefix))){done++;continue;}
  const keyFor=f=>eventPrefix+f.buildingId;
  const fleet=ready.find(f=>Number(f.power)>=power*Math.max(0,Number(s.ref_world_fleet_powerMarginPct??115))/100&&!history.has(keyFor(f)));
  if(!fleet){weak++;continue;}const key=keyFor(fleet);history.add(key);
  const result=await act(key,async()=>{
   await client.sendWatch('RadarSendFleetsRequest',fixed?{fleetBuildingIds:[fleet.buildingId]}:{uid:e.uid,fleetBuildingIds:[fleet.buildingId]},{window:1000});
   let verified=false,diagnostic='';
   // Query only: never resend the dispatch while waiting for delayed pushes.
   for(const wait of [0,800,1600]){
    if(wait)await sleep(wait);
    const current=locate(await radar(),entry),after=await stock();
    const stateOk=!!current&&[phases.RADAR_EVENT_START,phases.RADAR_EVENT_FINISHED].includes(current.state);
    const costsOk=Object.entries(costs).every(([id,n])=>(before[id]??0)-(after[id]??0)===n);
    verified=stateOk&&costsOk;
    diagnostic=`事件 ${e.eventId}，状态 ${current?.state??'未找到'}，`+Object.entries(costs).map(([id,n])=>`${id}预期扣除 ${n}／实际 ${(before[id]??0)-(after[id]??0)}`).join('；');
    if(verified)break;
   }
   return {status:verified?'verified':'unconfirmed',message:verified?`雷达${fixed?'固定':''}情报 ${e.eventId}：已核对执行状态与材料消耗，完成后另行领奖`:`雷达派遣复查仍未确认（${diagnostic}），保留该事件，不自动重发；下一轮继续检查其他情报`};
  });
  if(result&&result.status!=='verified')throw Error('unconfirmed_radar_start');return;
 }
 log(`雷达派遣：事件共 ${list(info).length}，所选类型 ${list(info).filter(enabled).length}，执行中／待领奖 ${waiting}，缺材料 ${missing}，战力不足 ${weak}，已派遣记录 ${done}，可用舰队 ${ready.length}`);
}
