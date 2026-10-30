"""Persist bounded action evidence, without recording credentials or raw packets."""
def safe_action_result(event):
    result={key:event[key] for key in ('status','win','message','serverPrompt','promptCode','promptText') if key in event}
    for key in ('rewardStage','counterBefore','counterAfter','counterTimeBefore','counterTimeAfter'):
        value=event.get(key)
        if type(value) is int and 0 <= value <= 2**53-1:
            result[key]=value
    if event.get('giftCodeStatus') in ('expired','used','used_by_other','invalid','unconfirmed'):
        result['giftCodeStatus']=event['giftCodeStatus']
    return result
