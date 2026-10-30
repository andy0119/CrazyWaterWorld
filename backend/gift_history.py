"""Keep confirmed expired codes out of this account's candidate list."""
import json
import time

def expired_codes(db, sub_id):
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='script_actions'").fetchone():
        return set()
    result=set()
    for key, raw in db.execute("SELECT action_key,result FROM script_actions WHERE sub_id=? AND action_key LIKE 'gift:%' AND status='rejected'", (sub_id,)):
        try:data=json.loads(raw or '{}')
        except (ValueError,TypeError):continue
        # Only explicit expiry, including records made before giftCodeStatus existed.
        if data.get('giftCodeStatus')=='expired' or data.get('serverPrompt')=='GIFT_CODE_EXPIRED' or data.get('promptCode')==63 or data.get('message')==f'禮包碼 {key[5:]}：已過期':
            result.add(key[5:])
    return result

def purge_expired(db, sub_id):
    expired=expired_codes(db,sub_id)
    if not expired:return 0
    row=db.execute('SELECT settings FROM task_settings WHERE sub_id=?',(sub_id,)).fetchone()
    if not row:return 0
    values=json.loads(row[0]);codes=values.get('script_gift_codes',[])
    if not isinstance(codes,list):return 0
    kept=[c for c in codes if c.strip() not in expired]
    removed=len(codes)-len(kept)
    if removed:
        values['script_gift_codes']=kept
        db.execute('UPDATE task_settings SET settings=?,updated=? WHERE sub_id=?',(json.dumps(values,ensure_ascii=False),int(time.time()),sub_id))
    return removed
