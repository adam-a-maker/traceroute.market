/**
 * /api/quotes.js  —  Vercel serverless function
 *
 * Fetch strategy (tried in order):
 *   1. Stooq.com  (free CSV, no auth, fastest)
 *   2. Yahoo Finance v8/v7  (query1 + query2, with browser headers)
 *
 * Edge-cache: 12s fresh, 24s stale-while-revalidate.
 * Weekend / closed-market fallback: returns last valid Stooq row
 * with marketState=CLOSED when price=N/A.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=12, stale-while-revalidate=60');

  // ── Stooq symbol ➜ { Yahoo symbol, display name, timezone key }
  const STOOQ_MAP = {
    '^spx':      { sym: '^GSPC',     name: 'S&P 500',          tz: 'nyse'     },
    '^ixic':     { sym: '^IXIC',     name: 'NASDAQ Composite', tz: 'nyse'     },
    '^cac':      { sym: '^FCHI',     name: 'CAC 40',           tz: 'euronext' },
    '^ftx':      { sym: '^FTSE',     name: 'FTSE 100',         tz: 'lse'      },
    '^nkx':      { sym: '^N225',     name: 'Nikkei 225',       tz: 'tse'      },
    '000001.ss': { sym: '000001.SS', name: 'SSE Composite',    tz: 'sse'      },
  };

  // Approximate market open windows in UTC minutes-from-midnight
  function marketState(tz) {
    const d   = new Date();
    const dow = d.getUTCDay();         // 0 = Sun, 6 = Sat
    const hm  = d.getUTCHours() * 60 + d.getUTCMinutes();

    if (dow === 0 || dow === 6) return 'CLOSED';

    const W = {
      nyse:     [[9*60,14*60+30],[14*60+30,21*60],[21*60,24*60+30]],
      euronext: [[7*60,8*60],   [8*60,16*60+30], [16*60+30,17*60+30]],
      lse:      [[7*60,8*60],   [8*60,16*60+30], [16*60+30,17*60+30]],
      tse:      [[0,30],         [0,6*60+30],     [6*60+30,7*60]],
      sse:      [[60,90],        [90,7*60],        [7*60,7*60+30]],
    };
    const w = W[tz];
    if (!w) return 'CLOSED';
    if (hm >= w[0][0] && hm < w[0][1]) return 'PRE';
    if (hm >= w[1][0] && hm < w[1][1]) return 'REGULAR';
    if (hm >= w[2][0] && hm < w[2][1]) return 'POST';
    return 'CLOSED';
  }

  function makeCtrl(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c;
  }

  // ── SOURCE 1: Stooq CSV ──────────────────────────────────────
  async function fromStooq() {
    const s   = Object.keys(STOOQ_MAP).join(',');
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcv&e=csv`;

    const r = await fetch(url, {
      signal: makeCtrl(8000).signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':     'text/csv,text/plain,*/*',
        'Referer':    'https://stooq.com/',
      },
    });

    if (!r.ok) throw new Error(`Stooq HTTP ${r.status}`);

    const csv   = await r.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) throw new Error('Stooq: empty body');

    // Columns: Symbol,Date,Time,Open,High,Low,Close,Volume
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c.length < 7) continue;

      const key  = c[0].trim().toLowerCase();
      const info = STOOQ_MAP[key];
      if (!info) continue;

      const o   = parseFloat(c[3]);
      const hi  = parseFloat(c[4]);
      const lo  = parseFloat(c[5]);
      const cl  = parseFloat(c[6]);
      const vol = parseFloat(c[7]) || 0;

      // N/A rows from Stooq when market is closed — still return with CLOSED state
      if (isNaN(cl) || cl <= 0) {
        // We can't give a price — skip for now; Yahoo fallback may have stale data
        continue;
      }

      results.push({
        symbol:                      info.sym,
        shortName:                   info.name,
        regularMarketPrice:          cl,
        regularMarketChangePercent:  (!isNaN(o) && o > 0) ? ((cl - o) / o) * 100 : 0,
        regularMarketOpen:           isNaN(o)  ? cl : o,
        regularMarketDayHigh:        isNaN(hi) ? cl : hi,
        regularMarketDayLow:         isNaN(lo) ? cl : lo,
        regularMarketVolume:         vol,
        regularMarketPreviousClose:  isNaN(o)  ? cl : o,
        marketState:                 marketState(info.tz),
        currency:                    'USD',
      });
    }

    if (results.length === 0) throw new Error('Stooq: all rows N/A');
    return { quoteResponse: { result: results, error: null } };
  }

  // ── SOURCE 2: Yahoo Finance v7 / v8 ─────────────────────────
  async function fromYahoo() {
    const syms = '^GSPC,^IXIC,^FCHI,^FTSE,^N225,000001.SS';
    const flds = [
      'regularMarketPrice','regularMarketChangePercent','regularMarketOpen',
      'regularMarketDayHigh','regularMarketDayLow','regularMarketVolume',
      'regularMarketPreviousClose','shortName','marketState','currency',
    ].join(',');

    const H = {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'application/json,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://finance.yahoo.com/',
      'Origin':          'https://finance.yahoo.com',
      'sec-fetch-dest':  'empty',
      'sec-fetch-mode':  'cors',
      'sec-fetch-site':  'same-site',
    };

    const BASES   = ['query1', 'query2'];
    const VERSIONS= ['v8', 'v7'];
    const errors  = [];

    for (const base of BASES) {
      for (const ver of VERSIONS) {
        try {
          const qs  = ver === 'v8'
            ? `symbols=${encodeURIComponent(syms)}&fields=${encodeURIComponent(flds)}&formatted=false&lang=en-US&region=US`
            : `symbols=${encodeURIComponent(syms)}&fields=${encodeURIComponent(flds)}`;
          const url = `https://${base}.finance.yahoo.com/${ver}/finance/quote?${qs}`;

          const r = await fetch(url, { headers: H, signal: makeCtrl(8000).signal });
          if (!r.ok) { errors.push(`${base}/${ver}: HTTP ${r.status}`); continue; }

          const d = await r.json();
          const q = d?.quoteResponse?.result || [];
          if (q.length > 0) return d;
          errors.push(`${base}/${ver}: empty result`);
        } catch (e) {
          errors.push(`${base}/${ver}: ${e.message}`);
        }
      }
    }

    throw new Error(`Yahoo all failed — ${errors.join(' | ')}`);
  }

  // ── Try sources in order ─────────────────────────────────────
  const errs = [];

  try {
    const data = await fromStooq();
    return res.status(200).json(data);
  } catch (e) {
    errs.push(`Stooq: ${e.message}`);
    console.error('[quotes] Stooq failed:', e.message);
  }

  try {
    const data = await fromYahoo();
    return res.status(200).json(data);
  } catch (e) {
    errs.push(`Yahoo: ${e.message}`);
    console.error('[quotes] Yahoo failed:', e.message);
  }

  // Both sources failed
  return res.status(502).json({ error: errs.join(' || ') });
};