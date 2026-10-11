# scripts/kick.py — يجلب بيانات Kick بتقنية تشبه متصفح Chrome (curl_cffi) ويرسلها لموقعك
import json, os, re, sys, urllib.parse
from curl_cffi import requests

C = os.environ.get("KICK_CHANNEL", "dinfil3")
SITE = os.environ.get("SITE_URL", "").rstrip("/")
KEY = os.environ.get("PUSH_KEY", "")
TOKEN = os.environ.get("SCRAPEDO_TOKEN", "")   # اختياري: خدمة خارجية لو Kick حجب GitHub
B = "https://kick.com/api/v2/channels/" + C

def get(path):
    u = B + path
    if TOKEN:
        r = requests.get("http://api.scrape.do/?token=%s&url=%s" % (TOKEN, urllib.parse.quote(u, safe="")), timeout=90)
    else:
        r = requests.get(u, impersonate="chrome", timeout=30, headers={"Accept": "application/json"})
    if r.status_code != 200:
        raise Exception(str(r.status_code))
    return r.json()

def dur(v):
    try:
        m = round(float(v) / 60000)
    except Exception:
        return ""
    return "%dس %dد" % (m // 60, m % 60) if m else ""

out = {"ok": False, "channel": C, "live": False, "viewers": "", "followers": "",
       "gifters": {}, "clips": [], "archives": [], "errors": [], "debug": {}}

def step(name, fn):
    try:
        fn()
    except Exception as e:
        out["errors"].append("%s: %s" % (name, e))

def channel():
    j = get("")
    out["followers"] = j.get("followers_count") or j.get("followersCount") or ""
    l = j.get("livestream")
    if l and l.get("is_live", True):
        out["live"] = True
        out["viewers"] = str(l.get("viewer_count", l.get("viewers", "")))

def gifters():
    j = get("/leaderboards")
    out["debug"]["leaderboards"] = {k: (len(v) if isinstance(v, list) else str(type(v).__name__)) for k, v in j.items()} if isinstance(j, dict) else str(type(j).__name__)
    def amt(x):
        for k in ("quantity", "gifted_amount", "total", "amount", "kicks", "value"):
            if x.get(k) is not None:
                return str(x[k])
        return ""
    g = {"w": [], "m": [], "a": []}
    for k, v in (j.items() if isinstance(j, dict) else []):
        if isinstance(v, list) and v and isinstance(v[0], dict) and v[0].get("username"):
            slot = "w" if "week" in k else "m" if "month" in k else "a"
            if not g[slot]:
                g[slot] = [{"n": x.get("username"), "v": amt(x)} for x in v[:10]]
    out["gifters"] = g

def clips():
    j = get("/clips?sort=view&time=all")
    a = j.get("clips") or j.get("data") or (j if isinstance(j, list) else [])
    def cid(x):
        m = re.search(r"(clip_[0-9A-Za-z]+)", str(x.get("clip_url") or ""))
        return x.get("id") or (m.group(1) if m else "")
    out["clips"] = [{"t": x.get("title") or "مقطع",
                     "u": "https://kick.com/%s/clips/%s" % (C, cid(x)),
                     "v": str(x.get("view_count", x.get("views", 0)))} for x in a[:12]]

def videos():
    try:
        j = get("/videos")
    except Exception:
        j = get("/videos/latest")
    out["debug"]["videos"] = ("list:%d" % len(j)) if isinstance(j, list) else (list(j.keys()) if isinstance(j, dict) else str(type(j).__name__))
    a = j if isinstance(j, list) else (j.get("data") or j.get("videos") or [])
    for x in a[:12]:
        ls = x.get("livestream") or {}
        v = x.get("video") or {}
        vid = v.get("uuid") or v.get("uid") or x.get("uuid") or x.get("id")
        out["archives"].append({"t": ls.get("session_title") or x.get("session_title") or x.get("title") or "بث",
                                "u": "https://kick.com/%s/videos/%s" % (C, vid),
                                "d": dur(ls.get("duration", x.get("duration"))),
                                "v": str(x.get("views", ls.get("views", 0)))})

for n, f in (("channel", channel), ("gifters", gifters), ("clips", clips), ("videos", videos)):
    step(n, f)

out["ok"] = bool(out["followers"] or out["clips"] or out["archives"] or out["gifters"].get("w") or out["gifters"].get("a"))
out["at"] = int(__import__("time").time() * 1000)
print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in out.items() if k != "gifters"}, ensure_ascii=False))

if not out["ok"]:
    print("لا توجد بيانات — الأخطاء:", out["errors"])
    sys.exit(1)
if not SITE or not KEY:
    print("SITE_URL أو PUSH_KEY غير مضبوط في GitHub Secrets")
    sys.exit(1)
r = requests.post(SITE + "/api/kick", json=out, headers={"x-key": KEY}, timeout=60)
print("POST", r.status_code, r.text[:200])
sys.exit(0 if r.status_code == 200 else 1)
