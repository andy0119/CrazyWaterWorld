import {normalize} from './wx-game/worlds.mjs';
export async function runMuseumSpeedup({client,settings:s,state,act,log,history=new Set()}){
 if(!s.museum_8||!Number.isFinite(state.level)||state.level<28)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000);
 const have=async()=>Number(((await read('AllItemRequest','AllItemResponse')).items??[]).find(x=>x.itemId==='博物馆加速')?.num??0);
 const prefix='museum-speed:'+new Date(Date.now()+(client.serverClockOffsetMs??0)+28800000).toISOString().slice(0,10)+':';
 const cap=Math.max(0,Math.floor(Number(s.ref_island_museum_speedUpDailyLimit)||0)),reserve=Math.max(0,Math.floor(Number(s.ref_island_museum_speedUpKeepStock)||0));
 let spent=[...history].filter(x=>x.startsWith(prefix)).reduce((n,x)=>n+(Number(x.split(':').at(-1))||0),0),count=0;
 const info=await read('MuseumInfoRequest','MuseumInfoResponse');
 for(const stage of info.exploreStages??[]){
  const job=stage.expedition;if(!(job?.endTime>now()))continue;
  const before=await have(),useNum=Math.min(Math.ceil((job.endTime-now())/1800),Math.max(0,Math.floor(before)-reserve),cap?Math.max(0,cap-spent):Infinity);
  if(!Number.isSafeInteger(useNum)||useNum<=0){log('博物馆加速：道具保留数量或每日上限条件未满足');return;}
  const key=prefix+`${stage.stageId}:${job.startTime}:${job.endTime}:${before}:${useNum}`;
  if(history.has(key))continue;history.add(key);spent+=useNum;
  const result=await act(key,async()=>{
   const reply=await read('MuseumSpeedUpExploreRequest','MuseumSpeedUpExploreResponse',{stageId:stage.stageId,useNum});
   const current=(await read('MuseumInfoRequest','MuseumInfoResponse')).exploreStages?.find(x=>x.stageId===stage.stageId)?.expedition;
   const verified=!!reply.expedition&&current?.startTime===job.startTime&&Number.isFinite(current.endTime)&&current.endTime<job.endTime&&before-(await have())===useNum;
   return {status:verified?'verified':'unconfirmed',message:verified?`探宝加速：已核对 ${useNum} 份探险指南；今日用量 ${spent}${cap?'/'+cap:''}`:'探宝加速结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_museum_speedup');
  if(++count>=3)return;
 }
}
