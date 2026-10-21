import {normalize} from './wx-game/worlds.mjs';
export async function runAntiqueFreeRecruit({client,settings:s,act,log}){
 if(!s.ref_antique_enabled||!s.ref_antique_recruit_enabled)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const info=(await read('RecruitInfoRequest','RecruitInfoResponse')).antique;
 const now=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 if(!info||!Number.isSafeInteger(info.freeEndTimeSeconds)||info.freeEndTimeSeconds>now||!Number.isSafeInteger(info.recruitTimes)||info.recruitTimes<0){log('藏品免费招募尚未到时间或计数未确认');return;}
 const stock=async()=>{const items=(await read('AllItemRequest','AllItemResponse')).items;if(!Array.isArray(items))throw Error('unknown_antique_recruit_inventory');return Object.fromEntries(items.map(x=>[x.itemId,Number(x.num)]));};
 const antiques=(await read('AllAntiqueRequest','AllAntiqueResponse')).antiques;if(!Array.isArray(antiques))return;
 const before=await stock(),owned=new Set(antiques.map(x=>x.id));
 const result=await act(`antique-free:${info.freeEndTimeSeconds}:${info.recruitTimes}`,async()=>{
  const reply=await read('AntiqueRecruitRequest','AntiqueRecruitResponse',{type:1,way:1});
  const current=(await read('RecruitInfoRequest','RecruitInfoResponse')).antique;
  const after=await stock(),all=(await read('AllAntiqueRequest','AllAntiqueResponse')).antiques??[],assets={};let added=false;
  for(const r of reply.reward??[]){
   if(r.antiqueId&&!r.trans&&!owned.has(r.antiqueId)&&all.some(x=>x.id===r.antiqueId))added=true;
   for(const a of r.reward?.asset??[])if(a.id&&Number.isSafeInteger(Number(a.num))&&Number(a.num)>0)assets[a.id]=(assets[a.id]??0)+Number(a.num);
  }
  const rewards=added||Object.keys(assets).length>0&&Object.entries(assets).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
  const ok=rewards&&!!reply.recruitData&&current?.recruitTimes===info.recruitTimes+1&&reply.recruitData.recruitTimes===current.recruitTimes&&current.freeEndTimeSeconds>info.freeEndTimeSeconds;
  return{status:ok?'verified':'unconfirmed',message:ok?'藏品免费招募：冷却、计数与藏品／奖励已核对':'藏品免费招募结果未确认，停止本轮'};
 });
 if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_antique_free_recruit');
}
