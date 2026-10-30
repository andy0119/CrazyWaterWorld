import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const int=n=>Number.isSafeInteger(n)&&n>=0;
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,24);
const num=(s,key,fallback)=>Number(s[key]??fallback);

export function tradeRefreshWindow(now,hours){
 const local=now+28800,day=Math.floor(local/86400),slots=[];
 for(const d of [day-1,day,day+1])for(const h of hours)slots.push(d*86400+h*3600-28800);
 slots.sort((a,b)=>a-b);
 return{previous:slots.filter(t=>t<=now).at(-1),next:slots.find(t=>t>now)};
}

export async function runTradeEngine({client,settings:s,state,activityState,act,log,history=new Set(),config=tables}){
 if(!s.ref_world_trade_enabled)return;
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=()=>Math.floor((now()+28800)/86400);
 const activity=activityState?.trade,unlock=(config.ModuleOpenCfg?.data??[]).find(x=>x.moduleId==='海商王')?.playerLevel;
 if(!int(unlock)||!int(state.level)||state.level<unlock||!int(activity?.period)||activity.period===0||!(activity.startTime<=now()&&activity.endTime>now())){log('商船贸易：等级未解锁或尚未收到有效开放活动');return;}
 const param=key=>(config.ActivityTradeCfg?.data??[]).find(x=>x.key===key)?.value;
 const range=String(param('海商王贸易时间')??'').split('-').map(Number),hour=((now()+28800)%86400)/3600;
 if(range.length!==2||!range.every(int)||range[0]>=range[1]||range[1]>24)return;
 if(hour<range[0]||hour>=range[1]){log(`商船贸易：等待开放时段 ${range[0]}:00—${range[1]}:00`);return;}
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const detail=()=>read('TradeInfoRequest','TradeInfoResponse');
 const valid=info=>info?.period===activity.period&&info.player&&info.cargo&&int(info.player.coins)&&int(info.player.profit)&&Array.isArray(info.player.goods)&&info.player.goods.every(g=>int(g.pid)&&int(g.goodsId)&&int(g.num)&&int(g.buyPrice)&&g.buyPrice>0&&int(g.cityId))&&int(info.cargo.cargoLv)&&info.cargo.cargoLv>0&&int(info.cargo.cityId)&&int(info.cargo.moveEndTime)&&int(info.cargo.moveStartTime);
 const capacity=info=>{
  let total=0;for(const g of info.player.goods){const c=(config.TradeGoodsCfg?.data??[]).find(x=>x.goodsId===g.goodsId);if(!int(c?.capacity)||c.capacity<=0)return null;total+=c.capacity*g.num;}
  return int(total)?total:null;
 };
 const sameVoyage=(a,b)=>a.moveStartTime===b.moveStartTime&&a.moveToCityId===b.moveToCityId;
 const stocks=async()=>{
  const items=(await read('AllItemRequest','AllItemResponse')).items,res=(await read('AllResourceRequest','AllResourceResponse')).list;
  if(!Array.isArray(items)||!Array.isArray(res))throw Error('unknown_trade_inventory');
  return{items:Number(items.find(x=>x.itemId==='海商王加速')?.num??0),ruby:Number(res.find(x=>x.res===4)?.amount??0)};
 };
 const prefix=`trade:${activity.period}:${activity.startTime}`;
 let info=await detail();if(!valid(info)){log('商船贸易：货币／货舱状态不完整，跳过');return;}
 const ship=(config.TradeShipCfg?.data??[]).find(x=>x.lv===info.cargo.cargoLv),load=capacity(info);
 if(!int(ship?.capacity)||ship.capacity<=0||load===null||load>ship.capacity)return;
 const perform=async(key,fn)=>{
  if(history.has(key))return false;
  history.add(key);
  const result=await act(key,async()=>{
   if(activity.endTime<=now())return{status:'rejected',message:'商船活动已结束，取消本次操作'};
   return fn();
  });
  if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_trade_action');
  return result?.status==='verified';
 };
 // Upgrade is an explicit diamond-spending option, separate from trading coins.
 if(s.ref_world_trade_upgrade){
  const next=(config.TradeShipCfg?.data??[]).find(x=>x.lv===info.cargo.cargoLv+1),cost=next?.upCost;
  if(next&&int(next.upMoney)&&info.player.profit>=next.upMoney&&cost?.[0]==='RUBY'&&int(cost[1])&&cost[1]>0){
   const before=await stocks();
   if(int(before.ruby)&&before.ruby>=cost[1]){
    await perform(`${prefix}:upgrade:${info.cargo.cargoLv}`,async()=>{
     const reply=await read('TradeCargoUpgradeRequest','TradeCargoUpgradeResponse'),afterInfo=await detail(),after=await stocks();
     const ok=valid(afterInfo)&&reply.cargo?.cargoLv===next.lv&&afterInfo.cargo.cargoLv===next.lv&&before.ruby-after.ruby===cost[1];
     return{status:ok?'verified':'unconfirmed',message:ok?`商船升至 ${next.lv} 级：等级与消耗 ${cost[1]} 钻石已核对`:'商船升级结果未确认，暂停商船任务'};
    });return;
   }
  }
 }
 const cargo=info.cargo;
 if(cargo.moveEndTime>now()){
  const mode=s.ref_world_trade_speedUpStages_0_mode??'off',until=num(s,'ref_world_trade_speedUpStages_0_untilProfit',0);
  if(!['off','everyTrip','refresh'].includes(mode)||!int(until)||mode==='off'||until>0&&info.player.profit>=until){log('商船航行中，按设置等待抵达');return;}
  if(s.ref_world_trade_speedUpStages_0_fullOnly&&load<ship.capacity){log('商船加速：未满载，继续正常航行');return;}
  const threshold=num(s,'ref_world_trade_speedUpStages_0_minDiscountPct',5);
  let baseValue=0,buyValue=0;
  for(const g of info.player.goods){const row=config.TradeGoodsCfg.data.find(x=>x.goodsId===g.goodsId);if(!int(row?.unitPrice)||row.unitPrice<=0)return;baseValue+=row.unitPrice*g.num;buyValue+=g.buyPrice*g.num;}
  if(!Number.isFinite(threshold)||threshold<0||threshold>100||baseValue<=0||(baseValue-buyValue)*100/baseValue+1e-9<threshold){log('商船加速：货物买入折扣未达设置门槛');return;}
  const hours=String(param('海商王刷新时间')??'').split(',').map(Number);
  if(!hours.length||hours.some(x=>!int(x)||x>23))return;
  const window=tradeRefreshWindow(now(),hours),beforeMins=num(s,'ref_world_trade_speedUpStages_0_alignBeforeMins',29),afterMins=num(s,'ref_world_trade_speedUpStages_0_afterWithinMins',5),afterTimes=num(s,'ref_world_trade_speedUpStages_0_afterRefreshTimes',0);
  if(![beforeMins,afterMins,afterTimes].every(int))return;
  let phase='trip',slot=0;
  if(mode==='refresh'){
   const pre=window.next-now()<=beforeMins*60,post=now()-window.previous<=afterMins*60;
   if(pre&&beforeMins>0){phase='before';slot=window.next;}
   else if(post&&afterMins>0&&afterTimes>0){phase='after';slot=window.previous;}
   else{log('商船加速：等待设置的货架刷新窗口');return;}
   if(phase==='after'&&[...history].filter(k=>k.startsWith(`${prefix}:speed:${day()}:${slot}:after:`)).length>=afterTimes){log('商船加速：已达本次刷新后的执行次数');return;}
  }
  const voyage=`${cargo.moveStartTime}:${cargo.cityId}:${cargo.moveToCityId}`;
  if([...history].some(k=>k.startsWith(`${prefix}:speed:`)&&k.split(':').slice(-4,-1).join(':')===voyage))return;
  const limit=num(s,'ref_world_trade_speedUpDailyLimit',100),perTrip=num(s,'ref_world_trade_speedUpStages_0_itemsPerTrip',4),step=Number(param('海商王加速时长'))*60,maxSeconds=Number(param('海商王行驶时间'))*60;
  if(![limit,perTrip,step,maxSeconds].every(int)||perTrip===0||step===0||maxSeconds<step)return;
  const dailyPrefix=`${prefix}:speed:${day()}:`,used=[...history].filter(k=>k.startsWith(dailyPrefix)).reduce((n,k)=>n+Number(k.split(':').at(-1)||0),0);
  if(!int(used))return;
  const amount=Math.min(perTrip,Math.ceil((cargo.moveEndTime-now())/step),Math.floor(maxSeconds/step),limit>0?Math.max(0,limit-used):Infinity);
  if(!int(amount)||amount<=0){log('商船加速：已达每日上限');return;}
  const before=await stocks();if(!int(before.items)||!int(before.ruby))return;
  if(before.items<amount){
   if(!s.ref_world_trade_speedUpStages_0_buySpeedItem){log('商船加速道具不足，继续正常航行');return;}
   const price=(config.ItemPriceCfg?.data??[]).find(x=>x.itemId==='海商王加速')?.rubyPrice,cap=Number(param('海商王加速日购买上限')),bought=info.player.buySpeedTimes;
   const shortage=amount-before.items;
   if(!int(price)||price<=0||!int(cap)||!int(bought)||bought+shortage>cap||before.ruby<shortage*price){log('商船加速道具购买：钻石不足或已达游戏每日购买上限');return;}
   await perform(`${prefix}:speedbuy:${day()}:${bought}:${shortage}`,async()=>{
    const reply=await read('TradeBuySpeedItemRequest','TradeBuySpeedItemResponse',{buyNum:shortage}),fresh=await detail(),after=await stocks();
    const ok=valid(fresh)&&reply.buySpeedTimes===bought+shortage&&fresh.player.buySpeedTimes===reply.buySpeedTimes&&after.items-before.items===shortage&&before.ruby-after.ruby===shortage*price;
    return{status:ok?'verified':'unconfirmed',message:ok?`商会指针购买 ${shortage} 个：道具、每日购买计数与 ${shortage*price} 钻石已核对`:'商会指针购买未确认，暂停商船任务'};
   });return;
  }
  await perform(`${dailyPrefix}${slot}:${phase}:${voyage}:${amount}`,async()=>{
   const reply=await read('TradeSpeedRequest','TradeSpeedResponse',{useNum:amount}),fresh=await detail(),after=await stocks(),expected=cargo.moveEndTime-amount*step;
   const arrived=expected<=now()&&fresh.cargo?.cityId===cargo.moveToCityId&&fresh.cargo.moveEndTime<=now()&&reply.moveEndTime<=now();
   const moving=expected>now()&&sameVoyage(cargo,fresh.cargo??{})&&fresh.cargo.moveEndTime===expected&&reply.moveEndTime===expected;
   const ok=valid(fresh)&&before.items-after.items===amount&&(arrived||moving);
   return{status:ok?'verified':'unconfirmed',message:ok?`商船加速 ${amount} 个指针：道具扣除与抵达时间已核对`:'商船加速结果未确认，暂停商船任务'};
  });return;
 }
 const delayMins=num(s,'ref_world_trade_firstTripDelayMins',0);if(!int(delayMins))return;
 const originPrefix=`${prefix}:origin:`,originKey=[...history].find(k=>k.startsWith(originPrefix));
 if(!originKey){await perform(originPrefix+now(),async()=>({status:'verified',message:`商船自动贸易初始化，首航延迟 ${delayMins} 分钟`}));return;}
 const firstSeen=Number(originKey.slice(originPrefix.length));if(!int(firstSeen)||now()<firstSeen+delayMins*60){log('商船贸易：等待设置的首航延迟');return;}
 const market=await read('TradeCityRequest','TradeCityResponse',{cityId:cargo.cityId});
 if(!Array.isArray(market.goods)||market.goods.some(x=>!int(x.goodsId)||!int(x.price)||x.price<=0||!int(x.stock)))return;
 const refreshHours=String(param('海商王刷新时间')??'').split(',').map(Number);
 if(!refreshHours.length||refreshHours.some(x=>!int(x)||x>23))return;
 const slot=tradeRefreshWindow(now(),refreshHours).previous;
 if(market.isReport===false){
  await perform(`${prefix}:report:${slot}:${cargo.cityId}`,async()=>{
   await client.sendWatch('TradeCityReportRequest',{cityId:cargo.cityId},{window:1000});
   const after=await read('TradeCityRequest','TradeCityResponse',{cityId:cargo.cityId});
   const ok=after.isReport===true;
   return{status:ok?'verified':'unconfirmed',message:ok?`商船城市 ${cargo.cityId}：行情情报已上报并读回`:'商船情报上报未确认，暂停商船任务'};
  });return;
 }
 for(const g of info.player.goods){
  const quote=market.goods.find(x=>x.goodsId===g.goodsId);
  if(!quote||g.cityId===cargo.cityId||g.num<=0||quote.price<=g.buyPrice||!int(ship.profitMargin))continue;
  const profit=Math.ceil((quote.price-g.buyPrice)*g.num*(1+ship.profitMargin/10000)),income=g.buyPrice*g.num+profit;
  if(!int(profit)||!int(income))continue;
  await perform(`${prefix}:sell:${slot}:${digest([info.player,cargo,g.pid,quote.price])}`,async()=>{
   const reply=await read('TradeSellRequest','TradeSellResponse',{cityId:cargo.cityId,pid:g.pid,sellNum:g.num}),fresh=await detail();
   const ok=valid(fresh)&&!fresh.player.goods.some(x=>x.pid===g.pid&&x.num>0)&&fresh.player.coins-info.player.coins===income&&fresh.player.profit-info.player.profit===profit&&!!reply.player&&digest(reply.player)===digest(fresh.player);
   return{status:ok?'verified':'unconfirmed',message:ok?`商船出售 ${g.goodsId} ×${g.num}：利润 ${profit}、货物与余额已核对`:'商船卖出结果未确认，暂停商船任务'};
  });return;
 }
 const affordable=market.goods.map(q=>({q,c:(config.TradeGoodsCfg?.data??[]).find(x=>x.goodsId===q.goodsId)})).filter(({q,c})=>c&&int(c.capacity)&&c.capacity>0&&int(c.maxCount)&&c.maxCount>q.stock&&int(c.unitPrice)&&q.price<c.unitPrice).sort((a,b)=>a.q.price/a.c.unitPrice-b.q.price/b.c.unitPrice);
 for(const {q,c}of affordable){
  const amount=Math.min(Math.floor((ship.capacity-load)/c.capacity),Math.floor(info.player.coins/q.price),c.maxCount-q.stock);if(!int(amount)||amount<=0)continue;
  const existing=info.player.goods.filter(g=>g.goodsId===q.goodsId).reduce((n,g)=>n+g.num,0);
  await perform(`${prefix}:buy:${slot}:${digest([info.player,cargo,q])}`,async()=>{
   const reply=await read('TradeBuyRequest','TradeBuyResponse',{cityId:cargo.cityId,goodsId:q.goodsId,buyNum:amount}),fresh=await detail();
   const count=fresh.player?.goods?.filter(g=>g.goodsId===q.goodsId).reduce((n,g)=>n+g.num,0);
   const ok=valid(fresh)&&count-existing===amount&&info.player.coins-fresh.player.coins===q.price*amount&&capacity(fresh)<=ship.capacity&&!!reply.player&&digest(reply.player)===digest(fresh.player);
   return{status:ok?'verified':'unconfirmed',message:ok?`商船买入 ${q.goodsId} ×${amount}：折扣 ${(100*(1-q.price/c.unitPrice)).toFixed(1)}%、货舱与贸易币已核对`:'商船买入结果未确认，暂停商船任务'};
  });return;
 }
 if(load<=0){log('商船贸易：无低于基准价的可买商品，等待行情刷新');return;}
 const shared=await read('TradeGuildRadarRequest','TradeGuildRadarResponse');
 const cities=[...new Set((shared.radar??[]).map(x=>x.cityId).filter(x=>int(x)&&x>0&&x!==cargo.cityId))].sort((a,b)=>a-b);
 if(!cities.length){log('商船贸易：尚无服务器提供的其他港口，暂不出航');return;}
 const last=[...history].filter(k=>k.startsWith(`${prefix}:move:`)).at(-1),lastFrom=last?Number(last.split(':').at(-3)):null;
 const destination=cities.find(x=>x!==lastFrom)??cities[0];
 await perform(`${prefix}:move:${cargo.moveStartTime}:${digest(info.player)}:${cargo.cityId}:${destination}:depart`,async()=>{
  const reply=await read('TradeMoveRequest','TradeMoveResponse',{cityId:cargo.cityId,mvToCityId:destination}),fresh=await detail();
  const ok=valid(fresh)&&reply.cargo?.moveToCityId===destination&&fresh.cargo.moveToCityId===destination&&fresh.cargo.moveEndTime>now()&&reply.cargo.moveEndTime===fresh.cargo.moveEndTime&&digest(fresh.player)===digest(info.player);
  return{status:ok?'verified':'unconfirmed',message:ok?`商船驶往城市 ${destination}：目的地与航行状态已核对，抵达后继续贸易`:'商船出航未确认，暂停商船任务'};
 });
}

export async function runTradeGuarded({run,client,paused,log}){
 if(paused.has('trade'))return;
 try{await run();}catch(error){
  if(!/^unconfirmed_trade_(action|reward|task)$/.test(error.message)||client?.connected===false)throw error;
  paused.add('trade');log('商船操作尚未确认，本次运行暂停商船派单；其他任务继续。请核对贸易状态后重新开始。');
 }
}
