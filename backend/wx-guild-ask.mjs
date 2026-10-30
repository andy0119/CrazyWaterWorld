import fs from 'node:fs';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runGuildAsk({client,settings:s,act,log,config=tables}){
 if(!s.ref_guild_aid_ask||s.ref_guild_aid_relayLocked)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=t=>Math.floor((t+28800)/86400);
 const parse=t=>{if(typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))return null;const [h,m]=t.split(':').map(Number);return h*60+m;};
 const start=parse(s.ref_guild_aid_askTime_start??'00:00'),end=parse(s.ref_guild_aid_askTime_end??'00:00'),minute=Math.floor(((now()+28800)%86400)/60);
 if(start===null||end===null||start!==end&&!(start<end?minute>=start&&minute<end:minute>=start||minute<end))return;
 const cap=Number(config.GuildParamCfg?.data?.find(x=>x.paramName==='每日求助次数上限')?.paramValue);
 if(!Number.isSafeInteger(cap)||cap<1)return;
 const count=async()=>{
  const counters=(await read('CounterInfoRequest','CounterInfoResponse')).counters;if(!Array.isArray(counters))return null;
  const row=counters.find(x=>x.type==='DAILY_GUILD_AID');if(!row)return 0;
  const n=Number(row.num);if(!Number.isSafeInteger(n)||n<0||n>0&&!(row.updateTime>0))return null;
  return row.updateTime>0&&day(row.updateTime)!==day(now())?0:n;
 };
 const guild=(await read('GuildInfoRequest','GuildInfoResponse')).guild;if(!guild?.guildId)return;
 const used=await count();if(used===null||used>=cap){log('联盟求助：已达每日次数或计数尚未确认');return;}
 const current=(await read('MyGuildAidRequest','MyGuildAidResponse',{type:0})).aids;
 const items=(await read('AllItemRequest','AllItemResponse')).items;
 if(!Array.isArray(current)||!Array.isArray(items))return;
 const allowed=(config.GuildHelpCfg?.data??[]).map(x=>x.id).filter(x=>x&&!['RUBY','GOLD'].includes(x));
 const selected=s.ref_guild_aid_askItems??[];
 if(s.ref_guild_aid_askItemsEnabled&&(!Array.isArray(selected)||!selected.length)){log('联盟求助：指定材料名单为空');return;}
 // Auto mode asks only for an allowed material with zero current stock.
 const candidates=s.ref_guild_aid_askItemsEnabled?selected:allowed.filter(id=>Number(items.find(x=>x.itemId===id)?.num??0)===0);
 const id=candidates.find(id=>allowed.includes(id)&&!current.some(x=>x.reqItemId===id));
 if(!id){log('联盟求助：没有可求助材料，或材料已有求助记录');return;}
 const date=day(now()),oldIds=new Set(current.map(x=>String(x.reqId)));
 const result=await act(`guild-ask:${guild.guildId}:${date}:${used}`,async()=>{
  await client.sendWatch('GuildAidAskRequest',{reqItemId:id,type:0},{window:1000});
  const after=(await read('MyGuildAidRequest','MyGuildAidResponse',{type:0})).aids,afterCount=await count();
  const ok=day(now())===date&&afterCount===used+1&&Array.isArray(after)&&after.some(x=>x.reqItemId===id&&!oldIds.has(String(x.reqId))&&/^[1-9]\d*$/.test(String(x.reqId))&&x.endTime>now());
  return{status:ok?'verified':'unconfirmed',message:ok?`联盟求助 ${id}：新求助记录与每日计数 ${afterCount}/${cap} 已核对`:'联盟求助结果未确认，不自动重送'};
 });
 if(result&&!['verified','rejected'].includes(result.status))throw Error('unconfirmed_guild_ask');
}
