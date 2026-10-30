from runtime_paths import node_executable
from arena_view import store as store_arena_view, mount as mount_arena_view
from world_map_view import store as store_world_map
from setting_options import store_role_options,load_role_options
import atexit,json,subprocess,threading,time,uuid

from pathlib import Path

from fastapi import Header,HTTPException

from wx_capabilities import TASKS,MASTERS,selected_tasks



class TaskEngine:

 def __init__(self,auth,conn,store,command=None):

  self.auth,self.conn,self.store=auth,conn,store

  self.labels={f['key']:f['label'] for section in json.loads(Path(__file__).with_name('task_catalog.json').read_text(encoding='utf8')) for f in section['fields']}

  self.command=command or [node_executable(),str(Path(__file__).with_name('task-worker.mjs'))]

  self.lock=threading.RLock();self.jobs={}

  with conn() as db:

   db.executescript('CREATE TABLE IF NOT EXISTS script_runs(id TEXT PRIMARY KEY,sub_id INTEGER,owner_id INTEGER,status TEXT,started INTEGER,finished INTEGER);CREATE TABLE IF NOT EXISTS script_logs(id INTEGER PRIMARY KEY,run_id TEXT,sub_id INTEGER,owner_id INTEGER,created INTEGER,message TEXT);CREATE TABLE IF NOT EXISTS script_actions(sub_id INTEGER,action_key TEXT,status TEXT,updated INTEGER,PRIMARY KEY(sub_id,action_key));')

   db.execute('CREATE TABLE IF NOT EXISTS task_role_options(sub_id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL,role_id TEXT NOT NULL,updated INTEGER NOT NULL,options TEXT NOT NULL)')

   if 'result' not in [r[1] for r in db.execute('PRAGMA table_info(script_actions)')]:db.execute('ALTER TABLE script_actions ADD COLUMN result TEXT')

   for old in db.execute("SELECT sub_id,action_key,updated FROM script_actions WHERE result IS NULL AND status='verified' AND action_key LIKE 'mainline:%'").fetchall():

    parts=old['action_key'].split(':');stage=parts[1]

    messages=[f'主线第 {stage} 关：服务器判定胜利，继续下一关',f'主线第 {stage} 关：服务器判定失败']

    hits=db.execute('SELECT message FROM script_logs WHERE sub_id=? AND ABS(created-?)<=1 AND message IN (?,?)',(old['sub_id'],old['updated'],*messages)).fetchall()

    outcomes={row['message'] for row in hits}

    if len(outcomes)==1:

     message=next(iter(outcomes));result={'status':'verified','win':message==messages[0],'message':message}

     db.execute('UPDATE script_actions SET result=? WHERE sub_id=? AND action_key=?',(json.dumps(result),old['sub_id'],old['action_key']))

   db.execute("UPDATE script_runs SET status='interrupted',finished=? WHERE finished IS NULL",(int(time.time()),))

   db.execute("UPDATE subusers SET status='idle' WHERE status='running'")

  atexit.register(self.close)

 def own(self,sub_id,authorization):

  user=self.auth(authorization)

  with self.conn() as db:account=db.execute('SELECT * FROM subusers WHERE id=? AND parent_id=?',(sub_id,user['id'])).fetchone()

  if not account:raise HTTPException(404,'找不到帳號')

  return user,account

 def log(self,job,message):

  with self.conn() as db:db.execute('INSERT INTO script_logs(run_id,sub_id,owner_id,created,message) VALUES(?,?,?,?,?)',(job['id'],job['sub_id'],job['owner'],int(time.time()),str(message)[:500]))

 def start(self,sub_id,authorization):

  user,account=self.own(sub_id,authorization)

  if account['platform'] not in ('wechat','yishijie','douyin_cn'):raise HTTPException(409,'此渠道尚未支援任務執行')

  session=self.store.load(user['id'],sub_id)

  with self.conn() as db:row=db.execute('SELECT settings FROM task_settings WHERE sub_id=?',(sub_id,)).fetchone()

  values=json.loads(row['settings']) if row else {}

  selected=dict(values)

  for key,default in [('script_achievement',False),('script_afk',False),('script_gift_codes',[]),('script_interval',60)]:selected.setdefault(key,default)

  unsupported=[key for key,value in selected.items() if value is True and key not in TASKS and key not in MASTERS]

  if unsupported:raise HTTPException(409,'部分勾选功能尚未接通，请先关闭：'+'、'.join(self.labels.get(k,k) for k in unsupported[:8]))

  if not selected_tasks(selected):raise HTTPException(409,'请先保存至少一项标记为「微信可执行」的任务；基地收取需开启对应总开关')

  selected['script_interval']=max(60,min(3600,int(selected['script_interval'])))

  with self.lock:

   if sub_id in self.jobs:raise HTTPException(409,'此帳號已有腳本執行中')

   if len(self.jobs)>=8:raise HTTPException(429,'本機最多同時執行8個帳號')

   process=subprocess.Popen(self.command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))

   job={'id':uuid.uuid4().hex,'sub_id':sub_id,'owner':user['id'],'process':process,'stopping':False,'role_id':str(session['role_id'])}

   with self.conn() as db:db.execute('INSERT INTO script_runs VALUES(?,?,?,?,?,NULL)',(job['id'],sub_id,user['id'],'starting',int(time.time())))

   self.jobs[sub_id]=job

   import os

   with self.conn() as db:history=[r['action_key'] for r in db.execute("SELECT action_key FROM script_actions WHERE sub_id=? AND ((action_key NOT LIKE 'loot:%' AND action_key NOT LIKE 'world-boss:%') OR status!='rejected') AND (action_key LIKE 'equip-make:%' OR action_key LIKE 'pet-breed:%' OR action_key LIKE 'world-boss:%' OR action_key LIKE 'choice-event:%' OR action_key LIKE 'loot:%' OR action_key LIKE 'trade:%' OR action_key LIKE 'cargo:%' OR action_key LIKE 'pet-level:%' OR action_key LIKE 'pet-feed:%' OR action_key LIKE 'pet-advance-%' OR action_key LIKE 'museum-speed:%' OR action_key LIKE 'hero-free-recruit:%' OR action_key LIKE 'guild-help:%' OR action_key LIKE 'pirate-attack:%' OR action_key LIKE 'radar-start:%' OR action_key LIKE 'week-order:%' OR action_key LIKE 'resource-field:%' OR action_key LIKE 'city-war:%') ORDER BY updated",(sub_id,))]

   process.stdin.write(json.dumps({'login':session['login'],'roleId':session['role_id'],'settings':selected,'parentPid':os.getpid(),'actionHistory':history})+'\n');process.stdin.flush()

   job['thread']=threading.Thread(target=self.monitor,args=(job,),daemon=True);job['thread'].start()

  return {'success':True,'run_id':job['id'],'status':'starting','message':'正在驗證遊戲連線，請查看執行紀錄'}

 def monitor(self,job):

  process=job['process'];status='failed'

  try:

   for line in process.stdout:

    if len(line)>200000:continue

    try:event=json.loads(line)

    except ValueError:continue

    kind=event.get('type')

    if kind=='intent':

     key=event.get('key','')[:200]

     with self.conn() as db:insert=db.execute("INSERT OR IGNORE INTO script_actions(sub_id,action_key,status,updated) VALUES(?,?,'attempted',?)",(job['sub_id'],key,int(time.time())));accepted=insert.rowcount==1

     previous=None

     if not accepted:

      with self.conn() as db:

       prior=db.execute('SELECT result FROM script_actions WHERE sub_id=? AND action_key=?',(job['sub_id'],key)).fetchone()

      if prior and prior['result']:previous=json.loads(prior['result'])

     if not job['stopping']:

      process.stdin.write(json.dumps({'ack':event['id'],'accepted':accepted,'previous':previous})+'\n');process.stdin.flush()

    elif kind=='world_map':

     store_world_map(self.conn,job,event)

    elif kind=='arena_view':

     store_arena_view(self.conn,job,event)

    elif kind=='setting_options':

     store_role_options(self.conn,job,event)

    elif kind=='outcome':

     action_status=event.get('status') if event.get('status') in ('verified','rejected','unconfirmed') else 'unconfirmed'

     with self.conn() as db:db.execute('UPDATE script_actions SET status=?,updated=?,result=? WHERE sub_id=? AND action_key=?',(action_status,int(time.time()),json.dumps({k:event[k] for k in ('status','win','message','serverPrompt','promptCode','promptText') if k in event}),job['sub_id'],event.get('key','')))

     self.log(job,event.get('message','任務結果待確認'))

    elif kind=='state':

     state=event.get('state');status=state if state in ('running','waiting','reconnecting','failed','reauthorization_required') else 'failed'

     with self.conn() as db:

      db.execute('UPDATE script_runs SET status=? WHERE id=?',(status,job['id']))

      db.execute('UPDATE subusers SET status=? WHERE id=? AND parent_id=?',(status,job['sub_id'],job['owner']))

      if status=='reauthorization_required':db.execute("UPDATE game_sessions SET status='reauthorization_required' WHERE sub_id=? AND owner_id=?",(job['sub_id'],job['owner']))

     self.log(job,event.get('message','連線狀態更新'))

    elif kind=='log':self.log(job,event.get('message',''))

  except Exception:self.log(job,'腳本通訊中斷，已停止；未確認動作不自動重送')

  finally:

   if process.poll() is None:process.terminate()

   final='stopped' if job['stopping'] else status if status in ('failed','reauthorization_required') else 'failed'

   with self.conn() as db:

    db.execute('UPDATE script_runs SET status=?,finished=? WHERE id=?',(final,int(time.time()),job['id']))

    db.execute('UPDATE subusers SET status=? WHERE id=? AND parent_id=?',('idle' if job['stopping'] else final,job['sub_id'],job['owner']))

   with self.lock:

    if self.jobs.get(job['sub_id']) is job:self.jobs.pop(job['sub_id'],None)

 def stop(self,sub_id,authorization):

  self.own(sub_id,authorization)

  with self.lock:

   job=self.jobs.get(sub_id)

   if job:job['stopping']=True;job['process'].terminate()

  if job:

   try:job['process'].wait(timeout=5)

   except subprocess.TimeoutExpired:raise HTTPException(503,'停止尚未完成，請稍後再確認')

   job['thread'].join(timeout=3)

   if job['thread'].is_alive():raise HTTPException(503,'正在保存最後執行狀態，請稍後再確認')

  return {'success':True,'status':'stopping' if job else 'idle','message':'已送出停止指令；已送往遊戲伺服器的動作無法撤回'}

 def close(self):

  with self.lock:

   for job in list(self.jobs.values()):

    job['stopping']=True

    if job['process'].poll() is None:job['process'].terminate()



