import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runEquippedEnhance({client,settings:s,act,log,config=tables}){
 if(!s.ref_hero_equipEnhance)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const heroes=async()=>(await read('AllHeroRequest','AllHeroResponse')).heroes;
 const stock=async()=>{const items=(await read('AllItemRequest','AllItemResponse')).items;if(!Array.isArray(items))throw Error('unknown_equipment_inventory');return Object.fromEntries(items.map(x=>[x.itemId,Number(x.num)]));};
 for(let iteration=0;iteration<8;iteration++){
  const owned=await heroes();if(!Array.isArray(owned))return;
  const selected=s.ref_hero_heroes??[],options=[];
  for(const hero of owned){
   if(selected.length&&!selected.includes(hero.heroId)&&!selected.includes(hero.showName))continue;
   for(const e of hero.equips??[]){
    if(!e.uid||String(e.uid)==='0'||!Number.isSafeInteger(e.level)||e.level<1||!Number.isSafeInteger(e.star))continue;
    const base=(config.EquipCfg?.data??[]).find(x=>x.id===e.equipId);if(!base)continue;
    const star=base.quality==='GREEN'?0:e.star;
    const cap=(config.EquipAttrCfg?.data??[]).find(x=>x.id===e.equipId&&x.star===star)?.maxLv;
    const cost=(config.EquipUpDecomposeCfg?.data??[]).find(x=>x.level===e.level+1)?.upgradeCost;
    if(!Number.isSafeInteger(cap)||e.level>=cap||!Number.isSafeInteger(cost)||cost<=0)continue;
    options.push({hero,e,cost});
   }
  }
  const before=await stock();if(!Number.isSafeInteger(before['精铁']??0))return;
  const choice=options.filter(x=>(before['精铁']??0)>=x.cost).sort((a,b)=>a.e.level-b.e.level||a.cost-b.cost)[0];
  if(!choice){log('装备强化：已穿戴装备达到上限、名单不符或精铁不足');return;}
  const {hero,e,cost}=choice;
  const result=await act(`equip-enhance:${e.uid}:${e.level+1}`,async()=>{
   await client.sendWatch('EnhanceEquipRequest',{uid:e.uid},{window:1000});
   const current=(await heroes())?.find(x=>x.heroId===hero.heroId)?.equips?.find(x=>String(x.uid)===String(e.uid));
   const after=await stock(),ok=current?.level===e.level+1&&(before['精铁']??0)-(after['精铁']??0)===cost;
   return{status:ok?'verified':'unconfirmed',message:ok?`英雄 ${hero.heroId} 装备 ${e.equipId} 强化至 ${e.level+1}：等级与精铁已核对`:'装备强化结果未确认，停止本轮'};
  });
  if(!result||result.status==='rejected')return;if(result.status!=='verified')throw Error('unconfirmed_equip_enhance');
 }
}
