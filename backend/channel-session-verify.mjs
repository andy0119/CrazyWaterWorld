import fs from 'node:fs';
import {GameClient} from './wx-game/client.mjs';
import {loadProtocol} from './wx-game/proto.mjs';
import {describeRole,listWorlds} from './wx-game/worlds.mjs';
const record=JSON.parse(fs.readFileSync(0,'utf8')),client=new GameClient({protocol:await loadProtocol()});client.on('error',()=>{});
let result={verified:false};const timer=setTimeout(()=>client.stop(),28000);
try{
 const response=await client.connect(record.login),role=describeRole(response.playerInfo);
 if(String(role?.id)===String(record.expectedRoleId)&&String(role?.appId)===String(record.expectedAppId)){
  await listWorlds(client);result={verified:true,role};
 }
}catch{}
finally{clearTimeout(timer);client.stop()}
console.log(JSON.stringify(result));
