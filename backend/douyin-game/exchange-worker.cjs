const {parentPort,workerData}=require('node:worker_threads');let stage='sdk_init';process.on('unhandledRejection',()=>{});console.log=()=>{};console.warn=()=>{};console.error=()=>{};
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
if(!workerData?.initOnly&&(typeof workerData?.code!=='string'||!workerData.code.trim()||workerData.code.length>4096)){parentPort.postMessage({ok:false,stage:'code_validation',error:'缺少有效的抖音小程序授權碼'});process.exit(1)}
const root=__dirname;
// Diagnostic metadata excludes request bodies, headers, query values and tokens.
const requestDiagnostics=[];
const unsupportedHostApis=new Set();
const hostEventHandlers=new Map();
const registerHostEvent=(name,handler)=>{if(typeof handler==='function')hostEventHandlers.set(name,handler)};
const source=fs.readFileSync(path.join(root,'sdk-bundle.js'),'utf8');
const modules=new Map(),cache=new Map(),store=new Map();
const system={platform:'windows',system:'Windows 10',model:'PC',brand:'PC',version:'8.0.65',SDKVersion:'3.10.0',language:'zh_CN',screenWidth:1080,screenHeight:1920,pixelRatio:1,devicePixelRatio:1};
const wx=new Proxy({onError:h=>registerHostEvent('error',h),onHide:h=>registerHostEvent('hide',h),onMemoryWarning:h=>registerHostEvent('memoryWarning',h),onNetworkStatusChange:h=>registerHostEvent('network',h),onShow:h=>registerHostEvent('show',h),removeStorageSync:k=>store.delete(k),getGameRecorderManager:()=>new Proxy({},{get:()=>()=>{}}),login:o=>o.success?.({code:workerData.code,anonymousCode:workerData.anonymousCode||'',isLogin:!!workerData.code,errMsg:'login:ok'}),getGameLiveState:()=>({isLive:false}),getSystemInfoSync:()=>system,getAppBaseInfo:()=>system,getDeviceInfo:()=>system,getWindowInfo:()=>system,getAccountInfoSync:()=>({miniProgram:{appId:'tt76340089e939a1bf02',envVersion:'release',version:'71'}}),getLaunchOptionsSync:()=>({scene:1001,query:{}}),getEnterOptionsSync:()=>({scene:1001,query:{}}),getStorageSync:k=>store.get(k)||'',setStorageSync:(k,v)=>store.set(k,v),getNetworkType:o=>o?.success?.({networkType:'wifi'}),getSetting:o=>o?.success?.({authSetting:{},subscriptionsSetting:{}}),request:o=>{
const u=new URL(o.url);const allowed=new Set(['api.gzxianc.com','api.gzxiancheng.com','minigame.ewan.cn','minigame-channel.cwmob.cn','cdn.gzxianc.com']);
if(!allowed.has(u.hostname)){requestDiagnostics.push({host:u.hostname,blocked:true});queueMicrotask(()=>{o.success?.({statusCode:200,data:{},header:{}});o.complete?.({})});return {abort(){}}}

const controller=new AbortController();let body=o.data;const method=(o.method||'GET').toUpperCase();const headers=o.header||{};
if(method==='GET'&&body){if(typeof body==='string'){const x=new URLSearchParams(body);for(const [k,v]of x)u.searchParams.append(k,v)}else for(const [k,v]of Object.entries(body))u.searchParams.append(k,String(v));body=undefined}
else if(body&&typeof body!=='string'&&!Buffer.isBuffer(body))body=JSON.stringify(body);
fetch(u,{method,headers,body:method==='GET'?undefined:body,signal:controller.signal}).then(async r=>{let text=await r.text(),data;if(o.dataType==='text'){data=text}else{try{data=JSON.parse(text)}catch{data=text}}requestDiagnostics.push({host:u.hostname,status:r.status,responseType:typeof data,fields:data&&typeof data==='object'?Object.keys(data).filter(k=>/^[A-Za-z_][A-Za-z0-9_]{0,50}$/.test(k)).slice(0,20):[]});o.success?.({statusCode:r.status,data,header:Object.fromEntries(r.headers)});o.complete?.({})}).catch(e=>{requestDiagnostics.push({host:u.hostname,networkFailure:true});o.fail?.({errMsg:e.message});o.complete?.({})});
return {abort(){controller.abort()}}
},createInnerAudioContext:()=>({}),createUserInfoButton:()=>({onTap(){},destroy(){}})}, {get:(t,k)=>k in t?t[k]:(...args)=>{if(typeof k==='string')unsupportedHostApis.add(k)}});
function load(name){if(name.includes('_instanceof'))return {_:(a,b)=>a instanceof b};if(name.includes('_type_of'))return {_:(v)=>typeof v};if(name.startsWith('./'))name='subpackages/minisdk/'+name.slice(2);if(cache.has(name))return cache.get(name).exports;const factory=modules.get(name);if(!factory)throw Error('Unsupported module '+name);const m={exports:{}};cache.set(name,m);factory(load,m,m.exports,console,Promise,setTimeout,clearTimeout,setInterval,clearInterval,()=>{},()=>{},context);return m.exports}
const context={tt:wx,wx,console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval,Promise,TextEncoder,TextDecoder,URL,URLSearchParams,ArrayBuffer,Uint8Array,Buffer,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),System:{register(){}},__tt_define__:(name,factory)=>modules.set(name,factory),define:(name,factory)=>modules.set(name,factory),require:load};context.GameGlobal=context;context.window=context;context.global=context;
vm.createContext(context);

