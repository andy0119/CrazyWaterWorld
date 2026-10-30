from gift_history import expired_codes
"""Daily public-code refresh. Persists candidates only; never contacts the game."""
import json
import threading
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from gift_code_source import latest_codes

_lock = threading.RLock()
_failure_until = 0


def merge_codes(existing, incoming, limit=None):
    result = [];seen=set()
    for code in [*incoming, *existing]:
        if not isinstance(code, str) or not 0 < len(code.strip()) <= 100:
            raise ValueError('invalid_gift_candidate')
        code = code.strip()
        if code not in seen:
            result.append(code);seen.add(code)
    if limit is not None and len(result) > limit:
        raise ValueError('gift_candidate_limit')
    return result


def refresh_account(conn, sub_id, fetcher=latest_codes, now=None):
    global _failure_until
    now = int(time.time()) if now is None else now
    day = datetime.fromtimestamp(now, timezone(timedelta(hours=8))).date().isoformat()
    with conn() as db:
        row = db.execute('SELECT settings FROM task_settings WHERE sub_id=?', (sub_id,)).fetchone()
    saved = json.loads(row['settings']) if row else {}
    if saved.get('script_gift_daily_update') is not True:
        return {'ok': True, 'disabled': True, 'day': day, 'message': '禮包碼每日更新已关闭'}
    with _lock:
        with conn() as db:
            db.execute('CREATE TABLE IF NOT EXISTS daily_gift_source(id INTEGER PRIMARY KEY,day TEXT NOT NULL,payload TEXT NOT NULL)')
            cached = db.execute('SELECT day,payload FROM daily_gift_source WHERE id=1').fetchone()
        if cached and cached['day'] == day:
            data = json.loads(cached['payload'])
        elif now < _failure_until:
            return {'ok': False, 'retryAfter': _failure_until-now, 'message': '禮包碼公開來源暫不可讀，保留原名單；稍後再查'}
        else:
            fallback = json.loads((Path(__file__).resolve().parent.parent/'web/gift-codes.json').read_text(encoding='utf-8'))
            try:
                data = fetcher(fallback, force=True)
                if data.get('stale') or not data.get('codes'):
                    raise ValueError('stale_source')
                merge_codes([], data['codes'])
            except Exception:
                _failure_until = now+3600
                return {'ok': False, 'retryAfter': 3600, 'message': '禮包碼公開來源讀取失敗，保留原名單，1 小時後再查'}
            with conn() as db:
                db.execute('INSERT INTO daily_gift_source VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET day=excluded.day,payload=excluded.payload', (day, json.dumps(data, ensure_ascii=False)))
    try:
        with conn() as db:expired=expired_codes(db,sub_id)
        codes = [code for code in merge_codes(saved.get('script_gift_codes', []), data['codes']) if code not in expired]
    except ValueError:
        return {'ok': False, 'retryAfter': 3600, 'message': '禮包碼名單無效，保留原名單；請先整理名單'}
    added = len(set(codes)-set(saved.get('script_gift_codes', [])))
    # Compare-and-set protects settings saved concurrently by the user.
    saved['script_gift_codes'] = codes
    with conn() as db:
        changed = db.execute('UPDATE task_settings SET settings=?,updated=? WHERE sub_id=? AND settings=?', (json.dumps(saved, ensure_ascii=False), now, sub_id, row['settings'])).rowcount
    if not changed:
        return {'ok': False, 'retryAfter': 60, 'message': '設定同時有修改，禮包碼稍後重新合併，未覆蓋修改'}
    stamp = data.get('source_updated_at') or '未提供'
    return {'ok': True, 'day': day, 'codes': codes, 'added': added, 'message': f'禮包碼每日更新：新增 {added} 組，共 {len(codes)} 組；來源更新 {stamp}，已嘗試的碼不重送'}
