import {runLimitedBossRewards} from './wx-limited-boss-rewards.mjs';
import {runRecycle} from './wx-recycle.mjs';
import {emitWorldMap,watchMapMovement} from './wx-map-view.mjs';
import {runGuildShip} from './wx-guild-ship.mjs';
import {runGiftCodes} from './wx-gift-codes.mjs';
import {runWorldBoss,runWorldBossGuarded} from './wx-world-boss.mjs';
import {captureChoiceEvents,runChoiceEvents,runChoiceEventsGuarded} from './wx-choice-events.mjs';
import {runTreasureLoot,runTreasureLootGuarded} from './wx-treasure-loot.mjs';
import {runWorldOnlineReward,runWorldOnlineGuarded} from './wx-world-online.mjs';
import readline from 'node:readline';
import {pathToFileURL} from 'node:url';
const input=readline.createInterface({input:process.stdin});
const waiters=new Map();let configure;
const configPromise=new Promise(resolve=>configure=resolve);
input.on('line',line=>{try{const data=JSON.parse(line);if(configure){const resolve=configure;configure=null;resolve(data);}else if(data.ack){waiters.get(data.ack)?.({accepted:data.accepted,previous:data.previous});waiters.delete(data.ack);}}catch{}});
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const config=await configPromise;
setInterval(()=>{try{process.kill(config.parentPid,0);}catch{process.exit(0);}},3000).unref();
const {GameClient}=await import('./wx-game/client.mjs');
const {loadProtocol}=await import('./wx-game/proto.mjs');
const {normalize,describeRole}=await import('./wx-game/worlds.mjs');
const protocol=loadProtocol();let client;
const {runPetLevels}=await import('./wx-pet-levels.mjs');
const {runPetAdvance}=await import('./wx-pet-advance.mjs');
const {runExpedition}=await import('./wx-expedition.mjs');
const {runGatherUpgrades}=await import('./wx-gather-upgrades.mjs');
const {runHeroGrowth,runAntiqueGrowth}=await import('./wx-growth.mjs');
const {runHeroExclusive}=await import('./wx-hero-exclusive.mjs');
const {runHeroRecruit}=await import('./wx-hero-recruit.mjs');
const {runGather}=await import('./wx-gather.mjs');
const {runKeyChests}=await import('./wx-key-chests.mjs');
const {runWorldMaintenance}=await import('./wx-world-maintenance.mjs');
const {runGuildClaims}=await import('./wx-guild-claims.mjs');
const {runGuildHelp}=await import('./wx-guild-help.mjs');
const {runGuildOrders}=await import('./wx-guild-orders.mjs');
const {runGuildTech}=await import('./wx-guild-tech.mjs');
const {runFleetSpeedup}=await import('./wx-fleet-speedup.mjs');
const {runPirates}=await import('./wx-pirates.mjs');
const {runRadar}=await import('./wx-radar.mjs');
const {runRadarGuarded}=await import('./wx-radar-guard.mjs');
const {runWeekOrders}=await import('./wx-week-orders.mjs');
const {runHeroSkillAdvance}=await import('./wx-hero-skill-advance.mjs');
const {runGuildTitle}=await import('./wx-guild-title.mjs');
const {runLeaguePlay}=await import('./wx-league-play.mjs');
const {runGuildAsk}=await import('./wx-guild-ask.mjs');
const {runBadgeEnhance}=await import('./wx-badge-enhance.mjs');
const {runLeagueClaims}=await import('./wx-league-claims.mjs');
const {runHeroAppoint}=await import('./wx-hero-appoint.mjs');
const {runEquippedEnhance}=await import('./wx-equipped-enhance.mjs');
const {readSettingOptions}=await import('./wx-setting-options.mjs');
const {runTradeEngine,runTradeGuarded}=await import('./wx-trade-engine.mjs');
const {runTradeClaims}=await import('./wx-trade-claims.mjs');
const {finishGameLogin}=await import('./wx-login-init.mjs');
const {runAntiqueFreeRecruit}=await import('./wx-antique-free-recruit.mjs');
const {runResourceFields}=await import('./wx-resource-fields.mjs');
const {runCityWar,runCityWarGuarded}=await import('./wx-city-war.mjs');
const {runArena}=await import('./wx-arena.mjs');
const {runBuildings,runBuildingSpeedups}=await import('./wx-buildings.mjs');
const {runAfkUpgrade}=await import('./wx-afk-upgrade.mjs');
const {runFarmPlant}=await import('./wx-farm.mjs');
const {runFacilityClaims}=await import('./wx-facility-claims.mjs');
const {runMuseumExplore}=await import('./wx-museum-explore.mjs');
const {runMuseumSpeedup}=await import('./wx-museum-speedup.mjs');
const {runProduction,runProductionGuarded,afkDue}=await import('./wx-production.mjs');
const {runProductionSpeedups}=await import('./wx-production-speedups.mjs');
const {runCrafting,runCraftingGuarded}=await import('./wx-crafting.mjs');
const {runFacilityActions}=await import('./wx-facility-actions.mjs');
const {runFreeTasks}=await import('./wx-free-tasks.mjs');
const {captureActivityState,runActivityRewards}=await import('./wx-activity-rewards.mjs');
const {runBlindBox}=await import('./wx-blind-box.mjs');
const {runChallenge,challengeState}=await import('./wx-challenge.mjs');
const {runTrials}=await import('./wx-trials.mjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const log=(message,detail={})=>emit({type:'log',message,...detail});
const actionHistory=new Set(config.actionHistory??[]);
const pausedModules=new Set();
let serial=0,lastAction=0;
async function act(key,action){
 const id=String(++serial);
 const accepted=await new Promise(resolve=>{waiters.set(id,resolve);emit({type:'intent',id,key});setTimeout(()=>{if(waiters.has(id)){waiters.delete(id);resolve(false);}},5000).unref();});
 if(!accepted?.accepted){if(accepted?.previous?.status==='verified'&&typeof accepted.previous.win==='boolean')return {...accepted.previous,replayed:true};return;}
 await delay(Math.max(0,1500-(Date.now()-lastAction)));lastAction=Date.now();
 try{const outcome=await action();emit({type:'outcome',key,...outcome});return outcome;}
 catch(e){const outcome={status:e.prompt?'rejected':'unconfirmed',message:e.prompt?'伺服器拒絕，提示 '+(protocol.Prompt[e.prompt.prompt]??e.prompt.prompt):'未取得明確回覆，此次不自動重送'};emit({type:'outcome',key,...outcome});return outcome;}
}
while(true){
 let disconnectedAt=null;
 client=new GameClient({protocol});client.on('error',()=>{});
 const activityState=captureActivityState(client);
 const eventState=captureChoiceEvents(client);
 const disconnected=()=>{if(disconnectedAt===null){disconnectedAt=Date.now();client.stop();}};
 client.on('close',disconnected);client.on('fatal',disconnected);
 const connectionWatch=setInterval(()=>{if(client.state==='READY'&&!client.connected)disconnected();},1000);
 try{
 const login=await client.connect(config.login);
 const role=describeRole(login.playerInfo);
 if(String(role?.id)!==String(config.roleId))throw Error('role_mismatch');
 await finishGameLogin({client,log});
 const challenge=challengeState(normalize(login.playerInfo));
 watchMapMovement({client,state:challenge,roleId:config.roleId,emit});
 challenge.vipLevel=Number(normalize(login.playerInfo).vip?.vipLevel??0);
 const currentWorld=Number(normalize(login.playerInfo).worldId);
 challenge.worldOpenTime=Number(normalize(login.playerInfo).worldOpenTime)||null;
 challenge.scenarioId=Number(normalize(login.playerInfo).scenarioId)||1;
 challenge.season=Number.isSafeInteger(currentWorld)&&currentWorld>0?Math.floor(currentWorld/1000000%1000):null;
 client.on('message',({name,body})=>{const value=normalize(body);if(name==='SCPlayerExpUpdate'&&value.level>challenge.level){challenge.level=value.level;if(challenge.blockedReason==='level'){challenge.blocked=false;challenge.blockedReason=null;}}if(name==='SCPlayerPower'&&value.power>0&&String(value.power)!==challenge.power){challenge.power=String(value.power);if(challenge.blockedReason==='loss'){challenge.blocked=false;challenge.blockedReason=null;challenge.losses=0;}}});
 emit({type:'state',state:'running',message:`遊戲連線已驗證；等級 ${challenge.level}，目前主線第 ${challenge.stage} 關，開始執行所選任務`});
 await readSettingOptions({client,roleId:config.roleId,emit,log,level:challenge.level});
 let cycle=0;
 while(true){
  if(disconnectedAt!==null||!client.connected)throw Error('connection_lost');
  cycle++;
  await emitWorldMap({client,state:challenge,roleId:config.roleId,emit,log});
  await runChallenge({client,settings:config.settings,state:challenge,act,log});
  await runRecycle({client,settings:config.settings,act,log,paused:pausedModules});
  await runTrials({client,settings:config.settings,state:challenge,act,log});
  await runExpedition({client,protocol,settings:config.settings,state:challenge,act,log});
  await runArena({client,settings:config.settings,state:challenge,act,log,emit,roleId:config.roleId});
  await runLimitedBossRewards({client,settings:config.settings,state:challenge,act,log,paused:pausedModules});
  await runWorldOnlineGuarded({run:()=>runWorldOnlineReward({client,settings:config.settings,state:challenge,act,log}),client,paused:pausedModules,log});
  await runWorldBossGuarded({run:()=>runWorldBoss({client,protocol,settings:config.settings,state:challenge,act,log,history:actionHistory}),client,paused:pausedModules,log});
  await runChoiceEventsGuarded({run:()=>runChoiceEvents({client,settings:config.settings,eventState,act,log,history:actionHistory}),client,paused:pausedModules,log});
  await runTreasureLootGuarded({run:()=>runTreasureLoot({client,protocol,settings:config.settings,state:challenge,act,log,history:actionHistory}),client,paused:pausedModules,log});
  await runCityWarGuarded({run:()=>runCityWar({client,protocol,settings:config.settings,state:challenge,act,log,history:actionHistory}),client,paused:pausedModules,log});
  await runWorldMaintenance({client,protocol,settings:config.settings,state:challenge,act,log,history:actionHistory});
  if(challenge.blocked&&config.settings.ref_battle_stage_enabled)emit({type:'state',state:'waiting',message:'主线挑战已暂停，等待条件改变；其他已选任务仍依开关检查'});
  if(config.settings.script_achievement){
   const info=normalize(await client.request('AchievementInfoRequest',{},'AchievementInfoResponse',8000));
   const eligible=(info.task??[]).filter(t=>!t.rewardClaimed&&Number.isFinite(t.targetProgress)&&t.targetProgress>0&&t.progress>=t.targetProgress).slice(0,5);
   for(const task of eligible)await act('achievement:'+task.id+':'+task.targetProgress,async()=>{
    await client.sendWatch('GotAchievementRewardRequest',{id:task.id},{window:1000});
    const after=normalize(await client.request('AchievementInfoRequest',{},'AchievementInfoResponse',8000));
    const confirmed=(after.task??[]).some(t=>String(t.id)===String(task.id)&&t.rewardClaimed===true);
    return {status:confirmed?'verified':'unconfirmed',message:confirmed?'成就 '+task.id+' 已確認領取':'成就 '+task.id+' 尚未確認領取，不重送'};
   });
   if(!eligible.length)log('目前沒有可領取的成就獎勵');
  }
  await runAfkUpgrade({client,settings:config.settings,state:challenge,act,log});
  if(config.settings.script_afk||config.settings.ref_battle_stage_afk_enabled){
   const info=normalize(await client.request('AfkInfoRequest',{},'AfkInfoResponse',8000));
   const finish=info.afkInfo?.afkFinishTime;
   const started=info.afkInfo?.afkStartTime;
   const hours=Math.max(0,Number(config.settings.ref_battle_stage_afk_claimAfterHours)||0);
   const due=afkDue(info.afkInfo,hours);
   if(due>0&&due<=(Date.now()+client.serverClockOffsetMs)/1000)await act('afk:'+started+':'+finish,async()=>{
    const reply=normalize(await client.request('DrawAfkRewardRequest',{useAdvCard:false},'DrawAfkRewardResponse',8000));
    const after=normalize(await client.request('AfkInfoRequest',{},'AfkInfoResponse',8000));
    const confirmed=!!reply.reward&&(after.afkInfo?.afkFinishTime>finish||after.afkInfo?.afkStartTime>started);
    return {status:confirmed?'verified':'unconfirmed',message:confirmed?'掛機收益已領取並確認新時段':'收到掛機收益回覆，入帳狀態待確認'};
   });
   else log('掛機收益尚未達到領取時間');
  }
  await runGiftCodes({client,settings:config.settings,act,log,protocol,paused:pausedModules,sleep:delay});
  await runGuildShip({client,protocol,settings:config.settings,roleId:config.roleId,act,log,paused:pausedModules});
  await runPetLevels({client,settings:config.settings,state:challenge,act,log,history:actionHistory});
  await runMuseumSpeedup({client,settings:config.settings,state:challenge,act,log,history:actionHistory});
  await runMuseumExplore({client,settings:config.settings,state:challenge,act,log});
  await runPetAdvance({client,settings:config.settings,state:challenge,act,log,history:actionHistory});
  await runFacilityClaims({client,settings:config.settings,state:challenge,act,log});
  await runHeroGrowth({client,settings:config.settings,state:challenge,act,log});
  await runAntiqueGrowth({client,settings:config.settings,act,log});
  await runGatherUpgrades({client,settings:config.settings,act,log});
  await runGather({client,settings:config.settings,act,log,paused:pausedModules});
  await runBuildings({client,settings:config.settings,state:challenge,act,log});
  await runGuildAsk({client,settings:config.settings,act,log});
  await runGuildClaims({client,settings:config.settings,act,log});
  await runGuildHelp({client,settings:config.settings,act,log,history:actionHistory});
  await runGuildOrders({client,settings:config.settings,state:challenge,act,log});
  await runGuildTech({client,settings:config.settings,state:challenge,act,log});
  await runActivityRewards({client,settings:config.settings,activityState,act,log});
  await runBlindBox({client,settings:config.settings,activityState,act,log});
  await runFleetSpeedup({client,protocol,settings:config.settings,act,log});
  await runPirates({client,protocol,settings:config.settings,state:challenge,act,log,history:actionHistory});
  await runRadarGuarded({run:({claimsOnly})=>runRadar({client,protocol,settings:config.settings,state:challenge,act,log,history:actionHistory,claimsOnly}),client,paused:pausedModules,log});
  await runWeekOrders({client,settings:config.settings,act,log,history:actionHistory});
  await runHeroSkillAdvance({client,settings:config.settings,state:challenge,act,log});
  await runGuildTitle({client,settings:config.settings,act,log});
  await runLeaguePlay({client,protocol,settings:config.settings,act,log});
  await runBadgeEnhance({client,settings:config.settings,act,log});
  await runLeagueClaims({client,settings:config.settings,act,log});
  await runHeroAppoint({client,settings:config.settings,state:challenge,act,log});
  await runEquippedEnhance({client,settings:config.settings,act,log});
  await runTradeGuarded({client,paused:pausedModules,log,run:async()=>{
   await runTradeEngine({client,settings:config.settings,state:challenge,activityState,act,log,history:actionHistory});
   await runTradeClaims({client,settings:config.settings,state:challenge,activityState,act,log});
  }});
  await runResourceFields({client,settings:config.settings,state:challenge,protocol,act,log,history:actionHistory});
  await runHeroExclusive({client,settings:config.settings,act,log});
  await runHeroRecruit({client,settings:config.settings,act,log,history:actionHistory});
  await runAntiqueFreeRecruit({client,settings:config.settings,act,log});
  await runKeyChests({client,settings:config.settings,act,log});
  await runCraftingGuarded({run:()=>runCrafting({client,settings:config.settings,state:challenge,act,log,history:actionHistory}),client,paused:pausedModules,log});
  await runFacilityActions({client,settings:config.settings,state:challenge,act,log,history:actionHistory});
  await runProductionSpeedups({client,settings:config.settings,state:challenge,act,log});
  await runBuildingSpeedups({client,settings:config.settings,act,log});
  await runProductionGuarded({run:()=>runProduction({client,settings:config.settings,act,log,state:challenge}),client,paused:pausedModules,log});
  await runFreeTasks({client,protocol,settings:config.settings,act,log});
  await runFarmPlant({client,settings:config.settings,state:challenge,act,log});
  log('第 '+cycle+' 輪完成，等待下一輪');
  await delay(config.settings.script_interval*1000);
 }
 }catch(e){
  client.stop();
  if(!e.loginResponse&&(disconnectedAt!==null||/connection_lost|socket.*login|login timeout/.test(e.message))){
   const minutes=Math.max(0.1,Number(config.settings.basic_0)||0.5);
   const until=(disconnectedAt??Date.now())+minutes*60000;
   emit({type:'state',state:'reconnecting',message:`連線中斷／被登出；依設定等待 ${minutes} 分鐘後重新登入`,retryAt:until});
   await delay(Math.max(0,until-Date.now()));
   continue;
  }
  emit({type:'state',state:e.loginResponse?'reauthorization_required':'failed',message:e.loginResponse?'遊戲登入已失效或被拒絕，請重新授權':'遊戲連線或任務中斷，已停止',resultCode:e.loginResponse?.result});break;
 }finally{clearInterval(connectionWatch);client.stop();}
}
input.close();process.exit(0);
