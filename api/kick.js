// api/kick.js — دالة Vercel تجلب بيانات Kick (Gifters + المقاطع + الأرشيف + المتابعين + حالة البث)
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://kick.com/'
};
const get = async u => {
  const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(r.status);
  return r.json();
};
const dur = v => { v = +v; if (!v) return ''; const m = Math.round(v / 6e4); return Math.floor(m / 60) + 'س ' + (m % 60) + 'د'; };

module.exports = async (req, res) => {
  const c = String(req.query.c || process.env.KICK_CHANNEL || 'dinfil3').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const base = 'https://kick.com/api/v2/channels/' + c;
  const out = { ok: false, channel: c, live: false, viewers: '', followers: '', gifters: {}, clips: [], archives: [], errors: [] };
  const T = (n, f) => f().catch(e => { out.errors.push(n + ': ' + e.message); });

  await Promise.all([
    T('channel', async () => {
      const j = await get(base);
      out.followers = j.followers_count || j.followersCount || '';
      const l = j.livestream;
      if (l && l.is_live !== false) { out.live = true; out.viewers = String(l.viewer_count ?? l.viewers ?? ''); }
    }),
    T('gifters', async () => {
      const j = await get(base + '/leaderboards');
      const m = a => (a || []).slice(0, 10).map(x => ({ n: x.username, v: String(x.quantity) }));
      out.gifters = { w: m(j.gifts_week), m: m(j.gifts_month), a: m(j.gifts) };
    }),
    T('clips', async () => {
      const j = await get(base + '/clips?sort=view&time=all');
      const a = j.clips || j.data || (Array.isArray(j) ? j : []);
      out.clips = a.slice(0, 12).map(x => ({
        t: x.title || 'مقطع',
        u: x.clip_url || ('https://kick.com/' + c + '/clips/' + x.id),
        v: String(x.view_count ?? x.views ?? 0)
      }));
    }),
    T('videos', async () => {
      const j = await get(base + '/videos');
      const a = Array.isArray(j) ? j : (j.data || j.videos || []);
      out.archives = a.slice(0, 12).map(x => {
        const ls = x.livestream || {};
        const id = (x.video && (x.video.uuid || x.video.uid)) || x.uuid || x.id;
        return {
          t: ls.session_title || x.session_title || x.title || 'بث',
          u: 'https://kick.com/' + c + '/videos/' + id,
          d: dur(ls.duration ?? x.duration),
          v: String(x.views ?? ls.views ?? 0)
        };
      });
    })
  ]);

  out.ok = !!(out.followers || out.clips.length || out.archives.length || (out.gifters.w && out.gifters.w.length));
  res.setHeader('Cache-Control', out.ok ? 's-maxage=300, stale-while-revalidate=900' : 's-maxage=30');
  res.status(200).json(out);
};
