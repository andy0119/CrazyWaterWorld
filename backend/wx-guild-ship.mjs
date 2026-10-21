import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./guild-ship-tables.json',import.meta.url),'utf8'));
export async function runGuildShip({client,protocol,settings:s,roleId,act,log,paused=new Set(),config=defaults}){
 if(!s.ref_guild_ship_enabled||paused.has('guild-ship'))return;
 if(s.ref_guild_ship_mode&&s.ref_guild_ship_mode!=='small_medium'){log('联盟商船：固定红船与侦测模式尚未接通，暂停本轮登船');return;}
 if(!/^\d+$/.test(String(roleId))||String(roleId)==='0')return;
 const read=async(req,res)=>normalize(await client.request(req,{},res,8000)),now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(a=>[a.itemId,Number(a.num)]));
 const isMe=p=>p&&String(p.playerId)===String(roleId),occupied=p=>p&&String(p.playerId??0)!=='0';
 const mine=info=>new Set([...(info.ownRun??[]).filter(x=>!x.mvEndTime||x.mvEndTime>now()),...(info.ship??[]).filter(x=>isMe(x.leader)||(x.cabin??[]).some(c=>isMe(c.player)))].map(x=>x.shipId));
 const costs=cabin=>{const result={};if(!cabin.order?.length)return null;for(const a of cabin.order){const n=Number(a.num);if(!a.id||['GOLD','RUBY'].includes(a.id)||!Number.isSafeInteger(n)||n<=0||(s.ref_guild_ship_forbiddenMaterials??[]).includes(a.id))return null;result[a.id]=(result[a.id]??0)+n;if(!Number.isSafeInteger(result[a.id]))return null;}return result;};
 const shipOk=ship=>{if(ship.state!==protocol.GuildShipState.GS_STATE_PREPARED||!occupied(ship.leader)||!(ship.preparedEndTime>now()+3))return false;const quality=config.ships.find(x=>x.shipId===ship.type)?.quality;if(!quality)return false;const assets=ship.reward?.asset??[];const min=Number(s['ref_guild_ship_minWaterCoin'+{RED:'Red',ORANGE:'Orange',PURPLE:'Purple'}[quality]])||0;const water=assets.filter(a=>a.id==='水姆币').reduce((n,a)=>n+Number(a.num),0);if(!Number.isFinite(water)||water<min)return false;const wanted=s.ref_guild_ship_rewardItems??[];return !wanted.length||assets.some(a=>wanted.includes(a.id)&&Number(a.num)>0);};
 try{
 let info=await read('GuildShipRequest','GuildShipResponse');if(!(info.period>0)){log('联盟商船：服务器未开放活动');return;}
 let joined=0;const max=config.maxShips;if(!Number.isSafeInteger(max)||max<1)return;
 for(let n=0;n<max;n++){
  const own=mine(info);if(own.size>=max){log('联盟商船：已达同时登船上限 '+max);break;}
  const inventory=await stock();let candidate;
  for(const ship of [...(info.ship??[])].filter(shipOk).sort((a,b)=>b.type-a.type)){
   if(own.has(ship.shipId)||!Number.isSafeInteger(ship.shipId)||ship.shipId<=0)continue;
   for(const cabin of ship.cabin??[]){if(occupied(cabin.player)||!Number.isSafeInteger(cabin.crewId)||cabin.crewId<=0)continue;const cost=costs(cabin);if(cost&&Object.entries(cost).every(([id,num])=>Number.isSafeInteger(inventory[id]??0)&&(inventory[id]??0)>=num)){candidate={ship,cabin,cost};break;}}if(candidate)break;
  }
  if(!candidate){log('联盟商船：无符合奖励门槛、空舱位、库存与禁用材料的可登船项目');break;}
  const {ship,cabin,cost}=candidate;
  const result=await act(`guild-ship-crew:${info.period}:${ship.shipId}:${ship.preparedEndTime}:${cabin.crewId}`,async()=>{
   const fresh=await read('GuildShipRequest','GuildShipResponse');const current=fresh.ship?.find(x=>x.shipId===ship.shipId),seat=current?.cabin?.find(x=>x.crewId===cabin.crewId);const before=await stock();
   if(fresh.period!==info.period||mine(fresh).size>=max||mine(fresh).has(ship.shipId)||!current||!shipOk(current)||!seat||occupied(seat.player)||JSON.stringify(costs(seat))!==JSON.stringify(cost)||Object.entries(cost).some(([id,num])=>(before[id]??0)<num))return{status:'rejected',message:'联盟商船状态或材料已变化，取消本次装货'};
   await client.sendWatch('GuildShipOrderRequest',{shipId:ship.shipId,crewId:cabin.crewId},{window:1000});
   const after=await read('GuildShipRequest','GuildShipResponse'),inventory=await stock();const joined=[...(after.ship??[]),...(after.ownRun??[])].some(x=>x.shipId===ship.shipId&&(x.cabin??[]).some(c=>c.crewId===cabin.crewId&&isMe(c.player)));
   const verified=joined&&Object.entries(cost).every(([id,num])=>(before[id]??0)-(inventory[id]??0)===num);
   info=after;return{status:verified?'verified':'unconfirmed',message:verified?`联盟商船 ${ship.shipId} 船舱 ${cabin.crewId}：已核对登船身分与材料扣除，航程奖励另行发放`:'联盟商船装货结果未确认，仅暂停商船，不自动重送'};
  });
  if(!result)break;if(result.status==='unconfirmed'){paused.add('guild-ship');break;}if(result.status==='rejected')break;joined++;
 }
 if(joined)log('联盟商船：本轮确认登船 '+joined+' 艘');
 }catch{log('联盟商船：读取或操作未确认，本次暂停商船，其他任务继续');paused.add('guild-ship');}
}
