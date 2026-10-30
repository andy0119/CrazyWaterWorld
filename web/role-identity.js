let roleIdentityAccount=null,roleIdentityRun=null;
function roleIdentityStateLabel(status){
 const labels={verified:'角色已验证／任务未启动',idle:'任务未启动',stopped:'任务已停止',interrupted:'服务重启，任务已停止',starting:'正在连接游戏',running:'任务执行中',waiting:'任务等待中',reconnecting:'等待重新连接',failed:'任务已停止，请查看执行记录',reauthorization_required:'游戏授权失效，请重新授权'};
 return Object.hasOwn(labels,status)?labels[status]:'连接状态待确认';
}
function paintRoleIdentity(){
 const a=roleIdentityAccount;if(!a)return;
 const run=roleIdentityRun;let status=run?.status||a.status;
 if(run?.finished&&['running','starting','waiting','reconnecting'].includes(status))status='stopped';
 const platform=({wechat:'微信小程序',douyin_cn:'抖音小程序',douyin:'抖音小程序',yishijie:'APP（益世界）',app:'APP'}[a.platform]||'未指定管道');
 document.getElementById('roleIdentity').textContent=[platform,a.server_name||'区服未确认',a.uid?'角色 ID：'+a.uid:'角色待验证',roleIdentityStateLabel(status)].join(' · ');
}
function setRoleIdentityAccount(accountInfo){roleIdentityAccount=accountInfo;paintRoleIdentity();}
function updateRoleIdentityRun(run){roleIdentityRun=run;paintRoleIdentity();}
