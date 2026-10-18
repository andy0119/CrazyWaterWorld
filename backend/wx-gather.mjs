import {normalize} from './wx-game/worlds.mjs';import fs from 'node:fs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runGather({client,settings:s,act,log,config=tables}){
 if(!s.gather_0&&!s.gather_1)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 const positive=x=>(x?.asset??[]).filter(a=>a.id&&Number(a.num)>0);
 const gained=(before,after,assets)=>assets.length>0&&assets.every(a=>(after[a.id]??0)-(before[a.id]??0)>=Number(a.num));
 const bucket=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/60000);
 const water=await read('OnWaterRequest','OnWaterResponse');
 const rows=config.BuildingUpgradeCfg?.data??[],unlocks=config.BuildingUnlockCfg?.data??[];
 const limit=(water.building??[]).reduce((sum,b)=>{const type=unlocks.find(x=>x.buildingId===b.buildingId)?.buildingType;return sum+(rows.find(r=>r.buildingType===type&&r.level===b.level)?.effect??[]).filter(x=>x[0]==='资源储量上限').reduce((n,x)=>n+Number(x[1]),0);},0);
 if(s.gather_1){
  const before=await stock();
  const eligible=(water.floater??[]).filter(f=>{const cfg=config.GarbageProductionCfg?.data?.find(x=>x.id===f.floaterId);if(!cfg||cfg.type!=='拾取'||!(f.num>0))return false;return s.gather_2===true||limit>0&&(before[cfg.production?.[0]]??0)<limit;}).slice(0,20);
  if(eligible.length){
   const ids=eligible.map(x=>x.floaterId);
   const result=await act(`floater:${bucket}:${ids.join('|')}`,async()=>{
    const reply=await read('PickUpFloaterRequest','PickUpFloaterResponse',{floaterId:ids});
    const denied=new Set(reply.deniedFloaterIds??[]);const accepted=eligible.filter(x=>!denied.has(x.floaterId));
    if(!accepted.length)return{status:'rejected',message:'自动打捞：服务器拒绝本批漂流物（可能已满仓）'};
    const after=await read('OnWaterRequest','OnWaterResponse');const current=new Map((after.floater??[]).map(x=>[x.floaterId,x.num]));
    const changed=accepted.every(x=>(current.get(x.floaterId)??0)<x.num);const assets=positive(reply.reward);
    const verified=changed&&(gained(before,await stock(),assets)||s.gather_2===true&&!assets.length);
    return{status:verified?'verified':'unconfirmed',message:verified?`自动打捞：已核对 ${accepted.length} 类漂流物${!assets.length?'，满仓继续模式无新增库存':''}`:'打捞结果未确认，停止本轮'};
   });if(result?.status==='unconfirmed')throw Error('unconfirmed_floater');
  }else log('自动打捞：没有可拾取漂流物或库存已达上限；宝箱另按开关处理');
 }
 if(s.gather_0){
  if(!(water.building??[]).some(b=>/钓鱼椅$/.test(b.buildingId)&&b.level>0&&!b.buildFinishTime)){log('钓鱼椅尚未建成，本轮跳过');return;}
  const before=await stock();
  const result=await act('fishing:'+bucket,async()=>{
   const reply=await read('StartFishingRequest','StartFishingResponse');
   if(reply.fishId>0)await client.sendWatch('GainBigFishRequest',{}, {window:1000});
   const verified=gained(before,await stock(),positive(reply.reward));
   return{status:verified?'verified':'unconfirmed',message:verified?'自动钓鱼：已核对服务器奖励与库存增加':'钓鱼已回应，奖励入库尚未确认，停止本轮'};
  });if(result?.status==='unconfirmed')throw Error('unconfirmed_fishing');
 }
}
