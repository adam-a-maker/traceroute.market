/**
 * /api/quotes.js — Vercel serverless function
 * Sources: Stooq CSV (primary) → Yahoo Finance (fallback)
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=12, stale-while-revalidate=60');

  function ctl(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c;
  }

  function marketState(tz) {
    const d = new Date();
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) return 'CLOSED';
    const hm = d.getUTCHours() * 60 + d.getUTCMinutes();
    const W = {
      nyse:     { pre:[540,870],  reg:[870,1260],  post:[1260,1470] },
      euronext: { pre:[420,480],  reg:[480,990],   post:[990,1050]  },
      lse:      { pre:[420,480],  reg:[480,990],   post:[990,1050]  },
      tse:      { pre:[0,30],     reg:[30,390],    post:[390,420]   },
      sse:      { pre:[60,90],    reg:[90,420],    post:[420,450]   },
    };
    const w = W[tz]; if (!w) return 'CLOSED';
    if (hm >= w.reg[0] && hm < w.reg[1]) return 'REGULAR';
    if (hm >= w.pre[0] && hm < w.pre[1]) return 'PRE';
    if (hm >= w.post[0] && hm < w.post[1]) return 'POST';
    return 'CLOSED';
  }

  // Stooq verified symbols (tested against stooq.com)
  const STOOQ = [
    { s: '^spx',     sym: '^GSPC',     name: 'S&P 500',          tz: 'nyse'     },
    { s: '^ndq',     sym: '^IXIC',     name: 'NASDAQ Composite', tz: 'nyse'     },
    { s: '^cac',     sym: '^FCHI',     name: 'CAC 40',           tz: 'euronext' },
    { s: '^ftse',    sym: '^FTSE',     name: 'FTSE 100',         tz: 'lse'      },
    { s: '^nk225',   sym: '^N225',     name: 'Nikkei 225',       tz: 'tse'      },
    { s: '000001.ss',sym: '000001.SS', name: 'SSE Composite',    tz: 'sse'      },
  ];

  async function fromStooq() {
    const syms = STOOQ.map(x => x.s).join(',');
    const url  = `https://stooq.com/q/l/?s=${encodeURIComponent(syms)}&f=sd2t2ohlcv&e=csv`;
    const r = await fetch(url, {
      signal: ctl(8000).signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept':     'text/csv,*/*',
        'Referer':    'https://stooq.com/',
      },
    });
    if (!r.ok) throw new Error(`Stooq ${r.status}`);
    const csv   = await r.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) throw new Error('Stooq: empty');

    const byStooqSym = Object.fromEntries(STOOQ.map(x => [x.s, x]));
    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c.length < 7) continue;
      const key  = c[0].trim().toLowerCase();
      const info = byStooqSym[key];
      if (!info) continue;
      const o = parseFloat(c[3]), h = parseFloat(c[4]),
            l = parseFloat(c[5]), cl= parseFloat(c[6]),
            v = parseFloat(c[7]) || 0;
      if (isNaN(cl) || cl <= 0) continue;
      results.push({
        symbol:                     info.sym,
        shortName:                  info.name,
        regularMarketPrice:         cl,
        regularMarketChangePercent: (!isNaN(o) && o > 0) ? ((cl-o)/o)*100 : 0,
        regularMarketOpen:          isNaN(o)  ? cl : o,
        regularMarketDayHigh:       isNaN(h)  ? cl : h,
        regularMarketDayLow:        isNaN(l)  ? cl : l,
        regularMarketVolume:        v,
        regularMarketPreviousClose: isNaN(o)  ? cl : o,
        marketState:                marketState(info.tz),
        currency: 'USD',
      });
    }
    if (!results.length) throw new Error('Stooq: all N/A');
    return { quoteResponse: { result: results, error: null } };
  }

  async function fromYahoo() {
    const syms = '^GSPC,^IXIC,^FCHI,^FTSE,^N225,000001.SS';
    const flds = 'regularMarketPrice,regularMarketChangePercent,regularMarketOpen,' +
                 'regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,' +
                 'regularMarketPreviousClose,shortName,marketState,currency';
    const H = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com',
      'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-site',
    };
    for (const base of ['query1','query2']) {
      for (const ver of ['v8','v7']) {
        try {
          const qs  = ver==='v8'
            ? `symbols=${encodeURIComponent(syms)}&fields=${encodeURIComponent(flds)}&formatted=false&lang=en-US&region=US`
            : `symbols=${encodeURIComponent(syms)}&fields=${encodeURIComponent(flds)}`;
          const r = await fetch(`https://${base}.finance.yahoo.com/${ver}/finance/quote?${qs}`,
                                { headers: H, signal: ctl(8000).signal });
          if (!r.ok) continue;
          const d = await r.json();
          if (d?.quoteResponse?.result?.length) return d;
        } catch(_) {}
      }
    }
    throw new Error('Yahoo: all endpoints failed');
  }

  try { return res.status(200).json(await fromStooq()); } catch(e1) {
    console.error('[quotes] Stooq:', e1.message);
    try { return res.status(200).json(await fromYahoo()); } catch(e2) {
      console.error('[quotes] Yahoo:', e2.message);
      return res.status(502).json({ error: `${e1.message} | ${e2.message}` });
    }
  }
};