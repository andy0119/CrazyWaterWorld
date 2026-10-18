const http=require('node:http');
const crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
function readRoles(code){return new Promise((resolve,reject)=>{let settled=false;const worker=new Worker(path.join(__dirname,'../wx-game/exchange-worker.cjs'),{workerData:{code}});const timeout=setTimeout(()=>{worker.terminate();if(!settled){settled=true;reject(Error('遊戲資料讀取逾時，請重新掃碼'))}},70000);worker.once('message',result=>{if(settled)return;settled=true;clearTimeout(timeout);worker.terminate();if(result.ok)resolve(result);else reject(Error('遊戲資料讀取失敗，階段：'+result.stage))});worker.once('error',()=>{if(settled)return;settled=true;clearTimeout(timeout);reject(Error('遊戲資料服務啟動失敗'))});worker.once('exit',()=>{if(!settled){settled=true;clearTimeout(timeout);reject(Error('遊戲資料服務提前結束'))}})})}
const {WxLoginService}=require('./service');
const service=new WxLoginService(),tasks=new Map();
const secret=process.env.AURORA_BRIDGE_SECRET;
const gameAppId='wx2ea52a972ea18e5e',TTL=110000;
function clean(id){const t=tasks.get(id);if(t){service.destroy(t.session);t.code=undefined;t.login=undefined;tasks.delete(id)}}
function publicTask(t){return {id:t.id,status:t.status,expires_at:t.expires,nickname:t.session.nickname||'',game_verified:t.status==='roles_ready',has_game_code:!!t.code,worlds:t.worlds||null,player:t.player||null}}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data))};
 if(req.headers['x-bridge-key']!==secret)return send(403,{error:'Forbidden'});
 try{
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error('Request too large')}
  const x=body?JSON.parse(body):{},route=req.url;
  if(route==='/start'){
   if(tasks.size>=20)throw Error('目前登入工作階段過多，請稍後再試');
   const {session,qr}=await service.createQrSession();
   const t={id:crypto.randomBytes(24).toString('hex'),session,status:'waiting',expires:Date.now()+TTL,busy:false};tasks.set(t.id,t);
   return send(200,{...publicTask(t),qr:'data:image/jpeg;base64,'+qr.toString('base64')});
  }
  const t=tasks.get(x.id);if(!t)return send(404,{error:'登入工作階段不存在或已結束'});
  if(route==='/cancel'){clean(t.id);return send(200,{success:true})}
  if(Date.now()>t.expires){clean(t.id);return send(410,{error:'登入碼已過期，請重新產生'})}
  if(t.busy)return send(200,publicTask(t));
  t.busy=true;
  try{
   if(route==='/status'&&['waiting','scanned'].includes(t.status))t.status=await service.poll(t.session);
   else if(route==='/confirm'){
    if(t.status!=='authorized')return send(409,{error:'請先在手機微信確認授權'});
    t.status='exchanging';
    try{await service.confirm(t.session);t.code=await service.issueCode(t.session,gameAppId);t.status='code_ready';t.expires=Date.now()+240000}catch(e){t.status='failed';throw e}
   }
   else if(route==='/roles'){
    if(t.status!=='code_ready'||!t.code)return send(409,{error:'請先完成掃碼並取得新的登入碼'});
    t.status='fetching_roles';const code=t.code;t.code=undefined;
    try{const result=await readRoles(code);t.worlds=result.worlds;t.player=result.player;t.login=result.login;t.status='roles_ready'}catch(e){t.status='failed';throw e}
   }
   else if(route==='/session'){if(t.status!=='roles_ready'||!t.login)return send(409,{error:'遊戲授權尚未就緒'});return send(200,{login:t.login})}
   else if(!['/status','/confirm'].includes(route))return send(404,{error:'Unknown route'});
   return send(200,publicTask(t));
  }finally{t.busy=false}
 }catch(e){send(502,{error:String(e.message).slice(0,300)})}
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port:server.address().port})+'\n'));
setInterval(()=>{for(const [id,t]of tasks)if(Date.now()>t.expires)clean(id);try{process.kill(Number(process.env.AURORA_PARENT_PID),0)}catch{process.exit(0)}},5000).unref();
