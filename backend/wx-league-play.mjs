import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runLeaguePlay({client,protocol,settings:s,act,log,config=tables}){
 if(!s.ref_battle_league_enabled||!s.ref_battle_league_challenge&&!s.ref_battle_league_hangupReward)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const info=()=>read('LeagueInfoRequest','LeagueInfoResponse');
 const stock=async()=>{
  const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');
  if(!Array.isArray(i.items)||!Array.isArray(r.list))throw Error('unknown_league_inventory');
  const out=Object.fromEntries(i.items.map(x=>[x.itemId,Number(x.num)]));
  for(const x of r.list){out['resource:'+x.res]=Number(x.amount);const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 let league=await info();
 if(!Number.isSafeInteger(league.roomDan)||league.roomDan<1||!Number.isSafeInteger(league.settleTime)||league.settleTime<=0)return;
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=()=>Math.floor((now()+28800)/86400);
 if(s.ref_battle_league_hangupReward&&Number.isSafeInteger(league.bonusItemNum)&&league.bonusItemNum>0){
  const before=await stock(),old=league;
  const result=await act(`league-afk:${old.settleTime}:${day()}:${old.bonusItemNum}:${createHash('sha256').update(JSON.stringify(before)).digest('hex').slice(0,24)}`,async()=>{
   const reply=await read('GotLeagueBonusItemRequest','GotRewardResponse');
   league=await info();const after=await stock(),sum={};let valid=true;
   for(const a of reply.reward?.asset??[]){const n=Number(a.num);if(!a.id||!Number.isSafeInteger(n)||n<=0){valid=false;break;}sum[a.id]=(sum[a.id]??0)+n;}
   const ok=valid&&Object.keys(sum).length>0&&league.settleTime===old.settleTime&&Number.isSafeInteger(league.bonusItemNum)&&league.bonusItemNum<old.bonusItemNum&&Object.entries(sum).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   return{status:ok?'verified':'unconfirmed',message:ok?'联赛挂机奖励：累计数量减少与实际奖励入库已核对':'联赛挂机领奖未确认，停止本轮'};
  });
  if(!result||result.status==='rejected')return;if(result.status!=='verified')throw Error('unconfirmed_league_afk');
 }
 if(!s.ref_battle_league_challenge)return;
 const seconds=(now()+28800)%86400;
 if(seconds<21600||seconds>86370){log('联赛挑战：当前不在开放时段（06:00—23:59:30）');return;}
 const dan=(config.LeagueDanCfg?.data??[]).find(x=>x.dan===league.roomDan);
 const mine=league.mine,reserve=Number(s.ref_battle_league_reservePoints??0);
 if(!dan||!Number.isSafeInteger(dan.teamCount)||dan.teamCount<1||!mine?.playerId||!Number.isSafeInteger(reserve)||reserve<0)return;
 if(!Array.isArray(league.ownFormations)||league.ownFormations.length<dan.teamCount||league.ownFormations.slice(0,dan.teamCount).some(f=>!f.heroPositions?.length)){
  log('联赛挑战：现有出战队伍不足，请先在游戏配置联赛阵容');return;
 }
 const pointId=protocol.Resource.LEAGUE_POINT;if(!Number.isSafeInteger(pointId))return;
 const before=await stock(),points=before['resource:'+pointId];
 if(!Number.isSafeInteger(points)||points<=reserve){log('联赛挑战：挑战积分已达到保留数量');return;}
 const response=await read('LeagueRefreshRivalRequest','LeagueRefreshRivalResponse',{isRefresh:false});
 const power=Number(mine.power);
 const rival=(response.rivals??[]).filter(x=>String(x.playerId)!==String(mine.playerId)&&/^[1-9]\d*$/.test(String(x.playerId))&&Number.isSafeInteger(Number(x.power))&&Number(x.power)>0&&Number.isSafeInteger(power)&&Number(x.power)<=power).sort((a,b)=>Number(a.power)-Number(b.power))[0];
 if(!rival){log('联赛挑战：当前没有战力不高于己方的可用对手，不消耗积分刷新');return;}
 // Recheck the budget and lineup after matchmaking, before spending one point.
 const current=await info(),stockNow=await stock();
 if(current.settleTime!==league.settleTime||current.roomDan!==league.roomDan||String(current.mine?.playerId)!==String(mine.playerId)||stockNow['resource:'+pointId]!==points||JSON.stringify(current.ownFormations)!==JSON.stringify(league.ownFormations))return;
 const result=await act(`league-fight:${league.settleTime}:${day()}:${league.nextPointTime}:${points}:${mine.score}:${rival.playerId}`,async()=>{
  const reply=await read('LeagueFightRequest','LeagueFightResponse',{playerId:rival.playerId});
  const after=await stock(),fresh=await info();
  const ok=String(reply.lPlayer?.playerId)===String(mine.playerId)&&String(reply.rPlayer?.playerId)===String(rival.playerId)&&Array.isArray(reply.records)&&Number.isSafeInteger(Number(reply.lPlayer?.finalScore))&&String(fresh.mine?.score)===String(reply.lPlayer.finalScore)&&fresh.settleTime===league.settleTime&&points-after['resource:'+pointId]===1;
  return{status:ok?'verified':'unconfirmed',message:ok?`联赛挑战：战报、结算积分 ${reply.lPlayer.finalScore} 与消耗1次挑战积分已核对`:'联赛挑战结果未确认，不自动重送'};
 });
 if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_league_fight');
}
