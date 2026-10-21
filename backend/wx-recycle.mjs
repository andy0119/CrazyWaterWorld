import fs from 'node:fs';import{normalize}from'./wx-game/worlds.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./wx-game/task-tables.json',import.meta.url),'utf8')).tables;
const rank=q=>({BLUE:1,PURPLE:2,稀有:1,史诗:2}[q]??0);
export async function runRecycle({client,settings:s,act,log,config=defaults,paused=new Set()}){
 const read=async(req,res)=>normalize(await client.request(req,{},res,8000));
 for(const kind of ['pet','equip']){
  const pet=kind==='pet',enabled=s[pet?'beast_0':'equipment_0']&&s[pet?'beast_7':'equipment_8'];if(!enabled||paused.has('recycle-'+kind))continue;
  const allowed=new Set((s[`ref_island_${kind}_recycleAllowedUids`]??[]).map(String));const ceiling=rank(s[`ref_island_${kind}_decomposeBelowQuality`]);
  if(!allowed.size||!ceiling){log((pet?'放生':'分解')+'：需选择明确允许处理的 ID 及品质上限；未选择不会处理');continue;}
  const items=async()=>{const r=await read(pet?'AllPetRequest':'EquipsRequest',pet?'AllPetResponse':'EquipsResponse');return r[pet?'pets':'equip'];};
  const eligible=item=>{const cfg=(config[pet?'PetBreedCfg':'EquipCfg']?.data??[]).find(c=>c[pet?'petId':'id']===item[pet?'petId':'equipId']);const q=rank(cfg?.quality);return allowed.has(String(item.uid))&&q>0&&q<=ceiling&&Number(item.level??0)<=1&&Number(item.star??0)===0&&Number(item.refineLv??0)===0&&Number(item.profFeed??0)===0;};
  const inUse=async(uid,petId)=>{if(pet){const water=(await read('OnWaterRequest','OnWaterResponse')).building,fleets=(await read('MyFleetsRequest','MyFleetsResponse')).fleets;if(!Array.isArray(water)||!Array.isArray(fleets))return true;return water.some(b=>String(b.petServe?.petUid)===uid)||fleets.some(f=>f.petId&&f.petId===petId);}const heroes=(await read('AllHeroRequest','AllHeroResponse')).heroes;if(!Array.isArray(heroes))return true;return heroes.some(h=>(h.equips??[]).some(e=>String(e.uid)===uid));};
  try{const owned=await items();if(!Array.isArray(owned))continue;
   for(const item of owned.filter(eligible).slice(0,3)){
    const uid=String(item.uid);if(await inUse(uid,item.petId))continue;
    const result=await act(`recycle-${kind}:${uid}`,async()=>{
     const fresh=(await items())?.find(x=>String(x.uid)===uid);if(!fresh||!eligible(fresh)||await inUse(uid,fresh.petId))return{status:'rejected',message:'放生／分解对象已变化或正在使用，取消'};
     await client.sendWatch(pet?'FreePetRequest':'DecomposeEquipRequest',pet?{petUid:[uid]}:{uid:[uid]},{window:1000});
     const after=await items(),ok=Array.isArray(after)&&!after.some(x=>String(x.uid)===uid);
     return{status:ok?'verified':'unconfirmed',message:ok?`${pet?'放生':'分解'} ${uid}：已核对服务器清单移除；返还材料以游戏库存为准`:'放生／分解结果未确认，暂停本模块、不重送'};
    });if(result?.status==='unconfirmed'){paused.add('recycle-'+kind);break;}
   }
  }catch{paused.add('recycle-'+kind);log('放生／分解读取异常，暂停本模块；其他任务继续');}
 }
}
