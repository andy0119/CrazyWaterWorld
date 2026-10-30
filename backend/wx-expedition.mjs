import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runExpedition({client,protocol,settings:s,state,act,log,config=tables}){
 if(!s.ref_battle_expedition_enabled)return;
 const raids=config.ExpeditionRaidCfg?.data??[],gate=Math.min(...raids.map(x=>Number(x.unlockLv)));if(!Number.isFinite(gate)||state.level<gate){log(`远征需等级 ${Number.isFinite(gate)?gate:'未知'}，本轮跳过`);return;}
 const read=(a,b,body={})=>client.request(a,body,b,8000).then(normalize);
 let info=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');const raid=raids.find(x=>x.raidId===info.raidId);
 if(!raid||state.level<raid.unlockLv){log('远征尚未选择已解锁副本与阵容，本轮跳过');return;}
 const stages=(config.ExpeditionStageCfg?.data??[]).filter(x=>x.raidId===info.raidId).sort((a,b)=>a.stageId-b.stageId);const last=stages.at(-1)?.stageId;if(!last)return;
 if(info.endTime>0&&info.endTime<Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000)&&info.passedStage<last){log('远征副本已到期，需重新选择副本后继续');return;}
 const key=()=>`${info.raidId}:${info.endTime}`;
 const verifyResult=r=>{if(r?.status==='unconfirmed')throw Error('unconfirmed_expedition');};
 if((s.ref_battle_expedition_sweep||s.ref_battle_expedition_freePass)&&info.passedRaid?.includes(info.raidId)&&info.passedStage<last){
  const result=await act('expedition-sweep:'+key(),async()=>{
   const reply=await read('ExpeditionSweepRequest','ExpeditionSweepResponse',{raidId:info.raidId});const after=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');
   const verified=!!reply.reward&&after.raidId===info.raidId&&after.passedStage>info.passedStage;
   return{status:verified?'verified':'unconfirmed',message:verified?'远征扫荡：已核对通关进度':'远征扫荡结果未确认，停止本轮'};
  });verifyResult(result);info=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');
 }
 if(s.ref_battle_expedition_challenge){
  for(let i=0;i<3;i++){
   if(info.passedStage>=last)break;
   const mark=key()+':'+info.passedStage+':'+state.power;if(state.expeditionBlocked===mark)break;
   const positions=info.formation?.heroPositions??[];if(!positions.length){log('远征尚未配置出战阵容，跳过');break;}
   const selected=new Set(positions.map(x=>x.heroId));const heroes=(info.hero??[]).filter(x=>selected.has(x.heroId));
   if(heroes.length!==selected.size){log('远征英雄血量资料不完整，跳过');break;}
   if(s.ref_battle_expedition_challengeStopOnHeroDeath&&heroes.some(x=>Number(x.hp)<=0)){log('远征按设置在英雄阵亡后停止');break;}
   const minimum=Number(s.ref_battle_expedition_challengeMinTeamHpPct)||0;
   if(minimum>0){
    const all=(await read('AllHeroRequest','AllHeroResponse')).heroes??[];let max=0,hp=0,known=true;
    for(const h of heroes){const data=all.find(x=>x.heroId===h.heroId);const maximum=Number(data?.attributes?.find(x=>x.attr===protocol.BattleAttr.attri_healthPoint)?.value);if(!(maximum>0)){known=false;break;}max+=maximum;hp+=Math.max(0,Math.min(maximum,Number(h.hp)));}
    if(!known||hp/max*100<minimum){log('远征队伍血量低于设置门槛或无法核对，停止挑战');break;}
   }
   if(info.stageBuff?.length){
    const offered=info.stageBuff.filter(id=>config.ExpeditionBuffsCfg?.data?.some(x=>x.buffId===id));if(!offered.length){log('远征增益选项未识别，暂停');break;}
    const buffId=offered[0];const before=JSON.stringify(info.buff??[]);
    const result=await act('expedition-buff:'+mark+':'+buffId,async()=>{
     await read('ExpeditionChooseBuffRequest','ExpeditionChooseBuffResponse',{raidId:info.raidId,buffId});const after=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');
     const verified=after.stageBuff?.length<info.stageBuff.length||JSON.stringify(after.buff??[])!==before;
     return{status:verified?'verified':'unconfirmed',message:verified?`远征增益 ${buffId}：已核对选择状态`:'远征增益结果未确认，停止本轮'};
    });verifyResult(result);info=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');if(info.stageBuff?.length)break;
   }
   const next=stages.find(x=>x.stageId>info.passedStage);if(!next)break;
   const result=await act(`expedition-fight:${key()}:${next.stageId}:${state.power}`,async()=>{
    const reply=await read('ExpeditionChallengeRequest','ExpeditionChallengeResponse',{raidId:info.raidId,stageId:next.stageId});const after=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');
    if(reply.raidId!==info.raidId||reply.stageId!==next.stageId)return{status:'unconfirmed',message:'远征回传关卡不符，停止'};
    const win=after.passedStage>=next.stageId;
    return{status:'verified',win,message:win?`远征 ${next.stageId}：已核对通关进度`:`远征 ${next.stageId}：未通关，同战力暂停`};
   });verifyResult(result);if(!result||result.status!=='verified'||!result.win){state.expeditionBlocked=mark;break;}
   info=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');
  }
 }
 if(s.ref_battle_expedition_finalReward&&!info.gotFinal&&info.passedStage>=last){
  const result=await act('expedition-final:'+key(),async()=>{
   await client.sendWatch('ExpeditionGotFinalRewardRequest',{raidId:info.raidId},{window:1000});const after=await read('ExpeditionInfoRequest','ExpeditionInfoResponse');const verified=after.gotFinal===true;
   return{status:verified?'verified':'unconfirmed',message:verified?'远征最终奖励：已核对领取状态':'远征最终奖励未确认，停止本轮'};
  });verifyResult(result);
 }
}
