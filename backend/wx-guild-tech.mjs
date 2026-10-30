import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runGuildTech({client,settings:s,state,act,log,config=tables}){
 if(!s.ref_guild_tech_enabled)return;
 if(!Number.isSafeInteger(state.season)||state.season<1){log('联盟科技：当前赛季尚未核对');return;}
 const priority=s.ref_guild_tech_items??[];
 if(!priority.length){log('联盟科技：尚未指定项目与顺序');return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 if(!(await read('GuildInfoRequest','GuildInfoResponse')).guild)return;
 const stage=(await read('SeasonTaskStageRequest','SeasonTaskStageResponse')).stage;
 if(!Number.isSafeInteger(stage)||stage<0)return;
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 const rows=(config.GuildTechCfg?.data??[]).filter(x=>x.season===state.season&&priority.some(p=>p===String(x.techId)||p===x.name)).sort((a,b)=>{
  const rank=r=>priority.findIndex(p=>p===String(r.techId)||p===r.name);return rank(a)-rank(b);
 });
 for(let iteration=0;iteration<5;iteration++){
  const info=(await read('GuildTechInfoRequest','GuildTechInfoResponse')).tech;
  if(!Array.isArray(info))return;
  const levels=new Map(info.map(x=>[x.techId,x.level])),before=await stock();let choice;
  for(const row of rows){
   const current=levels.get(row.techId)??0;if(!Number.isSafeInteger(current)||current<0)continue;
   const unlocks=(config.TechUnlockCfg?.data??[]).filter(x=>x.techId===row.techId&&(stage===0||x.openStage<=stage)).sort((a,b)=>a.openStage-b.openStage);
   const unlocked=unlocks.at(-1);
   if(!unlocked||current>=unlocked.maxLevel||unlocked.preTech&&(levels.get(unlocked.preTech)??0)<unlocked.preTechLevel)continue;
   const item=['世界','英雄'].includes(row.type)?'公会科技点':'联盟职级科技点';
   const cost=Number(row.techPointCost)+Number(row.techPointCostGrowth)*current;
   if(!Number.isSafeInteger(cost)||cost<=0||(before[item]??0)<cost)continue;
   choice={row,current,item,cost};break;
  }
  if(!choice){log('联盟科技：前置项目、赛季进度、等级上限或科技点条件未满足');return;}
  const {row,current,item,cost}=choice;
  const result=await act(`guild-tech:${state.season}:${row.techId}:${current+1}`,async()=>{
   const reply=await read('UpgradeGuildTechRequest','UpgradeGuildTechResponse',{techId:row.techId});
   const next=(await read('GuildTechInfoRequest','GuildTechInfoResponse')).tech?.find(x=>x.techId===row.techId),after=await stock();
   const verified=reply.tech?.techId===row.techId&&reply.tech.level===current+1&&next?.level===current+1&&(before[item]??0)-(after[item]??0)===cost;
   return {status:verified?'verified':'unconfirmed',message:verified?`联盟科技 ${row.name}：已核对等级 ${current+1} 与 ${cost} ${item}`:'联盟科技结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_guild_tech');
 }
}
