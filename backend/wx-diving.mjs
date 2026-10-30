import fs from 'node:fs';
const defaults=JSON.parse(fs.readFileSync(new URL('./diving-protocol-tables.json',import.meta.url),'utf8'));
import {normalize} from './wx-game/worlds.mjs';
// Bounded protocol replenishment trial, not a simulation of on-screen collection.
// Success requires matching server rewards AND actual inventory gain.
export async function runDiving({client,protocol,settings:s,state={},act,log,paused=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),config=defaults}){
 if(s.gather_4!==true||paused.has('diving'))return;
 const batch=Number(s.ref_gather_diving_batchSize??100);
 if(!Number.isSafeInteger(batch)||batch<1||batch>100){log('潜水试接：每批数量必须为1至100，不发送结算');return;}
 const read=(req,res)=>client.request(req,{},res,8000).then(normalize);
 const water=await read('OnWaterRequest','OnWaterResponse');
 if(!(water.building??[]).some(b=>/潜水船$/.test(b.buildingId)&&b.level>0&&!b.buildFinishTime)){log('自动潜水：潜水船尚未建成');return;}
 const level=Number(water.divingLevel?.level),autoLevel=Number(config.DiveParamCfg?.data?.find(x=>x.paramName==='自动潜水')?.paramValue);
 if(!Number.isSafeInteger(level)||!Number.isSafeInteger(autoLevel)||level<autoLevel){log('自动潜水：尚未达到游戏自动潜水等级，暂不结算');return;}
 const rows=config.BuildingUpgradeCfg?.data??[],unlocks=config.BuildingUnlockCfg?.data??[];
 const cap=(water.building??[]).reduce((sum,b)=>{const type=unlocks.find(x=>x.buildingId===b.buildingId)?.buildingType;return sum+(rows.find(r=>r.buildingType===type&&r.level===b.level)?.effect??[]).filter(x=>x[0]==='资源储量上限').reduce((n,x)=>n+Number(x[1]),0);},0);
 if(!Number.isSafeInteger(cap)||cap<=0){log('自动潜水：资源库存上限未确认');return;}
 const inventory=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 const before=await inventory(),materials=['玻璃','金属','海藻'];
 const choices=materials.map(id=>({id,num:1,held:before[id]??0})).filter(x=>Number.isSafeInteger(x.held)&&x.held>=0&&x.held<cap&&config.DiveItemsDefinitionCfg?.data?.some(r=>r.type==='拾取'&&r.produce?.[0]===x.id&&r.produce[1]===1)).sort((a,b)=>a.held-b.held);
 if(!choices.length){log('自动潜水：玻璃、金属、海藻已满仓或材料配置未确认');return;}
 const minute=Math.floor((Date.now()+(client.serverClockOffsetMs??0))/60000);
 const result=await act(`diving-batch:${minute}`,async()=>{
  try{
   const fresh=await inventory();
   const plan=choices.map(x=>({id:x.id,held:fresh[x.id]??0})).filter(x=>Number.isSafeInteger(x.held)&&x.held>=0&&x.held<cap).map(x=>({...x,num:Math.min(batch,cap-x.held)}));
   if(!plan.length)return{status:'rejected',skipReason:'warehouse-full',message:'潜水试接：库存已达上限，本批取消'};
   const reply=await client.request('DivingRequest',{reward:{asset:plan.map(x=>({type:protocol.DisplayAssetType.ITEM,id:x.id,num:x.num}))}},'DivingResponse',8000).then(normalize);
   const rewards={};for(const a of reply.reward?.asset??[])rewards[a.id]=(rewards[a.id]??0)+Number(a.num||0);
   let after=before,verified=false;
   for(const delay of [0,400,800]){if(delay)await sleep(delay);after=await inventory();verified=plan.every(x=>rewards[x.id]===x.num&&Number.isSafeInteger(after[x.id])&&after[x.id]-x.held>=x.num);if(verified)break;}
   return{status:verified?'verified':'unconfirmed',message:verified?'潜水协议补库试接：'+plan.map(x=>`${x.id} +${x.num}（${after[x.id]}/${cap}）`).join('、')+'；同批等量补充，服务器奖励及库存已核对':'潜水同批结算未确认：'+plan.map(x=>`${x.id} 请求 ${x.num}／奖励 ${rewards[x.id]??0}／库存增加 ${(after[x.id]??0)-x.held}`).join('、')+'；暂停潜水且不重送'};
  }catch(e){if(!e.prompt)throw e;return{status:'rejected',message:'自动潜水协议结算被服务器拒绝，暂停潜水；提示 '+(protocol.Prompt?.[e.prompt.prompt]??e.prompt.prompt)};}
 });
 if(result&&result.status!=='verified'&&result.skipReason!=='warehouse-full'){paused.add('diving');log('自动潜水本次已暂停，其他任务继续；不重复结算');}
}

export async function runDivingGuarded(args){
 try{await runDiving(args);}catch(e){if(args.client.connected===false)throw e;args.paused.add('diving');args.log('自动潜水读取或结算发生异常，本次暂停且不重送；其他任务继续');}
}
