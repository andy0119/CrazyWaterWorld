export async function refreshDailyGiftCodes({settings,state,request,log,now=Date.now()}){
 if(settings.script_gift_daily_update!==true)return;
 const day=new Date(now+8*3600000).toISOString().slice(0,10);
 if(state.giftSourceDay===day||now<(state.giftSourceRetryAt??0))return;
 try{
  const result=await request();
  if(!result?.ok){state.giftSourceRetryAt=now+Math.max(60,Number(result?.retryAfter)||3600)*1000;log(result?.message||'禮包碼每日更新未完成，保留原名單');return;}
  if(result.disabled){state.giftSourceDay=day;return;}
  if(result.day!==day||!Array.isArray(result.codes)||result.codes.some(c=>typeof c!=='string'||!c.length||c.length>100))throw Error('invalid_daily_codes');
  settings.script_gift_codes=result.codes;
  state.giftSourceDay=day;state.giftSourceRetryAt=0;
  log(result.message);
 }catch{state.giftSourceRetryAt=now+3600000;log('禮包碼每日更新回覆逾時或格式未確認，保留原名單，1 小時後再查');}
}
