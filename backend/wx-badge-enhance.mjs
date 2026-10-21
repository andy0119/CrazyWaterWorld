import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runBadgeEnhance({client,settings:s,act,log,config=tables}){
 if(!s.ref_hero_badgeEnhance)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const stock=async()=>{
  const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');
  if(!Array.isArray(i.items)||!Array.isArray(r.list))throw Error('unknown_badge_inventory');
  const gold=r.list.find(x=>x.res===3)?.amount;
  return{exp:Number(i.items.find(x=>x.itemId==='徽章经验')?.num??0),gold:Number(gold)};
 };
 for(let count=0;count<8;count++){
  const heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes,badges=(await read('BadgesRequest','BadgesResponse')).badge;
  if(!Array.isArray(heroes)||!Array.isArray(badges))return;
  const selected=s.ref_hero_heroes??[],worn=new Set();
  for(const h of heroes)if(!selected.length||selected.includes(h.heroId)||selected.includes(h.showName))for(const b of h.badges??[])worn.add(String(b.uid));
  const before=await stock();if(!Number.isSafeInteger(before.exp)||!Number.isSafeInteger(before.gold))return;
  const choices=[];
  for(const b of badges){
   if(!worn.has(String(b.uid))||!Number.isSafeInteger(b.level)||b.level<1||!Number.isSafeInteger(b.exp)||b.exp<0||!Number.isSafeInteger(b.star))continue;
   const cap=(config.HeroBadgeAttrCfg?.data??[]).find(x=>x.id===b.badgeId&&x.star===b.star)?.maxLevel;
   const level=(config.HeroBadgeLevelCfg?.data??[]).find(x=>x.level===b.level+1);
   if(!Number.isSafeInteger(cap)||b.level>=cap||!level||!Number.isSafeInteger(level.exp)||level.exp<=b.exp||!Number.isSafeInteger(level.goldExpRadio)||level.goldExpRadio<=0)continue;
   const exp=level.exp-b.exp,gold=exp*level.goldExpRadio;
   if(Number.isSafeInteger(gold)&&before.exp>=exp&&before.gold>=gold)choices.push({b,exp,gold});
  }
  const choice=choices.sort((a,b)=>a.b.level-b.b.level||a.exp-b.exp)[0];
  if(!choice){log('徽章强化：已穿戴徽章达到上限、名单不符或经验／金币不足');return;}
  const {b,exp,gold}=choice;
  const result=await act(`badge-enhance:${b.uid}:${b.level}:${b.exp}`,async()=>{
   // Never feed other badges: use only the dedicated experience item.
   await read('EnhanceBadgeRequest','EnhanceBadgeResponse',{uid:b.uid,decomposeUid:[],expItemNum:exp});
   const all=(await read('BadgesRequest','BadgesResponse')).badge,current=all?.find(x=>String(x.uid)===String(b.uid)),after=await stock();
   const ok=current?.level===b.level+1&&current.exp===0&&current.star===b.star&&before.exp-after.exp===exp&&before.gold-after.gold===gold&&badges.every(x=>all.some(y=>String(y.uid)===String(x.uid)));
   return{status:ok?'verified':'unconfirmed',message:ok?`徽章 ${b.badgeId} 强化至 ${current.level}：经验、金币与徽章保留已核对`:'徽章强化结果未确认，停止本轮'};
  });
  if(!result||result.status==='rejected')return;if(result.status!=='verified')throw Error('unconfirmed_badge_enhance');
 }
}
