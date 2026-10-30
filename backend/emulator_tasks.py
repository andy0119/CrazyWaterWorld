"""Local, single-device visual task runner. Does not automate authentication."""
import io,json,os,re,subprocess,threading,time
from pathlib import Path
import numpy as np
from PIL import Image
from fastapi import Header,HTTPException
from pydantic import BaseModel,Field

ADB=os.environ.get('AURORA_ADB','C:/leidian/LDPlayer14/adb.exe')
SERIAL=os.environ.get('AURORA_ADB_SERIAL','127.0.0.1:5555')
PACKAGE='com.gx.sw.qa.fkssj003.esj'
ASSETS=Path(__file__).with_name('emulator-assets')
def adb(*args):
 r=subprocess.run([ADB,'-s',SERIAL,*args],capture_output=True,timeout=15,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 if r.returncode:raise RuntimeError('模擬器連線失敗')
 return r.stdout
def frame():
 im=Image.open(io.BytesIO(adb('exec-out','screencap','-p'))).convert('RGB')
 if im.size!=(720,1280):raise RuntimeError('需要模擬器直向解析度 720×1280')
 return im
def role():
 pid=adb('shell','pidof',PACKAGE).decode().strip().split()[0]
 log=adb('logcat','-d','-t','4000','--pid='+pid,'-v','brief').decode('utf8',errors='replace')
 for line in reversed(log.splitlines()):
  for m in re.finditer(r'\{',line):
   try:o,_=json.JSONDecoder().raw_decode(line[m.start():])
   except ValueError:continue
   p=o.get('playerInfo') if isinstance(o,dict) and o.get('result')==0 else None
   if isinstance(p,dict) and p.get('playerId') and p.get('nickname'):
    return {'uid':str(p['playerId']),'nickname':p['nickname'],'level':p.get('level'),'pid':pid}
 raise RuntimeError('未找到本次遊戲角色，請先自行重新進入遊戲')
def error(a,b):return float(np.abs(np.asarray(a,dtype=np.float32)-np.asarray(b,dtype=np.float32)).mean())
def base_visible(im):
 return error(im.crop((500,1180,570,1270)),Image.open(ASSETS/'base-nav.png').convert('RGB'))<18
def fish_point(im):
 # Match only the circular blue/white indicator interior, independent of base location.
 template=np.asarray(Image.open(ASSETS/'fish.png').convert('RGB').resize((30,33)),dtype=np.float32)
 pixels=np.asarray(im.resize((360,640)),dtype=np.float32)
 yy,xx=np.mgrid[:33,:30];mask=((xx-15)**2/11**2+(yy-17)**2/12**2)<1
 scores=np.zeros((400,260),dtype=np.float32)
 for y,x in zip(*np.where(mask)):
  scores+=np.abs(pixels[90+y:490+y,48+x:308+x]-template[y,x]).mean(axis=2)
 scores/=mask.sum()
 y,x=np.unravel_index(np.argmin(scores),scores.shape)
 return ((int(x)+48+15)*2,(int(y)+90+17)*2,float(scores[y,x])) if scores[y,x]<12 else None

class BindDevice(BaseModel):
 uid:str=Field(min_length=1,max_length=50)

class EmulatorTasks:
 def __init__(self,auth,conn):
  self.auth,self.conn=auth,conn;self.lock=threading.RLock();self.job=None
  with conn() as db:
   db.executescript('CREATE TABLE IF NOT EXISTS emulator_bindings(serial TEXT PRIMARY KEY,sub_id INTEGER UNIQUE,owner_id INTEGER,uid TEXT,pid TEXT,avatar BLOB);CREATE TABLE IF NOT EXISTS emulator_logs(id INTEGER PRIMARY KEY,sub_id INTEGER,owner_id INTEGER,created INTEGER,message TEXT);')
 def own(self,id,token):
  u=self.auth(token)
  with self.conn() as db:r=db.execute('SELECT * FROM subusers WHERE id=? AND parent_id=?',(id,u['id'])).fetchone()
  if not r:raise HTTPException(404,'找不到帳號')
  if r['platform']!='yishijie':raise HTTPException(409,'此任務目前僅支援益世界 APP')
  return u,r
 def note(self,j,message):
  with self.conn() as db:db.execute('INSERT INTO emulator_logs(sub_id,owner_id,created,message) VALUES(?,?,?,?)',(j['sub_id'],j['owner'],int(time.time()),message))
 def probe(self,id,token):
  self.own(id,token)
  with self.conn() as db:r=db.execute('SELECT sub_id FROM emulator_bindings WHERE serial=?',(SERIAL,)).fetchone()
  if r and r['sub_id']!=id:raise HTTPException(409,'此模擬器已綁定其他帳號')
  try:
   p=role();im=frame()
   if not base_visible(im):raise RuntimeError('請先回到遊戲基地，關閉彈窗')
   return {'role':{k:v for k,v in p.items() if k!='pid'},'device':SERIAL}
  except Exception as e:raise HTTPException(409,str(e) if isinstance(e,RuntimeError) else '無法讀取模擬器，請確認遊戲已開啟')
 def bind(self,id,data,token):
  u,a=self.own(id,token)
  with self.lock:
   if self.job:raise HTTPException(409,'請先停止模擬器任務')
   p=self.probe(id,token)['role']
   if p['uid']!=data.uid:raise HTTPException(409,'角色已改變，請重新讀取')
   if a['uid'] and str(a['uid'])!=p['uid']:raise HTTPException(409,'目前模擬器角色與此帳號不符')
   im=frame();buf=io.BytesIO();im.crop((0,0,105,115)).save(buf,format='PNG');pid=role()['pid']
   with self.conn() as db:
    other=db.execute('SELECT id FROM subusers WHERE uid=? AND id<>?',(p['uid'],id)).fetchone()
    if other:raise HTTPException(409,'這個角色已綁定其他帳號')
    db.execute('INSERT INTO emulator_bindings VALUES(?,?,?,?,?,?) ON CONFLICT(serial) DO UPDATE SET sub_id=excluded.sub_id,owner_id=excluded.owner_id,uid=excluded.uid,pid=excluded.pid,avatar=excluded.avatar',(SERIAL,id,u['id'],p['uid'],pid,buf.getvalue()))
    db.execute('UPDATE subusers SET uid=?,nickname=? WHERE id=?',(p['uid'],p['nickname'],id))
   return {'success':True,'role':p}
 def start(self,id,token):
  u,a=self.own(id,token)
  raise HTTPException(409,'產出圖示校準未通過：目前樣本實際為海獸培育入口，自動點擊已停用。角色讀取與綁定仍可使用。')
 def run(self,j):
  self.note(j,'已開始：每 60 秒檢查基地釣魚產出；僅在辨識成功時點擊')
  try:
   b=j['binding'];avatar=Image.open(io.BytesIO(b['avatar'])).convert('RGB')
   while not j['stop'].is_set():
    p=role();im=frame()
    if p['uid']!=b['uid'] or p['pid']!=b['pid']:raise RuntimeError('角色或遊戲程序已改變，請重新綁定')
    if error(im.crop((0,0,105,115)),avatar)>18:raise RuntimeError('角色畫面已改變，已停止以避免誤點')
    if not base_visible(im):raise RuntimeError('不是已確認的基地畫面，請關閉彈窗後重新開始')
    point=fish_point(im)
    if point:
     x,y,_=point
     if j['stop'].is_set():break
     adb('shell','input','tap',str(x),str(y))
     if j['stop'].wait(2):break
     after=frame();remaining=fish_point(after)
     self.note(j,'已點擊釣魚產出，領取圖示已消失；道具數量待遊戲內核對' if base_visible(after) and not remaining else '點擊結果無法確認，已停止，請檢查遊戲')
     if not base_visible(after) or remaining:break
    else:self.note(j,'基地正常，目前未辨識到可領取的釣魚產出')
    j['stop'].wait(60)
  except Exception as e:self.note(j,str(e) if isinstance(e,RuntimeError) else '模擬器讀取失敗，任務已停止')
  finally:
   self.note(j,'模擬器任務已停止')
   with self.lock:
    if self.job is j:self.job=None
 def stop(self,id,token):
  self.own(id,token)
  with self.lock:j=self.job if self.job and self.job['sub_id']==id else None
  if j:
   j['stop'].set();j['thread'].join(20)
   if j['thread'].is_alive():raise HTTPException(503,'正在等待模擬器回應，停止尚未完成')
  return {'success':True}
 def status(self,id,token):
  u,a=self.own(id,token)
  with self.conn() as db:
   bound=db.execute('SELECT uid FROM emulator_bindings WHERE sub_id=? AND owner_id=?',(id,u['id'])).fetchone()
   rows=db.execute('SELECT created,message FROM emulator_logs WHERE sub_id=? AND owner_id=? ORDER BY id DESC LIMIT 60',(id,u['id'])).fetchall()
  return {'running':bool(self.job and self.job['sub_id']==id),'bound':bool(bound),'logs':[dict(r) for r in reversed(rows)]}

def mount_emulator_tasks(app,auth,conn):
 service=EmulatorTasks(auth,conn);app.state.emulator_tasks=service
 @app.get('/api/sub-user/{id}/emulator')
 def status(id:int,authorization:str|None=Header(None)):return service.status(id,authorization)
 @app.get('/api/sub-user/{id}/emulator/probe')
 def probe(id:int,authorization:str|None=Header(None)):return service.probe(id,authorization)
 @app.post('/api/sub-user/{id}/emulator/bind')
 def bind(id:int,data:BindDevice,authorization:str|None=Header(None)):return service.bind(id,data,authorization)
 @app.post('/api/sub-user/{id}/emulator/start')
 def start(id:int,authorization:str|None=Header(None)):return service.start(id,authorization)
 @app.post('/api/sub-user/{id}/emulator/stop')
 def stop(id:int,authorization:str|None=Header(None)):return service.stop(id,authorization)
 @app.on_event('shutdown')
 def shutdown():
  if service.job:service.job['stop'].set();service.job['thread'].join(20)
