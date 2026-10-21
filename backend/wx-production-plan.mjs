// Plan only one prerequisite batch per demanded recipe. Never invent batch yields.
export function expandProductionNeeds({needs,rank,recipes,buildings,unlocks,stock,disabled=[]}){
 const result=new Map(needs),order=new Map(rank),queued=new Set(buildings.flatMap(b=>b.factory?.factoryQ??[]).map(q=>q.productId));
 const allowed=recipes.filter(r=>!r.limitType&&buildings.some(b=>b.level>0&&b.factory&&b.level>=r.unlockLevel&&!disabled.includes(b.buildingId)&&!disabled.includes(r.buildType)&&unlocks.some(u=>u.buildingId===b.buildingId&&u.buildingType===r.buildType)));
 const seen=new Set(),cycles=new Set();
 function visit(id,path){if(path.has(id)){cycles.add(id);return}if(seen.has(id)||queued.has(id)||(stock[id]??0)>=(result.get(id)??0))return;seen.add(id);const recipe=allowed.find(r=>r.itemId===id);if(!recipe)return;const next=new Set(path);next.add(id);
  for(const [material,amount] of recipe.costItem??[]){const n=Number(amount);if(material==='RUBY'||!Number.isSafeInteger(n)||n<=0)continue;if(next.has(material)){cycles.add(material);continue}if((stock[material]??0)<n){result.set(material,Math.max(result.get(material)??0,n));order.set(material,Math.min(order.get(material)??Infinity,order.get(id)??Infinity));visit(material,next);}}
 }
 for(const id of needs.keys())visit(id,new Set());return{needs:result,rank:order,queued,cycles};
}
