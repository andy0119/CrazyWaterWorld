import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const feedCount=pet=>(pet.profFeed??[]).reduce((sum,x)=>sum+(x.attrFeed??[]).reduce((n,a)=>n+Number(a.times??0),0),0);
export async function runPetAdvance({client,settings:s,state,act,log,history=new Set(),config=tables}){
 if(!s.beastwar_0||!Number.isFinite(state.level)||state.level<25)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const day=new Date(Date.now()+(client.serverClockOffsetMs??0)+28800000).toISOString().slice(0,10);
 const caps={feed:Math.max(0,Math.floor(Number(s.ref_island_pet_advanceFeedDailyLimit)||0)),grade:Math.max(0,Math.floor(Number(s.ref_island_pet_advanceDailyLimit)||0))};
 const used=kind=>[...history].filter(x=>x.startsWith(`pet-advance-${kind}:${day}:`)).length;
 for(let iteration=0;iteration<5;iteration++){
  const water=await read('OnWaterRequest','OnWaterResponse'),pets=(await read('AllPetRequest','AllPetResponse')).pets??[];
  const stock=Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
  let choice;
  for(const b of water.building??[]){
   if(!b.petServe?.petUid||b.buildFinishTime>0)continue;
   const selectedRooms=s.ref_island_pet_advanceRooms??[];
   if(selectedRooms.length&&!selectedRooms.some(id=>String(id)===String(b.buildingId)))continue;
   const pet=pets.find(x=>String(x.uid)===String(b.petServe.petUid));if(!pet)continue;
   const next=config.PetAdvancedCfg?.data?.find(x=>x.grade===pet.grade+1);if(!next)continue;
   const rows=config.PetFeedAttrCfg?.data?.filter(x=>x.level===pet.grade)??[];
   const max=rows.reduce((sum,x)=>sum+(x.attrCounts??[]).reduce((n,a)=>n+Number(a),0),0),count=feedCount(pet);
   if(!Number.isFinite(max)||max<=0||!Number.isFinite(count))continue;
   if(count>=max){
    if(pet.level>=next.level&&(!caps.grade||used('grade')<caps.grade)){choice={kind:'grade',b,pet,count};break;}
   }else if(!caps.feed||used('feed')<caps.feed){
    const req=b.petServe.upgradeRequirements??[],cost={};
    if(!req.length||req.some(x=>!x.id||['RUBY','GOLD'].includes(x.id)||!Number.isSafeInteger(Number(x.num))||Number(x.num)<=0))continue;
    for(const x of req)cost[x.id]=(cost[x.id]??0)+Number(x.num);
    if(Object.entries(cost).every(([id,n])=>(stock[id]??0)>=n)){choice={kind:'feed',b,pet,count,cost};break;}
   }
  }
  if(!choice){log('海兽进阶：等级、投喂材料或每日上限条件未满足');return;}
  const {kind,b,pet,count,cost}=choice,key=`pet-advance-${kind}:${day}:${pet.uid}:${pet.grade}:${count}`;
  if(history.has(key))return;history.add(key);
  const result=await act(key,async()=>{
   await client.sendWatch(kind==='grade'?'PetUpgradeRequest':'PetUpgradeFeedRequest',{buildingId:b.buildingId},{window:1000});
   const current=(await read('AllPetRequest','AllPetResponse')).pets?.find(x=>String(x.uid)===String(pet.uid));
   let verified=kind==='grade'?current?.grade===pet.grade+1:current?.grade===pet.grade&&feedCount(current)>count;
   if(kind==='feed'){
    const after=Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
    verified=verified&&Object.entries(cost).every(([id,n])=>(stock[id]??0)-(after[id]??0)===n);
   }
   return {status:verified?'verified':'unconfirmed',message:verified?`海兽 ${pet.petId} ${kind==='grade'?'进阶':'进阶投喂'}：已核对服务器状态；今日计数 ${used(kind)}${caps[kind]?'/'+caps[kind]:''}`:'海兽进阶结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_pet_advance');
 }
}
