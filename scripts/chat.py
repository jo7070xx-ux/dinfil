# scripts/chat.py — يعدّ رسائل الشات في قناتك أثناء البث ويرسل أكثر المتفاعلين (مع الأفتار) لموقعك
import json, os, random, sys, time
from curl_cffi import requests

C = os.environ.get("KICK_CHANNEL", "dinfil3")
SITE = os.environ.get("SITE_URL", "").rstrip("/")
KEY = os.environ.get("PUSH_KEY", "")
PROBE = float(os.environ.get("MINUTES") or 0)          # تجربة: شغّل X دقيقة حتى لو ما فيه بث
IGNORE = {x.strip().lower() for x in os.environ.get("IGNORE_USERS", "botrix,kickbot,nightbot").split(",") if x.strip()}
POLL = float(os.environ.get("POLL_SECS") or 8)
MAX = 340 * 60                                          # أقصى مدة للتشغيل الواحد (حد GitHub 6 ساعات)
API = "https://kick.com/api/v2/channels/"

def get(u):
    r = requests.get(u, impersonate="chrome", timeout=30, headers={"Accept": "application/json"})
    if r.status_code != 200:
        raise Exception("%s %s" % (r.status_code, u.replace("https://kick.com", "")))
    return r.json()

def push(payload):
    if not SITE or not KEY:
        print("SITE_URL أو PUSH_KEY غير مضبوط")
        return False
    r = requests.post(SITE + "/api/chat", json=payload, headers={"x-key": KEY}, timeout=60)
    if r.status_code != 200:
        print("POST failed", r.status_code, r.text[:200])
    return r.status_code == 200

def load_users():
    try:
        r = requests.get(SITE + "/api/chat?full=1", headers={"x-key": KEY}, timeout=30)
        return ((r.json().get("state") or {}).get("u") or {}) if r.status_code == 200 else {}
    except Exception:
        return {}

def avatar(slug):
    for u in (API + slug, "https://kick.com/api/v1/users/" + slug):
        try:
            j = get(u)
            pic = (j.get("user") or {}).get("profile_pic") or j.get("profile_pic") or j.get("profilepic")
            if pic:
                return pic
        except Exception:
            pass
    return ""

def messages(cid):
    j = get(API + "%s/messages" % cid)
    d = j.get("data", j) if isinstance(j, dict) else j
    a = d.get("messages") if isinstance(d, dict) else d
    return j, [m for m in (a or []) if isinstance(m, dict)]

info = get(API + C)
cid = info.get("id")
live = bool(info.get("livestream"))
users = load_users()
dbg = {"channel_id": cid, "live": live, "probe": PROBE}
if not (live or PROBE):
    print("القناة ليست في بث — لا شيء للعدّ")
    sys.exit(0)

def top():
    best = sorted(users.items(), key=lambda kv: -kv[1]["c"])[:10]
    for slug, u in best:
        if u.get("a") is None:
            u["a"] = avatar(slug)
    return [{"n": u["n"], "c": u["c"], "a": u.get("a") or ""} for _, u in best]

def save(error=None):
    keep = dict(sorted(users.items(), key=lambda kv: -kv[1]["c"])[:500])
    return push({"state": {"u": keep}, "top": top(), "at": int(time.time() * 1000), "debug": dbg, "error": error})

seen, first, fails, added = set(), True, 0, 0
t0 = last_save = last_live = time.time()
off_since = None
while True:
    try:
        j, ms = messages(cid)
        if first:
            dbg["shape"] = {"keys": list(j.keys())[:8] if isinstance(j, dict) else "list", "count": len(ms),
                            "sample": sorted(ms[0].keys())[:12] if ms else []}
            print("أول طلب نجح:", json.dumps(dbg["shape"], ensure_ascii=False))
        fails = 0
        for m in ms:
            mid = m.get("id")
            if mid in seen:
                continue
            seen.add(mid)
            if first:
                continue                                  # رسائل قديمة قبل بدء العدّ
            s = m.get("sender") or {}
            slug = str(s.get("slug") or s.get("username") or "").lower()
            if not slug or slug in IGNORE:
                continue
            u = users.setdefault(slug, {"n": s.get("username") or slug, "c": 0, "a": None})
            u["c"] += 1
            added += 1
        first = False
    except Exception as e:
        fails += 1
        dbg["last_error"] = str(e)
        print("خطأ:", e)
        if first and fails >= 3:
            push({"debug": dbg, "error": "تعذّر قراءة الشات: %s" % e})
            sys.exit(1)
    now = time.time()
    if now - last_save > 120:
        save()
        last_save = now
    if now - last_live > 300:
        last_live = now
        try:
            if get(API + C).get("livestream"):
                off_since = None
            else:
                off_since = off_since or now
        except Exception:
            pass
    if PROBE:
        if now - t0 > PROBE * 60:
            break
    elif now - t0 > MAX or (off_since and now - off_since > 600):
        break
    time.sleep(POLL + random.random() * 2)

dbg["added"] = added
ok = save()
print("انتهى. رسائل مُضافة:", added, "| الحفظ:", "نجح" if ok else "فشل")
sys.exit(0 if ok else 1)
