import assert from 'node:assert/strict';
import {runCraftingGuarded,resumeCraftingAfterEquipClaim} from '../backend/wx-crafting.mjs';
const paused=new Set();await runCraftingGuarded({run:async()=>{throw Error('unconfirmed_equip_make')},client:{connected:true},paused,log:()=>{}});assert.ok(paused.has('crafting:equipment'));resumeCraftingAfterEquipClaim({paused,log:()=>{}});assert.equal(paused.has('crafting'),false);
const pet=new Set();await runCraftingGuarded({run:async()=>{throw Error('unconfirmed_pet_breed')},client:{connected:true},paused:pet,log:()=>{}});resumeCraftingAfterEquipClaim({paused:pet,log:()=>{}});assert.ok(pet.has('crafting'));
console.log('PASS confirmed equipment recovery, unrelated pet uncertainty remains paused');
