import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const sweepBonuses=JSON.parse(fs.readFileSync(new URL('./pirate-sweep-bonuses.json',import.meta.url),'utf8'));
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export function inPirateWindow(start,end,seconds){
 if(!start&&!end||start===end)return true;
 if(!/^\d{2}:\d{2}$/.test(start??'')||!/^\d{2}:\d{2}$/.test(end??''))return false;
 const time=new Date((seconds+28800)*1000).toISOString().slice(11,16);
 return start<end?time>=start&&time<end:time>=start||time<end;
}
export async function runPirates({client,protocol,settings:s,state,act,log,history=new Set(),config=tables,sweepBudget=50,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
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
 const baseSweep=Number(config.PirateParamCfg?.data?.find(x=>x.paramName==='每日野怪扫荡次数')?.paramValue);
 const vipBonus=sweepBonuses.vip.find(x=>x.level===state.vipLevel)?.bonus??0;
 // Current client month-card tables grant no pirate-sweep bonus.
 const maxSweep=baseSweep+vipBonus;
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
  if(result&&result.status!=='verified')throw Error('unconfirmed_pirate_sweep');
  if(result?.status==='verified'&&Number.isSafeInteger(sweepBudget)&&sweepBudget>1)return runPirates({client,protocol,settings:s,state,act,log,history,config,sweepBudget:sweepBudget-1,sleep});
  return;
 }
 if(sweep){
  if(!Number.isSafeInteger(pirates.sweepTimes)||pirates.sweepTimes<0||!Number.isSafeInteger(maxSweep)||maxSweep<=0)log('海盗扫荡：服务器次数或每日上限未确认，本轮不发送');
  else if(pirates.sweepTimes>=maxSweep)log(`海盗扫荡：今日已完成 ${pirates.sweepTimes}/${maxSweep} 次`);
  else{const eligible=options.filter(x=>x.p.level<=x.killed),selected=eligible.filter(x=>allowed(x,s.ref_world_pirate_sweepTypes));log(`海盗扫荡：今日 ${pirates.sweepTimes}/${maxSweep} 次，剩余 ${maxSweep-pirates.sweepTimes} 次；当前海盗 ${pirates.pirates?.length??0} 个，赛季进度内 ${options.length} 个，已通关可扫 ${eligible.length} 个，类型匹配 ${selected.length} 个；暂无可扫目标，下一轮重新读取，不视为完成`);}
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
 const {p,row}=choice;
 const group=ready.filter(f=>Number(f.power)>=Number(row.power)*margin/100&&!history.has(actionKey(p,f)));
 const cost=fuel*group.length;
 if(!group.length)return;
 if((before['汽油']??0)<cost){log(`海盗：${group.length} 支舰队同时出征需汽油 ${cost}，当前不足，本轮不派遣`);return;}
 const ids=group.map(f=>f.buildingId);
 const key=actionKey(p,group[0]);for(const fleet of group)history.add(actionKey(p,fleet));
 const result=await act(key,async()=>{
  await client.sendWatch('ChallengePirateRequest',{uid:p.uid,fleetBuildingIds:ids,cityId:p.cityId},{window:1000});
  let verified=false,observed=[],fuelSpent=null;
  for(const wait of [0,400,800]){
   if(wait)await sleep(wait);
   const current=(await read('MyFleetsRequest','MyFleetsResponse')).fleets??[],after=await inventory();
   observed=ids.map(id=>{const f=current.find(x=>x.buildingId===id);return {id,state:f?.state??null,city:f?.targetCityId??null,grid:f?.targetGridIdx??null,matched:!!f&&[protocol.FleetState.MOVING,protocol.FleetState.BATTLING,protocol.FleetState.QUEUING].includes(f.state)&&f.targetCityId===p.cityId&&f.targetGridIdx===p.gridIdx};});
   fuelSpent=(before['汽油']??0)-(after['汽油']??0);
   verified=observed.every(f=>f.matched)&&fuelSpent===cost;
   if(verified)break;
  }
  return {status:verified?'verified':'unconfirmed',message:verified?`海盗 ${row.showName} Lv.${p.level}：${ids.length} 支舰队同时出征同一目标，已核对各舰队状态与汽油 ${cost}，战斗结果待战报`:`海盗出征未确认：目标 ${p.cityId}/${p.gridIdx}，已确认 ${observed.filter(f=>f.matched).length}/${ids.length} 队，汽油扣除 ${fuelSpent}/${cost}；仅暂停海盗，其他任务继续`,diagnostics:{target:{uid:p.uid,city:p.cityId,grid:p.gridIdx},fleets:observed,fuelSpent,expectedFuel:cost}};
 });
 if(result&&result.status!=='verified')throw Error('unconfirmed_pirate_attack');
}

export async function runPiratesGuarded({run,client,paused,log}){
 if(paused.has('pirates'))return;
 try{await run();}catch(e){
  if(client?.connected===false||!/^unconfirmed_pirate_(attack|sweep)$/.test(e.message))throw e;
  paused.add('pirates');log('海盗结果未确认，仅暂停海盗模块，其他任务继续；不重复发送出征或扫荡请求');
 }
}
