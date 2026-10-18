import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8'));
export async function runTrials({client,settings:s,state,act,log,config=tables}){
 if(!s.ref_battle_trial_enabled)return;
 state.trials??={};const retries=Math.max(0,Math.trunc(Number(s.ref_battle_trial_samePowerRetryCount)||0));
 for(const [field,raidId,label] of [['heroExp',1,'英雄经验试炼'],['forge',2,'强化石试炼'],['petExp',3,'海兽经验试炼']]){
  if(!s[`ref_battle_trial_${field}_challenge`])continue;
  const stages=(config.tables.TrialRaidStageCfg?.data??[]).filter(r=>r.raidId===raidId).sort((a,b)=>a.stageId-b.stageId);
  if(!stages.length){log(label+'配置尚未载入，跳过');continue;}
  if(state.level<stages[0].openLevel){log(`${label}需等级 ${stages[0].openLevel}，目前 ${state.level}，跳过`);continue;}
  const read=()=>client.request('TrialRaidInfoRequest',{raidId},'TrialRaidInfoResponse',8000).then(normalize);
  const info=await read();if(!info.raid||info.raid.raidId!==raidId){log(label+'状态不完整，跳过');continue;}
  const stage=stages.find(r=>r.stageId>info.raid.passedStage);
  if(!stage){log(label+'已通过当前配置的全部关卡');continue;}
  if(state.level<stage.openLevel){log(`${label}下一关需等级 ${stage.openLevel}，跳过`);continue;}
  const mark=`${stage.stageId}:${state.power}`;
  const trial=state.trials[raidId]??={mark,losses:0,blocked:false};
  if(trial.mark!==mark){trial.mark=mark;trial.losses=0;trial.blocked=false;}
  if(trial.blocked)continue;
  log(`${label}：${trial.losses===0?'首次挑战':`重试 ${trial.losses}/${retries}`}`);
  const result=await act(`trial:${raidId}:${mark}:attempt:${trial.losses}`,async()=>{
   const reply=normalize(await client.request('TrialRaidChallengeRequest',{raidId,stageId:stage.stageId},'TrialRaidChallengeResponse',15000));
   if(reply.raidId!==raidId||reply.stageId!==stage.stageId)return{status:'unconfirmed',message:label+'回传关卡不符，已暂停'};
   const after=await read();if(!after.raid||after.raid.raidId!==raidId)return{status:'unconfirmed',message:label+'无法核对通关进度，已暂停'};
   const win=after.raid.passedStage>=stage.stageId;
   return{status:'verified',win,message:win?`${label}第 ${stage.stageLevel} 关：已读回通关进度`:`${label}第 ${stage.stageLevel} 关：未通关，已核对进度`};
  });
  if(!result||result.status!=='verified'){trial.blocked=true;log(label+'已暂停，未确认请求不自动重送');}
  else if(!result.win){trial.losses++;if(trial.losses>retries){trial.blocked=true;log(label+'达到相同战力重试上限，已暂停');}}
 }
}
