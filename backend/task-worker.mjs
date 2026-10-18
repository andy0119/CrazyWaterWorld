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
const {runExpedition}=await import('./wx-expedition.mjs');
const {runGatherUpgrades}=await import('./wx-gather-upgrades.mjs');
const {runHeroGrowth,runAntiqueGrowth}=await import('./wx-growth.mjs');
const {runGather}=await import('./wx-gather.mjs');
const {runWorldMaintenance}=await import('./wx-world-maintenance.mjs');
const {runArena}=await import('./wx-arena.mjs');
const {runBuildings,runBuildingSpeedups}=await import('./wx-buildings.mjs');
const {runAfkUpgrade}=await import('./wx-afk-upgrade.mjs');
const {runFarmPlant}=await import('./wx-farm.mjs');
const {runFacilityClaims}=await import('./wx-facility-claims.mjs');
const {runProduction,afkDue}=await import('./wx-production.mjs');
const {runFreeTasks}=await import('./wx-free-tasks.mjs');
const {runChallenge,challengeState}=await import('./wx-challenge.mjs');
const {runTrials}=await import('./wx-trials.mjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const log=(message,detail={})=>emit({type:'log',message,...detail});
const actionHistory=new Set(config.actionHistory??[]);
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
 const disconnected=()=>{if(disconnectedAt===null){disconnectedAt=Date.now();client.stop();}};
 client.on('close',disconnected);client.on('fatal',disconnected);
 const connectionWatch=setInterval(()=>{if(client.state==='READY'&&!client.connected)disconnected();},1000);
 try{
 const login=await client.connect(config.login);
 const role=describeRole(login.playerInfo);
 if(String(role?.id)!==String(config.roleId))throw Error('role_mismatch');
 const challenge=challengeState(normalize(login.playerInfo));
 client.on('message',({name,body})=>{const value=normalize(body);if(name==='SCPlayerExpUpdate'&&value.level>challenge.level){challenge.level=value.level;if(challenge.blockedReason==='level'){challenge.blocked=false;challenge.blockedReason=null;}}if(name==='SCPlayerPower'&&value.power>0&&String(value.power)!==challenge.power){challenge.power=String(value.power);if(challenge.blockedReason==='loss'){challenge.blocked=false;challenge.blockedReason=null;challenge.losses=0;}}});
 emit({type:'state',state:'running',message:`遊戲連線已驗證；等級 ${challenge.level}，目前主線第 ${challenge.stage} 關，開始執行所選任務`});
 let cycle=0;
 while(true){
  if(disconnectedAt!==null||!client.connected)throw Error('connection_lost');
  cycle++;
  await runChallenge({client,settings:config.settings,state:challenge,act,log});
  await runTrials({client,settings:config.settings,state:challenge,act,log});
  await runExpedition({client,protocol,settings:config.settings,state:challenge,act,log});
  await runArena({client,settings:config.settings,state:challenge,act,log});
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
  if(config.settings.script_gift_codes?.length){
   for(const code of config.settings.script_gift_codes)await act('gift:'+code,async()=>{
    const items=normalize(await client.request('AllItemRequest',{},'AllItemResponse',8000));
    const resources=normalize(await client.request('AllResourceRequest',{},'AllResourceResponse',8000));
    const assets=Object.fromEntries((items.items??[]).map(x=>[x.itemId,x.num]));
    for(const r of resources.list??[])if(r.res===3||r.res===4)assets[r.res===3?'GOLD':'RUBY']=r.amount;
    let reply;
    try{reply=normalize(await client.request('GotGiftCodeRequest',{giftCode:code},'GotRewardResponse',8000));}
    catch(e){if(e.prompt){const name=protocol.Prompt[e.prompt.prompt];const names={GIFT_CODE_EXPIRED:'已過期',GIFT_CODE_INVALID:'無效／不適用',GIFT_CODE_USED:'已領取',GIFT_CODE_BATCH_USED:'同批次已領取',GIFT_CODE_USED_BY_OTHER:'已被其他帳號使用'};return {status:names[name]?'rejected':'unconfirmed',message:'禮包碼 '+code+'：'+(names[name]??'未辨識的伺服器提示'),serverPrompt:name??null};}throw e;}
    const afterItems=normalize(await client.request('AllItemRequest',{},'AllItemResponse',8000));
    const afterResources=normalize(await client.request('AllResourceRequest',{},'AllResourceResponse',8000));
    const after=Object.fromEntries((afterItems.items??[]).map(x=>[x.itemId,x.num]));
    for(const r of afterResources.list??[])if(r.res===3||r.res===4)after[r.res===3?'GOLD':'RUBY']=r.amount;
    const expected=reply.reward?.asset??[];
    const verified=expected.length>0&&expected.every(x=>x.num>0&&(after[x.id]??0)-(assets[x.id]??0)>=x.num);
    await delay(2500);
    return {status:verified?'verified':'unconfirmed',message:'禮包碼 '+code+'：'+(verified?'已確認庫存增加':'有獎勵回覆，庫存增量尚未確認')};
   });
  }
  await runPetLevels({client,settings:config.settings,state:challenge,act,log,history:actionHistory});
  await runFacilityClaims({client,settings:config.settings,state:challenge,act,log});
  await runHeroGrowth({client,settings:config.settings,state:challenge,act,log});
  await runAntiqueGrowth({client,settings:config.settings,act,log});
  await runGatherUpgrades({client,settings:config.settings,act,log});
  await runGather({client,settings:config.settings,act,log});
  await runBuildings({client,settings:config.settings,state:challenge,act,log});
  await runBuildingSpeedups({client,settings:config.settings,act,log});
  await runProduction({client,settings:config.settings,act,log});
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
