import fs from 'node:fs';import{normalize}from './wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./hero-show-rewards.json',import.meta.url),'utf8'));
export async function runHeroShows({client,settings:s,act,log,paused=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),config=defaults}){
 if(s.ref_hero_show!==true||paused.has('hero-show'))return;
 const read=async(req,res,body={})=>normalize(await client.request(req,body,res,8000));
 const inventory=async()=>{const a=await read('AllItemRequest','AllItemResponse'),b=await read('AllResourceRequest','AllResourceResponse');if(!Array.isArray(a.items)||!Array.isArray(b.list))throw Error('unknown_show_inventory');const stock=Object.fromEntries(a.items.map(x=>[x.itemId,Number(x.num)]));for(const x of b.list)if([1,3,4].includes(x.res))stock[({1:'EXP',3:'GOLD',4:'RUBY'})[x.res]]=Number(x.amount);return stock;};
 try{
 const info=await read('AllHeroRequest','AllHeroResponse');if(!Array.isArray(info.heroes)||!Array.isArray(info.showSkillHeroes))throw Error('unknown_show_roster');
 const claimed=new Set(info.showSkillHeroes);const eligible=info.heroes.filter(x=>!claimed.has(x.heroId)&&config[x.heroId]);if(!eligible.length){log('英雄技能展示：当前已持有英雄没有未领取的展示奖励');return;}
 for(const hero of eligible.slice(0,3)){
  const result=await act(`hero-show:${hero.heroId}`,async()=>{
   const current=await read('AllHeroRequest','AllHeroResponse');if(!current.heroes?.some(x=>x.heroId===hero.heroId)||!Array.isArray(current.showSkillHeroes)||current.showSkillHeroes.includes(hero.heroId))return{status:'rejected',message:'英雄技能展示奖励已领取或持有状态已变化'};
   const before=await inventory(),expected=config[hero.heroId];if(!expected.every(a=>Number.isSafeInteger(before[a.id]??0)&&Number.isSafeInteger(a.num)&&a.num>0))return{status:'rejected',message:'英雄技能展示奖励或库存无法核对'};
   const reply=await read('GotHeroShowSkillRequest','GotRewardResponse',{heroId:hero.heroId});const assets=reply.reward?.asset??[];const reward={};for(const a of assets)reward[a.id]=(reward[a.id]??0)+Number(a.num);
   const matches=expected.every(a=>reward[a.id]===a.num);let verified=false;
   for(const wait of [0,400,800]){if(wait)await sleep(wait);const after=await read('AllHeroRequest','AllHeroResponse'),stock=await inventory();verified=matches&&after.showSkillHeroes?.includes(hero.heroId)&&expected.every(a=>(stock[a.id]??0)-(before[a.id]??0)>=a.num);if(verified)break;}
   return{status:verified?'verified':'unconfirmed',message:verified?`英雄 ${hero.heroId} 技能展示奖励：已核对领取名单与奖励入库`:'英雄技能展示奖励未确认，仅暂停本功能，不重复领取'};
  });if(result?.status==='unconfirmed'){paused.add('hero-show');return;}
 }
 }catch(e){if(client.connected===false)throw e;paused.add('hero-show');log('英雄技能展示：回覆未确认，暂停本功能');}
}
