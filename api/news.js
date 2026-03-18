/**
 * /api/news.js — Vercel serverless function
 * Aggregates financial news from public RSS feeds.
 * No API key required.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=240');

  function ctl(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c;
  }

  // Keyword → category mapping
  function classify(text) {
    const t = text.toLowerCase();
    if (/war|guerre|attack|attentat|militar|missile|conflit|sanctions|nuclear|bomb/.test(t))
      return { label:'GÉOPOLITIQUE', color:'#f07272', icon:'⚠' };
    if (/bankrupt|faillite|crash|collapse|effondr|default|défaut|crisis|crise|scandal/.test(t))
      return { label:'CRITIQUE',     color:'#f07272', icon:'🔴' };
    if (/inflation|recession|rate hike|taux|hausse|bear|downturn|layoff|licenci/.test(t))
      return { label:'RISQUE',       color:'#f0c830', icon:'🟡' };
    if (/earnings|résultats|merger|fusion|acquisition|ipo|split|dividende|beat/.test(t))
      return { label:'ENTREPRISE',   color:'#ff7a3d', icon:'🏢' };
    if (/rally|surge|surge|bull|growth|croissance|stimulus|accord|deal|record|all.time/.test(t))
      return { label:'POSITIF',      color:'#3dd68c', icon:'🟢' };
    if (/fed|central bank|banque centrale|bce|ecb|fomc|monetary|taux directeur/.test(t))
      return { label:'BANQUE CENT.', color:'#22d4f0', icon:'🏦' };
    return { label:'MARCHÉ',         color:'#8b7fef', icon:'📊' };
  }

  // Parse RSS items from XML string
  function parseRSS(xml, source) {
    const items = [];
    let cursor = 0;
    while (true) {
      const start = xml.indexOf('<item>', cursor);
      if (start === -1) break;
      const end   = xml.indexOf('</item>', start);
      if (end === -1) break;
      const block = xml.slice(start, end + 7);
      cursor = end + 7;

      const grab = (tag) => {
        const open  = block.indexOf(`<${tag}`);
        if (open === -1) return '';
        const close = block.indexOf('>', open);
        const endTag = block.indexOf(`</${tag}>`, close);
        if (endTag === -1) return '';
        return block.slice(close + 1, endTag)
          .replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'')
          .replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
          .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
          .trim();
      };

      const title   = grab('title');
      const link    = grab('link');
      const desc    = grab('description');
      const pubDate = grab('pubDate');

      if (!title || title.length < 5) continue;

      const cat = classify(title + ' ' + desc);
      const ts  = pubDate ? new Date(pubDate).getTime() : Date.now();

      items.push({ title, link, desc: desc.slice(0,200), source, ts, cat });
    }
    return items;
  }

  // Fetch one RSS feed
  async function fetchFeed(url, source) {
    try {
      const r = await fetch(url, {
        signal: ctl(6000).signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
      });
      if (!r.ok) return [];
      const xml = await r.text();
      return parseRSS(xml, source);
    } catch(_) { return []; }
  }

  const FEEDS = [
    { url: 'https://finance.yahoo.com/news/rssindex',                              source: 'Yahoo Finance' },
    { url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',                source: 'CNBC Markets'  },
    { url: 'https://feeds.marketwatch.com/marketwatch/topstories/',               source: 'MarketWatch'   },
    { url: 'https://www.investing.com/rss/news.rss',                              source: 'Investing.com' },
    { url: 'https://feeds.bloomberg.com/markets/news.rss',                        source: 'Bloomberg'     },
  ];

  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f.url, f.source)));
  const allItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // Deduplicate by title similarity, sort by date desc, take 30
  const seen = new Set();
  const unique = allItems
    .filter(item => {
      const key = item.title.slice(0, 60).toLowerCase().replace(/\W/g,'');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 30);

  res.status(200).json({ items: unique, updatedAt: Date.now() });
};
