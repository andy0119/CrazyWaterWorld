import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runBuildings({client,settings:s,state,act,log,config=tables}){
 if(!s.building_0||(!s.building_2&&!s.building_3))return;
 const read=(a,b)=>client.request(a,{},b,8000).then(normalize);
 const inventory=async()=>{const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');const out=Object.fromEntries((i.items??[]).map(x=>[x.itemId,Number(x.num)]));for(const x of r.list??[])if(x.res===3)out.GOLD=Number(x.amount);return out;};
 const rows=config.BuildingUpgradeCfg?.data??[],unlocks=config.BuildingUnlockCfg?.data??[];
 const forbidden=new Set(s.building_5??[]);const reserve=Math.max(0,Number(s.building_4)||0);
 for(let iteration=0;iteration<3;iteration++){
  const water=await read('OnWaterRequest','OnWaterResponse');const stock=await inventory();
  const type=b=>unlocks.find(x=>x.buildingId===b.buildingId)?.buildingType;
  const population=(water.building??[]).reduce((sum,b)=>sum+(rows.find(r=>r.buildingType===type(b)&&r.level===b.level)?.effect??[]).filter(e=>e[0]==='人口增加').reduce((n,e)=>n+Number(e[1]),0),0);
  const candidates=[];
  for(const b of water.building??[]){
   const kind=type(b);if(!kind||forbidden.has(kind)||forbidden.has(b.buildingId)||b.buildFinishTime>0)continue;
   if(b.level===0&&!s.building_2||b.level>0&&!s.building_3)continue;
   const row=rows.find(r=>r.buildingType===kind&&r.level===b.level+1);
   if(!row||!Number.isFinite(state.level)||row.playerLevel>state.level||Number(row.curPeople)>population||(row.condition??[]).length)continue;
   const costs=row.consume??[];const cost={};for(const [id,num] of costs)cost[id]=(cost[id]??0)+Number(num);
   if(Object.keys(cost).some(id=>id==='RUBY'||!Number.isFinite(cost[id])||cost[id]<0||(stock[id]??0)-cost[id]<(id==='建筑蓝图'?reserve:0)))continue;
   candidates.push({b,row});
  }
  if(!candidates.length){log('建筑：暂无符合等级、人口、材料保留与禁止名单的建造／升级');return;}
  const {b,row}=candidates.sort((a,b)=>a.row.playerLevel-b.row.playerLevel||a.row.curPeople-b.row.curPeople)[0];
  const result=await act(`building-upgrade:${b.buildingId}:${b.level}:${row.level}`,async()=>{
   await client.sendWatch(b.level===0?'BuildBuildingRequest':'UpgradeBuildingRequest',{buildingId:b.buildingId},{window:1000});
   const current=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId);
   const verified=!!current&&(current.level===row.level||current.level===b.level&&current.buildFinishTime>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000));
   return{status:verified?'verified':'unconfirmed',message:verified?`${b.level===0?'建造':'升级'} ${b.buildingId}：已核对建筑等级／施工时间`:'建筑操作结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_building');
 }
}


// Item-only acceleration; confirm both the construction state and item debit.
export async function runBuildingSpeedups({client,settings:s,act,log,config=tables}){
 if(!s.building_0||!s.building_7)return;
 const read=(a,b)=>client.request(a,{},b,8000).then(normalize);
 const stock=async()=>Number((await read('AllItemRequest','AllItemResponse')).items?.find(x=>x.itemId==='加速器')?.num??0);
 const water=await read('OnWaterRequest','OnWaterResponse');
 const denied=new Set(s.building_5??[]);
 let count=0;
 for(const b of water.building??[]){
  const kind=config.BuildingUnlockCfg?.data?.find(x=>x.buildingId===b.buildingId)?.buildingType;
  if(denied.has(b.buildingId)||denied.has(kind))continue;
  const now=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
  if(!Number.isFinite(b.buildFinishTime)||b.buildFinishTime<=now)continue;
  const before=await stock();
  const useNum=Math.min(Math.ceil((b.buildFinishTime-now)/60),Math.floor(before));
  if(!Number.isSafeInteger(useNum)||useNum<=0){log('建筑加速：加速器不足');return;}
  const result=await act(`building-speedup:${b.buildingId}:${b.level}:${b.buildFinishTime}:${before}`,async()=>{
   await client.sendWatch('SpeedUpUpgradeBuildingRequest',{buildingId:b.buildingId,speedUp:{type:2,useNum}},{window:1000});
   const current=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId);
   const after=await stock();
   const progressed=!!current&&(current.level>b.level||(Number.isFinite(current.buildFinishTime)&&current.buildFinishTime<b.buildFinishTime));
   const verified=progressed&&before-after===useNum;
   return {status:verified?'verified':'unconfirmed',message:verified?`建筑加速 ${b.buildingId}：已核对施工进度及 ${useNum} 个加速器消耗`:'建筑加速结果未确认，停止本轮'};
  });
  if(!result)return;
  if(result.status!=='verified')throw Error('unconfirmed_building_speedup');
  if(++count>=3)return;
 }
}
