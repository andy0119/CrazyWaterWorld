import json,time

ROLE_OPTION_FIELDS={'ref_shop_arena_items','ref_shop_vip_items','ref_shop_discount_items','ref_island_pet_recycleAllowedUids','ref_island_equip_recycleAllowedUids','ref_hero_heroes','ref_island_pet_advanceRooms','ref_island_factory_disabledFactories','ref_island_pet_levelUpPetIds','ref_world_fleet_repairSpeedFleets'}

def sanitize_role_options(options):
 if not isinstance(options,dict):return {}
 result={}
 for key,entries in options.items():
  if key not in ROLE_OPTION_FIELDS or not isinstance(entries,list):continue
  rows=[];seen=set()
  for item in entries[:300]:
   if not isinstance(item,dict):continue
   value,label=item.get('value'),item.get('label')
   if not isinstance(value,str) or not 0<len(value)<=100 or not isinstance(label,str) or not 0<len(label)<=150 or value in seen:continue
   seen.add(value);rows.append({'value':value,'label':label})
  result[key]=rows
 return result

def store_role_options(conn,job,event):
 if str(event.get('roleId'))!=str(job.get('role_id')):return
 options=sanitize_role_options(event.get('options'))
 if not options:return
 with conn() as db:
  old=db.execute('SELECT options FROM task_role_options WHERE sub_id=? AND owner_id=? AND role_id=?',(job['sub_id'],job['owner'],job['role_id'])).fetchone()
  if old:
   previous=sanitize_role_options(json.loads(old['options']))
   if event.get('append') is True:
    options={key:previous.get(key,[])+rows for key,rows in options.items()}
    options=sanitize_role_options(options)
   previous.update(options);options=previous
  db.execute('INSERT INTO task_role_options VALUES(?,?,?,?,?) ON CONFLICT(sub_id) DO UPDATE SET owner_id=excluded.owner_id,role_id=excluded.role_id,updated=excluded.updated,options=excluded.options',(job['sub_id'],job['owner'],job['role_id'],int(time.time()),json.dumps(options,ensure_ascii=False)))

def load_role_options(conn,owner,sub_id,role_id):
 with conn() as db:row=db.execute('SELECT options,updated FROM task_role_options WHERE sub_id=? AND owner_id=? AND role_id=?',(sub_id,owner,str(role_id))).fetchone()
 return {'options':sanitize_role_options(json.loads(row['options'])),'updated':row['updated'],'source':'role'} if row else {'options':{},'updated':None,'source':'configuration','message':'角色专属名单尚未读取；脚本连线成功后可更新。配置名单不代表角色已持有或已解锁。'}
