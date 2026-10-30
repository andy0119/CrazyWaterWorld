import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from wx_capabilities import effective_settings,TASKS,MASTERS

class DisabledSettingScopes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog=json.loads((ROOT/'backend/task_catalog.json').read_text(encoding='utf-8'))

    def test_disabled_master_does_not_block_unrelated_tasks(self):
        fields=[f for s in self.catalog for f in s['fields']]
        chase=next(f for f in fields if f.get('source_path')=='world.chipMine.fleets.0.chaseEnabled')
        master=next(f for f in fields if f.get('source_path')=='world.chipMine.enabled')
        original={master['key']:False,chase['key']:True,'script_afk':True}
        selected=effective_settings(original,self.catalog)
        self.assertFalse(selected[chase['key']])
        self.assertTrue(original[chase['key']])
        self.assertTrue(selected['script_afk'])
        self.assertEqual([], [k for k,v in selected.items() if v is True and k not in TASKS and k not in MASTERS])

    def test_active_unimplemented_child_and_unknown_are_not_silently_ignored(self):
        original={'ref_world_chipMine_enabled':True,'ref_world_chipMine_fleets_0_enabled':True,'ref_world_chipMine_fleets_0_chaseEnabled':True,'unknown_future_switch':True}
        selected=effective_settings(original,self.catalog)
        self.assertTrue(selected['ref_world_chipMine_fleets_0_chaseEnabled'])
        self.assertTrue(selected['unknown_future_switch'])
        self.assertNotIn('ref_world_chipMine_fleets_0_chaseEnabled',TASKS)
        self.assertNotIn('ref_world_chipMine_fleets_0_chaseEnabled',MASTERS)

    def test_afk_collection_is_independent_of_main_challenge_master(self):
        fields=[f for s in self.catalog for f in s['fields']]
        master=next(f for f in fields if f.get('source_path')=='battle.stage.enabled')
        afk=next(f for f in fields if f.get('source_path')=='battle.stage.afk.enabled')
        self.assertTrue(effective_settings({master['key']:False,afk['key']:True},self.catalog)[afk['key']])

if __name__=='__main__':unittest.main()
