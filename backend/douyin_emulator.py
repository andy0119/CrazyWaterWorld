"""Bounded Douyin entry launcher. Activity names never prove authentication."""
import argparse,json,re,subprocess,time
ADB=r"C:/leidian/LDPlayer14/adb.exe"
PACKAGE="com.ss.android.ugc.aweme"
APP_ID="tt76340089e939a1bf02"
SCHEME="snssdk1128://microapp?app_id="+APP_ID

def run_adb(serial,*args,timeout=15):
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}",serial):raise ValueError("Invalid device serial")
    r=subprocess.run([ADB,"-s",serial,*args],capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=timeout)
    if r.returncode:raise RuntimeError("ADB request failed")
    return r.stdout

def current_activity(serial):
    text=run_adb(serial,"shell","dumpsys","activity","activities")
    for line in text.splitlines():
        if "mResumedActivity" in line or "topResumedActivity" in line:
            m=re.search(r"com\.ss\.android\.ugc\.aweme/([A-Za-z0-9_.$]+)",line)
            return m.group(1) if m else None
    return None

def classify_activity(activity):
    s=(activity or "").lower()
    if "login" in s:return "login_ui_observed"
    if any(x in s for x in ("miniapp","minigame","microapp","tma.","ttgame")):return "miniapp_container_observed"
    if "mainactivity" in s:return "douyin_home_observed"
    return "entry_unverified"

def launch_game(serial="emulator-5554"):
    resolved=run_adb(serial,"shell","cmd","package","resolve-activity","--brief","-a","android.intent.action.VIEW","-d",SCHEME)
    if PACKAGE not in resolved:raise RuntimeError("Installed Douyin does not resolve the game entry")
    text=run_adb(serial,"shell","am","start","-W","-a","android.intent.action.VIEW","-d",SCHEME,"-p",PACKAGE,timeout=30)
    if not re.search(r"Status:\s*ok",text):raise RuntimeError("Android did not acknowledge entry launch")
    return {"state":"entry_dispatched","app_id":APP_ID,"login_verified":False,"game_verified":False}

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--serial",default="emulator-5554");parser.add_argument("--launch",action="store_true");parser.add_argument("--watch-seconds",type=int,default=0)
    a=parser.parse_args()
    if not 0<=a.watch_seconds<=120:parser.error("watch-seconds must be 0..120")
    if a.launch:print(json.dumps(launch_game(a.serial)),flush=True)
    deadline=time.monotonic()+a.watch_seconds;previous=None
    while True:
        activity=current_activity(a.serial);state=classify_activity(activity)
        if (activity,state)!=previous:
            print(json.dumps({"state":state,"activity":activity,"login_verified":False,"game_verified":False}),flush=True);previous=(activity,state)
        if time.monotonic()>=deadline:break
        time.sleep(1)
if __name__=="__main__":main()
