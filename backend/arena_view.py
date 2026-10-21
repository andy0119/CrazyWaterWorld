"""Role-scoped snapshots read from verified game connections."""
import json,time

def setup(conn):
 with conn() as db:db.execute('CREATE TABLE IF NOT EXISTS task_arena_views(sub_id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL,role_id TEXT NOT NULL,updated INTEGER NOT NULL,data TEXT NOT NULL)')

def sanitize(data):
 if not isinstance(data,dict) or not isinstance(data.get('opponents'),list):return None
 def row(value):
  if not isinstance(value,dict):return None
  out={}
  for key in ('id','nickname','power'):
   v=value.get(key)
   if isinstance(v,str) and len(v)<=100:out[key]=v
  rank=value.get('rankNo')
  if type(rank) is int and 0<=rank<=100000000:out['rankNo']=rank
  if value.get('failed') is True:out['failed']=True
  return out
 clean={'myself':row(data.get('myself')) or {},'opponents':[r for v in data['opponents'][:100] if (r:=row(v)) is not None]}
 for key in ('arenaPoint','dailyChallengeTimes'):
  v=data.get(key)
  if type(v) is int and 0<=v<=100000000:clean[key]=v
 return clean

def store(conn,job,event):
 if str(event.get('roleId'))!=str(job['role_id']):return
 data=sanitize(event.get('data'))
 if data is None:return
 with conn() as db:db.execute('INSERT INTO task_arena_views VALUES(?,?,?,?,?) ON CONFLICT(sub_id) DO UPDATE SET owner_id=excluded.owner_id,role_id=excluded.role_id,updated=excluded.updated,data=excluded.data',(job['sub_id'],job['owner'],str(job['role_id']),int(time.time()),json.dumps(data,ensure_ascii=False)))

def mount(app,engine):
 from fastapi import Header
 setup(engine.conn)
 @app.get('/api/sub-user/{sub_id}/arena')
 def arena(sub_id:int,authorization:str|None=Header(None)):
  user,account=engine.own(sub_id,authorization)
  with engine.conn() as db:row=db.execute('SELECT updated,data FROM task_arena_views WHERE sub_id=? AND owner_id=? AND role_id=?',(sub_id,user['id'],str(account['uid']))).fetchone()
  return {'updated':row['updated'],'data':sanitize(json.loads(row['data']))} if row else {'updated':None,'data':None}
