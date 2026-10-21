import {normalize} from './wx-game/worlds.mjs';
function positivePower(value){try{const s=String(value);return /^\d+$/.test(s)&&BigInt(s)>0n?BigInt(s):null;}catch{return null;}}
export function arenaTarget(info,power,failed=new Set()){
 const rank=Number(info.myself?.rankNo),ownId=String(info.myself?.id??'');
 const ownPower=positivePower(power)??positivePower(info.myself?.power);
 if(!Number.isSafeInteger(rank)||rank<=0)return {reason:'自身排名未确认'};
 const others=(info.challenges??[]).filter(x=>x.id&&String(x.id)!==ownId&&Number.isSafeInteger(Number(x.rankNo))&&Number(x.rankNo)>0);
 const challenge=ownPower===null?undefined:others.filter(x=>Number(x.rankNo)<rank&&!failed.has(String(x.id))&&positivePower(x.power)!==null&&positivePower(x.power)<ownPower).sort((a,b)=>positivePower(a.power)<positivePower(b.power)?-1:positivePower(a.power)>positivePower(b.power)?1:Number(a.rankNo)-Number(b.rankNo))[0];
 return {challenge,sweep:others.find(x=>Number(x.rankNo)>rank),rank,ownPower,reason:ownPower===null?'自身战力未确认':'暂无排名更高且战力更低的未败对手'};
}
export async function runArena({client,settings:s,state,act,log,emit=()=>{},roleId}){
 const enabled=s.ref_battle_arena_enabled&&(s.ref_battle_arena_challenge||s.ref_battle_arena_sweep)&&!state.arenaUnconfirmed;
 const publish=info=>emit({type:'arena_view',roleId,data:{myself:{...info.myself,id:String(info.myself?.id??roleId??''),power:String(state.power??info.myself?.power??'')},arenaPoint:Number(info.arenaPoint??0),dailyChallengeTimes:Number(info.dailyChallengeTimes??0),opponents:(info.challenges??[]).map(x=>({...x,id:String(x.id??''),power:String(x.power??''),failed:state.arenaFailedOpponents?.has(String(x.id))===true}))}});
 const now=new Date(Date.now()+(client.serverClockOffsetMs??0)+8*3600000),day=now.toISOString().slice(0,10);
 const time=s.ref_battle_arena_executeTime;const waiting=time&&/^\d{2}:\d{2}$/.test(time)&&now.toISOString().slice(11,16)<time;
 const read=(a,b)=>client.request(a,{},b,8000).then(normalize);
 if(state.level<13){log('竞技场需等级13，本轮跳过');return;}
 const water=await read('OnWaterRequest','OnWaterResponse');
 if(!(water.building??[]).some(b=>b.buildingId==='1竞技场'&&b.level>0&&!b.buildFinishTime)){log('竞技场建筑尚未建成，本轮跳过');return;}
 state.arenaFailedOpponents??=new Set();
 for(let i=0;i<3;i++){
  const info=await read('ArenaInfoRequest','ArenaInfoResponse');publish(info);
  if(!enabled)return;if(waiting){log('竞技场未到设定执行时间');return;}
  if(!(info.arenaPoint>0)){log('竞技场挑战券不足，本轮结束');return;}
  const choice=arenaTarget(info,state.power,state.arenaFailedOpponents);
  const target=s.ref_battle_arena_challenge?choice.challenge:undefined;
  const sweep=!target&&s.ref_battle_arena_sweep===true&&Number(info.dailyChallengeTimes??0)<10&&choice.sweep;
  if(!target&&!sweep){log(Number(info.dailyChallengeTimes??0)>=10?'竞技场每日前10次挑战奖励已完成，无符合条件的晋级对手，停止本轮':`竞技场跳过：${choice.reason??'没有可扫荡的低排名对手'}`);return;}
  const enemy=target||sweep;
  log(`竞技场${target?'进攻分析':'扫荡'}：自身排名 ${choice.rank}，战力 ${choice.ownPower??'未知'}；对手 ${enemy.nickname||enemy.id}，排名 ${enemy.rankNo}，战力 ${enemy.power??'未知'}；每场消耗1张挑战券`);
  const beforeCount=Number(info.dailyChallengeTimes??0);let lost=false;
  const result=await act(`arena:${day}:${beforeCount}:${info.arenaPoint}:${target?String(target.id):'sweep'}`,async()=>{
   let reply;
   if(target)reply=normalize(await client.request('ArenaChallengeRequest',{rank:target.rankNo,challengeId:target.id},'ArenaChallengeResponse',15000));
   else await client.sendWatch('ArenaSweepRequest',{}, {window:1000});
   const after=await read('ArenaInfoRequest','ArenaInfoResponse');
   const counted=Number(after.dailyChallengeTimes??0)===beforeCount+1;
   const ticket=Number(after.arenaPoint)===Number(info.arenaPoint)-1;
   const verified=counted&&ticket&&(!target||(Number(reply?.reportId)>0&&!reply.isChange));
   lost=!!target&&verified&&!reply.isWin;
   if(lost)state.arenaFailedOpponents.add(String(target.id));publish(after);
   return {status:verified?'verified':'unconfirmed',message:verified?(target?`竞技场挑战：服务器判定${reply.isWin?'胜利':'失败'}，排名 ${info.myself?.rankNo} → ${after.myself?.rankNo??'未知'}，已核对消耗1券${lost?'；本次不再挑战此对手':''}`:`竞技场扫荡：每日奖励进度 ${Number(after.dailyChallengeTimes??0)}/10，已核对消耗1券`):'竞技场结果或券数未确认，暂停竞技场，避免重复消耗'};
  });
  if(lost)state.arenaFailedOpponents.add(String(target.id));
  if(!result)return;
  if(result.status!=='verified'){state.arenaUnconfirmed=true;return;}
 }
}
