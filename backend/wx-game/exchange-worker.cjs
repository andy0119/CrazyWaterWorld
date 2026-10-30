const {parentPort,workerData}=require('node:worker_threads');let stage='sdk_init';process.on('unhandledRejection',()=>{});console.log=()=>{};console.warn=()=>{};console.error=()=>{};
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=__dirname;
const source=fs.readFileSync(path.join(root,'sdk-bundle.js'),'utf8');
const modules=new Map(),cache=new Map(),store=new Map();
const system={platform:'windows',system:'Windows 10',model:'PC',brand:'PC',version:'8.0.65',SDKVersion:'3.10.0',language:'zh_CN',screenWidth:1080,screenHeight:1920,pixelRatio:1,devicePixelRatio:1};
const wx=new Proxy({login:o=>o.success?.({code:workerData.code,errMsg:'login:ok'}),getGameLiveState:()=>({isLive:false}),getSystemInfoSync:()=>system,getAppBaseInfo:()=>system,getDeviceInfo:()=>system,getWindowInfo:()=>system,getAccountInfoSync:()=>({miniProgram:{appId:'wx2ea52a972ea18e5e',envVersion:'release',version:'71'}}),getLaunchOptionsSync:()=>({scene:1001,query:{}}),getEnterOptionsSync:()=>({scene:1001,query:{}}),getStorageSync:k=>store.get(k)||'',setStorageSync:(k,v)=>store.set(k,v),getNetworkType:o=>o?.success?.({networkType:'wifi'}),getSetting:o=>o?.success?.({authSetting:{},subscriptionsSetting:{}}),request:o=>{
const u=new URL(o.url);const allowed=new Set(['api.gzxianc.com','api.gzxiancheng.com','minigame.ewan.cn','minigame-channel.cwmob.cn','cdn.gzxianc.com']);
if(!allowed.has(u.hostname)){queueMicrotask(()=>{o.success?.({statusCode:200,data:{},header:{}});o.complete?.({})});return {abort(){}}}

const controller=new AbortController();let body=o.data;const method=(o.method||'GET').toUpperCase();const headers=o.header||{};
if(method==='GET'&&body){if(typeof body==='string'){const x=new URLSearchParams(body);for(const [k,v]of x)u.searchParams.append(k,v)}else for(const [k,v]of Object.entries(body))u.searchParams.append(k,String(v));body=undefined}
else if(body&&typeof body!=='string'&&!Buffer.isBuffer(body))body=JSON.stringify(body);
fetch(u,{method,headers,body:method==='GET'?undefined:body,signal:controller.signal}).then(async r=>{let text=await r.text(),data;try{data=JSON.parse(text)}catch{data=text}o.success?.({statusCode:r.status,data,header:Object.fromEntries(r.headers)});o.complete?.({})}).catch(e=>{o.fail?.({errMsg:e.message});o.complete?.({})});
return {abort(){controller.abort()}}
},createInnerAudioContext:()=>({}),createUserInfoButton:()=>({onTap(){},destroy(){}})}, {get:(t,k)=>k in t?t[k]:(...args)=>{}});
function load(name){if(name.includes('_instanceof'))return {_:(a,b)=>a instanceof b};if(name.includes('_type_of'))return {_:(v)=>typeof v};if(name.startsWith('./'))name='subpackages/minisdk/'+name.slice(2);if(cache.has(name))return cache.get(name).exports;const factory=modules.get(name);if(!factory)throw Error('Unsupported module '+name);const m={exports:{}};cache.set(name,m);factory(load,m,m.exports);return m.exports}
const context={wx,console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval,Promise,TextEncoder,TextDecoder,URL,URLSearchParams,ArrayBuffer,Uint8Array,Buffer,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),System:{register(){}},define:(name,factory)=>modules.set(name,factory),require:load};context.GameGlobal=context;context.window=context;context.global=context;
vm.createContext(context);

function fail(stage){parentPort.postMessage({ok:false,stage,error:'該步驟未完成，請重新掃碼重試或檢查伺服器回應'});process.exit(1)}
async function queryRoles(raw,info){
 try{
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
   const player=describeRole(response.playerInfo);
   parentPort.postMessage({ok:true,worlds,player,login});
  }finally{client.stop()}
  process.exit(0);
 }catch{fail(stage)}
}
try{
 vm.runInContext(source,context,{timeout:15000});
 const Instance=load('subpackages/minisdk/wxMiniSuperSDK.js').default;
 const instance=new Instance();
 const config=JSON.parse(fs.readFileSync(path.join(root,'sdk-config.json'),'utf8'));
 instance.init({...config,isLandscape:false,onSuccess:()=>{
  instance.getDataInfo({onSuccess:info=>{
   if(workerData.initOnly){parentPort.postMessage({ok:true,sdk_ready:true,has_app_info:!!info.appId});process.exit(0)}
   stage='sdk_exchange';instance.login({onSuccess:user=>queryRoles(user,info),onFailed:()=>fail(stage)})
  },onFailed:()=>fail('sdk_config')})
 },onFailed:()=>fail('sdk_init')});
}catch{fail(stage)}
