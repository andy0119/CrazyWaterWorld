import {normalize} from './wx-game/worlds.mjs';
export async function runGuildClaims({client,settings:s,act,log}){
 const packs=s.ref_guild_packs_guild||s.ref_shop_enabled&&s.ref_shop_guild;
 if(!packs&&!s.ref_guild_aid_receive)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const stock=async()=>{
  const i=await read('AllItemRequest','AllItemResponse'),r=await read('AllResourceRequest','AllResourceResponse');
  const out=Object.fromEntries((i.items??[]).map(x=>[x.itemId,Number(x.num)]));
  for(const x of r.list??[]){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}
  return out;
 };
 const info=await read('GuildInfoRequest','GuildInfoResponse');
 if(!info.guild){log('当前角色尚未加入联盟，跳过联盟领取');return;}
 if(packs){
  const available=(info.guild.welfarePack??[]).filter(x=>x.createTime>info.guild.gotWelfareTime);
  if(available.length){
   const before=await stock(),latest=Math.max(...available.map(x=>x.createTime));
   const result=await act(`guild-packs:${info.guild.guildId}:${info.guild.gotWelfareTime}:${latest}`,async()=>{
    const reply=await read('GotGuildWelfarePackRequest','GotGuildWelfarePackResponse');
    const current=(await read('GuildInfoRequest','GuildInfoResponse')).guild,after=await stock(),assets={};
    for(const a of reply.reward?.asset??[])if(a.id&&Number(a.num)>0)assets[a.id]=(assets[a.id]??0)+Number(a.num);
    const verified=String(current?.guildId)===String(info.guild.guildId)&&current.gotWelfareTime>=latest&&reply.lastGotTime>=latest&&Object.keys(assets).length>0&&Object.entries(assets).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
    return {status:verified?'verified':'unconfirmed',message:verified?'联盟礼包：已核对领取时间与奖励入库':'联盟礼包结果未确认，停止本轮'};
   });
   if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_guild_packs');
  }
 }
 if(s.ref_guild_aid_receive){
  const aids=(await read('MyGuildAidRequest','MyGuildAidResponse',{type:0})).aids??[],ready=aids.filter(x=>x.helper&&x.reqItemId);
  if(!ready.length)return;
  const before=await stock();
  const result=await act(`guild-aid-receive:${ready.map(x=>x.reqId).sort().join('|')}`,async()=>{
   await client.sendWatch('GotMyGuildAidRequest',{type:0},{window:1000});
   const current=(await read('MyGuildAidRequest','MyGuildAidResponse',{type:0})).aids??[],after=await stock();
   const required={};for(const x of ready)required[x.reqItemId]=(required[x.reqItemId]??0)+1;
   const verified=ready.every(x=>!current.some(y=>String(y.reqId)===String(x.reqId)))&&Object.entries(required).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   return {status:verified?'verified':'unconfirmed',message:verified?'联盟援助：已核对领取记录与材料增加':'联盟援助领取结果未确认，停止本轮'};
  });
  if(result&&result.status!=='verified')throw Error('unconfirmed_guild_aid');
 }
}
