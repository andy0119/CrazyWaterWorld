import fs from 'node:fs';import {normalize} from './wx-game/worlds.mjs';
const tables=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
export async function runAfkUpgrade({client,settings:s,state,act,log,config=tables}){
 if(!s.ref_battle_stage_afk_enabled||!s.ref_battle_stage_afk_levelUp)return;
 const read=(a,b,body={})=>client.request(a,body,b,8000).then(normalize);
 for(let i=0;i<5;i++){
  const info=(await read('AfkInfoRequest','AfkInfoResponse')).afkInfo;
  const next=(config.OfflineCfg?.data??[]).find(x=>x.level===info?.level+1);
  if(!next||!Number.isFinite(state.stage)||Number(next.stage)>state.stage-1){log('挂机升级：已达当前主线允许的等级');return;}
  if(!Array.isArray(next.consume)||next.consume.length!==2||next.consume[0]!=='挂机徽章'||!(Number(next.consume[1])>0)){log('挂机升级消耗配置未确认，跳过');return;}
  const count=x=>Number((x.items??[]).find(v=>v.itemId==='挂机徽章')?.num??0);
  const before=await read('AllItemRequest','AllItemResponse');
  if(count(before)<Number(next.consume[1])){log('挂机升级：挂机徽章不足，跳过');return;}
  const result=await act(`afk-upgrade:${info.level}:${next.level}`,async()=>{
   // Client sends an increment (1/5/10), not the target level.
   const reply=await read('UpgradeAfkLevelRequest','UpgradeAfkLevelResponse',{level:1});
   const after=(await read('AfkInfoRequest','AfkInfoResponse')).afkInfo;const stock=await read('AllItemRequest','AllItemResponse');
   const verified=reply.level===next.level&&after?.level===next.level&&count(before)-count(stock)>=Number(next.consume[1]);
   return{status:verified?'verified':'unconfirmed',message:verified?`挂机等级已提升至 ${next.level}，已核对徽章消耗`:'挂机升级结果未确认，停止本轮'};
  });
  if(!result)return;if(result.status!=='verified')throw Error('unconfirmed_afk_upgrade');
 }
}
