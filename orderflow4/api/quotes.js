export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=14, stale-while-revalidate=28');
  try {
    const syms = encodeURIComponent('^GSPC,^IXIC,^FCHI,^FTSE,^N225,000001.SS');
    const flds = 'regularMarketPrice,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,shortName,marketState,currency';
    const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=${flds}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
    });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
