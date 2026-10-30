import assert from 'node:assert/strict';
import {runShops}from'../backend/wx-shops.mjs';
async function test({name='arena',selected=true,allow=false,budget=0,uncertain=false,history=new Set(),vipLevel=5}={}){
 let ruby=100,coins=100,goods=0,buyTimes=0,isBuy=false,calls=0,options=[];const paused=new Set();
 const product=()=>({id:1,asset:{id:'wood',num:5},price:{id:name==='arena'?'竞技币':'RUBY',num:10},discount:100,buyTimes,limitBuyTimes:1,vipLevel:0});
 const client={connected:true,request:async(req,body,res)=>{
 if(req==='AllItemRequest')return{items:[{itemId:'wood',num:goods},{itemId:'竞技币',num:coins}]};
 if(req==='AllResourceRequest')return{list:[{res:4,amount:ruby}]};
 if(req==='ShopInfoRequest')return{product:[product()],nextRefreshTime:123};
 if(req==='DiscountShopRequest')return{shopItem:[{id:1,price:20,discount:.5,isBuy}],refreshTime:123};
 if(req==='BuyShopProductRequest'||req==='DiscountShopBuyRequest'){calls++;assert.equal(res,req==='BuyShopProductRequest'?'GotRewardResponse':'DiscountShopBuyResponse');if(!uncertain){goods+=5;buyTimes++;isBuy=true;if(name==='arena')coins-=10;else ruby-=10;}return{reward:{asset:[{id:'wood',num:5}]}};}
 throw Error(req);
 }};
 await runShops({client,protocol:{ShopType:{ARENA_SHOP:1,VIP_SHOP:3}},settings:{ref_shop_enabled:true,['ref_shop_'+name]:true,['ref_shop_'+name+'_items']:selected?['1']:[],ref_shop_allowRuby:allow,ref_shop_rubyDailyLimit:budget},state:{vipLevel},history,paused,emit:e=>options.push(e),log:()=>{},act:async(k,fn)=>fn(),sleep:async()=>{}});
 return{calls,ruby,coins,goods,paused,options,history};
}
let r=await test();assert.equal(r.calls,1);assert.equal(r.coins,90);assert.equal(r.goods,5);assert.equal(r.options[0].options.ref_shop_arena_items[0].value,'1');
assert.equal((await test({selected:false})).calls,0);
for(const name of ['vip','discount']){assert.equal((await test({name})).calls,0);assert.equal((await test({name,allow:true,budget:9})).calls,0);r=await test({name,allow:true,budget:10});assert.equal(r.calls,1);assert.equal(r.ruby,90);assert.equal((await test({name,allow:true,budget:10,history:r.history})).calls,0);}
r=await test({uncertain:true});assert.ok(r.paused.has('shop:arena'));assert.equal(r.calls,1);
console.log('PASS selected product only, coin/reward/counter verification, VIP/discount opt-in and budget, restart budget retained, uncertain isolation');
