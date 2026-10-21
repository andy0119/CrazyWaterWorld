import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export function inPirateWindow(start,end,seconds){
 if(!start&&!end||start===end)return true;
 if(!/^\d{2}:\d{2}$/.test(start??'')||!/^\d{2}:\d{2}$/.test(end??''))return false;
 const time=new Date((seconds+28800)*1000).toISOString().slice(11,16);
 return start<end?time>=start&&time<end:time>=start||time<end;
}
export async function runPirates({client,protocol,settings:s,state,act,log,history=new Set(),config=tables}){
 if(!s.ref_world_pirate_attack&&!s.ref_world_pirate_sweep)return;
 if(!Number.isSafeInteger(state.season)||state.season<1){log('海盗：赛季尚未确认');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const inventory=async()=>{
  const items=await read('AllItemRequest','AllItemResponse'),resources=await read('AllResourceRequest','AllResourceResponse');
  const out=Object.fromEntries((items.items??[]).map(x=>[x.itemId,Number(x.num)]));
  for(const x of resources.list??[]){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 const fuel=Number(config.WorldParamCfg?.data?.find(x=>x.paramName==='打野怪消耗汽油')?.paramValue);
 if(!Number.isSafeInteger(fuel)||fuel<=0)return;
 const sweep=s.ref_world_pirate_sweep&&inPirateWindow(s.ref_world_pirate_sweepTime_start,s.ref_world_pirate_sweepTime_end,now());
 const attack=s.ref_world_pirate_attack&&inPirateWindow(s.ref_world_pirate_attackTime_start,s.ref_world_pirate_attackTime_end,now());
 if(!sweep&&!attack)return;
 const stage=(await read('SeasonTaskStageRequest','SeasonTaskStageResponse')).stage;
 if(!Number.isSafeInteger(stage)||stage<0)return;
 const seasonRow=config.SeasonTaskCfg?.data?.find(x=>Number(x.season)===state.season&&x.stage===stage);
 if(stage!==0&&!seasonRow)return;
 const pirates=await read('AllPirateRequest','AllPirateResponse'),records=(await read('PirateKillRecordRequest','PirateKillRecordResponse')).records??[];
 const options=(pirates.pirates??[]).filter(x=>Number.isSafeInteger(x.uid)&&x.uid>0&&Number.isSafeInteger(x.cityId)&&x.cityId>0).map(p=>({p,row:config.WorldPirateCfg?.data?.find(x=>Number(x.season)===state.season&&x.type===p.type&&x.level===p.level),killed:records.find(x=>x.type===p.type)?.maxKilledLevel??0})).filter(x=>x.row&&(stage===0||x.p.level<=seasonRow.maxPirateLevel));
 const allowed=(o,names)=>!names?.length||names.includes(String(o.p.type))||names.includes(o.row.showName);
 const before=await inventory();if((before['汽油']??0)<fuel){log('海盗：汽油不足');return;}
 const maxSweep=Number(config.PirateParamCfg?.data?.find(x=>x.paramName==='每日野怪扫荡次数')?.paramValue);
 const target=sweep&&Number.isSafeInteger(pirates.sweepTimes)&&pirates.sweepTimes>=0&&maxSweep>pirates.sweepTimes?options.filter(x=>x.p.level<=x.killed&&allowed(x,s.ref_world_pirate_sweepTypes)).sort((a,b)=>b.p.level-a.p.level)[0]:null;
 if(target){
  const fixed=target.row.fixedReward??[];if(!fixed.length||fixed.some(x=>!x[0]||!(x[1]>0)))return;
  const day=new Date((now()+28800)*1000).toISOString().slice(0,10);
  const result=await act(`pirate-sweep:${day}:${pirates.sweepTimes}:${target.p.uid}`,async()=>{
   await client.sendWatch('PirateSweepRequest',{uid:target.p.uid,cityId:target.p.cityId},{window:1000});
   const current=await read('AllPirateRequest','AllPirateResponse'),after=await inventory(),assets={};
   for(const [id,n] of fixed)assets[id]=(assets[id]??0)+Number(n);
   const verified=current.sweepTimes===pirates.sweepTimes+1&&Object.entries(assets).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   return {status:verified?'verified':'unconfirmed',message:verified?`海盗扫荡 ${target.row.showName} Lv.${target.p.level}：已核对每日次数与固定奖励`:'海盗扫荡结果未确认，停止本轮'};
  });
  if(result&&result.status!=='verified')throw Error('unconfirmed_pirate_sweep');return;
 }
 if(!attack)return;
 const margin=Math.max(0,Number(s.ref_world_fleet_powerMarginPct??115));
 const fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets??[];
 const ready=[...fleets].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true})).filter((f,i)=>f.state===protocol.FleetState.IDLE&&!(f.repairing?.endTs>now())&&f.maxDura>0&&f.durability>=Math.min(f.maxDura,Number(s.ref_world_fleet_repairThresholds?.[i]??1600))&&Number(f.power)>0);
 const candidates=options.filter(x=>x.p.level===x.killed+1&&allowed(x,s.ref_world_pirate_attackTypes)&&x.row.power>0).sort((a,b)=>a.row.power-b.row.power);
 const day=new Date((now()+28800)*1000).toISOString().slice(0,10);
 const actionKey=(p,f)=>`pirate-attack:${day}:${p.uid}:${p.cityId}:${f.buildingId}`;
 let choice;
 for(const o of candidates){const fleet=ready.filter(f=>Number(f.power)>=Number(o.row.power)*margin/100&&!history.has(actionKey(o.p,f))).sort((a,b)=>Number(b.power)-Number(a.power))[0];if(fleet){choice={...o,fleet};break;}}
 if(!choice){log('海盗：没有满足进度、战力裕量、舰队耐久与类型条件的目标');return;}
 const {p,row,fleet}=choice;
 const key=actionKey(p,fleet);history.add(key);
 const result=await act(key,async()=>{
  await client.sendWatch('ChallengePirateRequest',{uid:p.uid,fleetBuildingIds:[fleet.buildingId],cityId:p.cityId},{window:1000});
  const current=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId),after=await inventory();
  const departed=!!current&&[protocol.FleetState.MOVING,protocol.FleetState.BATTLING,protocol.FleetState.QUEUING].includes(current.state)&&current.targetCityId===p.cityId&&current.targetGridIdx===p.gridIdx;
  const verified=departed&&(before['汽油']??0)-(after['汽油']??0)===fuel;
  return {status:verified?'verified':'unconfirmed',message:verified?`海盗 ${row.showName} Lv.${p.level}：已核对舰队出征目标与汽油消耗，战斗结果待战报`:'海盗出征结果未确认，停止本轮'};
 });
 if(result&&result.status!=='verified')throw Error('unconfirmed_pirate_attack');
}
