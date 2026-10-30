function mergeGiftCodeLists(current, incoming, limit=Infinity){
 const previous=[...new Set(current)],seen=new Set(previous),codes=[...previous];let duplicates=0;
 for(const raw of incoming){const code=raw.trim();if(!code)continue;if(seen.has(code)){duplicates++;continue;}seen.add(code);codes.push(code);}
 if(codes.length>limit)throw Error('合并后共 '+codes.length+' 组，超过 '+limit+' 组上限；原名单未变更，请先清理后重试');
 return {codes,added:codes.length-previous.length,duplicates};
}
function addGiftExcelTools(tools,field){
 const choose=el('input');choose.type='file';choose.accept='.xlsx';choose.hidden=true;choose.setAttribute('aria-label','选择礼包码 Excel');
 const importButton=el('button','Excel 导入');importButton.type='button';importButton.onclick=()=>choose.click();
 const exportButton=el('button','Excel 导出／范例');exportButton.type='button';exportButton.title='导出当前名单与本账号已确认过期的码，分在两张工作表';
 const readResponse=async r=>{if(r.status===404)throw Error('Excel 服务尚未载入，请重启网站服务后再试');if(!r.ok){let d={};try{d=await r.json()}catch{}throw Error(typeof d.detail==='string'?d.detail:'Excel 处理失败');}return r;};
 choose.onchange=async()=>{const file=choose.files?.[0];if(!file)return;importButton.disabled=true;try{
  if(!/\.xlsx$/i.test(file.name))throw Error('请选择 .xlsx 文件；旧版 .xls 请先另存为 .xlsx');
  if(file.size>2*1024*1024)throw Error('Excel 文件不能超过 2 MB');
  const r=await readResponse(await fetch('/api/gift-codes/import-excel?filename='+encodeURIComponent(file.name),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file}));
  const data=await r.json(),merged=mergeGiftCodeLists(values[field.key]||[],data.codes,field.maxItems??Infinity);
  values[field.key]=merged.codes;change();draw();message('Excel 新增 '+merged.added+' 组，略过重复 '+(merged.duplicates+(data.duplicates||0))+' 组'+(data.examples_skipped?'、范例占位码 '+data.examples_skipped+' 组':'')+'；目前共 '+merged.codes.length+' 组，请保存设置；不会自动兑换');
 }catch(e){message(e.message,true)}finally{choose.value='';importButton.disabled=false}};
 exportButton.onclick=async()=>{exportButton.disabled=true;try{
  const r=await readResponse(await fetch('/api/gift-codes/export-excel',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({account,codes:values[field.key]||[]})}));
  const url=URL.createObjectURL(await r.blob()),link=el('a');link.href=url;link.download='gift-codes-account-'+account+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('已导出「礼包码」与「過期」两张工作表；主表包含尚未保存的修改，过期表来自本账号确认纪录，不含登入资料');
 }catch(e){message(e.message,true)}finally{exportButton.disabled=false}};
 tools.append(importButton,exportButton,choose);
}
