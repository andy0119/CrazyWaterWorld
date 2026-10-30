import assert from 'node:assert/strict';
import {runArena} from '../backend/wx-arena.mjs';
async function test(tickets,confirm=true){
 let count=0,sends=0;const views=[],results=[];
 const client={request:async(req)=>{
 if(req==='OnWaterRequest')return {building:[{buildingId:'1竞技场',level:1}]};
 if(req==='AllResourceRequest')return {list:[{res:5,amount:tickets-(confirm?sends:0)}]};
 if(req==='ArenaInfoRequest')return {myself:{id:'me',rankNo:10,power:100},dailyChallengeTimes:count,challenges:[{id:'other',rankNo:11,power:1}]};
 throw Error(req);
 },sendWatch:async()=>{sends++;count++;}};
 const state={level:20,power:100};
 await runArena({client,settings:{ref_battle_arena_enabled:true,ref_battle_arena_sweep:true},state,log:()=>{},emit:x=>views.push(x),act:async(k,fn)=>{const r=await fn();results.push(r);return r;}});
 return {sends,results,state,views};
}
let r=await test(2);assert.equal(r.sends,2);assert.ok(r.results.every(x=>x.status==='verified'));assert.equal(r.views[0].data.arenaPoint,2);
r=await test(0);assert.equal(r.sends,0);
r=await test(2,false);assert.equal(r.sends,1);assert.equal(r.state.arenaUnconfirmed,true);assert.equal(r.results[0].status,'unconfirmed');
console.log('PASS resource-backed tickets, exact consumption, zero-ticket stop, uncertain consumption pause');
