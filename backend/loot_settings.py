"""Validation for cargo settings; does not write user preferences."""
import math
PREFIX='ref_world_treasureLoot_fleets_'
def validate_loot_settings(values):
 for i in range(3):
  p=PREFIX+str(i)+'_'
  hours=values.get(p+'hours',[])
  if not isinstance(hours,list) or len(hours)>15 or any(not isinstance(h,str) or not h.isdecimal() or not 8<=int(h)<=22 for h in hours):
   raise ValueError(f'货轮舰队 {i+1}：时间请填写 8–22 的整点数字，例如 8、12、18')
  for key,low,high in [('levels',3,5),('maxProgress',0,100),('marchSpeedupTargetSecs',0,100),('recallChipMineLeadMin',0,30),('rewardFilterCount',2,100)]:
   if p+key not in values:continue
   n=values[p+key]
   if type(n) not in (int,float) or not math.isfinite(n) or int(n)!=n or not low<=n<=high:
    raise ValueError(f'货轮舰队 {i+1}：{key} 必须为 {low}–{high} 的整数')
  if values.get(p+'filterReward') and values.get(p+'rewardFilterMode')=='count' and len(values.get(p+'rewardFilter',[]))==1:
   raise ValueError(f'货轮舰队 {i+1}：至少几个模式需选择至少两种奖励')
