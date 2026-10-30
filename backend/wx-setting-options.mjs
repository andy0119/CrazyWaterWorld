import fs from 'node:fs';
const factoryTables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
import {normalize}from './wx-game/worlds.mjs';
export function factoryChoices(buildings,tables=factoryTables){
 const unlocks=tables.BuildingUnlockCfg?.data??[],types=new Set((tables.BuildingProduceCfg?.data??[]).map(r=>r.buildType));
 return buildings.filter(b=>b.factory||(b.level>0&&types.has(unlocks.find(u=>u.buildingId===b.buildingId)?.buildingType))).map(b=>{const type=unlocks.find(u=>u.buildingId===b.buildingId)?.buildingType;return{value:b.buildingId,label:type?`${type}（${b.buildingId}）`:b.buildingId};});
}
export async function readSettingOptions({client,roleId,emit,log,level=0}){
 if(typeof client.request!=='function')return;
 const options={};
 const read=async(req,res)=>{try{return normalize(await client.request(req,{},res,5000));}catch{log('角色可选名单：'+req+' 暂未读取成功，保留其他名单');return null;}};
 const heroes=(await read('AllHeroRequest','AllHeroResponse'))?.heroes;
 if(Array.isArray(heroes))options.ref_hero_heroes=heroes.filter(h=>h.heroId).map(h=>({value:h.heroId,label:h.showName||h.heroId}));
 const water=(await read('OnWaterRequest','OnWaterResponse'))?.building;
 if(Array.isArray(water)){
  options.ref_island_pet_advanceRooms=water.filter(b=>b.petServe?.petUid&&String(b.petServe.petUid)!=='0').map(b=>({value:b.buildingId,label:b.buildingId}));
  const factories=factoryChoices(water);
  options.ref_island_factory_disabledFactories=factories;
 }
 const pets=level>=23?(await read('AllPetRequest','AllPetResponse'))?.pets:null;
 if(Array.isArray(pets))options.ref_island_pet_levelUpPetIds=pets.map(p=>({value:String(p.uid),label:`${p.petId}（等级 ${p.level}，ID ${p.uid}）`}));
 if(Array.isArray(pets))options.ref_island_pet_recycleAllowedUids=pets.map(p=>({value:String(p.uid),label:`${p.petId}（等级 ${p.level}，ID ${p.uid}）`}));
 const equips=level>=17?(await read('EquipsRequest','EquipsResponse'))?.equip:null;
 if(Array.isArray(equips))options.ref_island_equip_recycleAllowedUids=equips.map(e=>({value:String(e.uid),label:`${e.equipId}（等级 ${e.level}，ID ${e.uid}）`}));
 const fleets=level>=6?(await read('MyFleetsRequest','MyFleetsResponse'))?.fleets:null;
 if(Array.isArray(fleets))options.ref_world_fleet_repairSpeedFleets=[...fleets].sort((a,b)=>String(a.buildingId).localeCompare(String(b.buildingId),undefined,{numeric:true})).map((f,i)=>({value:f.buildingId,label:`舰队 ${i+1}（${f.buildingId}）`}));
 if(Object.keys(options).length){for(const [key,rows]of Object.entries(options)){if(!rows.length)emit({type:'setting_options',roleId:String(roleId),options:{[key]:[]}});for(let i=0;i<rows.length;i+=40)emit({type:'setting_options',roleId:String(roleId),append:i>0,options:{[key]:rows.slice(i,i+40)}});}log('已读取并缓存当前角色的可选名单，可在任务设置更新名单');}
}
