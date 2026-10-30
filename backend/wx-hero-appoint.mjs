import fs from 'node:fs';import {createHash} from 'node:crypto';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runHeroAppoint({client,settings:s,state,act,log,config=tables}){
 if(!s.ref_hero_appoint||!Number.isSafeInteger(state.level))return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const owned=(await read('AllHeroRequest','AllHeroResponse')).heroes;
 if(!Array.isArray(owned)||!owned.length)return;
 const positions=(config.AppointPosCfg?.data??[]).filter(x=>x.playerLevel<=state.level&&Number.isSafeInteger(x.posId)&&x.posId>0).map(x=>x.posId);
 if(!positions.length)return;
 const before=await read('AppointInfoRequest','AppointInfoResponse');if(!Array.isArray(before.heroes)||!Array.isArray(before.priorPosIds))return;
 const valid=rows=>Array.isArray(rows)&&new Set(rows.map(x=>x.posId)).size===rows.length&&new Set(rows.map(x=>x.heroId)).size===rows.length&&rows.every(x=>positions.includes(x.posId)&&owned.some(h=>h.heroId===x.heroId));
 if(!valid(before.heroes))return;
 const signature=createHash('sha256').update(JSON.stringify({positions,priority:before.priorPosIds,heroes:owned.map(x=>[x.heroId,x.level,x.star]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))})).digest('hex').slice(0,24);
 const result=await act(`hero-appoint:${signature}`,async()=>{
  await client.sendWatch('AutoAppointRequest',{posId:positions},{window:1000});
  const after=await read('AppointInfoRequest','AppointInfoResponse');
  const ok=valid(after.heroes)&&after.heroes.length===Math.min(positions.length,owned.length)&&JSON.stringify(after.priorPosIds)===JSON.stringify(before.priorPosIds);
  return{status:ok?'verified':'unconfirmed',message:ok?`自动委任：已核对 ${after.heroes.length} 个岗位及英雄，不重复委任`:'自动委任结果未确认，停止本轮'};
 });
 if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_hero_appoint');
}