def mount_engine_routes(app,engine):

 @app.post('/api/sub-user/{sub_id}/script/start')

 def start(sub_id:int,authorization:str|None=Header(None)):return engine.start(sub_id,authorization)

 @app.post('/api/sub-user/{sub_id}/script/stop')

 def stop(sub_id:int,authorization:str|None=Header(None)):return engine.stop(sub_id,authorization)

 @app.get('/api/sub-user/{sub_id}/script')

 def status(sub_id:int,authorization:str|None=Header(None)):

  user,account=engine.own(sub_id,authorization)

  with engine.conn() as db:

   run=db.execute('SELECT id,status,started,finished FROM script_runs WHERE sub_id=? AND owner_id=? ORDER BY started DESC,rowid DESC LIMIT 1',(sub_id,user['id'])).fetchone()

   logs=db.execute('SELECT id,created,message FROM script_logs WHERE sub_id=? AND owner_id=? ORDER BY id DESC LIMIT 100',(sub_id,user['id'])).fetchall()

  return {'platform':account['platform'],'run':dict(run) if run else None,'logs':[dict(r) for r in reversed(logs)],'supported_tasks':list(TASKS),'capabilities':TASKS}


 @app.get('/api/sub-user/{sub_id}/setting-options')
 def setting_options(sub_id:int,authorization:str|None=Header(None)):
  user,account=engine.own(sub_id,authorization)
  return load_role_options(engine.conn,user['id'],sub_id,account['uid'])

