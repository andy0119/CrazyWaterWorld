import {normalize}from './wx-game/worlds.mjs';
export function mapFleet(f,roleId,own=false){
 const owner=String(f.owner?.playerId??(own?roleId:''));if(!owner||owner==='0')return null;own=own||owner===String(roleId);
 return{id:own?String(f.buildingId):owner+':'+String(f.buildingId),ownerId:owner,nickname:String(f.owner?.nickname??'').slice(0,80),guildId:String(f.owner?.guildId??'').slice(0,40),own,cityId:f.cityId??0,grid:f.curGridIdx??0,targetGrid:f.targetGridIdx??0,state:f.state??0,startGrid:f.startGridIdx??0,startCityId:f.startCityId??0,targetCityId:f.targetCityId??0,moveStart:f.moveStartTs??0,moveEnd:f.moveEndTs??0,treasureUid:f.treasureLootUid??0};
}
export function mapTreasure(t){if(!Number.isSafeInteger(t.uid)||t.uid<=0||!Number.isSafeInteger(t.gridIdx)||t.gridIdx<0)return null;return{uid:t.uid,grid:t.gridIdx,color:t.color??1,ownerGuild:t.ownerGuildIdx??0,fleets:t.ownerFleetNum??0,progress:Number.isFinite(t.progress)?Math.min(100,Math.max(0,t.progress)):0};}
export function mapTreasureRank(x){const id=String(x.playerId??'');if(!/^\d{1,40}$/.test(id)||id==='0')return null;const progress=Number(x.progress??0),estimated=Number(x.estProgress??0);if(!Number.isFinite(progress)||!Number.isFinite(estimated)||progress<0||progress>100||estimated<0||estimated>100)return null;return{playerId:id,nickname:String(x.nickname??'').slice(0,80),guildIdx:Number(x.guildIdx??0),progress,estimated,rank:Number(x.rank??0)};}
export function mapChipMine(t){if(!Number.isSafeInteger(t.gridId)||t.gridId<0)return null;return{grid:t.gridId,color:t.color??1,occupied:t.occupiedNum??0,total:t.positionNum??0};}
export async function emitWorldMap({client,state,roleId,emit,log}){
 if(state.scenarioId!==1)return;
 try{const world=normalize(await client.request('WorldInfoRequest',{screenCenter:{x:0,y:0}},'WorldInfoResponse',8000)),fleet=normalize(await client.request('MyFleetsRequest',{},'MyFleetsResponse',8000));
 if(!Array.isArray(world.cities)||!Array.isArray(fleet.fleets))return;
 const data={scenario:1,serverNow:Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),cities:world.cities.slice(0,200).map(c=>({id:c.id,guildIdx:c.guildIdx??0})),fleets:[...fleet.fleets.slice(0,10).map(f=>mapFleet(f,roleId,true)),...(world.fleets??[]).filter(f=>String(f.owner?.playerId)!==String(roleId)).slice(0,190).map(f=>mapFleet(f,roleId))].filter(Boolean)};
 for(const [key,req,res,field,mapper]of [['treasures','TreasureLootListRequest','TreasureLootListResponse','treasure',mapTreasure],['chipMines','ChipMineListRequest','ChipMineListResponse','chipMines',mapChipMine]]){
  try{const reply=normalize(await client.request(req,{},res,8000));if(!Array.isArray(reply[field]))throw Error('map_entities');data[key]=reply[field].slice(0,200).map(mapper).filter(Boolean);data[key+'Updated']=data.serverNow;if(key==='treasures')for(const t of data.treasures){const old=state.mapSnapshot?.treasures?.find(x=>x.uid===t.uid);if(Array.isArray(old?.ranks)){t.ranks=old.ranks;t.ranksUpdated=old.ranksUpdated;}}}
  catch{data[key]=state.mapSnapshot?.[key]??[];if(state.mapSnapshot?.[key+'Updated'])data[key+'Updated']=state.mapSnapshot[key+'Updated'];log(key==='treasures'?'地图货轮本轮未更新，保留先前资料并标示时间':'地图芯片矿本轮未更新，活动可能未开放');}
 }
 // Bounded, oldest-first reads on the existing session; no extra game login.
 for(const t of [...(data.treasures??[])].filter(x=>x.fleets>0).sort((a,b)=>(a.ranksUpdated??0)-(b.ranksUpdated??0)).slice(0,3)){
  try{const reply=normalize(await client.request('TreasureLootRankRequest',{uid:t.uid},'TreasureLootRankResponse',8000));if(!Array.isArray(reply.items))throw Error('map_rank');t.ranks=reply.items.slice(0,50).map(mapTreasureRank).filter(Boolean);t.ranksUpdated=data.serverNow;}
  catch{log('地图货轮 '+t.uid+' 佔领名单本轮未更新，保留原查询时间');}
 }
 state.mapSnapshot=data;emit({type:'world_map',roleId:String(roleId),data});
 }catch{log('地圖資料本輪未更新，保留上次快取；其他任務繼續');}
}

export function watchMapMovement({client,state,roleId,emit}){
 client.on('message',({name,body})=>{
  if(!state.mapSnapshot)return;
  if(['SCTreasureLootUpdate','SCTreasureLootRefresh','SCChipMine'].includes(name)){
   const data=state.mapSnapshot,v=normalize(body),now=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
   if(name==='SCTreasureLootRefresh'){data.treasures=[];data.treasuresUpdated=now;}
   else{const key=name==='SCChipMine'?'chipMines':'treasures',rows=name==='SCChipMine'?v.chipMines:v.treasure,mapper=name==='SCChipMine'?mapChipMine:mapTreasure,id=name==='SCChipMine'?'grid':'uid';if(!Array.isArray(rows))return;data[key]??=[];for(const entry of rows){const previous=data[key].find(x=>x[id]===(name==='SCChipMine'?entry.gridId:entry.uid));const prior=previous?(name==='SCChipMine'?{gridId:previous.grid,color:previous.color,occupiedNum:previous.occupied,positionNum:previous.total}:{uid:previous.uid,gridIdx:previous.grid,color:previous.color,ownerGuildIdx:previous.ownerGuild,ownerFleetNum:previous.fleets,progress:previous.progress}):{};const row=mapper({...prior,...entry});if(!row)continue;const i=data[key].findIndex(x=>x[id]===row[id]);if(i>=0)data[key][i]={...data[key][i],...row};else if(data[key].length<200)data[key].push(row);}data[key+'Updated']=now;}
   data.serverNow=now;emit({type:'world_map',roleId:String(roleId),data});return;
  }
  if(!['SCMyFleetUpdate','SCFleet'].includes(name))return;
  const fleets=normalize(body).fleets;if(!Array.isArray(fleets))return;
  const data=state.mapSnapshot;for(const f of fleets){const row=mapFleet(f,roleId,name==='SCMyFleetUpdate');if(!row)continue;const index=data.fleets.findIndex(x=>x.id===row.id);if(index>=0)data.fleets[index]=row;else if(data.fleets.length<200)data.fleets.push(row);}
  data.serverNow=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);emit({type:'world_map',roleId:String(roleId),data});
 });
}
