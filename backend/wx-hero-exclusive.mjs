import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runHeroExclusive({client,settings:s,act,log,config=tables}){
 if(!s.ref_hero_exclusiveLevelUp&&!s.ref_hero_exclusiveStarUp)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 for(let iteration=0;iteration<8;iteration++){
  const heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes??[],before=await stock(),specified=s.ref_hero_heroes??[];
  let choice;
  for(const h of heroes){
   if(!h.exclusive||specified.length&&!specified.includes(h.heroId)&&!specified.includes(h.showName))continue;
   if(!config.ExclusiveShowCfg?.data?.some(x=>x.heroId===h.heroId))continue;
   const meta=config.HeroCfg?.data?.find(x=>x.id===h.heroId);if(!meta)continue;
   const index=meta.quality==='RED'?1:0;
   const current=config.ExclusiveStarCfg?.data?.find(x=>x.star===h.exclusive.star);
   if(!current)continue;
   const candidates=[];
   if(s.ref_hero_exclusiveLevelUp){
    const next=config.ExclusiveUpgradeCfg?.data?.find(x=>x.level===h.exclusive.level+1);
    if(next&&h.star>=next.heroStar&&next.level<=current.unlockLv)candidates.push({kind:'level',target:next.level,assets:[next.cost?.[index]]});
   }
   if(s.ref_hero_exclusiveStarUp){
    const next=config.ExclusiveStarCfg?.data?.find(x=>x.star===h.exclusive.star+1);
    if(next&&h.star>=next.heroStar&&next.piece>0)candidates.push({kind:'star',target:next.star,assets:[next.cost?.[index],[`${h.heroId}碎片`,next.piece]]});
   }
   for(const c of candidates){
    const cost={};if(c.assets.some(x=>!Array.isArray(x)||x.length!==2||!x[0]||['RUBY','GOLD'].includes(x[0])||!Number.isSafeInteger(Number(x[1]))||Number(x[1])<=0))continue;
    for(const [id,n] of c.assets)cost[id]=(cost[id]??0)+Number(n);
    if(Object.entries(cost).every(([id,n])=>(before[id]??0)>=n)){choice={...c,h,cost};break;}
   }
   if(choice)break;
  }
  if(!choice){log('英雄专属装备：名单、星级、专属装备上限或材料条件未满足');return;}
  const {h,kind,target,cost}=choice;
  const result=await act(`hero-exclusive:${kind}:${h.heroId}:${target}`,async()=>{
   const req=kind==='level'?'HeroExclusiveLevelUpRequest':'HeroExclusiveStarUpRequest';
   await client.sendWatch(req,kind==='level'?{heroId:h.heroId}:{heroId:h.heroId,universal:false},{window:1000});
   const current=(await read('AllHeroRequest','AllHeroResponse')).heroes?.find(x=>x.heroId===h.heroId)?.exclusive,after=await stock();
   const verified=current?.[kind]===target&&Object.entries(cost).every(([id,n])=>(before[id]??0)-(after[id]??0)===n);
   return {status:verified?'verified':'unconfirmed',message:verified?`英雄 ${h.heroId} 专属装备${kind==='level'?'升级':'升星'}：已核对等级与材料`:'专属装备结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_hero_exclusive');
 }
}
