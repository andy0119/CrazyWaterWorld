import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runMuseumExplore({client,settings:s,state,act,log,config=tables}){
 if(!s.museum_1||!Number.isFinite(state.level)||state.level<28)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const stock=async()=>Object.fromEntries(((await read('AllItemRequest','AllItemResponse')).items??[]).map(x=>[x.itemId,Number(x.num)]));
 let info=await read('MuseumInfoRequest','MuseumInfoResponse');
 // Finish only expeditions whose server end time has elapsed.
 for(const stage of info.exploreStages??[]){
  if(!(stage.expedition?.endTime>0)||stage.expedition.endTime>now())continue;
  const result=await act(`museum-finish:${stage.stageId}:${stage.expedition.startTime}:${stage.expedition.endTime}`,async()=>{
   const before=await stock();
   await read('MuseumCompleteExploreRequest','MuseumCompleteExploreResponse',{stageId:stage.stageId});
   const reply=await read('MuseumRewardRequest','MuseumRewardResponse',{stageId:stage.stageId});
   info=await read('MuseumInfoRequest','MuseumInfoResponse');const after=await stock();
   const current=info.exploreStages?.find(x=>x.stageId===stage.stageId),assets={};
   for(const a of reply.reward?.asset??[])if(a.id&&Number(a.num)>0)assets[a.id]=(assets[a.id]??0)+Number(a.num);
   const verified=!!reply.exploreStage&&!!current&&!(current.expedition?.endTime>0)&&current.progress>=stage.progress&&Object.keys(assets).length>0&&Object.entries(assets).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   return {status:verified?'verified':'unconfirmed',message:verified?`博物馆地图 ${stage.stageId}：已核对探宝结算与奖励库存`:'探宝结算结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_museum_finish');
 }
 const capacity=Math.max(0,...(config.MuseumExpeditionTeamCfg?.data??[]).filter(x=>x.playerLevel<=state.level).map(x=>x.teamCount));
 let active=(info.exploreStages??[]).filter(x=>x.expedition?.endTime>0).length;
 if(active>=capacity)return;
 const busy=new Set((info.exploreStages??[]).filter(x=>x.expedition?.endTime>0).flatMap(x=>x.expedition.heroIds??[]));
 const heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes??[];
 const allowed=s.museum_7??[];let count=0;
 for(const stage of info.exploreStages??[]){
  if(active>=capacity||count>=3)break;
  if(stage.expedition?.endTime>0)continue;
  const row=config.MuseumExpeditionStageCfg?.data?.find(x=>x.stageId===stage.stageId);
  if(!row||allowed.length&&!allowed.some(x=>String(x)===String(stage.stageId)||x===row.name))continue;
  if(row.areaLevelReq?.length&&!(info.exhibitions??[]).some(x=>x.exhibitionId===row.areaLevelReq[0]&&x.level>=row.areaLevelReq[1]))continue;
  const base=stage.expedition?.cost?.asset??[];
  if(!base.length){log(`博物馆地图 ${stage.stageId} 未提供实际材料需求，暂不自动出发`);continue;}
  const before=await stock();let requested=Math.max(1,Math.floor(Number(s.museum_2)||1));
  if(s.museum_3){
   const names=s.museum_4??[],threshold=Math.max(0,Number(s.museum_5)||0);
   if(base.some(x=>(!names.length||names.includes(x.id))&&(before[x.id]??0)<=threshold))requested=Math.max(1,Math.floor(Number(s.museum_6)||1));
  }
  const factors=(config.MuseumExploreTimeFactorCfg?.data??[]).filter(x=>x.playerLevel<=state.level&&x.factor<=requested&&x.factor>=1);
  if(!factors.length)continue;const factor=Math.max(...factors.map(x=>x.factor));
  const cost={};let invalid=false;
  for(const a of base){const n=Math.floor(Number(a.num)*factor);if(!a.id||['GOLD','RUBY'].includes(a.id)||!Number.isSafeInteger(n)||n<=0)invalid=true;cost[a.id]=(cost[a.id]??0)+n;}
  if(invalid||Object.entries(cost).some(([id,n])=>(before[id]??0)<n))continue;
  const cond=stage.expedition?.conditionId?config.MuseumExpeditionConditionCfg?.data?.find(x=>x.conditionId===stage.expedition.conditionId):null;
  if(stage.expedition?.conditionId&&!cond)continue;
  const required=cond?.heroCount??3;if(!Number.isSafeInteger(required)||required<1||required>10)continue;
  const selected=heroes.filter(h=>!busy.has(h.heroId)&&h.level>0).filter(h=>{
   if(!cond)return true;const meta=config.HeroCfg?.data?.find(x=>x.id===h.heroId);
   return !!meta&&(!cond.careerLimit||meta.career===cond.careerLimit)&&(!cond.factionLimit||meta.faction===cond.factionLimit)&&h.star>=cond.heroStar&&meta.qualityIndex>=cond.heroQualityIndex;
  }).sort((a,b)=>b.star-a.star||b.level-a.level).slice(0,required).map(x=>x.heroId);
  if(selected.length!==required)continue;
  const result=await act(`museum-start:${stage.stageId}:${stage.progress}:${JSON.stringify(stage.expedition)}:${Math.floor(now()/60)}`,async()=>{
   const reply=await read('MuseumStartExploreRequest','MuseumStartExploreResponse',{stageId:stage.stageId,heroIds:selected,factor});
   const current=(await read('MuseumInfoRequest','MuseumInfoResponse')).exploreStages?.find(x=>x.stageId===stage.stageId)?.expedition;
   const after=await stock();
   const verified=!!reply.expedition&&current?.endTime>now()&&current.factor===factor&&current.heroIds?.length===selected.length&&selected.every(x=>current.heroIds.includes(x))&&Object.entries(cost).every(([id,n])=>(before[id]??0)-(after[id]??0)===n);
   return {status:verified?'verified':'unconfirmed',message:verified?`博物馆地图 ${stage.stageId}：已核对 ${factor} 倍探宝、组队与材料消耗`:'探宝出发结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_museum_start');
  selected.forEach(x=>busy.add(x));active++;count++;
 }
}
