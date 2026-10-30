(() => {
 const panel=document.createElement('section');panel.className='intro';panel.hidden=true;
 panel.innerHTML='<h2>益世界 APP · 模擬器任務</h2><p>先在雷電登入遊戲並回到基地。本版僅領取釣魚產出；電腦、服務與模擬器需保持運作。</p><button type="button" id="emuRead">讀取目前角色</button> <button type="button" id="emuBind" disabled>綁定此角色</button> <button type="button" id="emuStart" disabled>開始自動領取</button> <button type="button" id="emuStop" disabled>停止</button><p id="emuRole" role="status"></p><pre id="emuLog" style="max-height:240px;overflow:auto;white-space:pre-wrap"></pre>';
 document.querySelector('main').insertBefore(panel,document.getElementById('tabs'));
 panel.querySelector('h2').textContent='益世界 APP · 模擬器連線';
 panel.querySelector('p').textContent='角色讀取與綁定可使用。產出圖示校準未通過，自動點擊暫停，避免誤進海獸培育頁。';
 const get=id=>document.getElementById(id);let candidate=null,busy=false;
 async function refresh(){try{const r=await api(`/api/sub-user/${account}/emulator`);panel.hidden=false;document.getElementById('startScript').closest('section').hidden=true;document.querySelector('.badge').textContent='APP 模擬器任務';document.querySelector('main > .intro > p:last-child').textContent='APP 目前可讀取與綁定模擬器角色，自動任務仍在校準。設定可儲存，但尚未代表已執行。';get('emuStart').disabled=true;get('emuStop').disabled=busy||!r.running;get('emuRead').disabled=busy||r.running;get('emuBind').disabled=busy||r.running||!candidate;get('emuLog').textContent=r.logs.map(x=>'['+new Date(x.created*1000).toLocaleTimeString()+'] '+x.message).join('\n');}catch(e){/* Non-APP account: existing task controls remain available. */}}
 async function action(fn){busy=true;try{await fn();}catch(e){get('emuRole').textContent=e.message;}finally{busy=false;await refresh();}}
 get('emuRead').onclick=()=>action(async()=>{candidate=null;const r=await api(`/api/sub-user/${account}/emulator/probe`);candidate=r.role;get('emuRole').textContent=`${candidate.nickname} · ID ${candidate.uid} · Lv${candidate.level}，請確認是要託管的角色再綁定。`;});
 get('emuBind').onclick=()=>action(async()=>{if(!candidate)return;await api(`/api/sub-user/${account}/emulator/bind`,'POST',{uid:candidate.uid});get('emuRole').textContent='角色已綁定，可以開始領取。';candidate=null;});
 get('emuStart').onclick=()=>action(async()=>{await api(`/api/sub-user/${account}/emulator/start`,'POST',{});});
 get('emuStop').onclick=()=>action(async()=>{await api(`/api/sub-user/${account}/emulator/stop`,'POST',{});get('emuRole').textContent='任務已停止。';});
 refresh();const timer=setInterval(()=>{if(!busy)refresh();},3000);window.addEventListener('pagehide',()=>clearInterval(timer));
})();
