import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runLeagueClaims({client,settings:s,act,log,config=tables}){
 if(!s.ref_battle_league_enabled||!s.ref_battle_league_danReward&&!s.ref_battle_league_passReward)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const info=()=>read('LeagueInfoRequest','LeagueInfoResponse');
 const stock=async()=>{
  const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');
  if(!Array.isArray(i.items)||!Array.isArray(r.list))throw Error('unknown_league_inventory');
  const out=Object.fromEntries(i.items.map(x=>[x.itemId,Number(x.num)]));
  for(const x of r.list){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 const assets=rows=>{
  const out={};for(const pair of rows){if(!pair?.[0]||!Number.isSafeInteger(pair[1])||pair[1]<=0)return null;out[pair[0]]=(out[pair[0]]??0)+pair[1];}return Object.keys(out).length?out:null;
 };
 const gain=(before,after,cost)=>!!cost&&Object.entries(cost).every(([id,n])=>Number.isSafeInteger(before[id]??0)&&Number.isSafeInteger(after[id]??0)&&(after[id]??0)-(before[id]??0)>=n);
 let league=await info();if(!Number.isSafeInteger(league.roomDan)||league.roomDan<1)return;
 const period=league.settleTime;if(!Number.isSafeInteger(period)||period<=0)return;
 if(s.ref_battle_league_danReward){
  for(let count=0;count<10;count++){
   if(!Number.isSafeInteger(league.gotBonusDan)||league.gotBonusDan<0||!Number.isSafeInteger(league.dan)||league.gotBonusDan>=league.dan)break;
   const next=(config.LeagueDanCfg?.data??[]).find(x=>x.dan===league.gotBonusDan+1),reward=assets(next?.reward??[]);if(!next||!reward)break;
   const before=await stock(),old=league.gotBonusDan;
   const result=await act(`league-dan:${period}:${next.dan}`,async()=>{
    const reply=await read('LeagueGotBonusDanRequest','LeagueGotBonusDanResponse');
    league=await info();const after=await stock();
    // Unknown bulk-claim behavior stops here rather than inferring success.
    const ok=reply.gotBonusDan===old+1&&league.gotBonusDan===old+1&&league.settleTime===period&&gain(before,after,reward);
    return{status:ok?'verified':'unconfirmed',message:ok?`联赛段位 ${next.dan} 奖励已核对入库`:'联赛段位奖励未确认，停止本轮'};
   });
   if(!result||result.status==='rejected')return;if(result.status!=='verified')throw Error('unconfirmed_league_dan');
  }
 }
 if(!s.ref_battle_league_passReward)return;
 const pass=await read('LeagueBattlePassInfoRequest','LeagueBattlePassInfoResponse');
 if(!Array.isArray(pass.got)||!Number.isSafeInteger(pass.score)||pass.score<0)return;
 const eligible=(config.LeaguePassCfg?.data??[]).filter(x=>x.dan===league.roomDan&&x.reqScore<=pass.score);
 const required=[],expected=[];
 for(const row of eligible){
  const got=pass.got.find(x=>x.id===row.rwdId);
  if(!got?.freeGot){required.push([row.rwdId,'freeGot']);expected.push(...row.freeReward??[]);}
  if(pass.activePay===true&&!got?.payGot){required.push([row.rwdId,'payGot']);expected.push(...row.payReward??[]);}
 }
 const reward=assets(expected);if(!required.length||!reward)return;
 const before=await stock();
 const result=await act(`league-pass:${period}:${league.roomDan}:${required.map(x=>x.join('-')).sort().join(',')}`,async()=>{
  const reply=await read('LeagueGotPassRewardRequest','LeagueGotPassRewardResponse');
  const current=await read('LeagueBattlePassInfoRequest','LeagueBattlePassInfoResponse'),currentLeague=await info(),after=await stock();
  const all=got=>Array.isArray(got)&&required.every(([id,field])=>got.some(x=>x.id===id&&x[field]===true));
  const ok=all(reply.got)&&all(current.got)&&currentLeague.settleTime===period&&currentLeague.roomDan===league.roomDan&&gain(before,after,reward);
  return{status:ok?'verified':'unconfirmed',message:ok?'联赛通关奖励：领取档位与库存已核对':'联赛通关奖励未确认，停止本轮'};
 });
 if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_league_pass');
}
