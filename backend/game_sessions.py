"""Per-manager encrypted game sessions. Credentials never leave backend routes."""
import ctypes,json,time
from ctypes import wintypes
from fastapi import Header,HTTPException

class Blob(ctypes.Structure):
 _fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]

def crypt(value,decrypt=False):
 raw=ctypes.create_string_buffer(value);source=Blob(len(value),ctypes.cast(raw,ctypes.POINTER(ctypes.c_ubyte)));target=Blob()
 library=ctypes.windll.crypt32
 if decrypt:
  function=library.CryptUnprotectData
  function.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
  args=(ctypes.byref(source),None,None,None,None,1,ctypes.byref(target))
 else:
  function=library.CryptProtectData
  function.argtypes=[ctypes.POINTER(Blob),wintypes.LPCWSTR,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
  args=(ctypes.byref(source),'Aurora manager game session',None,None,None,1,ctypes.byref(target))
 function.restype=wintypes.BOOL
 if not function(*args):raise RuntimeError('Local credential protection unavailable')
 try:return ctypes.string_at(target.data,target.size)
 finally:ctypes.windll.kernel32.LocalFree(target.data)

class GameSessionStore:
 def __init__(self,conn):
  self.conn=conn
  with conn() as db:
   db.execute('CREATE TABLE IF NOT EXISTS game_sessions(sub_id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL,platform TEXT NOT NULL,role_id TEXT NOT NULL,cipher BLOB NOT NULL,verified_at INTEGER NOT NULL,status TEXT NOT NULL,UNIQUE(platform,role_id))')
 def save_in_db(self,db,owner_id,sub_id,platform,role_id,login):
  account=db.execute('SELECT id,platform,uid FROM subusers WHERE id=? AND parent_id=?',(sub_id,owner_id)).fetchone()
  if not account or account['platform']!=platform or account['uid']!=str(role_id):raise HTTPException(404,'找不到已授權角色')
  duplicate=db.execute('SELECT sub_id FROM game_sessions WHERE platform=? AND role_id=?',(platform,str(role_id))).fetchone()
  if duplicate and duplicate['sub_id']!=sub_id:raise HTTPException(409,'此角色已綁定其他管理帳號，請先由原管理帳號解除綁定')
  credentials=login.get('eworldParams',{})
  if not all(credentials.get(k) for k in ('openId','token','timestamp','sign')):raise HTTPException(409,'遊戲會話資料不完整，請重新授權')
  payload={'owner_id':owner_id,'sub_id':sub_id,'platform':platform,'role_id':str(role_id),'login':login}
  cipher=crypt(json.dumps(payload,ensure_ascii=False).encode('utf-8'))
  db.execute('INSERT INTO game_sessions VALUES(?,?,?,?,?,?,?) ON CONFLICT(sub_id) DO UPDATE SET cipher=excluded.cipher,verified_at=excluded.verified_at,status=excluded.status',(sub_id,owner_id,platform,str(role_id),cipher,int(time.time()),'verified'))
 def load(self,owner_id,sub_id):
  with self.conn() as db:
   row=db.execute('SELECT g.* FROM game_sessions g JOIN subusers s ON s.id=g.sub_id AND s.parent_id=g.owner_id WHERE g.sub_id=? AND g.owner_id=?',(sub_id,owner_id)).fetchone()
  if not row:raise HTTPException(404,'找不到已授權角色')
  payload=json.loads(crypt(row['cipher'],True))
  if payload['owner_id']!=owner_id or payload['sub_id']!=sub_id or payload['role_id']!=row['role_id'] or payload['platform']!=row['platform']:raise HTTPException(409,'會話歸屬驗證失敗，請重新授權')
  return payload

def mount_session_routes(app,auth,conn):
 @app.get('/api/sub-user/{sub_id}/connection')
 def connection(sub_id:int,authorization:str|None=Header(None)):
  user=auth(authorization)
  with conn() as db:
   account=db.execute('SELECT platform FROM subusers WHERE id=? AND parent_id=?',(sub_id,user['id'])).fetchone()
   if not account:raise HTTPException(404,'找不到帳號')
   row=db.execute('SELECT status,verified_at FROM game_sessions WHERE sub_id=? AND owner_id=?',(sub_id,user['id'])).fetchone()
  return {'platform':account['platform'],'session_stored':bool(row),'status':row['status'] if row else 'reauthorization_required','verified_at':row['verified_at'] if row else None,'execution_available':bool(row and account['platform'] in ('wechat','yishijie','douyin_cn') and row['status']=='verified'),'message':'已加密保存授權會話，執行前仍需驗證有效性' if row else '請重新登入遊戲以保存此帳號的授權會話'}
 @app.delete('/api/sub-user/{sub_id}/connection')
 def revoke(sub_id:int,authorization:str|None=Header(None)):
  user=auth(authorization)
  app.state.script_engine.stop(sub_id,authorization)
  with conn() as db:
   if not db.execute('SELECT id FROM subusers WHERE id=? AND parent_id=?',(sub_id,user['id'])).fetchone():raise HTTPException(404,'找不到帳號')
   db.execute('DELETE FROM game_sessions WHERE sub_id=? AND owner_id=?',(sub_id,user['id']))
   db.execute("UPDATE subusers SET status='idle' WHERE id=? AND parent_id=?",(sub_id,user['id']))
  return {'success':True,'message':'已移除此平台保存的遊戲授權；設定保留，可重新登入'}
