(()=>{
 const names={3:'小型货轮',4:'中型货轮',5:'万吨货轮'};
 globalThis.formatTaskLog=function(value){
  let s=String(value??'');if(!s.includes('货轮'))return s;
  s=s.replace(/档位分布\s*(\{[^}]*\})/g,(all,raw)=>{try{return '当前货轮：'+Object.entries(JSON.parse(raw)).map(([k,v])=>(names[k]||'其他货轮')+' '+v+' 艘').join('、');}catch{return '货轮数量资料未确认';}});
  s=s.replace(/选择档位\s+([345])/g,(_,n)=>'选择'+names[n]);
  s=s.replace(/候选状态\s*(\[[^\]]*\])/g,(all,raw)=>{try{const rows=JSON.parse(raw);return rows.length?'候选货轮：'+rows.map(r=>(Number.isSafeInteger(r.ownerFleetNum)?'目前占领舰队 '+r.ownerFleetNum+' 支，':'')+(Number.isFinite(r.progress)?'已采集 '+r.progress+'%':'进度未知')).join('；'):'没有候选货轮';}catch{return '候选货轮资料未确认';}});
  return s;
 };
})();
