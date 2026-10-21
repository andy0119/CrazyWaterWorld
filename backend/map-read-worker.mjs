import readline from 'node:readline';
import {GameClient} from './wx-game/client.mjs';
import {loadProtocol} from './wx-game/proto.mjs';
import {normalize,describeRole} from './wx-game/worlds.mjs';
import {finishGameLogin} from './wx-login-init.mjs';
import {emitWorldMap} from './wx-map-view.mjs';
const input=readline.createInterface({input:process.stdin});const config=await new Promise(resolve=>input.once('line',line=>resolve(JSON.parse(line))));input.close();
const client=new GameClient({protocol:loadProtocol()});client.on('error',()=>{});
const timer=setTimeout(()=>{client.stop();process.exit(2)},30000);
try{const login=await client.connect(config.login);if(String(describeRole(login.playerInfo)?.id)!==String(config.roleId))throw Error('role');
 await finishGameLogin({client,log:()=>{}});let result;
 await emitWorldMap({client,state:{scenarioId:Number(normalize(login.playerInfo).scenarioId)||1},roleId:config.roleId,emit:e=>result=e,log:()=>{}});
 if(!result?.data?.cities?.length)throw Error('empty');client.stop();clearTimeout(timer);process.stdout.write(JSON.stringify(result),()=>process.exit(0));
}catch{client.stop();clearTimeout(timer);process.stderr.write('Map refresh failed; recheck game authorization.');process.exit(2);}
