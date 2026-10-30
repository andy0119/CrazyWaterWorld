function copiedTaskValues(catalog, source) {
 const result={};
 for(const section of catalog)for(const field of section.fields){
  const roleOnly=['ref_island_pet_recycleAllowedUids','ref_island_equip_recycleAllowedUids'].includes(field.key);
  const value=roleOnly?[]:Object.hasOwn(source,field.key)?source[field.key]:field.default;
  result[field.key]=JSON.parse(JSON.stringify(value));
 }
 return result;
}
if(typeof document!=='undefined'){
 const copyButton=document.getElementById('copySettings');
 const dialog=document.getElementById('copySettingsDialog');
 const select=document.getElementById('copySourceAccount');
 const apply=document.getElementById('applyCopySettings');
 const status=document.getElementById('copySettingsStatus');
 document.getElementById('cancelCopySettings').onclick=()=>dialog.close();
 copyButton.onclick=async()=>{
  if(!ready){message('设置尚未载入，请稍候',true);return;}
  select.replaceChildren();select.disabled=true;apply.disabled=true;
  status.textContent='正在读取可复制的账号…';dialog.showModal();
  try{
   const data=await api('/api/user/sub-users');
   const sources=data.data.filter(a=>Number(a.id)!==account);
   for(const a of sources){
    const option=document.createElement('option');option.value=a.id;
    const channel={wechat:'微信小程序',douyin_cn:'抖音小程序',douyin:'抖音小程序',yishijie:'APP（益世界）',app:'APP'}[a.platform]||a.platform||'未指定管道';
    option.textContent=[a.nickname||a.username||'账号',channel,a.server_name,a.uid?'ID '+a.uid:''].filter(Boolean).join(' · ');
    select.appendChild(option);
   }
   status.textContent=sources.length?'选择配置来源，带入后请按右上角「保存设置」。':'目前没有其他账号，请先新增账号。';
   select.disabled=apply.disabled=!sources.length;
  }catch(error){status.textContent=error.message;}
 };
 apply.onclick=async()=>{
  const sourceId=Number(select.value);
  if(!Number.isInteger(sourceId)||sourceId<=0||sourceId===account)return;
  if(dirty&&!window.confirm('带入配置会覆盖当前未保存的修改，是否继续？'))return;
  apply.disabled=true;select.disabled=true;status.textContent='正在读取来源配置…';
  try{
   const data=await api(`/api/sub-user/${sourceId}/settings`);
   const next=copiedTaskValues(sections,data.values);
   const label=select.selectedOptions[0].textContent;
   values=next;change();draw();dialog.close();
   message('已带入「'+label+'」的配置，请保存设置；放生／分解的角色专属 ID 名单已清空');
  }catch(error){status.textContent=error.message;}
  finally{apply.disabled=false;select.disabled=false;}
 };
}
