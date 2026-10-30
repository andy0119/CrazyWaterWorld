import {normalize} from './wx-game/worlds.mjs';import fs from 'node:fs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runGather({client,settings:s,act,log,config=tables,paused=new Set(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),state={}}){
 if(!s.gather_0&&!s.gather_1)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 const positive=x=>(x?.asset??[]).filter(a=>a.id&&Number(a.num)>0);
 const gained=(before,after,assets)=>assets.length>0&&assets.every(a=>(after[a.id]??0)-(before[a.id]??0)>=Number(a.num));
 const bucket=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/60000);
 const water=await read('OnWaterRequest','OnWaterResponse');
 const rows=config.BuildingUpgradeCfg?.data??[],unlocks=config.BuildingUnlockCfg?.data??[];
 const limit=(water.building??[]).reduce((sum,b)=>{const type=unlocks.find(x=>x.buildingId===b.buildingId)?.buildingType;return sum+(rows.find(r=>r.buildingType===type&&r.level===b.level)?.effect??[]).filter(x=>x[0]==='资源储量上限').reduce((n,x)=>n+Number(x[1]),0);},0);
 if(s.gather_1&&!paused.has('floater')){
  const before=await stock();
  const material=id=>config.GarbageProductionCfg?.data?.find(x=>x.id===id)?.production?.[0];
  const candidates=(water.floater??[]).filter(f=>{const cfg=config.GarbageProductionCfg?.data?.find(x=>x.id===f.floaterId);if(!cfg||cfg.type!=='拾取'||!(f.num>0))return false;return s.gather_2===true||limit>0&&(before[cfg.production?.[0]]??0)<limit;});
  const cursor=Number.isSafeInteger(state.floaterCursor)?state.floaterCursor:0,start=candidates.length?cursor%candidates.length:0;
  const rotated=[...candidates.slice(start),...candidates.slice(0,start)];
  const underCap=f=>limit>0&&(before[material(f.floaterId)]??0)<limit;
  const eligible=[...rotated.filter(underCap),...rotated.filter(f=>!underCap(f))].slice(0,20);
  state.floaterCursor=candidates.length?(start+20)%candidates.length:0;
  const glass=(water.floater??[]).filter(f=>material(f.floaterId)==='玻璃').reduce((n,f)=>n+Math.max(0,Number(f.num)||0),0);
  log(`自动打捞材料：玻璃库存 ${before['玻璃']??0}/${limit||'上限未确认'}，可见玻璃漂流物 ${glass}；本轮检查 ${eligible.length}/${candidates.length} 类，优先未满仓并轮换`);
  if(eligible.length){
   const ids=eligible.map(x=>x.floaterId);
   const result=await act(`floater:${bucket}:${ids.join('|')}`,async()=>{
    const reply=await read('PickUpFloaterRequest','PickUpFloaterResponse',{floaterId:ids});
    const denied=new Set(reply.deniedFloaterIds??[]);const accepted=eligible.filter(x=>!denied.has(x.floaterId));
    if(!accepted.length)return{status:'rejected',message:'自动打捞：服务器拒绝本批材料 '+[...new Set(eligible.map(f=>material(f.floaterId)||f.floaterId))].join('、')+'；可能已满仓或漂流物已变化，下一轮轮换检查'};
    const after=await read('OnWaterRequest','OnWaterResponse');const current=new Map((after.floater??[]).map(x=>[x.floaterId,x.num]));
    const changed=accepted.every(x=>(current.get(x.floaterId)??0)<x.num);const assets=positive(reply.reward);
    const verified=changed&&(gained(before,await stock(),assets)||s.gather_2===true&&!assets.length);
    return{status:verified?'verified':'unconfirmed',message:verified?`自动打捞：已核对 ${accepted.length} 类漂流物（${[...new Set(accepted.map(f=>material(f.floaterId)||f.floaterId))].join('、')}）${!assets.length?'，满仓继续模式无新增库存':''}`:'打捞结果未确认，停止本轮'};
   });if(result?.status==='unconfirmed'){paused.add('floater');log('自动打捞结果尚未确认，本次暂停打捞；其他任务继续');}
  }else log('自动打捞：没有可拾取漂流物或库存已达上限；宝箱另按开关处理');
 }
 if(s.gather_0&&!paused.has('fishing')){
  if(!(water.building??[]).some(b=>/钓鱼椅$/.test(b.buildingId)&&b.level>0&&!b.buildFinishTime)){log('钓鱼椅尚未建成，本轮跳过');return;}
  const before=await stock();
  if(limit>0&&(before['鱼']??0)>=limit){log('自动钓鱼：鱼库存已满，等待消耗后继续');return;}
  const result=await act('fishing:'+bucket,async()=>{
   const reply=await read('StartFishingRequest','StartFishingResponse');
   let bonus=null;
   if(reply.fishId>0)bonus=await read('GainBigFishRequest','GainBigResponse');
   const assets=positive(reply.reward).concat(positive(bonus?.extReward)),sum={};
   for(const a of assets){const n=Number(a.num);if(!Number.isSafeInteger(n)||n<=0)return{status:'unconfirmed',message:'钓鱼奖励数量不完整，暂停钓鱼'};sum[a.id]=(sum[a.id]??0)+n;}
   const expected=Object.entries(sum).map(([id,num])=>({id,num:id==='鱼'&&limit>0?Math.min(num,Math.max(0,limit-(before[id]??0))):num}));
   let verified=false,after=before,bookOk=reply.fishId<=0;
   for(const wait of [0,800,1600]){
    if(wait)await sleep(wait);
    after=await stock();
    if(reply.fishId>0){const book=await read('FishEncyclopediaRequest','FishEncyclopediaResponse');bookOk=Array.isArray(book.fishList)&&book.fishList.includes(reply.fishId);}
    verified=bookOk&&expected.length>0&&expected.some(a=>a.num>0)&&gained(before,after,expected);
    if(verified)break;
   }
   const detail=expected.map(a=>`${a.id} 预期+${a.num}／实际+${(after[a.id]??0)-(before[a.id]??0)}`).join('，');
   return{status:verified?'verified':'unconfirmed',message:verified?'自动钓鱼：已核对服务器奖励与库存'+(reply.fishId>0?'、大鱼图鉴':''):`钓鱼已回应但入库未确认（${detail||'未取得有效奖励'}），只暂停钓鱼`};
  });if(result?.status==='unconfirmed'){paused.add('fishing');log('钓鱼结果尚未确认，本次暂停钓鱼且不重送；雷达、商船及其他任务继续');}

 }
}
