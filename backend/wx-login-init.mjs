export async function finishGameLogin({client,log}){
 await client.sendWatch('LoginFinishRequest',{}, {window:1000});
 log('已发送游戏初始化完成请求；活动开放状态以服务器推送为准');
}
