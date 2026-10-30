import sys,json,sqlite3,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from gift_history import expired_codes,purge_expired
from action_results import safe_action_result

class GiftExpiryHistory(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript('CREATE TABLE task_settings(sub_id INTEGER PRIMARY KEY,settings TEXT,updated INTEGER);CREATE TABLE script_actions(sub_id INTEGER,action_key TEXT,status TEXT,result TEXT);')
        self.values={'script_gift_codes':['EXPIRED','USED','UNKNOWN','VALID'],'factory_0':True}
        self.db.execute('INSERT INTO task_settings VALUES(1,?,0)',(json.dumps(self.values),))
        self.db.execute('INSERT INTO task_settings VALUES(2,?,0)',(json.dumps(self.values),))
        for code,status,result in [('EXPIRED','rejected',{'giftCodeStatus':'expired'}),('USED','rejected',{'giftCodeStatus':'used'}),('UNKNOWN','unconfirmed',{'promptCode':99})]:
            self.db.execute('INSERT INTO script_actions VALUES(1,?,?,?)',('gift:'+code,status,json.dumps(result)))

    def tearDown(self):self.db.close()

    def test_only_expired_removed_and_history_preserved(self):
        self.assertEqual(purge_expired(self.db,1),1)
        values=json.loads(self.db.execute('SELECT settings FROM task_settings WHERE sub_id=1').fetchone()[0])
        self.assertEqual(values['script_gift_codes'],['USED','UNKNOWN','VALID']);self.assertTrue(values['factory_0'])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM script_actions').fetchone()[0],3)
        self.assertEqual(purge_expired(self.db,1),0)

    def test_account_isolation(self):
        self.assertEqual(expired_codes(self.db,2),set());self.assertEqual(purge_expired(self.db,2),0)

    def test_daily_source_cannot_reintroduce_expired_code(self):
        from contextlib import contextmanager
        import gift_daily
        gift_daily._failure_until=0
        self.db.row_factory=sqlite3.Row
        values={**self.values,'script_gift_daily_update':True}
        self.db.execute('UPDATE task_settings SET settings=? WHERE sub_id=1',(json.dumps(values),))
        @contextmanager
        def conn():
            yield self.db
            self.db.commit()
        result=gift_daily.refresh_account(conn,1,lambda fallback,force=False:{'codes':['EXPIRED','NEW'],'stale':False},1793372400)
        self.assertTrue(result['ok']);self.assertNotIn('EXPIRED',result['codes'])
        self.assertIn('NEW',result['codes']);self.assertIn('USED',result['codes']);self.assertIn('UNKNOWN',result['codes'])

    def test_legacy_expiry_and_metadata_persistence(self):
        self.db.execute('INSERT INTO script_actions VALUES(1,?,?,?)',('gift:LEGACY','rejected',json.dumps({'serverPrompt':'GIFT_CODE_EXPIRED'})))
        self.assertEqual(expired_codes(self.db,1),{'EXPIRED','LEGACY'})
        self.assertEqual(safe_action_result({'giftCodeStatus':'expired','token':'private'}),{'giftCodeStatus':'expired'})

if __name__=='__main__':unittest.main()
