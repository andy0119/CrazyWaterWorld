(() => {
 let sessionId=null, timer=null, generation=0, channel=null;
 const panel=document.createElement('section'); panel.id='douyinQrPanel'; panel.hidden=true;
 const title=document.createElement('p');title.textContent='抖音帳號掃碼（小遊戲授權尚未接通）';
 const button=document.createElement('button');button.type='button';button.textContent='產生抖音登入碼';
 const image=document.createElement('img');image.alt='抖音帳號登入二維碼';image.hidden=true;image.width=240;image.height=240;
 const state=document.createElement('p');state.setAttribute('role','status');
 const note=document.createElement('p');note.className='muted';note.textContent='本步驟只驗證抖音帳號。下方先前讀取的角色不會自動綁定到此次掃碼帳號。';
 panel.append(title,button,document.createElement('br'),image,state,note);
 document.getElementById('otherChannelState').after(panel);
 async function cancel() {
  generation++;clearTimeout(timer);image.hidden=true;
  const old=sessionId;sessionId=null;
  if(old)await api('/api/game-login/douyin/qr/'+encodeURIComponent(old),'DELETE').catch(()=>{});
 }
 async function poll(stamp) {
  if(stamp!==generation||!sessionId)return;
  try {
   const value=await api('/api/game-login/douyin/qr/'+encodeURIComponent(sessionId));
   if(stamp!==generation)return;
   state.textContent=value.message;
   if(['waiting','scanned'].includes(value.state))timer=setTimeout(()=>poll(stamp),2500);
   else {image.hidden=true;button.disabled=false;}
  }catch(error){if(stamp===generation){state.textContent=error.message;image.hidden=true;button.disabled=false;}}
 }
 button.onclick=async()=>{
  await cancel();const stamp=generation;button.disabled=true;state.textContent='正在取得抖音登入碼…';
  try {
   const value=await api('/api/game-login/douyin/qr','POST');
   if(stamp!==generation){if(value.id)void api('/api/game-login/douyin/qr/'+encodeURIComponent(value.id),'DELETE').catch(()=>{});return;}
   sessionId=value.id;state.textContent=value.message;
   if(value.qr){image.src=value.qr;image.hidden=false;timer=setTimeout(()=>poll(stamp),2500);}
   else button.disabled=false;
  }catch(error){if(stamp===generation){state.textContent=error.message;button.disabled=false;}}
 };
 const previous=window.showAdditionalChannel;
 window.showAdditionalChannel=next=>{
  previous(next);if(next!==channel){void cancel();button.disabled=false;state.textContent='';}channel=next;panel.hidden=next!=='douyin_cn';
 };
 document.getElementById('addAccount').addEventListener('close',()=>{void cancel();button.disabled=false;});
})();
