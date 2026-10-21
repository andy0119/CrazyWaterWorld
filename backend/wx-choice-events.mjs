import fs from'node:fs';
import {normalize}from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./choice-event-tables.json',import.meta.url),'utf8'));
export function captureChoiceEvents(client){
 const state={received:false,events:new Map()};
 client.on('message',({name,body})=>{if(name!=='SCChoiceEventUpdate')return;const x=normalize(body);if(!Array.isArray(x.events))return;state.received=true;for(const e of x.events)if(Number.isSafeInteger(e.uid)&&e.uid>0&&Number.isSafeInteger(e.eventId))state.events.set(String(e.uid),e);});
 return state;
}
export async function runChoiceEvents({client,settings:s,eventState,act,log,history=new Set(),config=defaults}){
 if(!s.event_0)return;
 if(!eventState?.received){log('随机事件：尚未收到服务器事件清单，不猜测事件 ID');return;}
 if(!eventState.events.size){log('随机事件：当前没有待处理事件');return;}
 const stock=async()=>{
  const i=normalize(await client.request('AllItemRequest',{},'AllItemResponse',8000)),r=normalize(await client.request('AllResourceRequest',{},'AllResourceResponse',8000));
  if(!Array.isArray(i.items)||!Array.isArray(r.list))throw Error('unknown_choice_inventory');
  const out=Object.fromEntries(i.items.map(x=>[x.itemId,Number(x.num)]));for(const x of r.list){const id={1:'EXP',3:'GOLD',4:'RUBY'}[x.res];if(id)out[id]=Number(x.amount);}return out;
 };
 for(const event of [...eventState.events.values()].slice(0,3)){
  const row=config.data?.find(x=>x.eventId===event.eventId),key=`choice-event:${event.uid}:${event.eventId}`;
  if(!row?.option1||!(row.option1Reward>0)){log(`随机事件 ${event.eventId}：选项配置未确认，跳过`);continue;}
  if(history.has(key))continue;
  const before=await stock();history.add(key);
  const result=await act(key,async()=>{
   if(eventState.events.get(String(event.uid))?.eventId!==event.eventId)return{status:'rejected',message:'随机事件已变化，取消选择'};
   const reply=normalize(await client.request('SelectChoiceRequest',{uid:event.uid,optionIndex:1},'GotRewardResponse',8000));
   const sum={};let valid=true;for(const a of reply.reward?.asset??[]){if(!a.id||!Number.isSafeInteger(Number(a.num))||Number(a.num)<=0)valid=false;else sum[a.id]=(sum[a.id]??0)+Number(a.num);}
   const after=await stock(),verified=valid&&Object.keys(sum).length>0&&Object.entries(sum).every(([id,n])=>(after[id]??0)-(before[id]??0)>=n);
   if(verified)eventState.events.delete(String(event.uid));
   return{status:verified?'verified':'unconfirmed',message:verified?`随机事件「${row.title}」：已选择「${row.option1}」，奖励入库已核对`:'随机事件奖励未确认，仅暂停随机事件模块'};
  });
  if(result?.status==='unconfirmed')throw Error('unconfirmed_choice_event');
 }
}
export async function runChoiceEventsGuarded({run,client,paused,log}){
 if(paused.has('choice-events'))return;
 try{await run();}catch(e){
  if(client?.connected===false)throw e;
  if(/^timeout waiting for /.test(e.message)){log('随机事件库存查询超时，下一轮重查；其他任务继续');return;}
  if(!e.prompt&&!/^(unconfirmed_choice_event|unknown_choice_inventory)$/.test(e.message))throw e;
  paused.add('choice-events');log('随机事件结果未确认，仅暂停此模块，其他任务继续');
 }
}
