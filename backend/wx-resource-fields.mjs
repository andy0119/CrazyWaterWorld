import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const worldMap=JSON.parse(fs.readFileSync(new URL('./wx-game/world-map1.json',import.meta.url),'utf8'));
export async function runResourceFields({client,settings:s,state,protocol,act,log,history=new Set(),config=tables,map=worldMap}){
 if(!s.ref_world_resField_enabled)return;
 if(state.scenarioId!==1||!Number.isSafeInteger(state.season)||state.season<1){log('资源地：当前场景地图尚未匹配');return;}
 const limits={1:s.ref_world_resField_factory,2:s.ref_world_resField_oasis,3:s.ref_world_resField_tank};
 if(Object.values(limits).every(x=>!(Number(x)>0)))return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const guild=(await read('GuildInfoRequest','GuildInfoResponse')).guild;if(!guild)return;
 const cities=(await read('GuildCityInfoRequest','GuildCityInfoResponse')).cities;if(!Array.isArray(cities))return;
 const own=(await read('MyResFieldsRequest','MyResFieldsResponse')).info;
 if(!Array.isArray(own?.fields)||!Number.isSafeInteger(own.maxNum)||own.maxNum<=0)return;
 const fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets;if(!Array.isArray(fleets))return;
 const validGrid=x=>Number.isSafeInteger(x)&&x>=0&&x<map.mapData.length;
 const type=x=>validGrid(x)?Math.floor(map.mapData[x]/10000)%10:0;
 const occupied=new Set(own.fields.map(x=>x.gridIdx));
 // Outbound fleets reserve a resource slot until occupation or return is known.
 for(const f of fleets)if([protocol.FleetState.MOVING,protocol.FleetState.BATTLING,protocol.FleetState.QUEUING].includes(f.state)&&type(f.targetGridIdx)>0)occupied.add(f.targetGridIdx);
 if(occupied.size>=own.maxNum){log('资源地：已有占领或在途数量已达服务器上限');return;}
 const fuel=config.WorldParamCfg?.data?.find(x=>x.paramName==='资源地消耗汽油')?.paramValue;
 if(!Number.isSafeInteger(fuel)||fuel<=0)return;
 const stock=async()=>{
  const items=(await read('AllItemRequest','AllItemResponse')).items;
  if(!Array.isArray(items))throw Error('unknown_resource_field_inventory');
  return Object.fromEntries(items.map(x=>[x.itemId,Number(x.num)]));
 };
 const before=await stock();if(!Number.isSafeInteger(before['汽油'])||before['汽油']<fuel)return;
 const sorted=[...fleets].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true}));
 const ready=sorted.filter((f,i)=>f.state===protocol.FleetState.IDLE&&!(f.repairing?.endTs>now())&&f.maxDura>0&&f.durability>=Math.min(f.maxDura,Number(s.ref_world_fleet_repairThresholds?.[i]??1600))&&Number(f.power)>0);
 const margin=Number(s.ref_world_fleet_powerMarginPct??115);if(!Number.isFinite(margin)||margin<0)return;
 const candidates=[];
 for(const city of cities){
  const c=(config['1_CityCfg']?.data??[]).find(x=>x.id===city.cityId),grids=map.cityInfo[String(city.cityId)]?.res;if(!c||!Array.isArray(grids))continue;
  const level=c.guildIndex>0?1:c.resLevel;
  for(const grid of grids){
   const t=type(grid),limit=Math.max(0,Math.floor(Number(limits[t])||0));
   if(!limit||occupied.has(grid)||[...occupied].filter(g=>type(g)===t).length>=limit)continue;
   if(map.mapData[grid]%1000!==city.cityId)continue;
   const row=(config['1_ResFieldTypeCfg']?.data??[]).find(x=>Number(x.season)===state.season&&x.type===t&&x.level===level);
   if(row?.suggestPower>0)candidates.push({grid,t,power:row.suggestPower,city:city.cityId});
  }
 }
 candidates.sort((a,b)=>a.power-b.power||a.grid-b.grid);
 const day=new Date((now()+28800)*1000).toISOString().slice(0,10),key=(g,f)=>`resource-field:${day}:${g}:${f.buildingId}`;
 let choice;for(const c of candidates){const fleet=ready.find(f=>Number(f.power)>=c.power*margin/100&&!history.has(key(c.grid,f)));if(fleet){choice={...c,fleet};break;}}
 if(!choice){log('资源地：没有满足数量、地图、战力或舰队耐久条件的目标');return;}
 const {grid,t,city,fleet}=choice,k=key(grid,fleet);history.add(k);
 const result=await act(k,async()=>{
  await client.sendWatch('ChallengeResFieldRequest',{resFieldGridIdx:grid,fleetBuildingIds:[fleet.buildingId]},{window:1000});
  const afterFleet=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId);
  const afterOwn=(await read('MyResFieldsRequest','MyResFieldsResponse')).info;
  const after=await stock(),won=afterOwn?.fields?.some(x=>x.gridIdx===grid);
  const departed=afterFleet&&[protocol.FleetState.MOVING,protocol.FleetState.BATTLING,protocol.FleetState.QUEUING].includes(afterFleet.state)&&afterFleet.targetGridIdx===grid&&afterFleet.targetCityId===city;
  const ok=(won||departed)&&before['汽油']-(after['汽油']??0)===fuel;
  return{status:ok?'verified':'unconfirmed',message:ok?`资源地 ${grid}（类型 ${t}）：${won?'已核对占领':'已核对出征，等待占领结果'}与汽油消耗`:'资源地派遣结果未确认，停止本轮'};
 });
 if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_resource_field');
}
