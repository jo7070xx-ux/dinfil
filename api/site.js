// api/site.js — يحفظ تعديلات لوحة التحكم ويعرضها لكل الزوار (Vercel Blob)
// GET  /api/site  → آخر نسخة محفوظة (عامة)
// POST /api/site  → حفظ نسخة جديدة (يحتاج ADMIN_PASSWORD)
const { put, list, del } = require('@vercel/blob');
const crypto = require('crypto');

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const versions = async () => {
  const { blobs } = await list({ prefix: 'site/' });
  return blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1)); // الأحدث أولاً
};
// الصور (data:image) تتحول إلى ملفات في Blob ويُحفظ رابطها فقط
const upImg = async v => {
  const m = v.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s);
  if (!m) return v;
  const buf = Buffer.from(m[2], 'base64');
  const name = 'img/' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '.' + m[1].split('/')[1].replace('jpeg', 'jpg');
  const r = await put(name, buf, { access: 'public', contentType: m[1], addRandomSuffix: false, allowOverwrite: true });
  return r.url;
};
const walk = async o => {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') o[k] = await upImg(v);
    else if (v && typeof v === 'object') await walk(v);
  }
};

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const v = await versions();
      let data = {};
      if (v.length) data = await (await fetch(v[0].url)).json();
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=60');
      return res.status(200).json(data);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

    const pass = process.env.ADMIN_PASSWORD || '';
    const b = req.body || {};
    if (!pass) return res.status(500).json({ error: 'ADMIN_PASSWORD غير مضبوط في Vercel' });
    if (!same(b.pw || '', pass)) return res.status(401).json({ error: 'كلمة السر غلط' });
    if (b.check) return res.status(200).json({ ok: true });
    if (!b.data || typeof b.data !== 'object') return res.status(400).json({ error: 'بيانات غير صالحة' });

    const data = b.data;
    await walk(data);
    await put('site/' + Date.now() + '.json', JSON.stringify(data), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
    const old = (await versions()).slice(3); // نحتفظ بآخر 3 نسخ فقط
    if (old.length) await del(old.map(x => x.url));
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
