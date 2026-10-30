from runtime_paths import node_executable
import atexit,json,os,secrets,subprocess,threading,time,urllib.request,urllib.error
from pathlib import Path
from fastapi import APIRouter,HTTPException,Header
from pydantic import BaseModel
from fastapi.responses import JSONResponse
router=APIRouter()
_process=None
_port=None
_key=secrets.token_urlsafe(32)
_lock=threading.Lock()
_owners={}

def close_bridge():
 global _process
 if _process and _process.poll() is None:
  _process.terminate()
  try:_process.wait(timeout=5)
  except subprocess.TimeoutExpired:_process.kill()
atexit.register(close_bridge)

def bridge_call(route,body=None):
 global _process,_port
 with _lock:
  if _process is None or _process.poll() is not None:
   node=node_executable()
   helper=Path(__file__).parent/'wx-login/bridge.cjs'
   try:
    _process=subprocess.Popen([node,str(helper)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf8',env=dict(os.environ,AURORA_BRIDGE_SECRET=_key,AURORA_PARENT_PID=str(os.getpid())),creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    _port=json.loads(_process.stdout.readline())['port']
   except Exception:raise HTTPException(503,'微信登入服務啟動失敗，請確認本機 Node.js 執行環境')
  port=_port
 try:
  request=urllib.request.Request(f'http://127.0.0.1:{port}{route}',data=json.dumps(body or {}).encode(),headers={'Content-Type':'application/json','X-Bridge-Key':_key})
  with urllib.request.urlopen(request,timeout=85) as r:return json.load(r)
 except urllib.error.HTTPError as e:
  try:detail=json.load(e).get('error','微信登入服務錯誤')
  except Exception:detail='微信登入服務錯誤'
  raise HTTPException(e.code,detail)
 except Exception:raise HTTPException(502,'微信登入服務連線逾時或中斷，請重新產生登入碼')

class TaskRef(BaseModel):
 id:str

class RoleRef(TaskRef):
 world_id:str
 role_id:str

def mount_wx_routes(app,auth,conn,session_store):
 def owner(task_id,authorization):
  user=auth(authorization)
  if _owners.get(task_id,{}).get('user_id')!=user['id']:raise HTTPException(404,'找不到登入工作階段')
  return user
 def reply(data):return JSONResponse(data,headers={'Cache-Control':'no-store'})
 @router.post('/api/game-login/wechat/start')
 def start(authorization:str|None=Header(None)):
  user=auth(authorization)
  now=time.time()
  for task_id in list(_owners):
   if _owners[task_id]['expires']<now:_owners.pop(task_id,None)
  if sum(v['user_id']==user['id'] for v in _owners.values())>=3:raise HTTPException(429,'請先關閉其他登入視窗或等待登入碼過期')
  data=bridge_call('/start')
  _owners[data['id']]={'user_id':user['id'],'expires':data['expires_at']/1000}
  return reply(data)
 @router.post('/api/game-login/wechat/status')
 def status(x:TaskRef,authorization:str|None=Header(None)):
  owner(x.id,authorization);return reply(bridge_call('/status',{'id':x.id}))
 @router.post('/api/game-login/wechat/confirm')
 def confirm(x:TaskRef,authorization:str|None=Header(None)):
  owner(x.id,authorization)
  data=bridge_call('/confirm',{'id':x.id});_owners[x.id]['expires']=data['expires_at']/1000
  return reply(data)
 @router.post('/api/game-login/wechat/roles')
 def roles(x:TaskRef,authorization:str|None=Header(None)):
  owner(x.id,authorization);return reply(bridge_call('/roles',{'id':x.id}))
 @router.post('/api/game-login/wechat/bind')
 def bind_role(x:RoleRef,authorization:str|None=Header(None)):
  user=owner(x.id,authorization)
  data=bridge_call('/status',{'id':x.id})
  if data.get('status')!='roles_ready':raise HTTPException(409,'請先完成角色驗證')
  entries=[(w.get('worldId'),w.get('role')) for w in (data.get('worlds') or {}).get('recentWorlds',[])]
  if not entries and data.get('player'):entries=[(data['player'].get('worldId'),data['player'])]
  role=next((r for world,r in entries if r and str(world)==x.world_id and str(r.get('id'))==x.role_id),None)
  if not role:raise HTTPException(400,'所選角色不在已驗證清單內')
  private=bridge_call('/session',{'id':x.id})
  login=dict(private['login']);login['worldId']=int(x.world_id)
  nickname=str(role.get('nickname') or x.role_id)
  with conn() as c:
   existing=c.execute("SELECT id FROM subusers WHERE parent_id=? AND platform='wechat' AND uid=? AND server_id=?",(user['id'],x.role_id,x.world_id)).fetchone()
   if existing:
    sid=existing['id'];c.execute("UPDATE subusers SET nickname=?,status='verified' WHERE id=?",(nickname,sid))
   else:
    sid=c.execute("INSERT INTO subusers(parent_id,username,server_name,server_id,uid,platform,nickname,status,created) VALUES(?,?,?,?,?,?,?,?,?)",(user['id'],data.get('nickname') or nickname,'區服 '+x.world_id,x.world_id,x.role_id,'wechat',nickname,'verified',int(time.time()))).lastrowid
   session_store.save_in_db(c,user['id'],sid,'wechat',x.role_id,login)
  return reply({'success':True,'id':sid,'message':'角色已保存；遊戲登入已驗證，尚未啟動託管'})
 @router.post('/api/game-login/wechat/cancel')
 def cancel(x:TaskRef,authorization:str|None=Header(None)):
  owner(x.id,authorization)
  try:bridge_call('/cancel',{'id':x.id})
  except HTTPException as e:
   if e.status_code!=404:raise
  _owners.pop(x.id,None);return reply({'success':True})
 app.include_router(router)
