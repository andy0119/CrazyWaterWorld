import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8'));
export function challengeState(player){return {stage:Number(player.mainlineStage),level:Number(player.level),power:String(player.power),losses:0,blocked:false};}
export async function runChallenge({client,settings:s,state,act,log,delay=ms=>new Promise(r=>setTimeout(r,ms)),config=tables}){
 if(!s.ref_battle_stage_enabled||state.blocked)return;
 if(!Number.isSafeInteger(state.stage)||state.stage<1){state.blocked=true;log('主线关卡资料不完整，已暂停闯关');return;}
 const rows=config.tables.StageCfg?.data??[];
 const retries=Math.max(0,Math.trunc(Number(s.ref_battle_stage_samePowerRetryCount)||0));
 for(let i=0;i<3;i++){
  const stage=state.stage;const cfg=rows.find(x=>Number(x.stage)===stage);
  if(!cfg||!Number.isFinite(Number(cfg.playerLevel))){state.blocked=true;log('当前关卡配置尚未读取，已暂停闯关');return;}
  if(state.level<Number(cfg.playerLevel)){state.blocked=true;state.blockedReason='level';log(`第 ${stage} 关需角色等级 ${cfg.playerLevel}，目前 ${state.level}，暂停闯关`);return;}
  log(`主线第 ${stage} 关：${state.losses===0?'首次挑战':`重试 ${state.losses}/${retries}`}（上限 ${retries} 次重试）`);
  const result=await act(`mainline:${stage}:power:${state.power}:attempt:${state.losses}`,async()=>{
   const reply=normalize(await client.request('ChallengeStageRequest',{stage},'ChallengeStageResponse',15000));
   if(!reply.stats||typeof reply.stats!=='object')return{status:'unconfirmed',message:`第 ${stage} 关没有明确战斗结果，已暂停闯关`};
   if(reply.initialData?.mainlineStage>0&&Number(reply.initialData.mainlineStage)!==stage)return{status:'unconfirmed',message:'服务器回传关卡不符，已暂停闯关'};
   const win=reply.stats.isLeftWin===true;
   return{status:'verified',win,message:win?`主线第 ${stage} 关：服务器判定胜利，继续下一关`:`主线第 ${stage} 关：服务器判定失败`};
  });
  if(!result||result.status!=='verified'){state.blocked=true;log('闯关已暂停；未确认结果或已尝试的请求不会自动重送');return;}
  if(result.win){state.stage++;state.losses=0;}
  else{state.losses++;log(`第 ${stage} 关：已失败 ${state.losses} 次，已用重试 ${state.losses-1}/${retries}`);if(state.losses>retries){state.blocked=true;state.blockedReason='loss';log(`第 ${stage} 关已失败 ${state.losses} 次，已用完 ${retries} 次重试，暂停闯关`);return;}}
  if(i<2)await delay(3000);
 }
 log('本轮闯关完成，等待下一轮');
}
