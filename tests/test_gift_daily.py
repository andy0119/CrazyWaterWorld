import json,sqlite3,tempfile,unittest
from pathlib import Path
from contextlib import contextmanager
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import gift_daily

class DailyGiftUpdate(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db=Path(self.tmp.name)/'test.sqlite3';self.calls=0;self.now=1793372400
        gift_daily._failure_until=0
        with self.conn() as c:c.execute('CREATE TABLE task_settings(sub_id INTEGER PRIMARY KEY,settings TEXT,updated INTEGER)')
        self.save(1,{'script_gift_daily_update':True,'script_gift_codes':['OLD'],'factory_0':True})

    def tearDown(self):self.tmp.cleanup()

    @contextmanager
    def conn(self):
        c=sqlite3.connect(self.db);c.row_factory=sqlite3.Row
        try:yield c;c.commit()
        finally:c.close()

    def save(self,id,values):
        with self.conn() as c:c.execute('INSERT OR REPLACE INTO task_settings VALUES(?,?,0)',(id,json.dumps(values)))

    def settings(self,id=1):
        with self.conn() as c:return json.loads(c.execute('SELECT settings FROM task_settings WHERE sub_id=?',(id,)).fetchone()[0])

    def fetch(self,fallback,force=False):
        self.assertTrue(force);self.calls+=1
        return {'codes':['NEW','OLD','00123'],'source_updated_at':'2026-10-30','stale':False}

    def test_daily_cache_shared_and_persistent_and_next_day_refreshes(self):
        r=gift_daily.refresh_account(self.conn,1,self.fetch,self.now)
        self.assertTrue(r['ok']);self.assertEqual(r['added'],2);self.assertEqual(self.settings()['script_gift_codes'],['NEW','OLD','00123']);self.assertTrue(self.settings()['factory_0'])
        self.save(2,{'script_gift_daily_update':True,'script_gift_codes':[]})
        gift_daily.refresh_account(self.conn,2,self.fetch,self.now+60)
        gift_daily.refresh_account(self.conn,1,self.fetch,self.now+120)
        self.assertEqual(self.calls,1)
        gift_daily.refresh_account(self.conn,1,self.fetch,self.now+86400)
        self.assertEqual(self.calls,2)

    def test_disabled_does_not_fetch(self):
        self.save(1,{'script_gift_daily_update':False,'script_gift_codes':['OLD']})
        self.assertTrue(gift_daily.refresh_account(self.conn,1,self.fetch,self.now)['disabled']);self.assertEqual(self.calls,0)

    def test_failed_fetch_keeps_settings_and_backs_off(self):
        before=self.settings()
        def fail(*a,**kw):self.calls+=1;return {'codes':['WRONG'],'stale':True}
        self.assertFalse(gift_daily.refresh_account(self.conn,1,fail,self.now)['ok'])
        self.assertFalse(gift_daily.refresh_account(self.conn,1,fail,self.now+60)['ok'])
        self.assertEqual(self.calls,1);self.assertEqual(self.settings(),before)

    def test_concurrent_save_is_not_overwritten(self):
        def save_during_fetch(*a,**kw):
            self.save(1,{'script_gift_daily_update':True,'script_gift_codes':['MANUAL'],'factory_0':False})
            return self.fetch(*a,**kw)
        r=gift_daily.refresh_account(self.conn,1,save_during_fetch,self.now)
        self.assertFalse(r['ok']);self.assertEqual(r['retryAfter'],60);self.assertEqual(self.settings()['script_gift_codes'],['MANUAL']);self.assertFalse(self.settings()['factory_0'])

    def test_more_than_1000_codes_are_merged_without_truncation(self):
        original={'script_gift_daily_update':True,'script_gift_codes':[f'C{i}' for i in range(1000)]}
        self.save(1,original)
        self.assertTrue(gift_daily.refresh_account(self.conn,1,self.fetch,self.now)['ok']);self.assertEqual(len(self.settings()['script_gift_codes']),1003)

if __name__=='__main__':unittest.main()
