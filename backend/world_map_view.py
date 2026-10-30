import json,time,math

def setup(conn):
 with conn() as db:db.execute('CREATE TABLE IF NOT EXISTS task_world_maps(sub_id INTEGER,owner_id INTEGER,role_id TEXT,updated INTEGER,data TEXT,PRIMARY KEY(sub_id,owner_id))')

def store(conn,job,event):
 if str(event.get('roleId'))!=str(job['role_id']):return
 data=event.get('data')
 if not isinstance(data,dict) or data.get('scenario')!=1:return
 if not isinstance(data.get('cities'),list) or len(data['cities'])>200:return
 if not isinstance(data.get('fleets'),list) or len(data['fleets'])>200:return
 clean={'scenario':1,'cities':[],'fleets':[]}
 if type(data.get('serverNow')) is int and 0<data['serverNow']<100000000000:clean['serverNow']=data['serverNow']
 for row in data['cities']:
  if not isinstance(row,dict) or type(row.get('id')) is not int or not 0<row['id']<10000:return
  clean['cities'].append({k:v for k,v in row.items() if k in ('id','guildIdx') and type(v) is int and 0<=v<100000})
 for row in data['fleets']:
  if not isinstance(row,dict) or not isinstance(row.get('id'),str) or len(row['id'])>80:return
  r={'id':row['id'],'own':row.get('own') is True}
  for key,limit in [('ownerId',40),('nickname',80),('guildId',40)]:
   if isinstance(row.get(key),str):r[key]=row[key][:limit]
  for k in ('cityId','grid','targetGrid','state','startGrid','startCityId','targetCityId','moveStart','moveEnd','treasureUid'):
   v=row.get(k)
   if type(v) is int and 0<=v<(100000000000 if k in ('moveStart','moveEnd','treasureUid') else 1000000):r[k]=v
  clean['fleets'].append(r)
 for key,fields in [('treasures',('uid','grid','color','ownerGuild','fleets','progress')),('chipMines',('grid','color','occupied','total'))]:
  rows=data.get(key,[])
  if not isinstance(rows,list) or len(rows)>200:return
  clean[key]=[]
  for row in rows:
   if not isinstance(row,dict):return
   if any(type(row.get(k)) is not int or not 0<=row[k]<1000000 for k in fields):return
   item={k:row[k] for k in fields}
   if key=='treasures' and 'ranks' in row:
    if not isinstance(row['ranks'],list) or len(row['ranks'])>50:return
    item['ranks']=[]
    for player in row['ranks']:
     if not isinstance(player,dict) or not isinstance(player.get('playerId'),str) or not player['playerId'].isdigit() or len(player['playerId'])>40:return
     if not isinstance(player.get('nickname'),str) or len(player['nickname'])>80:return
     if any(type(player.get(k)) is not int or not 0<=player[k]<10000 for k in ('guildIdx','rank')):return
     if any(type(player.get(k)) not in (int,float) or not math.isfinite(player[k]) or not 0<=player[k]<=100 for k in ('progress','estimated')):return
     item['ranks'].append({k:player[k] for k in ('playerId','nickname','guildIdx','rank','progress','estimated')})
    at=row.get('ranksUpdated')
    if type(at) is int and 0<at<100000000000:item['ranksUpdated']=at
   clean[key].append(item)
  at=data.get(key+'Updated')
  if type(at) is int and 0<at<100000000000:clean[key+'Updated']=at
 with conn() as db:db.execute('INSERT INTO task_world_maps VALUES(?,?,?,?,?) ON CONFLICT(sub_id,owner_id) DO UPDATE SET role_id=excluded.role_id,updated=excluded.updated,data=excluded.data',(job['sub_id'],job['owner'],job['role_id'],int(time.time()),json.dumps(clean)))

def mount(app,conn,auth,session_store=None,engine=None):
 from fastapi import Header,HTTPException
 setup(conn)
 @app.get('/api/sub-user/{sub_id}/world-map')
 def read_map(sub_id:int,authorization:str|None=Header(None)):
  user=auth(authorization)
  with conn() as db:
   account=db.execute('SELECT uid FROM subusers WHERE id=? AND parent_id=?',(sub_id,user['id'])).fetchone()
   if not account:raise HTTPException(404,'找不到帳號')
   row=db.execute('SELECT role_id,updated,data FROM task_world_maps WHERE sub_id=? AND owner_id=?',(sub_id,user['id'])).fetchone()
  if not row or str(row['role_id'])!=str(account['uid']):return {'updated':None,'data':None}
  return {'updated':row['updated'],'data':json.loads(row['data'])}

 if session_store is not None and engine is not None:
  import subprocess,threading
  from pathlib import Path
  refresh_lock=threading.Lock()
  @app.post('/api/sub-user/{sub_id}/world-map/refresh')
  def refresh_map(sub_id:int,authorization:str|None=Header(None)):
   user,account=engine.own(sub_id,authorization)
   if account['platform'] not in ('wechat','yishijie','douyin_cn'):raise HTTPException(409,'目前地圖讀取支援微信、抖音小程序與益世界 APP 角色')
   with engine.lock:
    if sub_id in engine.jobs:return {'success':True,'message':'掛機正在連線中，地圖會於每輪開頭更新，請稍候'}
    if not refresh_lock.acquire(blocking=False):raise HTTPException(409,'已有地圖讀取中，請稍候')
    try:
     session=session_store.load(user['id'],sub_id)
     command=[engine.command[0],str(Path(__file__).with_name('map-read-worker.mjs'))]
     try:
      result=subprocess.run(command,input=json.dumps({'login':session['login'],'roleId':session['role_id']}),capture_output=True,text=True,encoding='utf-8',timeout=35,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
     except subprocess.TimeoutExpired:raise HTTPException(504,'地圖連線逾時，請確認遊戲授權')
     if result.returncode!=0:raise HTTPException(409,'無法讀取遊戲地圖，請確認授權有效，且遊戲帳號未在其他裝置操作')
     try:event=json.loads(result.stdout)
     except ValueError:raise HTTPException(502,'地圖回應無法辨識')
     if str(event.get('roleId'))!=str(session['role_id']) or not event.get('data',{}).get('cities'):raise HTTPException(502,'地圖角色或城池回應不完整')
     store(conn,{'sub_id':sub_id,'owner':user['id'],'role_id':session['role_id']},event)
     return {'success':True,'message':'已讀取遊戲城池與艦隊，連線已關閉'}
    finally:refresh_lock.release()
