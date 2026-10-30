// Serialized checkpoints: never run two game task streams on one session.
export function createLootPriority({enabled,run,nextRefresh,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),log=()=>{}}){
 let last=-Infinity,busy=false,observed=0,burstStart=Infinity,burstEnd=0,announced=0;
 function timing(){
  const t=now(),n=Number(nextRefresh())*1000;
  if(observed>0&&t>=observed-3000&&t<=observed+10000){burstStart=observed-3000;burstEnd=observed+10000;}
  if(Number.isFinite(n)&&n>0)observed=n;
  if(observed>0&&t>=observed-3000&&t<=observed+10000){burstStart=observed-3000;burstEnd=observed+10000;}
  const burst=t>=burstStart&&t<=burstEnd;
  const due=burst?last+1000:Math.min(last+15000,observed>t?observed-3000:Infinity);
  return{t,burst,due};
 }
 async function checkpoint(){
  if(!enabled()||busy)return false;
  const {t,burst,due}=timing();if(t<due)return false;
  busy=true;last=t;
  try{if(burst&&announced!==burstStart){announced=burstStart;log('搁浅货轮：已进入刷新优先检查时段，空闲启用舰队优先派遣');}await run();return true;}finally{last=now();busy=false;}
 }
 async function wait(ms){
  const end=now()+Math.max(0,Number(ms)||0);
  while(now()<end){await checkpoint();const {t,due}=timing();await sleep(Math.max(1,Math.min(1000,end-t,enabled()?Math.max(1,due-t):1000)));}
 }
 function invalidate(){last=-Infinity;burstStart=now();burstEnd=burstStart+10000;}
 return{checkpoint,wait,invalidate};
}
