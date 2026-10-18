import {normalize} from './wx-game/worlds.mjs';
export async function runArena({client,settings:s,state,act,log}){
 if(!s.ref_battle_arena_enabled||(!s.ref_battle_arena_challenge&&!s.ref_battle_arena_sweep))return;
 const now=new Date(Date.now()+(client.serverClockOffsetMs??0)+8*3600000);const day=now.toISOString().slice(0,10);
 const time=s.ref_battle_arena_executeTime;if(time&&/^\d{2}:\d{2}$/.test(time)&&now.toISOString().slice(11,16)<time){log('竞技场未到设定执行时间');return;}
 const read=(a,b)=>client.request(a,{},b,8000).then(normalize);
 if(state.level<13){log('竞技场需等级13，本轮跳过');return;}
 const water=await read('OnWaterRequest','OnWaterResponse');
 if(!(water.building??[]).some(b=>b.buildingId==='1竞技场'&&b.level>0&&!b.buildFinishTime)){log('竞技场建筑尚未建成，本轮跳过');return;}
 for(let i=0;i<3;i++){
  const info=await read('ArenaInfoRequest','ArenaInfoResponse');if(!(info.arenaPoint>0)){log('竞技场挑战次数不足，本轮结束');return;}
  const sweep=s.ref_battle_arena_sweep===true;
  const target=[...(info.challenges??[])].filter(x=>x.rankNo>0&&x.id).sort((a,b)=>Number(a.power)-Number(b.power))[0];
  if(!sweep&&!target){log('竞技场暂无可挑战对手');return;}
  const result=await act(`arena:${day}:${info.dailyChallengeTimes}:${info.arenaPoint}:${sweep?'sweep':String(target.id)}`,async()=>{
   let reply;
   if(sweep)await client.sendWatch('ArenaSweepRequest',{}, {window:1000});
   else reply=normalize(await client.request('ArenaChallengeRequest',{rank:target.rankNo,challengeId:target.id},'ArenaChallengeResponse',15000));
   const after=await read('ArenaInfoRequest','ArenaInfoResponse');
   const counted=after.dailyChallengeTimes>info.dailyChallengeTimes||after.arenaPoint<info.arenaPoint;
   const verified=counted&&(sweep||Number(reply?.reportId)>0);
   return{status:verified?'verified':'unconfirmed',message:verified?(sweep?'竞技场扫荡：已核对挑战计数':`竞技场挑战：服务器判定${reply.isWin?'胜利':'失败'}，已核对次数`):'竞技场结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_arena');
 }
}
