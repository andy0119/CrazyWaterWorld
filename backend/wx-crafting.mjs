import fs from 'node:fs';
import {createHash}from'node:crypto';
import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const universalDefaults=JSON.parse(fs.readFileSync(new URL('./crafting-universal.json',import.meta.url),'utf8'));
const quality=value=>({BLUE:1,PURPLE:2,ORANGE:3,RED:4,'稀有':1,'史诗':2,'传说':3,'超凡':4}[String(value)]??0);
const type=value=>({武器:'枪械',饰品:'兵刃'}[value]??value);
export function craftingPayment(cost,inventory,{allowed=false,universalId=null}={}){
 if(!Array.isArray(cost)||!cost.length||cost.some(x=>!Array.isArray(x)||x.length!==2||!x[0]||x[0]==='RUBY'||!Number.isSafeInteger(Number(x[1]))||Number(x[1])<=0))return null;
 const sum={};for(const[id,n]of cost)sum[id]=(sum[id]??0)+Number(n);
 if(Object.keys(sum).some(id=>!Number.isSafeInteger(inventory[id]??0)||(inventory[id]??0)<0))return null;
 const first=cost[0][0],short=Math.max(0,sum[first]-(inventory[first]??0));let universal=false;
 if(short){if(!allowed||!universalId||universalId===first||!Number.isSafeInteger(inventory[universalId]??0)||(inventory[universalId]??0)<short)return null;sum[first]-=short;sum[universalId]=(sum[universalId]??0)+short;universal=true;}
 if(Object.entries(sum).some(([id,n])=>!Number.isSafeInteger(n)||n<0||(inventory[id]??0)<n))return null;
 return{cost:Object.entries(sum).filter(([,n])=>n>0),universal};
}
export async function runCrafting({client,settings:s,state,act,log,config=tables,universalConfig=universalDefaults,history=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const pet=s.beast_0&&s.beast_2&&Number.isFinite(state.level)&&state.level>=23;
 const equip=s.equipment_0&&s.equipment_2&&Number.isFinite(state.level)&&state.level>=17;
 if(!pet&&!equip)return;
 if(!Number.isSafeInteger(state.season)||state.season<1){log('打造／培育：赛季尚未确认，跳过');return;}
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const stock=async()=>{
  const items=await read('AllItemRequest','AllItemResponse'),resources=await read('AllResourceRequest','AllResourceResponse');
  if(!Array.isArray(items.items)||!Array.isArray(resources.list))throw Error('unknown_crafting_inventory');
  const out=Object.fromEntries(items.items.map(x=>[x.itemId,Number(x.num)]));for(const r of resources.list)if(r.res===3)out.GOLD=Number(r.amount);return out;
 };
 const confirm=async(check)=>{for(const delay of [0,400,800]){if(delay)await sleep(delay);if(await check())return true;}return false;};
 const spent=(cost,before,after)=>cost.every(([id,n])=>(before[id]??0)-(after[id]??0)===Number(n));
 const attempts=(prefix,id)=>[...history].filter(k=>k.startsWith(prefix)&&k.split(':')[2]===String(id)).length;
 const doAction=async(key,fn)=>{history.add(key);const x=await act(key,fn);if(x?.status==='rejected')history.delete(key);return x;};
 let water=await read('OnWaterRequest','OnWaterResponse');
 if(pet){
  const max=quality(s.beast_4),species=s.beast_3??[],unlocked=(config.PetSpeciesCfg?.data??[]).filter(x=>(x.season??1)<=state.season);
  if(!max||!species.length)log('海兽培育：请明确选择种类与最高品质');
  else for(let attempt=0;attempt<3;attempt++){
   const room=(water.building??[]).find(b=>(config.BuildingUnlockCfg?.data??[]).some(u=>u.buildingId===b.buildingId&&u.buildingType==='宠物培育室')&&b.level>0&&!(b.buildFinishTime>now())&&b.petBreed&&Number.isSafeInteger(b.petBreed.maxQLength)&&b.petBreed.maxQLength>(b.petBreed.breedQ??[]).length);
   if(!room){log('海兽培育：没有已建成且有空位的培育室，检查建设状态与培育队列');break;}
   const inventory=await stock();
   const plans=(config.PetBreedCfg?.data??[]).filter(x=>x.season<=state.season&&quality(x.quality)>0&&quality(x.quality)<=max&&species.includes(unlocked.find(y=>y.spId===x.spId)?.name)).map(row=>{
    const q=universalConfig.materials?.[row.cost?.[0]?.[0]]?.quality,index=unlocked.findIndex(x=>x.spId===row.spId),universalId=(index>=0&&index<3?universalConfig.pet:universalConfig.pet2)?.[q];
    return{row,payment:craftingPayment(row.cost,inventory,{allowed:s.beast_5===true,universalId})};
   }).filter(x=>x.payment).sort((a,b)=>quality(a.row.quality)-quality(b.row.quality)||attempts('pet-breed:',a.row.petId)-attempts('pet-breed:',b.row.petId)||species.indexOf(unlocked.find(x=>x.spId===a.row.spId)?.name)-species.indexOf(unlocked.find(x=>x.spId===b.row.spId)?.name));
   const plan=plans[0];if(!plan){log('海兽培育：所选种类／品质的基因、金币或允许的万能图纸不足');break;}
   const{row,payment}=plan,before=(room.petBreed.breedQ??[]).map(x=>`${x.idx}:${x.petId}:${x.startTime}:${x.finishTime}`),hash=createHash('sha256').update(JSON.stringify(before)).digest('hex').slice(0,16);
   const result=await doAction(`pet-breed:${room.buildingId}:${row.petId}:${hash}:${Math.floor(now()/60)}`,async()=>{
    const fresh=(await read('OnWaterRequest','OnWaterResponse')).building?.find(b=>b.buildingId===room.buildingId);
    const queue=fresh?.petBreed;
    if(!fresh||fresh.level<=0||fresh.buildFinishTime>now()||!queue||!Number.isSafeInteger(queue.maxQLength)||queue.maxQLength<=(queue.breedQ??[]).length||JSON.stringify((queue.breedQ??[]).map(x=>`${x.idx}:${x.petId}:${x.startTime}:${x.finishTime}`))!==JSON.stringify(before))return{status:'rejected',message:'海兽培育：真实培育室队列已变化或已满，本轮取消'};
    await client.sendWatch('PetBreedRequest',{petId:row.petId,universal:payment.universal},{window:1000});
    const verified=await confirm(async()=>{
     water=await read('OnWaterRequest','OnWaterResponse');const jobs=water.building?.find(x=>x.buildingId===room.buildingId)?.petBreed?.breedQ??[];
     const added=jobs.some(x=>x.petId===row.petId&&x.finishTime>now()&&!before.includes(`${x.idx}:${x.petId}:${x.startTime}:${x.finishTime}`));
     return jobs.length>before.length&&added&&spent(payment.cost,inventory,await stock());
    });
    return{status:verified?'verified':'unconfirmed',message:verified?`海兽培育 ${row.petId}：新增批次、材料${payment.universal?'与万能图纸补差额':''}已核对`:'海兽培育结果未确认，暂停打造／培育模块'};
   });if(!result)break;if(result.status==='unconfirmed')throw Error('unconfirmed_pet_breed');if(result.status!=='verified')break;
  }
 }
 if(equip){
  let count=0;
  for(const b of water.building??[]){
   const isEquip=!!b.equipMaking||(config.BuildingUnlockCfg?.data??[]).some(u=>u.buildingId===b.buildingId&&u.buildingType==='装备厂');
   if(!isEquip||b.level<=0||b.buildFinishTime>now()||b.equipMaking?.equipId||b.equipMaking?.finishTime>0)continue;
   const inventory=await stock(),types=(s.equipment_3??[]).map(type),qualities=s.equipment_4??[],allowTypes=(s.ref_island_equip_universalTypes??[]).map(type);
   const plans=(config.BuildingEquipMakeCfg?.data??[]).filter(x=>x.season<=state.season&&(!types.length||types.includes(type(x.type)))).map(row=>{
    const pool=(config.EquipMakeLibCfg?.data??[]).filter(y=>y.libId===row.libId).map(y=>quality(config.EquipCfg?.data?.find(z=>z.id===y.equipId)?.quality));
    const accepted=pool.length>0&&pool.every(q=>q>0&&(!qualities.length||qualities.some(v=>quality(v)===q)));
    const q=universalConfig.materials?.[row.costItem?.[0]?.[0]]?.quality,universalId=universalConfig.equip?.[q];
    const payment=accepted?craftingPayment(row.costItem,inventory,{allowed:s.equipment_5===true&&allowTypes.includes(type(row.type)),universalId}):null;
    return{row,payment,rank:Math.min(...pool)};
   }).filter(x=>x.payment).sort((a,b)=>(Number(a.row.seconds)>0?Number(a.row.seconds):Infinity)-(Number(b.row.seconds)>0?Number(b.row.seconds):Infinity)||a.rank-b.rank||attempts('equip-make:',a.row.makeId)-attempts('equip-make:',b.row.makeId)||a.row.makeId-b.row.makeId);
   const plan=plans[0];if(!plan){log('装备打造：无符合类型／品质且材料足够的配方，万能图纸另受开关与类型白名单限制');continue;}
   const{row,payment}=plan;
   const result=await doAction(`equip-make:${b.buildingId}:${row.makeId}:${Math.floor(now()/60)}`,async()=>{
    await client.sendWatch('MakeEquipRequest',{buildingId:b.buildingId,makeId:row.makeId,universal:payment.universal},{window:1000});
    const verified=await confirm(async()=>{
     const current=(await read('OnWaterRequest','OnWaterResponse')).building?.find(x=>x.buildingId===b.buildingId)?.equipMaking;
     return current?.makeId===row.makeId&&current.finishTime>now()&&spent(payment.cost,inventory,await stock());
    });
    return{status:verified?'verified':'unconfirmed',message:verified?`装备打造 ${b.buildingId}：打造任务、材料${payment.universal?'与万能图纸补差额':''}已核对`:'装备打造结果未确认，暂停打造／培育模块'};
   });if(!result)break;if(result.status==='unconfirmed')throw Error('unconfirmed_equip_make');if(result.status!=='verified')continue;if(++count>=3)break;
  }
 }
}
export async function runCraftingGuarded({run,client,paused,log}){
 if(paused.has('crafting'))return;
 try{await run();}catch(e){if(client?.connected===false||!/^unconfirmed_(pet_breed|equip_make)$|^unknown_crafting_inventory$/.test(e.message))throw e;paused.add('crafting');if(e.message==='unconfirmed_equip_make')paused.add('crafting:equipment');log('打造／培育结果未确认，仅暂停本模块，其他任务继续');}
}

export function resumeCraftingAfterEquipClaim({paused,log}){
 if(!paused.has('crafting:equipment'))return;
 paused.delete('crafting:equipment');paused.delete('crafting');
 log('装备已确认入库且制作栏已清空，恢复自动打造；重新核对配方与材料');
}
