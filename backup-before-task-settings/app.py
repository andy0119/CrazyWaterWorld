import os,sqlite3,secrets,hashlib,hmac,time
from contextlib import contextmanager
from pathlib import Path
from fastapi import FastAPI,HTTPException,Header
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field
ROOT=Path(__file__).resolve().parent.parent
DB=Path(os.getenv('AURORA_DB',str(ROOT/'backend'/'aurora.sqlite3')))
app=FastAPI(title='Aurora Rebuild API',version='0.1.0')
@contextmanager
def conn():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row
 try:yield c;c.commit()
 finally:c.close()
def init():
 with conn() as c:
  c.executescript('''CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS subusers(id INTEGER PRIMARY KEY,parent_id INTEGER NOT NULL,username TEXT NOT NULL,server_name TEXT DEFAULT '',server_id TEXT DEFAULT '',uid TEXT DEFAULT '',platform TEXT DEFAULT '',nickname TEXT DEFAULT '',status TEXT DEFAULT 'idle',created INTEGER NOT NULL);''')
init()
def hashpass(password,salt):return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),250000).hex()
def auth(authorization):
 token=(authorization or '').removeprefix('Bearer ').strip()
 if not token:raise HTTPException(401,'請先登入')
 with conn() as c:
  u=c.execute('SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?',(hashlib.sha256(token.encode()).hexdigest(),int(time.time()))).fetchone()
 if not u:raise HTTPException(401,'登入已失效')
 return dict(u)
class Credentials(BaseModel):username:str=Field(min_length=3,max_length=60);password:str=Field(min_length=8,max_length=128)
class Bind(BaseModel):parent_id:int|None=None;username:str=Field(min_length=1,max_length=100);password:str|None=None;token:str|None=None;server_name:str='';server_id:str='';uid:str='';platform:str='';nickname:str='';channel_profile:dict|None=None
class Control(BaseModel):id:int;username:str|None=None
@app.post('/api/auth/register')
def register(x:Credentials):
 salt=secrets.token_hex(16)
 try:
  with conn() as c:c.execute('INSERT INTO users(username,password_hash,salt,created) VALUES(?,?,?,?)',(x.username,hashpass(x.password,salt),salt,int(time.time())))
 except sqlite3.IntegrityError:raise HTTPException(409,'帳號已存在')
 return {'success':True,'message':'註冊成功'}
@app.post('/api/auth/login')
def login(x:Credentials):
 with conn() as c:u=c.execute('SELECT * FROM users WHERE username=?',(x.username,)).fetchone()
 if not u or not hmac.compare_digest(hashpass(x.password,u['salt']),u['password_hash']):raise HTTPException(401,'帳號或密碼錯誤')
 token=secrets.token_urlsafe(32)
 with conn() as c:c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),u['id'],int(time.time())+86400))
 return {'success':True,'token':token,'user':{'id':u['id'],'username':u['username']}}
@app.get('/api/user/me')
def me(authorization:str|None=Header(None)):return auth(authorization)
@app.get('/api/user/sub-users')
def list_subusers(authorization:str|None=Header(None)):
 u=auth(authorization)
 with conn() as c:return {'data':[dict(r) for r in c.execute('SELECT id,username,server_name,server_id,uid,platform,nickname,status,created FROM subusers WHERE parent_id=? ORDER BY id DESC',(u['id'],))]}
@app.post('/api/sub-user/bind')
def bind(x:Bind,authorization:str|None=Header(None)):
 u=auth(authorization)
 if x.parent_id is not None and x.parent_id!=u['id']:raise HTTPException(403,'parent_id 不符')
 with conn() as c:
  cur=c.execute('INSERT INTO subusers(parent_id,username,server_name,server_id,uid,platform,nickname,created) VALUES(?,?,?,?,?,?,?,?)',(u['id'],x.username,x.server_name,x.server_id,x.uid,x.platform,x.nickname,int(time.time())))
  sid=cur.lastrowid
 return {'success':True,'id':sid,'message':'已儲存帳號資料（尚未連接遊戲登入）'}
def change_state(x:Control,state:str,authorization):
 u=auth(authorization)
 with conn() as c:
  r=c.execute('UPDATE subusers SET status=? WHERE id=? AND parent_id=?',(state,x.id,u['id']))
  if r.rowcount==0:raise HTTPException(404,'找不到帳號')
 return {'success':True,'status':state,'simulation':True,'message':'僅更新控制台狀態，尚未啟動遊戲自動化'}
@app.post('/api/kubernetes/run')
def run(x:Control,authorization:str|None=Header(None)):return change_state(x,'demo-running',authorization)
@app.post('/api/kubernetes/stop')
def stop(x:Control,authorization:str|None=Header(None)):return change_state(x,'idle',authorization)
@app.get('/api/sub-user/{sub_id}/exp')
def exp(sub_id:int,authorization:str|None=Header(None)):
 u=auth(authorization)
 with conn() as c:r=c.execute('SELECT id FROM subusers WHERE id=? AND parent_id=?',(sub_id,u['id'])).fetchone()
 if not r:raise HTTPException(404,'找不到帳號')
 return {'trial_available':False,'message':'試用資格與期限尚未實作；不會自動授權'}
@app.get('/api/health')
def health():return {'status':'ok','mode':'rebuild-demo'}
app.mount('/',StaticFiles(directory=ROOT/'web',html=True),name='web')
