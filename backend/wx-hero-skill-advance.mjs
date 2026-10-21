import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runHeroSkillAdvance({client,settings:s,state,act,log,config=tables}){
 if(!s.ref_hero_skillAdvance||!Number.isSafeInteger(state.season)||state.season<2)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const heroes=async()=>(await read('AllHeroRequest','AllHeroResponse')).heroes;
 const inventory=async()=>{
  const items=(await read('AllItemRequest','AllItemResponse')).items;
  if(!Array.isArray(items))throw Error('unknown_skill_advance_inventory');
  return Object.fromEntries(items.map(x=>[x.itemId,Number(x.num)]));
 };
 let count=0;
 const initial=await heroes();if(!Array.isArray(initial))return;
 for(const hero of initial){
  if(s.ref_hero_heroes?.length&&!s.ref_hero_heroes.includes(hero.heroId)&&!s.ref_hero_heroes.includes(hero.showName))continue;
  while(count<5){
   const current=(await heroes())?.find(x=>x.heroId===hero.heroId);
   const level=current?.skillUpgrades?.[0]??0;
   if(!current||!Number.isSafeInteger(level)||level<0||!(current.skillLevels?.[0]>=5))break;
   const next=(config.HeroSkillAdvanceCostCfg?.data??[]).find(x=>x.level===level+1);
   if(!next||!Number.isSafeInteger(next.season)||next.season>state.season||!(config.HeroSkillAdvanceCfg?.data??[]).some(x=>x.heroId===hero.heroId&&x.skillLv===level+1))break;
   // The client uses the first cost pair for the active skill advance.
   const pair=next.advanceCosts?.[0];if(!Array.isArray(pair)||!pair[0]||['GOLD','RUBY'].includes(pair[0])||!Number.isSafeInteger(pair[1])||pair[1]<=0)break;
   const [id,qty]=pair,before=await inventory();if(!Number.isSafeInteger(before[id]??0)||(before[id]??0)<qty)break;
   count++;
   const result=await act(`hero-skill-advance:${hero.heroId}:${level+1}`,async()=>{
    await client.sendWatch('HeroSkillUpgradeRequest',{heroId:hero.heroId},{window:1000});
    const afterHero=(await heroes())?.find(x=>x.heroId===hero.heroId),after=await inventory();
    const ok=afterHero?.skillUpgrades?.[0]===level+1&&before[id]-(after[id]??0)===qty;
    return{status:ok?'verified':'unconfirmed',message:ok?`英雄 ${hero.heroId} 技能进阶至 ${level+1}：等级与材料已核对`:'英雄技能进阶未确认，停止本轮'};
   });
   if(!result||result.status==='rejected')return;
   if(result.status!=='verified')throw Error('unconfirmed_hero_skill_advance');
  }
  if(count>=5){log('技能进阶本轮最多5次，下一轮继续');return;}
 }
}
