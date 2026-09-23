const https = require('https');
function get(u) { return new Promise((res, rej) => { https.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', e => rej(e)); }); }
(async () => {
  const home = await get('https://gift-ora.online/');
  const tests = ['review', 'testimonial', 'rating', 'Google Rating', 'Instagram', 'followers', 'orders delivered', 'satisfied', 'trustpilot', 'whatsapp', 'call us', 'since 20'];
  console.log('=== homepage trust/social signals ===');
  for (const t of tests) { const c = (home.match(new RegExp(t, 'gi')) || []).length; if (c > 0) console.log(' ', t, ':', c); }

  const sm = await get('https://gift-ora.online/sitemap.xml');
  const blogs = [...sm.matchAll(/<loc>(https:\/\/gift-ora\.online\/blog\/[^<]+)<\/loc>/g)].map(m => m[1]);
  console.log('---\nblog posts in sitemap:', blogs.length);
  if (blogs.length) {
    const b = await get(blogs[0]);
    const d = b.match(/datePublished"\s*:\s*"([^"]+)/);
    const mod = b.match(/dateModified"\s*:\s*"([^"]+)/);
    console.log('first blog:', blogs[0].replace('https://gift-ora.online/', ''), '| published:', d && d[1], '| modified:', mod && mod[1]);
  }

  console.log('---\nproduct page has aggregate review schema?');
  const p = await get('https://gift-ora.online/products/classic-oreo-crunch-celebration-cake.html');
  console.log(' review/ratingCount/rating present:', /ratingValue|ratingCount|reviews/i.test(p));

  console.log('---\nGoogle Business Profile / LocalBusiness schema:');
  const gbp = /LocalBusiness|Store|Organization|OpeningHours|geo"/i.exec(home);
  console.log(' homepage has LocalBusiness/geo schema:', !!gbp);
  console.log('DONE');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });