import {normalize} from './wx-game/worlds.mjs';
export async function runGuildHelp({client,settings:s,act,log,history=new Set()}){
 if(!s.ref_guild_aid_help)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const prefix='guild-help:'+new Date((now()+28800)*1000).toISOString().slice(0,10)+':';
 const cap=Math.max(0,Math.floor(Number(s.ref_guild_aid_helpDailyLimit)||0));
 const reserve=Math.max(0,Number(s.ref_guild_aid_helpMinStock)||0),allowed=s.ref_guild_aid_helpItems??[];
 const keywords=(s.ref_guild_aid_helpNicknameKeywords??[]).map(x=>x.toLocaleLowerCase());
 let used=[...history].filter(x=>x.startsWith(prefix)).length;
 if(cap&&used>=cap){log('联盟互助：已达每日帮助上限（含待确认操作）');return;}
 const guild=(await read('GuildInfoRequest','GuildInfoResponse')).guild;
 if(!guild)return;
 const list=(await read('GuildAidListRequest','GuildAidListResponse',{type:0})).askItems??[];
 const amount=async id=>Number(((await read('AllItemRequest','AllItemResponse')).items??[]).find(x=>x.itemId===id)?.num??0);
 let count=0;
 for(const item of list){
  if(cap&&used>=cap)break;
  if(!item.reqItemId||!item.asker||!Number.isFinite(item.endTime)||item.endTime<now())continue;
  if(['GOLD','RUBY'].includes(item.reqItemId)||allowed.length&&!allowed.includes(item.reqItemId))continue;
  if(keywords.length&&!keywords.some(x=>String(item.asker.nickname??'').toLocaleLowerCase().includes(x)))continue;
  const before=await amount(item.reqItemId);if(!Number.isFinite(before)||before-1<reserve)continue;
  const key=prefix+`${guild.guildId}:${item.reqId}`;
  if(history.has(key))continue;history.add(key);used++;
  const result=await act(key,async()=>{
   await client.sendWatch('GuildAidHelpRequest',{reqId:[item.reqId],type:0},{window:1000});
   const current=(await read('GuildAidListRequest','GuildAidListResponse',{type:0})).askItems??[];
   const verified=!current.some(x=>String(x.reqId)===String(item.reqId))&&before-(await amount(item.reqItemId))===1;
   return {status:verified?'verified':'unconfirmed',message:verified?`联盟互助：已帮助 ${item.asker.nickname??''}，核对 ${item.reqItemId} 消耗；今日 ${used}${cap?'/'+cap:''}`:'联盟互助结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_guild_help');
  if(++count>=5)return;
 }
}
