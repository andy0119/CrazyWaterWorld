(() => {
 let timer=null,busy=false;
 const start=document.getElementById('startScript'),stop=document.getElementById('stopScript'),state=document.getElementById('scriptState'),logs=document.getElementById('scriptLogs');
 const labels={reconnecting:'等待設定間隔後重新登入',starting:'正在驗證遊戲連線',running:'腳本執行中',waiting:'主線挑戰暫停／等待條件，請查看紀錄',stopped:'已停止',failed:'腳本中斷，請檢查紀錄',reauthorization_required:'遊戲授權失效，請回帳號管理重新登入',interrupted:'後端重啟，腳本已停止'};
 async function refreshState(){
  try{
   const result=await api(`/api/sub-user/${account}/script`);
   if(!['wechat','yishijie','douyin_cn'].includes(result.platform)){document.getElementById('scriptPanel').hidden=true;clearInterval(timer);return;}
   document.getElementById('scriptPanel').hidden=false;
   document.getElementById('wxTaskSupport').textContent=(result.platform==='wechat'?'已接通：':'共用协议试验渠道：各任务仍需实测；可选功能：')+Object.values(result.capabilities||{}).join('、')+'。未标记的功能仍待接通。';
   const run=result.run;
   if(typeof updateRoleIdentityRun==='function')updateRoleIdentityRun(run);
   state.textContent=run?(labels[run.status]||run.status):'尚未啟動；保存所選任務後開始，執行前會重新驗證遊戲會話';
   logs.textContent=result.logs.map(x=>'['+new Date(x.created*1000).toLocaleTimeString()+'] '+formatTaskLog(x.message)).join('\n');
   logs.scrollTop=logs.scrollHeight;
   const active=run&&['starting','running','waiting','reconnecting'].includes(run.status)&&!run.finished;
   start.disabled=busy||!!active;stop.disabled=busy||!active;
  }catch(e){state.textContent=e.message;start.disabled=true;stop.disabled=true;}
 }
 start.onclick=async()=>{
  if(dirty){state.textContent='請先保存修改後再開始';return;}
  busy=true;start.disabled=true;
  try{const result=await api(`/api/sub-user/${account}/script/start`,'POST',{});state.textContent=result.message;}
  catch(e){state.textContent=e.message;busy=false;start.disabled=false;return;}
  finally{busy=false;}
  await refreshState();
 };
 stop.onclick=async()=>{busy=true;stop.disabled=true;try{await api(`/api/sub-user/${account}/script/stop`,'POST',{});}catch(e){state.textContent=e.message;}finally{busy=false;}await refreshState();};
 void refreshState();timer=setInterval(()=>{if(!busy)void refreshState();},3000);
 window.addEventListener('pagehide',()=>clearInterval(timer));
})();
