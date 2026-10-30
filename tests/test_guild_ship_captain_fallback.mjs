import assert from 'node:assert/strict';import{runGuildShip}from'../backend/wx-guild-ship.mjs';
async function test({captain=false,qualified=true,mode='small_medium',fallback=false,missing=false,quality='RED'}={}){
 let wood=missing?0:10,calls=[],logs=[];const state={};const ship={shipId:7,type:3,state:1,leader:captain?{playerId:0}:{playerId:88},leaderCond:[{heroId:'H',star:3,exStar:1}],preparedEndTime:9999999999,cabin:[{crewId:1,order:[{id:'木材',num:3}]}],reward:{asset:[{id:'水姆币',num:100}]}};
 const client={connected:true,request:async req=>{if(req==='GuildShipRequest')return structuredClone({period:2,ship:[ship],ownRun:[]});if(req==='AllItemRequest')return{items:[{itemId:'木材',num:wood}]};if(req==='AllHeroRequest')return{heroes:[{heroId:'H',star:qualified?3:1,exclusive:{star:1}}]};throw Error(req);},sendWatch:async(req)=>{calls.push(req);if(req==='GuildShipSeekRequest')ship.leader={playerId:123};else if(req==='GuildShipOrderRequest'){ship.cabin[0].player={playerId:123};wood-=3;}else throw Error(req);}};
 await runGuildShip({client,protocol:{GuildShipState:{GS_STATE_PREPARED:1}},roleId:123,state,config:{ships:[{shipId:3,quality}],maxShips:1},settings:{ref_guild_ship_enabled:true,ref_guild_ship_captain:captain,ref_guild_ship_captainQualities:['超凡'],ref_guild_ship_mode:mode,ref_guild_ship_fallbackEnabled:fallback,ref_guild_ship_fallbackWaitMinutes:0},act:async(k,f)=>f(),log:m=>logs.push(m),sleep:async()=>{}});
 return{calls,logs,state};
}
assert.deepEqual((await test({captain:true})).calls,['GuildShipSeekRequest']);assert.equal((await test({captain:true,qualified:false})).calls.length,0);
assert.equal((await test({mode:'detect_red',quality:'PURPLE'})).calls.length,0);
assert.deepEqual((await test({mode:'detect_red',quality:'PURPLE',fallback:true})).calls,['GuildShipOrderRequest']);
const r=await test({missing:true});assert.equal(r.calls.length,0);assert.deepEqual(r.state.guildShipNeeds,[{id:'木材',num:3}]);
console.log('PASS captain combined-star eligibility, no unqualified claim, red-only detection, timed fallback, missing-material production handoff');
