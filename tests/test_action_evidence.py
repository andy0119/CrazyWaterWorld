import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from action_results import safe_action_result

class ActionEvidence(unittest.TestCase):
    def test_exact_server_counter_evidence_survives(self):
        source={'status':'verified','rewardStage':2,'counterBefore':1,'counterAfter':2,'counterTimeBefore':1793361600,'counterTimeAfter':1793361720,'message':'verified'}
        self.assertEqual(source,safe_action_result(source))

    def test_does_not_persist_credentials_or_raw_packets(self):
        self.assertEqual({'status':'unconfirmed'},safe_action_result({'status':'unconfirmed','token':'synthetic-test','login':{},'rawPacket':'synthetic-test'}))

    def test_invalid_numeric_evidence_is_not_coerced_or_fabricated(self):
        self.assertEqual({},safe_action_result({'counterBefore':True,'counterAfter':'2','counterTimeBefore':-1,'counterTimeAfter':None,'rewardStage':2**54}))
