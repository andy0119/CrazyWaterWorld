import {normalize} from './wx-game/worlds.mjs';
export async function runKeyChests({client,settings:s,act,log}){
 if(!s.gather_3)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 for(let i=0;i<3;i++){
  const before=await stock(),keys=before['保险箱钥匙']??0;
  if(!Number.isSafeInteger(keys)||keys<=0){log('钥匙开箱：没有保险箱钥匙');return;}
  const antiques=(await read('AllAntiqueRequest','AllAntiqueResponse')).antiques??[];
  const owned=new Set(antiques.map(x=>x.id));
  const bucket=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/60000);
  const result=await act(`key-chest:${bucket}:${keys}`,async()=>{
   const reply=await read('AntiqueRecruitRequest','AntiqueRecruitResponse',{type:2,way:2});
   const after=await stock(),current=(await read('AllAntiqueRequest','AllAntiqueResponse')).antiques??[];
   const assets={};let newAntique=false;
   for(const reward of reply.reward??[]){
    if(reward.antiqueId&&!reward.trans&&!owned.has(reward.antiqueId)&&current.some(x=>x.id===reward.antiqueId))newAntique=true;
    for(const a of reward.reward?.asset??[])if(a.id&&Number(a.num)>0)assets[a.id]=(assets[a.id]??0)+Number(a.num);
   }
   const rewardVerified=newAntique||Object.keys(assets).length>0&&Object.entries(assets).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   const verified=keys-(after['保险箱钥匙']??0)===1&&rewardVerified;
   return {status:verified?'verified':'unconfirmed',message:verified?'钥匙开箱：已核对钥匙消耗与藏品／奖励入库':'钥匙开箱结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_key_chest');
 }
}
