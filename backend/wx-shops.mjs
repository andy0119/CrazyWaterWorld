import fs from 'node:fs';
const adEntitlements=JSON.parse(fs.readFileSync(new URL('./advertising-entitlements.json',import.meta.url),'utf8'));
import {normalize} from './wx-game/worlds.mjs';
export async function runShops({client,protocol,settings:s,state={},act,log,emit=()=>{},roleId,paused=new Set(),history=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!s.ref_shop_enabled)return;
 const read=(req,res,body={})=>client.request(req,body,res,8000).then(normalize);
 const now=()=>Math.floor((Date.now()+(client.serverClockOffsetMs??0))/1000),day=Math.floor((now()+28800)/86400);
 const stock=async()=>{const items=await read('AllItemRequest','AllItemResponse'),resources=await read('AllResourceRequest','AllResourceResponse');if(!Array.isArray(items.items)||!Array.isArray(resources.list))throw Error('unknown_shop_inventory');const out=Object.fromEntries(items.items.map(x=>[x.itemId,Number(x.num)]));for(const x of resources.list){const id=({1:'EXP',3:'GOLD',4:'RUBY',5:'ARENA_POINT',6:'LEAGUE_POINT'})[x.res];if(id)out[id]=Number(x.amount);}return out;};
 if(state.shopRubyDay!==day){state.shopRubyDay=day;state.shopRubySpent=[...history].filter(k=>k.startsWith('shop:')&&k.split(':')[2]===String(day)&&k.split(':')[5]==='RUBY').reduce((n,k)=>n+(Number(k.split(':')[6])||0),0);}state.shopRubySpent??=0;
 for(const name of ['arena','vip','discount']){
  if(s['ref_shop_'+name]!==true||paused.has('shop:'+name))continue;
  try{
   const discount=name==='discount',type=name==='arena'?protocol.ShopType.ARENA_SHOP:protocol.ShopType.VIP_SHOP;
   const info=await read(discount?'DiscountShopRequest':'ShopInfoRequest',discount?'DiscountShopResponse':'ShopInfoResponse',discount?{}:{type});
   const rows=discount?info.shopItem:info.product;if(!Array.isArray(rows))throw Error('unknown_shop_list');
   const options=rows.filter(x=>Number.isSafeInteger(x.id)&&x.id>0).map(x=>({value:String(x.id),label:discount?`商品 ${x.id}（钻石 ${Math.floor(Number(x.price)*Number(x.discount))}）`:`${x.asset?.id??'商品'} ×${x.asset?.num??'?'}（ID ${x.id}，${x.price?.id??'?'} ${Math.floor(Number(x.price?.num)*Number(x.discount)/100)}）`}));
   emit({type:'setting_options',roleId:String(roleId),options:{['ref_shop_'+name+'_items']:options}});
   const selected=new Set(s['ref_shop_'+name+'_items']??[]);if(!selected.size){log('商店 '+name+'：已读取 '+rows.length+' 项，请选择要兑换的商品');continue;}
   for(const row of rows.filter(x=>selected.has(String(x.id))).slice(0,5)){
    if(discount?row.isBuy===true:row.limitBuyTimes>0&&row.buyTimes>=row.limitBuyTimes)continue;
    if(!discount&&Number(row.vipLevel??0)>Number(state.vipLevel??0))continue;
    const currency=discount?'RUBY':row.price?.id,cost=discount?Math.floor(Number(row.price)*Number(row.discount)):Math.floor(Number(row.price?.num)*Number(row.discount)/100);
    if(!currency||!Number.isSafeInteger(cost)||cost<0)continue;
    const budget=Number(s.ref_shop_rubyDailyLimit??0);
    if(currency==='RUBY'&&(s.ref_shop_allowRuby!==true||!Number.isSafeInteger(budget)||budget<=0||state.shopRubySpent+cost>budget)){log('商店 '+name+'：未开启耗钻或超过每日钻石预算，跳过商品 '+row.id);continue;}
    const before=await stock();if(!Number.isSafeInteger(before[currency]??0)||(before[currency]??0)<cost)continue;
    const key=`shop:${name}:${day}:${info.nextRefreshTime??info.refreshTime??0}:${row.id}:${currency}:${cost}`;
    const result=await act(key,async()=>{
     // Reserve uncertain spending until the next server day; never refund an unclear result.
     history.add(key);if(currency==='RUBY')state.shopRubySpent+=cost;
     const reply=await read(discount?'DiscountShopBuyRequest':'BuyShopProductRequest',discount?'DiscountShopBuyResponse':'GotRewardResponse',discount?{id:row.id}:{type,id:row.id,num:1});
     const assets=reply.reward?.asset??[],expected={};for(const a of assets){if(!a.id||!Number.isSafeInteger(Number(a.num))||Number(a.num)<=0)return{status:'unconfirmed',message:'商店奖励资料未确认，仅暂停本商店'};expected[a.id]=(expected[a.id]??0)+Number(a.num);}
     if(!Object.keys(expected).length)return{status:'unconfirmed',message:'商店未返回奖励，仅暂停本商店'};
     expected[currency]=(expected[currency]??0)-cost;
     let ok=false;
     for(const wait of [0,400,800]){if(wait)await sleep(wait);const after=await stock(),fresh=await read(discount?'DiscountShopRequest':'ShopInfoRequest',discount?'DiscountShopResponse':'ShopInfoResponse',discount?{}:{type});const current=(discount?fresh.shopItem:fresh.product)?.find(x=>x.id===row.id);const counted=current&&(discount?current.isBuy===true:current.buyTimes===Number(row.buyTimes??0)+1);ok=!!counted&&Object.entries(expected).every(([id,n])=>Number.isSafeInteger(after[id]??0)&&(after[id]??0)-(before[id]??0)===n);if(ok)break;}
     return{status:ok?'verified':'unconfirmed',message:ok?`商店 ${name} 商品 ${row.id}：已核对购买标记、${currency} 消耗 ${cost} 与奖励入库`:`商店 ${name} 商品 ${row.id} 未确认，仅暂停本商店，不重送`};
    });
    if(result?.status==='unconfirmed'){paused.add('shop:'+name);break;}
   }
  }catch(e){if(client.connected===false)throw e;paused.add('shop:'+name);log('商店 '+name+' 读取或兑换异常，仅暂停本商店，不重复请求');}
 }
 if(s.ref_shop_advertisement===true&&!paused.has('shop:advertisement')){
  if(!adEntitlements.noAdVipLevels.includes(state.vipLevel)){log('广告商店：未确认官方VIP免广告资格，仍需真实播放完成回调；不发领奖请求');return;}
  try{
   const info=await read('AdvShopInfoRequest','AdvShopInfoResponse');
   if(!Array.isArray(info.product))throw Error('unknown_ad_shop_list');
   const available=info.product.filter(x=>Number.isSafeInteger(x.id)&&x.id>0&&Number.isSafeInteger(x.gotTimes)&&x.gotTimes>=0&&Number.isSafeInteger(x.max)&&x.gotTimes<x.max);
   if(!available.length){log('广告商店：本日商品均已领满或尚未开放');return;}
   for(const row of available.slice(0,5)){
    const result=await act(`shop-advertisement:${day}:${row.id}:${row.gotTimes}`,async()=>{
     const before=await stock();
     await client.sendWatch('WatchAdvRequest',{type:protocol.AdvType.ADV_SHOP,id:row.id},{window:1000});
     const grant=(await read('AdvShopInfoRequest','AdvShopInfoResponse')).product?.find(x=>x.id===row.id);
     if(!grant||grant.reward!==true)return{status:'unconfirmed',message:`广告商店 ${row.id}：未读到服务器可领取授权，暂停且不领奖`};
     const reply=await read('GotAdvRewardRequest','GotRewardResponse',{id:row.id}),assets={};
     for(const a of reply.reward?.asset??[]){if(!a.id||!Number.isSafeInteger(Number(a.num))||Number(a.num)<=0)return{status:'unconfirmed',message:'广告商店奖励格式未确认，仅暂停本商店'};assets[a.id]=(assets[a.id]??0)+Number(a.num);}
     if(!Object.keys(assets).length)return{status:'unconfirmed',message:'广告商店未返回奖励，仅暂停本商店'};
     let verified=false;
     for(const wait of [0,400,800]){if(wait)await sleep(wait);const current=(await read('AdvShopInfoRequest','AdvShopInfoResponse')).product?.find(x=>x.id===row.id),after=await stock();
      verified=current?.gotTimes===row.gotTimes+1&&current.gotTimes<=row.max&&Object.entries(assets).every(([id,n])=>Number.isSafeInteger(after[id]??0)&&(after[id]??0)-(before[id]??0)>=n)&&(after.RUBY??0)>=(before.RUBY??0);
      if(verified)break;
     }
     return{status:verified?'verified':'unconfirmed',message:verified?`广告商店 ${row.asset?.id??row.id}：官方免广告授权、次数 ${row.gotTimes+1}/${row.max} 与奖励入库已核对`:`广告商店 ${row.id} 兑换结果未确认，仅暂停本商店，不重送`};
    });
    if(result&&result.status!=='verified'){paused.add('shop:advertisement');break;}
   }
  }catch(e){if(client.connected===false)throw e;paused.add('shop:advertisement');log('广告商店读取或兑换异常，仅暂停本商店，不重送');}
 }

}
