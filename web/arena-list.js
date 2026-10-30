let arenaSnapshot=null,arenaListError='';
function arenaPower(value){try{return /^\d+$/.test(String(value))&&BigInt(value)>0n?BigInt(value):null}catch{return null}}
function arenaEligibility(row,data){
 if(String(row.id)===String(data.myself?.id))return '自身';
 if(row.failed)return '本次已败，跳过';
 const rank=Number(data.myself?.rankNo),other=Number(row.rankNo);
 if(!(rank>0&&other>0))return '排名未确认';
 if(other>rank)return Number(data.dailyChallengeTimes??0)<10?'可扫荡补每日奖励':'每日10次已满，不扫荡';
 if(other===rank)return '同排名，不挑战';
 const own=arenaPower(data.myself?.power),enemy=arenaPower(row.power);
 return own===null||enemy===null?'战力未确认':enemy<own?'符合挑战条件':'战力不低于自身，跳过';
}
function renderArenaList(section){
 section.querySelector('[data-arena-list]')?.remove();
 const box=el('div');box.dataset.arenaList='';box.className='arena-opponent-list';
 box.appendChild(el('h3','对手列表'));
 const data=arenaSnapshot?.data;
 if(!data){box.appendChild(el('p',arenaListError||'尚未读取对手。微信任务连接成功后会自动更新；未开启挑战也可读取。'));section.appendChild(box);return;}
 const updated=new Date(arenaSnapshot.updated*1000).toLocaleString();
 box.appendChild(el('p',`自身排名：${data.myself?.rankNo||'未确认'} · 战力：${data.myself?.power||'未确认'} · 挑战券：${data.arenaPoint??'未知'} · 今日挑战：${data.dailyChallengeTimes??0} · 读取时间：${updated}`));
 box.appendChild(el('small',arenaListError||'以下为最近一次读取结果；战力较高仍可能战败，最终以服务器判定为准。'));
 const wrap=el('div');wrap.className='arena-table-scroll';const table=el('table'),head=el('thead'),header=el('tr');
 for(const name of ['排名','对手','战力','判断'])header.appendChild(el('th',name));head.appendChild(header);table.appendChild(head);
 const body=el('tbody');
 for(const row of data.opponents??[]){const tr=el('tr');for(const value of [row.rankNo||'未知',row.nickname||row.id,row.power||'未知',arenaEligibility(row,data)])tr.appendChild(el('td',String(value)));body.appendChild(tr);}
 table.appendChild(body);wrap.appendChild(table);box.appendChild(wrap);
 if(!data.opponents?.length)box.appendChild(el('p','服务器本次未返回对手。'));
 section.appendChild(box);
}
function updateArenaList(){for(const section of document.querySelectorAll('#content>section'))if(section.querySelector('h2')?.textContent==='竞技场')renderArenaList(section);}
async function fetchArenaList(){
 if(!ready)return;
 try{arenaSnapshot=await api(`/api/sub-user/${account}/arena`);arenaListError='';}
 catch(error){arenaListError='列表更新失败：'+error.message+'。显示内容可能已过期。';}
 updateArenaList();
}
const arenaListTimer=setInterval(fetchArenaList,5000);
window.addEventListener('pagehide',()=>clearInterval(arenaListTimer));
fetchArenaList();
