import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runGuildTitle({client,settings:s,act,log,config=tables}){
 if(!s.ref_guild_packs_title)return;
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const day=t=>Math.floor((t+28800)/86400);
 const info=await read('GuildInfoRequest','GuildInfoResponse');
 if(!info.guild||!Number.isSafeInteger(info.gotTitle)||!Number.isSafeInteger(info.gotTitleTime)||info.gotTitleTime<0||day(info.gotTitleTime)>=day(now()))return;
 const rewards=(config.GuildDailyRewardCfg?.data??[]).find(x=>x.title===info.gotTitle)?.reward;
 if(!rewards?.length||rewards.some(x=>!x[0]||!Number.isSafeInteger(x[1])||x[1]<=0||['GOLD','RUBY','EXP'].includes(x[0])))return;
 const inventory=async()=>{const items=(await read('AllItemRequest','AllItemResponse')).items;if(!Array.isArray(items))throw Error('unknown_guild_title_inventory');return Object.fromEntries(items.map(x=>[x.itemId,Number(x.num)]));};
 const before=await inventory(),claimDay=day(now());
 const result=await act(`guild-title:${info.guild.guildId}:${claimDay}`,async()=>{
  if(day(now())!==claimDay)return{status:'rejected',message:'已跨日，下一轮重新检查称号礼包'};
  await client.sendWatch('GotGuildTitleRewardRequest',{}, {window:1000});
  const current=await read('GuildInfoRequest','GuildInfoResponse'),after=await inventory(),assets={};
  for(const[id,n]of rewards)assets[id]=(assets[id]??0)+n;
  const ok=String(current.guild?.guildId)===String(info.guild.guildId)&&current.gotTitle===info.gotTitle&&current.gotTitleTime>info.gotTitleTime&&day(current.gotTitleTime)===claimDay&&Object.entries(assets).every(([id,n])=>Number.isSafeInteger(before[id]??0)&&Number.isSafeInteger(after[id]??0)&&(after[id]??0)-(before[id]??0)>=n);
  return{status:ok?'verified':'unconfirmed',message:ok?'联盟称号礼包：领取日期与奖励入库已核对':'联盟称号礼包未确认，停止本轮'};
 });
 if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_guild_title');
}
