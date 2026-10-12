// api/chat.js — يخزّن ويعرض ترتيب أكثر المتفاعلين في الشات (يرسله scripts/chat.py)
// GET  /api/chat           → الترتيب العام (أفضل 10 مع الأفتار)
// GET  /api/chat?full=1    → كل العدّادات (يحتاج header: x-key)
// POST /api/chat           → حفظ/دمج بيانات جديدة (يحتاج header: x-key)
const { put, list, del } = require('@vercel/blob');
const crypto = require('crypto');

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const latest = async () => {
  const { blobs } = await list({ prefix: 'chat/' });
  return blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
};

module.exports = async (req, res) => {
  try {
    const pass = process.env.ADMIN_PASSWORD || '';
    const authed = !!pass && same(req.headers['x-key'] || '', pass);
    const v = await latest();
    const cur = v.length ? await (await fetch(v[0].url)).json() : {};

    if (req.method === 'GET') {
      if (req.query.full && authed) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(cur);
      }
      const { state, ...pub } = cur;
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(Object.keys(pub).length ? pub : { top: [], error: 'لا توجد بيانات بعد' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    if (!authed) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad body' });

    const next = { ...cur, ...b };
    for (const k of Object.keys(next)) if (next[k] === null) delete next[k];
    await put('chat/' + Date.now() + '.json', JSON.stringify(next), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
    const old = (await latest()).slice(3);
    if (old.length) await del(old.map(x => x.url));
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