function fail(stage,detail){const diagnostics={requests:requestDiagnostics.slice(-12),unsupportedHostApis:[...unsupportedHostApis].sort()};if(detail&&typeof detail==='object'){for(const k of ['code','status','errNo','errorCode'])if(typeof detail[k]==='number'||(typeof detail[k]==='string'&&/^-?[0-9]{1,8}$/.test(detail[k])))diagnostics[k]=detail[k];diagnostics.fields=Object.keys(detail).filter(k=>/^[A-Za-z_][A-Za-z0-9_]{0,50}$/.test(k));const msg=String(detail.msg||detail.message||detail.errMsg||detail.errorMsg||'');diagnostics.messageClass=/系统|system|server|服务|網絡|网络/i.test(msg)?'server_or_network':/参数|param/i.test(msg)?'parameters':/登录|登陆|login|code/i.test(msg)?'login':'other';diagnostics.messageLength=msg.length;diagnostics.safeMessage=msg.replace(/https?:\/\/[^\s]+/g,'[URL]').replace(/[A-Za-z0-9_+\/=.-]{12,}/g,'[REDACTED]').replace(/\d{6,}/g,'[NUMBER]').slice(0,160);diagnostics.category=/used|使用过|已使用/i.test(msg)?'already_used':/expir|过期|失效/i.test(msg)?'expired':/sign|签名/i.test(msg)?'signature':/code|登录码|授權碼|授权码/i.test(msg)?'authorization_code':'unspecified';}parentPort.postMessage({ok:false,stage,error:'該步驟未完成，請檢查診斷狀態',diagnostics});process.exit(1)}
async function queryRoles(raw,info){
 try{
  if(workerData.sdkOnly){
   const user=typeof raw==='string'?JSON.parse(raw):raw;
   if(!user?.openId||!user?.token||!user?.sign||!user?.timestamp)return fail('sdk_exchange');
   parentPort.postMessage({ok:true,sdk_exchanged:true,sessionData:user,clientInfo:info});process.exit(0);
  }
  stage='game_session';
  const user=typeof raw==='string'?JSON.parse(raw):raw;
  if(!user||!user.openId||!user.token||!user.sign||!user.timestamp)return fail('sdk_exchange');
  const {loadProtocol}=await import('./proto.mjs');
  const {GameClient}=await import('./client.mjs');
  const {listWorlds,describeRole}=await import('./worlds.mjs');
  const client=new GameClient({protocol:loadProtocol()});
  client.on('error',()=>{});
  try{
   const login={language:'zh_CN',systemLanguage:'zh_CN',worldId:0,eworldParams:{openId:user.openId,token:user.token,timestamp:user.timestamp,sign:user.sign},eworldClientInfo:{appId:info.appId,channelId:info.channelId,sc:info.sc,extc:info.extc,biz:info.biz,did:info.did,platform:'5',networkType:'Wifi',clientVersion:'1.11.6.480',isAuth:user.isAuth,birthday:user.birthday}};
   const response=await client.connect(login);
   stage='role_list';const worlds=await listWorlds(client);
   parentPort.postMessage({ok:true,worlds,player:describeRole(response.playerInfo)});
  }finally{client.stop()}
  process.exit(0);
 }catch(e){parentPort.postMessage({ok:false,stage,error:'抖音登入處理失敗'});process.exit(1)}
}
try{
 vm.runInContext(source,context,{timeout:15000});
 const Instance=load('subpackages/minisdk/ttMiniSuperSDK.js').default;
 const instance=new Instance();
 const config=JSON.parse(fs.readFileSync(path.join(root,'sdk-config.json'),'utf8'));
 instance.init({...config,isLandscape:false,onSuccess:()=>{
  instance.getDataInfo({onSuccess:info=>{
   if(workerData.initOnly){parentPort.postMessage({ok:true,sdk_ready:true,has_app_info:!!info.appId,unsupportedHostApis:[...unsupportedHostApis].sort(),runtime:{platform:context.EwGamedata?.platform,system:context.EwGamedata?.system,deviceCodePresent:!!context.EwGamedata?.devicecode,scene:context.EwAdInfo?.scene}});process.exit(0)}
   stage='sdk_exchange';instance.login({onSuccess:user=>queryRoles(user,info),onFailed:e=>fail(stage,e)})
  },onFailed:()=>fail('sdk_config')})
 },onFailed:()=>fail('sdk_init')});
}catch(e){parentPort.postMessage({ok:false,stage,error:'抖音登入處理失敗'});process.exit(1)}
