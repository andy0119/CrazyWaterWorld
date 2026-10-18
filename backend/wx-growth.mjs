import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';import {planHeroes} from './wx-game/heroes.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8'));
export async function runHeroGrowth({client,settings:s,state,act,log,tables=config}){
 if(!s.ref_hero_levelUp&&!s.ref_hero_starUp&&!s.ref_hero_skillLevelUp)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes??[];
 const items=Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 const specified=s.ref_hero_heroes??[];const picked=specified.length?heroes.filter(x=>specified.includes(x.heroId)||specified.includes(x.showName)):heroes;
 const plan=planHeroes({config:tables,heroes:picked,playerLevel:state.level,allowUniversal:false,itemNum:id=>(!s.ref_hero_levelUp&&id==='英雄经验'||!s.ref_hero_starUp&&id.endsWith('碎片'))?0:items[id]??0});
 const allowed={level:s.ref_hero_levelUp,star:s.ref_hero_starUp,skill:s.ref_hero_skillLevelUp};let count=0;
 for(const step of plan.steps.filter(x=>allowed[x.kind])){
  for(let i=0;i<(step.kind==='level'?step.count:1);i++){
   if(count++>=12){log('英雄养成本轮已达12次上限，下一轮继续');return;}
   const target=step.kind==='level'?step.from+i+1:step.to;
   const req=step.kind==='level'?'HeroLevelUpRequest':step.kind==='star'?'HeroStarUpRequest':'HeroSkillLevelUpRequest';
   const body=step.kind==='star'?{heroId:step.heroId,universal:false}:step.kind==='skill'?{heroId:step.heroId,skillIdx:step.slot+1}:{heroId:step.heroId};
   const result=await act(`hero:${step.kind}:${step.heroId}:${step.slot??''}:${target}`,async()=>{
    if(step.kind==='star')await client.request(req,body,'HeroStarUpResponse',15000);else await client.sendWatch(req,body,{window:1000});
    const after=(await read('AllHeroRequest','AllHeroResponse')).heroes?.find(x=>x.heroId===step.heroId);
    const value=step.kind==='level'?after?.level:step.kind==='star'?after?.star:after?.skillLevels?.[step.slot];
    const verified=Number(value)>=target;
    return{status:verified?'verified':'unconfirmed',message:verified?`英雄 ${step.heroId} ${step.kind}：已核对提升至 ${value}`:'英雄养成结果未确认，停止本轮'};
   });
   if(result?.status==='unconfirmed')throw Error('unconfirmed_hero_growth');if(result?.status==='rejected')return;
  }
 }
 if(!count)log('英雄养成：当前等级、碎片或技能材料未满足升级条件');
}
export async function runAntiqueGrowth({client,settings:s,act,log,tables=config.tables}){
 if(!s.ref_antique_enabled)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const inventory=async()=>{const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');const out=Object.fromEntries((i.items??[]).map(x=>[x.itemId,Number(x.num)]));for(const x of r.list??[])if(x.res===3)out.GOLD=Number(x.amount);return out;};
 let count=0;let info=await read('AllAntiqueRequest','AllAntiqueResponse');let stock=await inventory();
 for(const row of tables.AntiqueBaseCfg?.data??[]){
  if(count>=12)break;const current=info.antiques?.find(x=>x.id===row.antiqueId);
  let request,target,consume;
  if(!current&&s.ref_antique_activate){request='ActivateAntiqueRequest';target=0;consume=Number(row.activeFrag);}
  else if(current&&s.ref_antique_upgrade){const next=tables.AntiqueStarCfg?.data?.find(x=>x.star===current.star+1);if(!next)continue;const key={BLUE:'consumeBlue',PURPLE:'consumePur',ORANGE:'consumeOra',RED:'consumeRed'}[row.color];consume=Number(next[key]);request='AntiqueStarUpRequest';target=next.star;}
  else continue;
  if(!(consume>0)||(stock[row.antiqueId+'碎片']??0)<consume)continue;
  count++;
  const result=await act(`antique:${row.antiqueId}:${current?'star':'activate'}:${target}`,async()=>{
   await client.sendWatch(request,request==='ActivateAntiqueRequest'?{id:row.antiqueId}:{id:row.antiqueId,universal:false},{window:1000});
   const after=(await read('AllAntiqueRequest','AllAntiqueResponse')).antiques?.find(x=>x.id===row.antiqueId);const verified=!!after&&after.star>=target;
   return{status:verified?'verified':'unconfirmed',message:verified?`藏品 ${row.antiqueId}：已核对${current?'升星':'激活'}状态`:'藏品养成结果未确认，停止本轮'};
  });if(result?.status==='unconfirmed')throw Error('unconfirmed_antique');if(result){info=await read('AllAntiqueRequest','AllAntiqueResponse');stock=await inventory();}
 }
 if(!s.ref_antique_suit_enabled)return;
 for(const suit of tables.AntiqueSuitCfg?.data??[]){
  if(count>=12)break;
  const specified=s.ref_antique_suit_levelUpSuitIds??[];const current=info.suits?.find(x=>x.id===suit.suitId);const level=current?.level??0;
  let costs=[];
  if(level===0){if(!s.ref_antique_suit_activate)continue;const required=(tables.AntiqueBaseCfg?.data??[]).filter(x=>x.suitId===suit.suitId);if(!required.length||!required.every(x=>info.antiques?.some(a=>a.id===x.antiqueId)))continue;}
  else{
   if(!s.ref_antique_suit_levelUp||specified.length&&!specified.some(x=>String(x)===String(suit.suitId)||x===suit.suitName))continue;
   const cap=tables.AntiqueMasterLvCfg?.data?.find(x=>x.level===info.masterLv)?.maxSuitLv;if(!cap||level>=cap)continue;
   const next=(tables.AntiqueSuitLvCfg?.data??[]).filter(x=>x.color===suit.color&&x.maxLevel>=level+1).sort((a,b)=>a.maxLevel-b.maxLevel)[0];if(!next)continue;costs=next.costArr??[];
  }
  if(costs.some(([id,num])=>id==='RUBY'||(stock[id]??0)<num))continue;
  count++;const result=await act(`antique-suit:${suit.suitId}:${level+1}`,async()=>{
   await client.sendWatch('AntiqueSuitLevelUpRequest',{id:suit.suitId},{window:1000});
   const after=(await read('AllAntiqueRequest','AllAntiqueResponse')).suits?.find(x=>x.id===suit.suitId);const verified=Number(after?.level)>level;
   return{status:verified?'verified':'unconfirmed',message:verified?`藏品套装 ${suit.suitName}：已核对等级 ${after.level}`:'套装操作结果未确认，停止本轮'};
  });if(result?.status==='unconfirmed')throw Error('unconfirmed_antique_suit');if(result){info=await read('AllAntiqueRequest','AllAntiqueResponse');stock=await inventory();}
 }
}
