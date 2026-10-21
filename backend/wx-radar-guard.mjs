export async function runRadarGuarded({run,client,paused,log}){
 if(paused.has('radar'))return;
 try{await run({claimsOnly:false});}
 catch(error){
  if(!/^unconfirmed_radar_(start|reward)$/.test(error.message)||client?.connected===false)throw error;
  if(error.message==='unconfirmed_radar_start'){
   log('雷达该笔派遣尚未确认，保留记录避免重发；下一轮继续自动派遣其他可执行情报，并领取已完成奖励。');
  }else{
   paused.add('radar');
   log('雷达领奖结果尚未确认，暂停雷达，避免重复领奖；其他任务继续。');
  }
 }
}
