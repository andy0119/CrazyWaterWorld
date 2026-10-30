import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const display={textContent:''},context={document:{getElementById:()=>display}};vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../web/role-identity.js',import.meta.url),'utf8'),context);
context.setRoleIdentityAccount({platform:'wechat',server_name:'测试区',uid:'test-id',status:'running'});
assert.match(display.textContent,/任务执行中/);assert.ok(!display.textContent.includes('待连接游戏'));
context.updateRoleIdentityRun({status:'reconnecting',finished:null});assert.match(display.textContent,/等待重新连接/);
context.updateRoleIdentityRun({status:'running',finished:123});assert.match(display.textContent,/任务已停止/);
context.updateRoleIdentityRun({status:'reauthorization_required'});assert.match(display.textContent,/请重新授权/);
context.updateRoleIdentityRun(null);context.setRoleIdentityAccount({platform:'wechat',uid:'test-id',status:'idle'});assert.match(display.textContent,/任务未启动/);
console.log('PASS identity header distinguishes running/reconnecting/stopped/reauthorization and follows task-state polling');

const catalog=JSON.parse(fs.readFileSync(new URL('../backend/task_catalog.json',import.meta.url),'utf8'));
const fields=catalog.flatMap(s=>s.fields).filter(f=>/^ref_world_chipMine_fleets_[012]_levels$/.test(f.key));assert.equal(fields.length,3);
for(const f of fields){assert.equal(f.type,'select');assert.deepEqual(f.options,[{value:5,label:'橙色矿'},{value:4,label:'紫色矿'},{value:3,label:'蓝色矿'}]);}
console.log('PASS chip-mine controls display color choices while retaining numeric protocol values');
