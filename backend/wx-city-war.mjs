import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const worldMap=JSON.parse(fs.readFileSync(new URL('./wx-game/world-map1.json',import.meta.url),'utf8'));
export function cityFuelCost({map,config,guildIdx,targetId,friendly}){
 if(friendly)return 0;
 const home=(config['1_CityCfg']?.data??[]).find(x=>x.guildIndex===guildIdx);
 const a=map.cityInfo?.[home?.id]?.gridIdx,b=map.cityInfo?.[targetId]?.gridIdx,m=map.mapInfo;
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||!m||!(m.width>0&&m.tileWidth>0&&m.tileHeight>0))return null;
 const point=idx=>{const col=idx%m.width,row=Math.floor(idx/m.width);return[(col+(row%2===0?0.5:1))*m.tileWidth,-(row+1)*m.tileHeight/2];};
 const [ax,ay]=point(a),[bx,by]=point(b),distance=Math.hypot(ax-bx,ay-by);
 const bands=[...(config['1_AttackCityConsumeCfg']?.data??[])].sort((a,b)=>a.dist-b.dist);
 if(!bands.length||bands.some(x=>!Number.isFinite(x.dist)||!Number.isFinite(x.cost)||x.cost<0))return null;
 let unit=bands[0].cost;for(const band of bands){if(distance<band.dist)break;unit=band.cost;}
 const fuel=Math.ceil(distance*unit);return Number.isSafeInteger(fuel)&&fuel>=0?fuel:null;
}
export async function accelerateCityFleet({client,protocol,fleet,key,settings:s,read,stock,now,act,log,config,sleep}){
 const target=Number(s[key+'marchSpeedupTargetSecs']??100),cost=config.WorldParamCfg?.data?.find(x=>x.paramName==='行军加速消耗')?.paramValue;
 if(s[key+'marchSpeedup']!==true||!Number.isFinite(target)||target<0||target>100||!Number.isSafeInteger(cost)||cost<=0)return;
 for(let n=0;n<8;n++){
  const current=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId);
  if(current?.state!==protocol.FleetState.MOVING||!(current.targetCityId>0)||current.targetCityId!==fleet.targetCityId||!(current.moveEndTs-now()>target))return;
  const before=await stock(),balance=before.RUBY;if(!Number.isSafeInteger(balance)||balance<cost){log('城战行军加速：钻石不足或余额未确认，继续正常行军');return;}
  const result=await act(`city-speed:${current.buildingId}:${current.targetCityId}:${current.moveEndTs}:${balance}`,async()=>{
   const fresh=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===current.buildingId);
   if(fresh?.state!==protocol.FleetState.MOVING||fresh.targetCityId!==current.targetCityId||fresh.moveEndTs!==current.moveEndTs)return{status:'rejected',message:'城战行军状态已变，取消加速'};
   await client.sendWatch('SpeedUpFleetRequest',{buildingId:current.buildingId},{window:800});
   let verified=false;
   for(const wait of [0,400,800]){if(wait)await sleep(wait);const after=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===current.buildingId),items=await stock();
    const progressed=after&&(after.targetCityId===current.targetCityId&&after.state===protocol.FleetState.MOVING&&after.moveEndTs<current.moveEndTs||after.cityId===current.targetCityId&&after.state!==protocol.FleetState.MOVING);
    if(progressed&&balance-items.RUBY===cost){verified=true;break;}}
   return{status:verified?'verified':'unconfirmed',message:verified?`城战行军加速：耗钻 ${cost} 与行军进度已核对`:'城战行军加速结果未确认，停止本次城战操作'};
  });
  if(result?.status==='unconfirmed')throw Error('unconfirmed_city_war');
  if(result?.status!=='verified')return;
 }
}
export async function runCityWar({client,settings:s,state,protocol,act,log,history=new Set(),config=tables,map=worldMap,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!s.ref_world_cityWar_enabled)return;
 const scenario=Number(s.ref_world_cityWar_scenario??1);
 if(scenario!==1||state.scenarioId!==1){log('城战：当前仅支持普通世界方案1，场景不符时跳过');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const unlock=(config.ModuleOpenCfg?.data??[]).find(x=>x.moduleId==='世界')?.playerLevel;
 const days=(config.GameplayOpenCfg?.data??[]).find(x=>x.gameplay==='国战')?.openDays;
 if(!Number.isSafeInteger(unlock)||!Number.isSafeInteger(state.level)||state.level<unlock||!Number.isSafeInteger(state.season)||state.season<1||!Array.isArray(days)||!days.length||!(state.worldOpenTime>0)){log('城战：等级或世界开放条件尚未确认，跳过');return;}
 const required=days[Math.min(state.season,days.length)-1],openDay=Math.floor((now()+28800)/86400)-Math.floor((state.worldOpenTime+28800)/86400)+1;
 if(!Number.isSafeInteger(required)||required<1||openDay<required){log('城战：本赛季国战尚未开放，跳过');return;}
 const war=await read('WarDeclarationRequest','WarDeclarationResponse');
 if(!Number.isSafeInteger(war.startTime)||!Number.isSafeInteger(war.endTime)||!(war.startTime<=now()&&now()<war.endTime)||!Array.isArray(war.declarations)){log('城战：尚未开战或本场已结束');return;}
 const unite=await read('UniteWorldsPlanRequest','UniteWorldsPlanResponse');
 if((unite.matchMaking||unite.executeTs>0&&unite.worldIds?.length)&&now()>=unite.executeTs-3600){log('城战：处于合服禁止操作时段');return;}
 const guild=(await read('GuildInfoRequest','GuildInfoResponse')).guild;if(!guild?.guildId)return;
 let idx;try{idx=Number(BigInt(String(guild.guildId))%1000n);}catch{return;}if(idx<=0)return;
 const world=await read('WorldInfoRequest','WorldInfoResponse',{screenCenter:{x:0,y:0}});
 if(!Array.isArray(world.cities))return;
 if(s.ref_world_cityWar_online)log('城战：已读取世界状态，当前连接持续保持在线');
 const owned=war.declarations.filter(x=>x.attackGuildIdx===idx||x.defenceGuildIdx===idx);
 const cityRows=config['1_CityCfg']?.data??[];
 const stock=async()=>{const items=(await read('AllItemRequest','AllItemResponse')).items;if(!Array.isArray(items))throw Error('unknown_city_war_inventory');return Object.fromEntries(items.map(x=>[x.itemId,Number(x.num)]));};
 const fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets;if(!Array.isArray(fleets))return;
 const ordered=[...fleets].sort((a,b)=>a.buildingId.localeCompare(b.buildingId,undefined,{numeric:true}));
 for(let i=0;i<Math.min(3,ordered.length);i++){
  const key='ref_world_cityWar_fleets_'+i+'_';if(!s[key+'enabled'])continue;
  const fleet=ordered[i];
  if(fleet.state===protocol.FleetState.MOVING){const city=world.cities.find(x=>x.id===fleet.targetCityId);if(city?.state===protocol.CityState.CTS_BATTLING&&owned.some(x=>x.cityId===fleet.targetCityId))await accelerateCityFleet({client,protocol,fleet,key,settings:s,read,stock,now,act,log,config,sleep});continue;}
  if(fleet.state!==protocol.FleetState.IDLE||fleet.repairing?.endTs>now()||!(fleet.maxDura>0)||fleet.durability<Math.min(fleet.maxDura,Number(s.ref_world_fleet_repairThresholds?.[i]??1600)))continue;
  const plan=s[key+'plan']??[];
  const cityIds=plan.length?plan.map(value=>{const text=String(value).trim(),byId=cityRows.find(x=>String(x.id)===text),named=cityRows.filter(x=>x.name===text);return byId?.id??(named.length===1?named[0].id:null);}).filter(Number.isSafeInteger):[war.assembleCityId];
  let target;
  for(const cityId of cityIds){
   if(!(cityId>0)||cityId===fleet.cityId||!map.cityInfo?.[cityId])continue;
   const city=world.cities.find(x=>x.id===cityId),declarations=owned.filter(x=>x.cityId===cityId);
   if(!city||city.state!==protocol.CityState.CTS_BATTLING||!declarations.length)continue;
   const friendly=city.guildIdx===idx;
   if(!declarations.some(x=>friendly?x.defenceGuildIdx===idx:x.attackGuildIdx===idx))continue;
   const cost=cityFuelCost({map,config,guildIdx:idx,targetId:cityId,friendly});if(cost===null)continue;
   const prefix=`city-war:${war.startTime}:${war.endTime}:${fleet.buildingId}:${cityId}:`;
   const attempts=[...history].filter(x=>x.startsWith(prefix)).length,max=s.ref_world_cityWar_reattack?3:1;
   if(attempts>=max)continue;
   target={cityId,cost,actionKey:prefix+attempts};break;
  }
  if(!target)continue;
  const before=await stock();if(!Number.isSafeInteger(before['汽油']??0)||(before['汽油']??0)<target.cost){log('城战：汽油不足，本轮不出征');continue;}
  history.add(target.actionKey);
  const result=await act(target.actionKey,async()=>{
   const currentWar=await read('WarDeclarationRequest','WarDeclarationResponse');
   const liveFleet=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId);
   const liveCity=(await read('WorldInfoRequest','WorldInfoResponse',{screenCenter:{x:0,y:0}})).cities?.find(x=>x.id===target.cityId);
   const validDeclaration=currentWar.declarations?.some(x=>x.cityId===target.cityId&&(liveCity?.guildIdx===idx?x.defenceGuildIdx===idx:x.attackGuildIdx===idx));
   if(currentWar.startTime!==war.startTime||currentWar.endTime!==war.endTime||now()>=war.endTime||!validDeclaration||liveCity?.state!==protocol.CityState.CTS_BATTLING||liveFleet?.state!==protocol.FleetState.IDLE)return{status:'rejected',message:'城战目标、时段或舰队状态已变化，取消本次出征'};
   await client.sendWatch('MoveFleetsToCityRequest',{buildingId:[fleet.buildingId],cityId:target.cityId},{window:1000});
   let ok=false,diagnostic='';
   for(const wait of [0,800,1600]){
    if(wait)await sleep(wait);
    const afterFleet=(await read('MyFleetsRequest','MyFleetsResponse')).fleets?.find(x=>x.buildingId===fleet.buildingId),after=await stock();
    const moving=afterFleet&&[protocol.FleetState.MOVING,protocol.FleetState.BATTLING,protocol.FleetState.QUEUING].includes(afterFleet.state)&&afterFleet.targetCityId===target.cityId;
    const arrived=afterFleet?.state===protocol.FleetState.IDLE&&afterFleet.cityId===target.cityId;
    const used=(before['汽油']??0)-(after['汽油']??0);ok=!!(moving||arrived)&&used===target.cost;
    diagnostic=`目标 ${target.cityId}，舰队状态 ${afterFleet?.state??'未知'}，汽油预期 ${target.cost}／实扣 ${used}`;
    if(ok)break;
   }
   return{status:ok?'verified':'unconfirmed',message:ok?`城战 ${fleet.buildingId} → 城市 ${target.cityId}：目的地与汽油已核对，胜负另查战报`:`城战出征未确认（${diagnostic}），不自动重发`};
  });
  if(!result)return;
  if(result.status==='rejected')continue;
  if(result.status!=='verified')throw Error('unconfirmed_city_war');
  await accelerateCityFleet({client,protocol,fleet:{...fleet,targetCityId:target.cityId},key,settings:s,read,stock,now,act,log,config,sleep});
 }
}
export async function runCityWarGuarded({run,client,paused,log}){
 if(paused.has('cityWar'))return;
 try{await run();}catch(error){
  if(error.message!=='unconfirmed_city_war'||client?.connected===false)throw error;
  paused.add('cityWar');log('城战本次运行已暂停：出征结果待核对，其他任务继续；不会重复派遣。');
 }
}
