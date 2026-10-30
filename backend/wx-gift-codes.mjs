import {normalize} from './wx-game/worlds.mjs';
export async function runGiftCodes({client,settings,act,log,protocol,paused=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(paused.has('gift-codes'))return;
 const codes=[...new Set((settings.script_gift_codes??[]).filter(c=>typeof c==='string').map(c=>c.trim()).filter(Boolean))];
 const read=async(req,res)=>normalize(await client.request(req,{},res,8000));
 const snapshot=async()=>{const items=await read('AllItemRequest','AllItemResponse');const resources=await read('AllResourceRequest','AllResourceResponse');const assets=Object.fromEntries((items.items??[]).map(x=>[x.itemId,Number(x.num)]));for(const r of resources.list??[])if(r.res===3||r.res===4)assets[r.res===3?'GOLD':'RUBY']=Number(r.amount);return assets;};
 let attempted=0,verified=0,rejected=0;
 for(const code of codes){
  const result=await act('gift:'+code,async()=>{
   try{
    const before=await snapshot();let reply;
    try{reply=normalize(await client.request('GotGiftCodeRequest',{giftCode:code},'GotRewardResponse',8000));}
    catch(e){
     if(!e.prompt)throw e;
     const raw=e.prompt.prompt,mapped=protocol.Prompt?.[raw];
     const name=typeof mapped==='string'?mapped:typeof raw==='string'&&Object.hasOwn(protocol.Prompt??{},raw)?raw:null;
     const names={GIFT_CODE_EXPIRED:'已過期',GIFT_CODE_INVALID:'無效／不適用',GIFT_CODE_USED:'已領取',GIFT_CODE_BATCH_USED:'同批次已領取',GIFT_CODE_USED_BY_OTHER:'已被其他帳號使用'};
     const text=(e.prompt.args??[]).filter(x=>typeof x==='string').join(' ').slice(0,180);
     let reason=names[name];
     // Accept only explicit gift-code error text, never infer from generic blocking.
     if(!reason&&/(礼包码|禮包碼|兑换码|兌換碼|激活码|激活碼)/.test(text)){
      if(/已过期|已過期|已失效|过期|過期/.test(text))reason='已過期';
      else if(/已领取|已領取|已兑换|已兌換|已使用|重复领取|重複領取/.test(text))reason='已領取';
      else if(/不存在|无效|無效|错误|錯誤/.test(text))reason='無效／不適用';
     }
     const description=name??String(raw??'未知');
     return{status:reason?'rejected':'unconfirmed',message:'禮包碼 '+code+'：'+(reason??`未辨識提示 ${description}${text?'（'+text+'）':''}，暫停兌換`),serverPrompt:description,promptCode:raw,promptText:text};
    }
    const after=await snapshot();const expected=new Map();
    for(const a of reply.reward?.asset??[]){const n=Number(a.num);if(!a.id||!Number.isSafeInteger(n)||n<=0)return{status:'unconfirmed',message:'禮包碼 '+code+'：獎勵格式無法確認，暫停兌換'};expected.set(a.id,(expected.get(a.id)??0)+n);}
    const ok=expected.size>0&&[...expected].every(([id,n])=>Number.isFinite(after[id])&&(after[id]??0)-(before[id]??0)>=n);
    return{status:ok?'verified':'unconfirmed',message:'禮包碼 '+code+'：'+(ok?'已確認庫存增加':'有獎勵回覆，庫存增量尚未確認；暫停兌換')};
   }catch{return{status:'unconfirmed',message:'禮包碼 '+code+'：連線或庫存查詢未確認，暫停兌換且不自動重送'};}
   finally{await sleep(2500);}
  });
  if(!result)continue;attempted++;if(result.status==='verified')verified++;if(result.status==='rejected')rejected++;
  if(result.status==='unconfirmed'){paused.add('gift-codes');log('禮包碼結果未確認，本次只暫停兌換，其他任務繼續');break;}
 }
 if(attempted)log(`禮包碼本輪：嘗試 ${attempted}，入庫確認 ${verified}，已領／過期／無效 ${rejected}；已記錄的碼不重送`);
}
