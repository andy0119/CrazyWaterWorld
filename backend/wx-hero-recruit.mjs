import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runHeroRecruit({client,settings:s,act,log,history=new Set(),config=tables}){
 if(!s.ref_hero_fragRecruit&&!s.ref_hero_recruit_enabled)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 let heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes??[];
 if(s.ref_hero_fragRecruit){
  let count=0;
  for(const row of config.HeroCfg?.data??[]){
   if(heroes.some(x=>x.heroId===row.id)||!Number.isSafeInteger(row.recruitFrag)||row.recruitFrag<=0)continue;
   const specified=s.ref_hero_heroes??[];if(specified.length&&!specified.includes(row.id))continue;
   const before=await stock(),id=`${row.id}碎片`;
   if((before[id]??0)<row.recruitFrag)continue;
   const result=await act(`hero-fragment-recruit:${row.id}`,async()=>{
    await client.sendWatch('HeroRecruitRequest',{heroId:row.id},{window:1000});
    heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes??[];
    const after=await stock();
    const verified=heroes.some(x=>x.heroId===row.id&&x.level>0)&&(before[id]??0)-(after[id]??0)===row.recruitFrag;
    return {status:verified?'verified':'unconfirmed',message:verified?`碎片招募 ${row.id}：已核对新英雄与专属碎片消耗`:'英雄碎片招募结果未确认，停止本轮'};
   });
   if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_hero_fragment_recruit');
   if(++count>=5)break;
  }
 }
 if(!s.ref_hero_recruit_enabled)return;
 const info=(await read('RecruitInfoRequest','RecruitInfoResponse')).hero;
 const now=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 if(!info||!Number.isFinite(info.freeEndTimeSeconds)||info.freeEndTimeSeconds>now){log('英雄免费招募尚未到时间');return;}
 const prefix='hero-free-recruit:'+new Date((now+28800)*1000).toISOString().slice(0,10)+':';
 const cap=Math.max(0,Math.floor(Number(s.ref_hero_recruit_dailyLimit)||0)),used=[...history].filter(x=>x.startsWith(prefix)).length;
 if(cap&&used>=cap){log('英雄免费招募已达到每日上限（含待确认）');return;}
 const key=prefix+info.freeEndTimeSeconds+':'+info.recruitTimes;
 if(history.has(key))return;
 const before=await stock(),owned=new Set(heroes.map(x=>x.heroId));history.add(key);
 const result=await act(key,async()=>{
  const reply=await read('RecruitStartRequest','RecruitStartResponse',{way:1});
  const current=(await read('RecruitInfoRequest','RecruitInfoResponse')).hero;
  heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes??[];const after=await stock();
  const fragments={};let added=false;
  for(const r of reply.reward??[]){
   if(r.heroId&&!r.trans&&!owned.has(r.heroId)&&heroes.some(x=>x.heroId===r.heroId))added=true;
   for(const a of r.frag?.asset??[])if(a.id&&Number(a.num)>0)fragments[a.id]=(fragments[a.id]??0)+Number(a.num);
  }
  const rewards=added||Object.keys(fragments).length>0&&Object.entries(fragments).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
  const verified=rewards&&!!current&&(current.recruitTimes>info.recruitTimes||current.freeEndTimeSeconds>info.freeEndTimeSeconds);
  return {status:verified?'verified':'unconfirmed',message:verified?'英雄免费招募：已核对新英雄／碎片与招募计数':'免费招募结果未确认，停止本轮'};
 });
 if(result&&result.status!=='verified')throw Error('unconfirmed_hero_free_recruit');
}
