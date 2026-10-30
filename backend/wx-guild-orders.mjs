import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runGuildOrders({client,settings:s,state,act,log,config=tables}){
 if(!s.ref_guild_order_enabled||!Number.isFinite(state.level))return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=t=>new Date((t+28800)*1000).toISOString().slice(0,10);
 const count=async()=>{
  const counters=(await read('CounterInfoRequest','CounterInfoResponse')).counters;
  if(!Array.isArray(counters))return null;
  const row=counters.find(x=>x.type==='DAILY_FINISH_GUILD_ORDER');if(!row)return 0;
  if(!Number.isSafeInteger(Number(row.num))||row.num<0)return null;
  if(row.num>0&&!(row.updateTime>0))return null;
  return row.updateTime>0&&day(row.updateTime)!==day(now())?0:Number(row.num);
 };
 const guild=(await read('GuildInfoRequest','GuildInfoResponse')).guild;if(!guild)return;
 const allowed=s.ref_guild_order_cityIds??[],cities=(await read('GuildCityInfoRequest','GuildCityInfoResponse')).cities??[];
 const city=cities.find(x=>Number.isSafeInteger(x.cityId)&&x.cityId>0&&(!allowed.length||allowed.includes(String(x.cityId))));if(!city)return;
 const knownSeason=Number.isSafeInteger(state.season)&&state.season>0;
 const levels=(config.GuildOrderNumCfg?.data??[]).filter(x=>x.playerLevel<=state.level&&(!knownSeason||x.season===state.season));
 // Until the active season is exposed by the caller, respect the strictest
 // currently applicable season limit instead of assuming unlimited donations.
 const perSeason=new Map();for(const row of levels){const old=perSeason.get(row.season);if(!old||row.playerLevel>old.playerLevel)perSeason.set(row.season,row);}
 const serverLimits=[...perSeason.values()].map(x=>x.maxNum).filter(x=>x>=0);
 const saved=Math.max(0,Math.floor(Number(s.ref_guild_order_dailyLimit)||0));
 const cap=Math.min(saved||Infinity,...serverLimits);
 for(let iteration=0;iteration<3;iteration++){
  const used=await count();if(used===null){log('联盟订单：每日计数尚未确认');return;}
  if(used>=cap){log('联盟订单已达到设置或保守赛季上限');return;}
  const order=(await read('GuildOrderRequest','GuildOrderResponse')).order;
  if(!order||order.nextRefreshTime<=now()||!order.requirements?.length)return;
  const costs={};
  if(order.requirements.some(x=>!x.id||['GOLD','RUBY'].includes(x.id)||!Number.isSafeInteger(Number(x.num))||Number(x.num)<=0))return;
  for(const x of order.requirements)costs[x.id]=(costs[x.id]??0)+Number(x.num);
  const inventory=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
  const before=await inventory();if(Object.entries(costs).some(([id,n])=>(before[id]??0)<n))return;
  const result=await act(`guild-order:${day(now())}:${guild.guildId}:${city.cityId}:${used}:${order.nextRefreshTime}`,async()=>{
   const reply=await read('FinishGuildOrderRequest','FinishGuildOrderResponse',{cityId:city.cityId});
   const current=await count(),after=await inventory();
   const verified=!!reply.reward&&current===used+1&&Object.entries(costs).every(([id,n])=>(before[id]??0)-(after[id]??0)===n);
   return {status:verified?'verified':'unconfirmed',message:verified?`联盟订单城市 ${city.cityId}：已核对材料与每日完成计数 ${current}`:'联盟订单结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_guild_order');
 }
}
