"""Explicitly owner-bound local sessions, never a public account/password login."""
import json,subprocess,threading,time
from pathlib import Path
from fastapi import Header,HTTPException
from game_sessions import crypt

def binding_for(root,channel,owner):
 if channel not in ('yishijie','douyin_cn'):return None
 try:data=json.loads((root/'channel-sessions.local.json').read_text(encoding='utf-8-sig'))
 except (OSError,ValueError):return None
 value=data.get(channel)
 if not isinstance(value,dict) or type(value.get('owner_id')) is not int or value['owner_id']!=owner:return None
 if not all(isinstance(value.get(k),str) and value[k] for k in ('capture_path','expected_role_id','app_id')):return None
 return value

def mount(app,auth,conn,store,engine):
 root=Path(__file__).parent;gate=threading.Lock()
 @app.get('/api/game-login/channels/{channel}/saved-session')
 def available(channel:str,authorization:str|None=Header(None)):
  user=auth(authorization);binding=binding_for(root,channel,user['id'])
  return {'available':bool(binding),'method':'owner_bound_local_session','message':'此管理帳號有本機保存的測試授權，需重新連線驗證；不是新的帳密／掃碼登入。' if binding else '此管理帳號沒有可匯入的本機授權。'}
 @app.post('/api/game-login/channels/{channel}/saved-session')
 def connect(channel:str,authorization:str|None=Header(None)):
  user=auth(authorization);binding=binding_for(root,channel,user['id'])
  if not binding:raise HTTPException(404,'沒有可供此管理帳號使用的本機授權')
  if not gate.acquire(blocking=False):raise HTTPException(409,'已有本機授權正在驗證，請稍後再試')
  try:
   with engine.lock:
    with conn() as db:
     existing=db.execute('SELECT id FROM subusers WHERE parent_id=? AND platform=? AND uid=?',(user['id'],channel,binding['expected_role_id'])).fetchone()
    if existing and existing['id'] in engine.jobs:raise HTTPException(409,'此角色正在執行任務，請先停止再更新授權')
    try:
     record=json.loads(crypt(Path(binding['capture_path']).read_bytes(),True));login=record['login']
    except Exception:raise HTTPException(409,'本機授權無法讀取，需由原授權者重新登入取得會話')
    if (record.get('expectedRoleId') is not None and str(record['expectedRoleId'])!=binding['expected_role_id']) or str(login.get('eworldClientInfo',{}).get('appId'))!=binding['app_id']:raise HTTPException(409,'本機授權角色或渠道不符')
    try:
     result=subprocess.run([engine.command[0],str(root/'channel-session-verify.mjs')],input=json.dumps({'login':login,'expectedRoleId':binding['expected_role_id'],'expectedAppId':binding['app_id']}),capture_output=True,text=True,encoding='utf-8',timeout=35,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
     value=json.loads(result.stdout) if result.returncode==0 else {}
    except (subprocess.TimeoutExpired,ValueError,OSError):raise HTTPException(502,'遊戲授權驗證未完成，未新增帳號')
    role=value.get('role',{})
    if not value.get('verified') or str(role.get('id'))!=binding['expected_role_id'] or str(role.get('appId'))!=binding['app_id']:raise HTTPException(409,'遊戲會話已失效或角色不符，未新增帳號；需要新的遊戲授權')
    world=str(login.get('worldId') or role.get('worldId') or '')
    if not world.isdigit() or int(world)<=0:raise HTTPException(409,'區服尚未確認，未新增帳號')
    nickname=str(role.get('nickname') or binding['expected_role_id'])[:100]
    with conn() as db:
     # Check duplicates globally through GameSessionStore in the same transaction.
     existing=db.execute('SELECT id FROM subusers WHERE parent_id=? AND platform=? AND uid=?',(user['id'],channel,binding['expected_role_id'])).fetchone()
     if existing:
      sid=existing['id'];db.execute("UPDATE subusers SET nickname=?,server_id=?,server_name=?,status='verified' WHERE id=? AND parent_id=?",(nickname,world,'區服 '+world,sid,user['id']))
     else:
      sid=db.execute("INSERT INTO subusers(parent_id,username,server_name,server_id,uid,platform,nickname,status,created) VALUES(?,?,?,?,?,?,?,'verified',?)",(user['id'],nickname,'區服 '+world,world,binding['expected_role_id'],channel,nickname,int(time.time()))).lastrowid
     store.save_in_db(db,user['id'],sid,channel,binding['expected_role_id'],login)
    return {'success':True,'id':sid,'platform':channel,'verified':True,'settings_url':'/settings.html?account='+str(sid),'message':'已重新驗證並加密保存遊戲會話，可設定共用協議試驗任務；尚未啟動託管。新的帳密／掃碼入口仍未接通。'}
  finally:gate.release()
