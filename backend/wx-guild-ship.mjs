import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./guild-ship-tables.json',import.meta.url),'utf8'));
export async function runGuildShip({client,protocol,settings:s,roleId,act,log,paused=new Set(),config=defaults,state={},sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!s.ref_guild_ship_enabled||paused.has('guild-ship'))return;
 state.guildShipNeeds=[];
 if(s.ref_guild_ship_mode==='fixed_red'){log('联盟商船：固定时刻开红船仍需核对调度规则，本轮不猜测出船时机');return;}
 if(!/^\d+$/.test(String(roleId))||String(roleId)==='0')return;
 const read=async(req,res)=>normalize(await client.request(req,{},res,8000)),now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(a=>[a.itemId,Number(a.num)]));
 const isMe=p=>p&&String(p.playerId)===String(roleId),occupied=p=>p&&String(p.playerId??0)!=='0';
 const mine=info=>new Set([...(info.ownRun??[]).filter(x=>!x.mvEndTime||x.mvEndTime>now()),...(info.ship??[]).filter(x=>isMe(x.leader)||(x.cabin??[]).some(c=>isMe(c.player)))].map(x=>x.shipId));
 const costs=cabin=>{const result={};if(!cabin.order?.length)return null;for(const a of cabin.order){const n=Number(a.num);if(!a.id||['GOLD','RUBY'].includes(a.id)||!Number.isSafeInteger(n)||n<=0||(s.ref_guild_ship_forbiddenMaterials??[]).includes(a.id))return null;result[a.id]=(result[a.id]??0)+n;if(!Number.isSafeInteger(result[a.id]))return null;}return result;};
 const rewardOk=ship=>{const quality=config.ships.find(x=>x.shipId===ship.type)?.quality;if(!quality)return false;const assets=ship.reward?.asset??[];const min=Number(s['ref_guild_ship_minWaterCoin'+{RED:'Red',ORANGE:'Orange',PURPLE:'Purple'}[quality]])||0;const water=assets.filter(a=>a.id==='水姆币').reduce((n,a)=>n+Number(a.num),0);if(!Number.isFinite(water)||water<min)return false;const wanted=s.ref_guild_ship_rewardItems??[];return !wanted.length||assets.some(a=>wanted.includes(a.id)&&Number(a.num)>0);};
 const quality=ship=>config.ships.find(x=>x.shipId===ship.type)?.quality;
 let redOnly=s.ref_guild_ship_mode==='detect_red';
 const shipOk=ship=>ship.state===protocol.GuildShipState.GS_STATE_PREPARED&&occupied(ship.leader)&&ship.preparedEndTime>now()+3&&(!redOnly||quality(ship)==='RED')&&rewardOk(ship);
 try{
 let info=await read('GuildShipRequest','GuildShipResponse');if(!(info.period>0)){log('联盟商船：服务器未开放活动');return;}
 let joined=0;const max=config.maxShips;if(!Number.isSafeInteger(max)||max<1)return;
 if(state.guildShipPeriod!==info.period){state.guildShipPeriod=info.period;state.guildShipWaitStarted=now();}
 if(redOnly&&s.ref_guild_ship_fallbackEnabled===true&&now()-state.guildShipWaitStarted>=Math.max(0,Number(s.ref_guild_ship_fallbackWaitMinutes)||0)*60)redOnly=false;
 if(s.ref_guild_ship_captain===true){
  const selected=s.ref_guild_ship_captainQualities??[],labels={PURPLE:'史诗',ORANGE:'传说',RED:'超凡'};
  if(!selected.length)log('联盟商船船长：尚未选择船只品质，不自动占位');
  else{
   const heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes??[];
   for(const ship of [...(info.ship??[])].sort((a,b)=>b.type-a.type)){
    if(mine(info).size>=max)break;
    if(ship.state!==protocol.GuildShipState.GS_STATE_PREPARED||occupied(ship.leader)||mine(info).has(ship.shipId)||!selected.includes(labels[quality(ship)])||(redOnly&&quality(ship)!=='RED')||!rewardOk(ship))continue;
    const conditions=ship.leaderCond;if(!Array.isArray(conditions)||!conditions.length||!conditions.every(c=>{const h=heroes.find(x=>x.heroId===c.heroId);return h&&Number.isSafeInteger(h.star)&&Number.isSafeInteger(c.star)&&Number.isSafeInteger(Number(c.exStar??0))&&h.star+Number(h.exclusive?.star??0)>=c.star+Number(c.exStar??0);}))continue;
    const result=await act(`guild-ship-captain:${info.period}:${ship.shipId}`,async()=>{
     const fresh=await read('GuildShipRequest','GuildShipResponse'),current=fresh.ship?.find(x=>x.shipId===ship.shipId);
     if(fresh.period!==info.period||mine(fresh).size>=max||!current||occupied(current.leader)||JSON.stringify(current.leaderCond)!==JSON.stringify(conditions))return{status:'rejected',message:'联盟商船船长位置或资格条件已变化，取消占位'};
     await client.sendWatch('GuildShipSeekRequest',{shipId:ship.shipId},{window:1000});let verified=false;
     for(const wait of [0,400,800]){if(wait)await sleep(wait);info=await read('GuildShipRequest','GuildShipResponse');verified=info.period===fresh.period&&[...(info.ship??[]),...(info.ownRun??[])].some(x=>x.shipId===ship.shipId&&isMe(x.leader));if(verified)break;}
     return{status:verified?'verified':'unconfirmed',message:verified?`联盟商船 ${ship.shipId}：已确认船长身分与英雄资格`:'联盟商船船长身分未确认，仅暂停商船，不重复占位'};
    });
    if(result?.status==='unconfirmed'){paused.add('guild-ship');return;}
   }
  }
 }

 for(let n=0;n<max;n++){
  const own=mine(info);if(own.size>=max){log('联盟商船：已达同时登船上限 '+max);break;}
  const inventory=await stock();let candidate;
  for(const ship of [...(info.ship??[])].filter(shipOk).sort((a,b)=>b.type-a.type)){
   if(own.has(ship.shipId)||!Number.isSafeInteger(ship.shipId)||ship.shipId<=0)continue;
   for(const cabin of ship.cabin??[]){if(occupied(cabin.player)||!Number.isSafeInteger(cabin.crewId)||cabin.crewId<=0)continue;const cost=costs(cabin);if(cost&&Object.entries(cost).every(([id,num])=>Number.isSafeInteger(inventory[id]??0)&&(inventory[id]??0)>=num)){candidate={ship,cabin,cost};break;}}if(candidate)break;
  }
  if(!candidate){
   const plans=[];for(const ship of (info.ship??[]).filter(shipOk)){if(own.has(ship.shipId))continue;for(const cabin of ship.cabin??[]){if(occupied(cabin.player))continue;const cost=costs(cabin);if(cost)plans.push({cost,missing:Object.entries(cost).reduce((n,[id,num])=>n+Math.max(0,num-(inventory[id]??0)),0)});}}
   const best=plans.sort((a,b)=>a.missing-b.missing)[0];if(best){state.guildShipNeeds=Object.entries(best.cost).map(([id,num])=>({id,num}));log('联盟商船缺料，加入生产需求：'+state.guildShipNeeds.filter(a=>(inventory[a.id]??0)<a.num).map(a=>`${a.id} 缺 ${a.num-(inventory[a.id]??0)}`).join('、'));}
   log(redOnly?'联盟商船：等待符合条件的红船／空舱，候补依设置等待':'联盟商船：无符合奖励门槛、空舱位、库存与禁用材料的可登船项目');break;
  }
  const {ship,cabin,cost}=candidate;
  const result=await act(`guild-ship-crew:${info.period}:${ship.shipId}:${ship.preparedEndTime}:${cabin.crewId}`,async()=>{
   const fresh=await read('GuildShipRequest','GuildShipResponse');const current=fresh.ship?.find(x=>x.shipId===ship.shipId),seat=current?.cabin?.find(x=>x.crewId===cabin.crewId);const before=await stock();
   if(fresh.period!==info.period||mine(fresh).size>=max||mine(fresh).has(ship.shipId)||!current||!shipOk(current)||!seat||occupied(seat.player)||JSON.stringify(costs(seat))!==JSON.stringify(cost)||Object.entries(cost).some(([id,num])=>(before[id]??0)<num))return{status:'rejected',message:'联盟商船状态或材料已变化，取消本次装货'};
   await client.sendWatch('GuildShipOrderRequest',{shipId:ship.shipId,crewId:cabin.crewId},{window:1000});
   let verified=false;
   for(const wait of [0,400,800]){
    if(wait)await sleep(wait);const after=await read('GuildShipRequest','GuildShipResponse'),inventory=await stock();const onboard=[...(after.ship??[]),...(after.ownRun??[])].some(x=>x.shipId===ship.shipId&&(x.cabin??[]).some(c=>c.crewId===cabin.crewId&&isMe(c.player)));
    verified=onboard&&Object.entries(cost).every(([id,num])=>(before[id]??0)-(inventory[id]??0)===num);info=after;if(verified)break;
   }
   return{status:verified?'verified':'unconfirmed',message:verified?`联盟商船 ${ship.shipId} 船舱 ${cabin.crewId}：已核对登船身分与材料扣除，航程奖励另行发放`:'联盟商船装货结果未确认，仅暂停商船，不自动重送'};
  });
  if(!result)break;if(result.status==='unconfirmed'){paused.add('guild-ship');break;}if(result.status==='rejected')break;joined++;
 }
 if(joined)log('联盟商船：本轮确认登船 '+joined+' 艘');
 }catch(e){if(client.connected===false)throw e;log('联盟商船：读取或操作未确认，本次暂停商船，其他任务继续');paused.add('guild-ship');}
}
