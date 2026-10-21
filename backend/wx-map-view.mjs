import {normalize}from './wx-game/worlds.mjs';
export function mapFleet(f,roleId,own=false){
 const owner=String(f.owner?.playerId??(own?roleId:''));if(!owner||owner==='0')return null;own=own||owner===String(roleId);
 return{id:own?String(f.buildingId):owner+':'+String(f.buildingId),ownerId:owner,nickname:String(f.owner?.nickname??'').slice(0,80),guildId:String(f.owner?.guildId??'').slice(0,40),own,cityId:f.cityId??0,grid:f.curGridIdx??0,targetGrid:f.targetGridIdx??0,state:f.state??0,startGrid:f.startGridIdx??0,startCityId:f.startCityId??0,targetCityId:f.targetCityId??0,moveStart:f.moveStartTs??0,moveEnd:f.moveEndTs??0};
}
export async function emitWorldMap({client,state,roleId,emit,log}){
 if(state.scenarioId!==1)return;
 try{const world=normalize(await client.request('WorldInfoRequest',{screenCenter:{x:0,y:0}},'WorldInfoResponse',8000)),fleet=normalize(await client.request('MyFleetsRequest',{},'MyFleetsResponse',8000));
 if(!Array.isArray(world.cities)||!Array.isArray(fleet.fleets))return;
 const data={scenario:1,serverNow:Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),cities:world.cities.slice(0,200).map(c=>({id:c.id,guildIdx:c.guildIdx??0})),fleets:[...fleet.fleets.slice(0,10).map(f=>mapFleet(f,roleId,true)),...(world.fleets??[]).filter(f=>String(f.owner?.playerId)!==String(roleId)).slice(0,190).map(f=>mapFleet(f,roleId))].filter(Boolean)};
 state.mapSnapshot=data;emit({type:'world_map',roleId:String(roleId),data});
 }catch{log('地圖資料本輪未更新，保留上次快取；其他任務繼續');}
}

export function watchMapMovement({client,state,roleId,emit}){
 client.on('message',({name,body})=>{
  if(!['SCMyFleetUpdate','SCFleet'].includes(name)||!state.mapSnapshot)return;
  const fleets=normalize(body).fleets;if(!Array.isArray(fleets))return;
  const data=state.mapSnapshot;for(const f of fleets){const row=mapFleet(f,roleId,name==='SCMyFleetUpdate');if(!row)continue;const index=data.fleets.findIndex(x=>x.id===row.id);if(index>=0)data.fleets[index]=row;else if(data.fleets.length<200)data.fleets.push(row);}
  data.serverNow=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);emit({type:'world_map',roleId:String(roleId),data});
 });
}
