import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runPetLevels({client,settings:s,state,act,log,history=new Set(),config=tables}){
 if(!s.beastwar_1)return;if(state.level<25){log('海兽战备室需等级25，本轮跳过');return;}
 const read=(a,b)=>client.request(a,{},b,8000).then(normalize);
 const day=new Date(Date.now()+(client.serverClockOffsetMs??0)+28800000).toISOString().slice(0,10),prefix='pet-level:'+day+':';
 let spent=[...history].filter(x=>x.startsWith(prefix)).reduce((n,x)=>n+(Number(x.split(':').at(-1))||0),0);
 const cap=Number(s.ref_island_pet_levelUpDailyExpLimit)||0,target=Math.max(2,Math.floor(Number(s.beastwar_2)||2)),specified=s.ref_island_pet_levelUpPetIds??[];
 for(let i=0;i<5;i++){
  const water=await read('OnWaterRequest','OnWaterResponse'),pets=(await read('AllPetRequest','AllPetResponse')).pets??[];
  const stock=Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
  let choice;
  for(const b of water.building??[]){
   if(!b.petServe?.petUid||b.buildFinishTime>0)continue;const pet=pets.find(x=>String(x.uid)===String(b.petServe.petUid));if(!pet||pet.level>=target||specified.length&&!specified.some(x=>String(x)===String(pet.uid)||x===pet.petId))continue;
   const next=config.PetLevelCfg?.data?.find(x=>x.level===pet.level+1);if(!next||next.playerLevel>state.level||next.cost?.[0]!=='宠物经验'||!(next.cost[1]>0))continue;
   const cost=Number(next.cost[1]);if((stock['宠物经验']??0)<cost||cap&&spent+cost>cap)continue;
   choice={b,pet,next,cost};break;
  }
  if(!choice){log('海兽升级：目标等级、经验库存或每日上限条件未满足');return;}
  const {b,pet,next,cost}=choice;const key=prefix+`${pet.uid}:${pet.level}:${cost}`;if(history.has(key))return;history.add(key);spent+=cost;
  const result=await act(key,async()=>{
   await client.sendWatch('PetLevelUpRequest',{buildingId:b.buildingId},{window:1000});const after=(await read('AllPetRequest','AllPetResponse')).pets?.find(x=>String(x.uid)===String(pet.uid));
   const verified=after?.level===next.level;
   return{status:verified?'verified':'unconfirmed',message:verified?`海兽 ${pet.petId}：已核对等级 ${next.level}；今日经验预算计数（含待确认） ${spent}${cap?'/'+cap:''}`:'海兽升级结果未确认，停止本轮'};
  });if(result?.status==='unconfirmed')throw Error('unconfirmed_pet_level');if(!result||result.status!=='verified')return;
 }
}
