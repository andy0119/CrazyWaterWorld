"""Owner-isolated, bounded Douyin account QR. Does not assert game authorization."""
import atexit, json, secrets, subprocess, threading, time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from pathlib import Path
from fastapi import APIRouter, Header, HTTPException

WORK=Path(r'C:/Users/a2220/Documents/Codex/2026-10-16/files-mentioned-by-the-user-aurora/work')
NODE=r'C:/Users/a2220/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
MESSAGES={
 'waiting':'請用手機抖音官方標準版掃碼，再於手機確認。',
 'scanned':'已掃碼，請在手機確認登入。',
 'account_confirmed':'抖音帳號登入已驗證；小遊戲授權尚未接通，不能用這次掃碼讀取遊戲角色。',
 'session_pending':'手機已確認，抖音會話尚待驗證；遊戲尚未登入。',
 'expired':'登入碼已到期或授權取消，請重新產生。',
 'verification':'抖音要求額外驗證，請改在官方客戶端完成。',
 'failed':'掃碼服務未完成，請重新產生。',
}

def mount_douyin_qr_routes(app,auth):
 router=APIRouter(prefix='/api/game-login/douyin/qr')
 sessions={}; guard=threading.Lock(); pool=ThreadPoolExecutor(max_workers=4)
 def stop(record):
  process=record['process']
  if process.poll() is None:process.terminate()
 def clean():
  for sid,record in list(sessions.items()):
   if record['expires']<time.monotonic():stop(record);del sessions[sid]
 def exchange(record,initial=False):
  with record['lock']:
   try:
    if not initial:record['process'].stdin.write('poll\n');record['process'].stdin.flush()
    future=pool.submit(record['process'].stdout.readline)
    line=future.result(timeout=22)
    value=json.loads(line)
   except Exception:
    stop(record);raise HTTPException(502,'抖音掃碼服務沒有回應，請重新產生登入碼')
   state=value.get('state','failed')
   result={'state':state,'message':MESSAGES.get(state,MESSAGES['failed']),'gameVerified':False}
   if initial and state=='waiting':result.update(qr=value['qr'],expiresAt=value['expiresAt'])
   return result
 def owned(sid,user):
  with guard:
   clean();record=sessions.get(sid)
   if not record or record['owner']!=user['id']:raise HTTPException(404,'登入碼不存在或已到期')
   return record
 @router.post('')
 def start(authorization:str|None=Header(None)):
  user=auth(authorization)
  with guard:
   clean()
   for sid,record in list(sessions.items()):
    if record['owner']==user['id']:stop(record);del sessions[sid]
   if len(sessions)>=4:raise HTTPException(429,'登入服務忙碌，請稍後再試')
   process=subprocess.Popen([NODE,str(WORK/'douyin_qr_worker.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
   sid=secrets.token_urlsafe(24)
   record={'owner':user['id'],'process':process,'expires':time.monotonic()+180,'lock':threading.Lock(),'last_poll':0,'last_result':None}
   sessions[sid]=record
  result=exchange(record,True);return {'id':sid,**result}
 @router.get('/{sid}')
 def status(sid:str,authorization:str|None=Header(None)):
  record=owned(sid,auth(authorization))
  if time.monotonic()-record['last_poll']<2 and record['last_result']:return record['last_result']
  result=exchange(record);record['last_poll']=time.monotonic();record['last_result']=result
  return result
 @router.delete('/{sid}')
 def cancel(sid:str,authorization:str|None=Header(None)):
  record=owned(sid,auth(authorization))
  with guard:stop(record);sessions.pop(sid,None)
  return {'success':True}
 @atexit.register
 def shutdown():
  for record in list(sessions.values()):stop(record)
 app.include_router(router)
