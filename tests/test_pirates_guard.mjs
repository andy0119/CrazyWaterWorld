import assert from 'node:assert/strict';
import {runPiratesGuarded} from '../backend/wx-pirates.mjs';
const paused=new Set();let calls=0;
await runPiratesGuarded({run:async()=>{calls++;throw Error('unconfirmed_pirate_attack');},client:{connected:true},paused,log:()=>{}});
await runPiratesGuarded({run:async()=>calls++,client:{connected:true},paused,log:()=>{}});
assert.equal(calls,1);assert.ok(paused.has('pirates'));
await assert.rejects(runPiratesGuarded({run:async()=>{throw Error('unconfirmed_pirate_attack');},client:{connected:false},paused:new Set(),log:()=>{}}));
console.log('PASS isolated uncertainty, no repeated dispatch, disconnect propagated');
