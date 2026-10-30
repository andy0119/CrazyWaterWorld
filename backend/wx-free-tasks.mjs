import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
import {surveyTasks} from './wx-game/tasks.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8'));
export const FREE_TASKS={
 'ref_activity_workshop_gain':'活动工坊成品（需工坊总开关）',
 'ref_welfare_dailyTask':'每日任务及日／周活跃奖励',
 'ref_welfare_daily':'每日精选免费赠礼',
 'ref_welfare_email':'邮件附件奖励',
 'ref_welfare_growth':'已达标成长及支线奖励',
 'building_1':'建筑产出（需建筑总开关）',
 'building_6':'到期建筑完工（需建筑总开关）',
 'ref_island_factory_gain':'工厂成品（需工厂总开关）',
 'farm_1':'成熟农作物（需农田总开关）',
 'residents_7':'居民订单进度奖励',
};
export function enabledFreeTasks(s){return Object.keys(FREE_TASKS).filter(k=>s[k]===true&&(k!=='ref_activity_workshop_gain'||s.ref_activity_workshop_enabled===true)&&(!k.startsWith('building_')||s.building_0===true)&&(k!=='ref_island_factory_gain'||s.factory_0===true)&&(k!=='farm_1'||s.farm_0===true));}
const positiveAssets=a=>(a??[]).filter(x=>x&&x.id&&Number(x.num)>0);
async function stock(client){
 const i=normalize(await client.request('AllItemRequest',{},'AllItemResponse',8000));
 const r=normalize(await client.request('AllResourceRequest',{},'AllResourceResponse',8000));
 const out=Object.fromEntries((i.items??[]).map(x=>[x.itemId,Number(x.num)]));
 const names={1:'EXP',3:'GOLD',4:'RUBY',5:'ARENA_POINT',6:'LEAGUE_POINT'};
 for(const x of r.list??[])if(names[x.res])out[names[x.res]]=Number(x.amount);
 return out;
}
function increased(before,after,assets){const sums={};for(const x of positiveAssets(assets))sums[x.id]=(sums[x.id]??0)+Number(x.num);return Object.keys(sums).length>0&&Object.entries(sums).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);}
export async function runFreeTasks({client,protocol,settings:s,act,log,config=tables.tables,paused=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const on=new Set(enabledFreeTasks(s));if(!on.size)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const water=()=>read('OnWaterRequest','OnWaterResponse');
 async function claim(key,label,fn){
  const factory=key.startsWith('factory-product:'),scope='free-factory:'+key.split(':')[1];
  if(factory&&paused.has(scope))return;
  const result=await act(key,async()=>{const verified=await fn();return {status:verified?'verified':'unconfirmed',message:label+(verified?'：已核对领取状态':factory?'：结果未确认，仅暂停该工厂领取，其他任务继续；不重复发送':'：结果未确认，停止并请人工检查')};});
  if(result?.status==='unconfirmed'){
   if(client.connected===false)throw Error('connection_lost');
   if(factory){paused.add(scope);return;}
   throw Error('unconfirmed_action');
  }
 }
 if(on.has('ref_welfare_dailyTask')){
  let info=await read('DailyTaskInfoRequest','DailyTaskInfoResponse');
  for(const t of (info.dailyTask??[]).filter(t=>!t.rewardClaimed&&t.targetProgress>0&&t.progress>=t.targetProgress).slice(0,20)){
   await claim(`daily-task:${info.dailyResetTime}:${t.id}`,'每日任务 '+t.id,async()=>{
    await read('DrawDailyTaskRewardRequest','DrawDailyTaskRewardResponse',{id:t.id});
    const after=await read('DailyTaskInfoRequest','DailyTaskInfoResponse');return (after.dailyTask??[]).some(x=>x.id===t.id&&x.rewardClaimed===true);
   });
  }
  info=await read('DailyTaskInfoRequest','DailyTaskInfoResponse');
  for(const [kind,table,activity,claimed,request] of [['daily','DailyActivityRewardCfg',info.dailyActivity,info.dailyRewardClaimed,'DrawDailyRewardRequest'],['weekly','WeeklyActivityRewardCfg',info.weeklyActivity,info.weeklyRewardClaimed,'DrawWeeklyRewardRequest']]){
   const tiers=new Map();for(const row of tables.tables[table]?.data??[])if(row.activity<=activity&&!(claimed??[]).includes(row.id))tiers.set(row.id,row);
   for(const id of tiers.keys())await claim(`${kind}-chest:${info.dailyResetTime}:${id}`,(kind==='daily'?'每日':'每周')+'活跃奖励 '+id,async()=>{
    await client.sendWatch(request,{index:[id]},{window:1000});const after=await read('DailyTaskInfoRequest','DailyTaskInfoResponse');return (after[kind==='daily'?'dailyRewardClaimed':'weeklyRewardClaimed']??[]).includes(id);
   });
  }
  log('每日任务及活跃奖励检查完成');
 }
 if(on.has('ref_welfare_daily')){
  const info=await read('DailyGiftPackRequest','DailyGiftPackResponse');
  if(!(info.drawnPack??[]).includes('赠礼'))await claim(`daily-free-gift:${info.resetTime}`,'每日免费赠礼',async()=>{
   await client.sendWatch('GotFreeDailyPackRequest',{packId:'赠礼'},{window:1000});const after=await read('DailyGiftPackRequest','DailyGiftPackResponse');return (after.drawnPack??[]).includes('赠礼');
  });else log('每日免费赠礼已领取');
 }
 if(on.has('ref_welfare_email')){
  // Fixed page cap prevents unbounded polling; never sends or deletes mail.
  for(let page=0;page<5;page++){
   const inbox=await read('EmailBoxRequest','EmailBoxResponse',{pageNo:page});
   const emails=inbox.email??[];if(!emails.length)break;
   for(const mail of emails.filter(m=>!m.got&&Number.isSafeInteger(m.emailId)&&positiveAssets(m.attachment?.asset).length)){
    await claim(`email:${mail.emailId}`,'邮件附件 '+mail.emailId,async()=>{
     const before=await stock(client);
     await client.sendWatch('QuickGotReadEmailRequest',{emailId:[mail.emailId],all:false},{window:1000});
     const after=await read('EmailBoxRequest','EmailBoxResponse',{pageNo:page});const current=(after.email??[]).find(m=>m.emailId===mail.emailId);
     return current?.got===true&&increased(before,await stock(client),mail.attachment.asset);
    });
   }
   if(emails.length>=Number(inbox.total)||emails.length===0)break;
  }
  log('邮件附件检查完成');
 }
 if(on.has('ref_welfare_growth')||on.has('residents_7')){
  const survey=await surveyTasks(client,protocol,{config:tables});
  const allowed=survey.plan.filter(p=>(on.has('ref_welfare_growth')&&['main','branch'].includes(p.kind))||(on.has('residents_7')&&p.kind==='orderDaily')).slice(0,10);
  for(const p of allowed)await claim(`growth:${p.kind}:${p.id}:${p.kind==='orderDaily'?Math.floor((now()+28800)/86400):''}`,p.label,async()=>{
   await client.sendWatch(p.request,p.body,{window:1000});
   if(p.kind==='orderDaily')return Number((await water()).orderOfTheDay?.rewardedNum)>=Number(p.id);
   const after=await read('MainTaskInfoRequest','MainTaskInfoResponse');
   return p.kind==='main'?!!after.task&&(after.task.taskId!==p.id||after.task.rewardClaimed===true):!(after.branch??[]).some(x=>x.taskId===p.id);
  });log('成长与订单奖励检查完成');
 }
 if(['building_1','building_6','ref_island_factory_gain','ref_activity_workshop_gain','farm_1'].some(k=>on.has(k))){
  let state=await water();
  const readyProducts=on.has('building_1')?(state.building??[]).filter(b=>!b.factory&&positiveAssets(b.product?.asset).length).slice(0,150):[];
  if(readyProducts.length){
   const ids=readyProducts.map(b=>b.buildingId).sort();
   await claim(`building-products:${ids.join('|')}:${Math.floor(now()/60)}`,'建筑产出批量领取 '+ids.join('、'),async()=>{
    const before=await stock(client);
    const reply=await read('CollectBuildingProductRequest','CollectBuildingProductResponse',{buildingId:ids});
    const rewards=reply.reward??[];
    const returned=new Set(rewards.map(x=>x.buildingId));
    if(!ids.every(id=>returned.has(id)))return false;
    return increased(before,await stock(client),rewards.flatMap(x=>x.product?.asset??[]));
   });
  }
  for(const b of (state.building??[]).slice(0,150)){
   const workshop=(config.BuildingUnlockCfg?.data??[]).some(u=>u.buildingId===b.buildingId&&u.buildingType==='活动工厂');
   if((workshop?on.has('ref_activity_workshop_gain'):on.has('ref_island_factory_gain'))&&(b.factory?.finishedProducts??[]).length){
    await claim(`factory-product:${b.buildingId}:${Math.floor(now()/60)}`,(workshop?'活动工坊成品 ':'工厂成品 ')+b.buildingId,async()=>{
     const before=await stock(client);const reply=await read('GainFactoryProduceRequest','GainFactoryProduceResponse',{buildingId:b.buildingId});
     for(const delay of [0,400,800]){
      if(delay)await sleep(delay);
      const inventory=await stock(client),after=(await water()).building?.find(x=>x.buildingId===b.buildingId);
      if(after&&(after.factory?.finishedProducts??[]).length<b.factory.finishedProducts.length&&increased(before,inventory,reply.products?.asset))return true;
     }
     return false;
    });
   }
   if(on.has('farm_1')&&b.farm?.productId&&b.farm.ripeTime>0&&b.farm.ripeTime<=now()){
    await claim(`farm-harvest:${b.buildingId}:${b.farm.ripeTime}`,'农田收成 '+b.buildingId,async()=>{
     const before=await stock(client);await client.sendWatch('FarmHarvestRequest',{buildingId:[b.buildingId]},{window:1000});
     const after=(await water()).building?.find(x=>x.buildingId===b.buildingId);const inventory=await stock(client);
     return !!after&&(!after.farm?.productId||after.farm.ripeTime!==b.farm.ripeTime)&&(inventory[b.farm.productId]??0)>(before[b.farm.productId]??0);
    });
   }
   if(on.has('building_6')&&b.buildFinishTime>0&&b.buildFinishTime<=now())await claim(`building-finish:${b.buildingId}:${b.buildFinishTime}`,'建筑完工 '+b.buildingId,async()=>{
    await client.sendWatch('FinishUpgradeBuildingRequest',{buildingId:b.buildingId},{window:1000});const after=(await water()).building?.find(x=>x.buildingId===b.buildingId);
    return !!after&&after.buildFinishTime!==b.buildFinishTime&&after.level>=b.level;
   });
  }log('基地免费领取检查完成');
 }
}
