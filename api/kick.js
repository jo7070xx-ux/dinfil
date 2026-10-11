// api/kick.js — يخزّن ويعرض بيانات Kick (يرسلها له GitHub Actions كل 30 دقيقة)
// GET  /api/kick → آخر بيانات محفوظة (عامة)
// POST /api/kick → حفظ بيانات جديدة (header: x-key = ADMIN_PASSWORD)
const { put, list, del } = require('@vercel/blob');
const crypto = require('crypto');

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const latest = async () => {
  const { blobs } = await list({ prefix: 'kick/' });
  return blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
};

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const v = await latest();
      let d = { ok: false, errors: ['لا توجد بيانات بعد — شغّل الـ Workflow من تبويب Actions في GitHub'] };
      if (v.length) d = await (await fetch(v[0].url)).json();
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(d);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const pass = process.env.ADMIN_PASSWORD || '';
    if (!pass || !same(req.headers['x-key'] || '', pass)) return res.status(401).json({ error: 'unauthorized' });
    const d = req.body;
    if (!d || typeof d !== 'object') return res.status(400).json({ error: 'bad body' });
    await put('kick/' + Date.now() + '.json', JSON.stringify(d), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
    const old = (await latest()).slice(3);
    if (old.length) await del(old.map(x => x.url));
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
