(() => {
  let generation = 0;
  const draftDetails = document.getElementById('draftForm').closest('details');
  const originalSummary = draftDetails.querySelector('summary').textContent;
  const originalButton = document.querySelector('#draftForm button[type="submit"]').textContent;
  async function checkStatus(channel, stamp) {
    const button = document.getElementById('checkChannelStatus');
    const state = document.getElementById('otherChannelState');
    button.disabled = true;
    state.textContent = '正在檢查登入服務…';
    try {
      const status = await api('/api/game-login/channels/' + channel);
      if (stamp !== generation || selectedChannel !== channel) return;
      document.getElementById('otherChannelMethod').textContent = '登入方式：' + status.method_label;
      state.textContent = status.message;
      document.getElementById('localSessionImport')?.remove();
      const local=await api('/api/game-login/channels/'+channel+'/saved-session');
      if(stamp!==generation||selectedChannel!==channel)return;
      if(local.available){
        const holder=document.createElement('div');holder.id='localSessionImport';
        const note=document.createElement('p');note.textContent=local.message;
        const connect=document.createElement('button');connect.type='button';connect.textContent='验证并接入已保存的游戏授权';
        connect.onclick=async()=>{
          connect.disabled=true;note.textContent='正在连接游戏验证角色／区服，请稍候…';
          try{
            const result=await api('/api/game-login/channels/'+channel+'/saved-session','POST',{});
            if(stamp!==generation||selectedChannel!==channel)return;
            note.textContent=result.message;
            await refresh();
            document.getElementById('addAccount').close();
            document.getElementById('actionmsg').textContent=result.message;
          }catch(error){note.textContent=error.message;connect.disabled=false;}
        };
        holder.append(note,connect);state.after(holder);
      }

      document.getElementById('douyinCapturedRoles')?.remove();
      if (!document.getElementById('douyinCapturedRoles')) document.getElementById('loginStatus').textContent = status.login_available ? '登入服務已就緒' : '待連接遊戲登入・可先設定任務';
    } catch (error) {
      if (stamp === generation) state.textContent = '無法檢查登入服務：' + error.message;
    } finally { if (stamp === generation) button.disabled = false; }
  }
  window.showAdditionalChannel = channel => {
    const active = channel === 'douyin_cn' || channel === 'yishijie';
    document.getElementById('douyinCapturedRoles')?.remove();
    document.getElementById('localSessionImport')?.remove();
    const stamp = ++generation;
    document.getElementById('otherChannelPanel').classList.toggle('hidden', !active);
    document.getElementById('loginUnavailable').classList.add('hidden');
    draftDetails.open = active;
    draftDetails.querySelector('summary').textContent = active ? '建立' + channelNames[channel] + '帳號資料' : originalSummary;
    document.querySelector('#draftForm button[type="submit"]').textContent = active ? '儲存並進入任務設定' : originalButton;
    if (active) {
      document.getElementById('otherChannelMethod').textContent = channel === 'douyin_cn' ? '登入方式：抖音官方標準版掃碼' : '登入方式：益世界 APP 帳號登入';
      void checkStatus(channel, stamp);
    }
  };
  document.getElementById('checkChannelStatus').onclick = () => checkStatus(selectedChannel, ++generation);
  document.getElementById('addAccount').addEventListener('close', () => { generation++; });
})();
