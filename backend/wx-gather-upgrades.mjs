import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runGatherUpgrades({client,settings:s,act,log,config=tables}){
 const target=Math.max(2,Math.floor(Number(s.gather_9)||2));
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 for(const [flag,field,table,req,label] of [['gather_6','fishingLevel','FishLevelCfg','FishingLevelUpRequest','钓鱼'],['gather_7','divingLevel','DiveLevelCfg','DivingLevelUpRequest','潜水'],['gather_8','salvageLevel','SalvageLevelCfg','SalvageLevelUpRequest','打捞']]){
  if(!s[flag])continue;
  for(let iteration=0;iteration<5;iteration++){
   const water=await read('OnWaterRequest','OnWaterResponse'),info=water[field];if(!info||!Number.isFinite(info.level)||info.level>=target){log(`${label}升级：已达目标或尚未解锁`);break;}
   const current=config[table]?.data?.find(x=>x.level===info.level),next=config[table]?.data?.find(x=>x.level===info.level+1);if(!current||!next)break;
   if(info.enhance>=current.enhance){
    const [kind,level]=next.condition??[];const found=(water.building??[]).some(b=>b.buildingId.endsWith(kind)&&b.level>=level&&!b.buildFinishTime);if(!kind||!found){log(`${label}升阶需 ${kind??'建筑'} Lv.${level??'?'}，本轮跳过`);break;}
   }else{
    const cost=current.cost;if(!Array.isArray(cost)||cost.length!==2||cost[0]==='RUBY'||!(Number(cost[1])>0))break;
    const items=await read('AllItemRequest','AllItemResponse'),resources=await read('AllResourceRequest','AllResourceResponse');const have=cost[0]==='GOLD'?Number(resources.list?.find(x=>x.res===3)?.amount??0):Number(items.items?.find(x=>x.itemId===cost[0])?.num??0);
    if(have<cost[1]){log(`${label}强化材料不足`);break;}
   }
   const result=await act(`mini-upgrade:${field}:${info.level}:${info.enhance}`,async()=>{
    await client.sendWatch(req,{}, {window:1000});const after=(await read('OnWaterRequest','OnWaterResponse'))[field];
    const verified=!!after&&(after.level>info.level||after.level===info.level&&after.enhance>info.enhance);
    return{status:verified?'verified':'unconfirmed',message:verified?`${label}升级：已核对 Lv.${after.level} 强化 ${after.enhance}`:`${label}升级结果未确认，停止本轮`};
   });if(!result)break;if(result.status==='unconfirmed')throw Error('unconfirmed_mini_upgrade');if(result.status==='rejected')break;
  }
 }
}
