// path: src/App.jsx
// Trueprice.cash — Markets + EV/PE/PS weighted fair value + on-device AI (WebLLM)
// Clean build: no email/API code. "Contact us" → X profile. Ask AI shows only the final FV.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { CreateMLCEngine } from '@mlc-ai/web-llm';

/* ========================== UI ========================== */
const Section = ({ title, children }) => (
  <section className="rounded-2xl border bg-white p-4 mb-4">
    {title && <div className="text-base font-semibold mb-2">{title}</div>}
    {children}
  </section>
);

const Button = ({ children, onClick, variant = 'primary', disabled, as = 'button', href, target, rel }) => {
  const base = 'px-3 py-1.5 rounded-xl text-sm font-medium border transition';
  const styles = {
    primary: 'bg-black text-white border-black hover:opacity-90',
    ghost: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
    danger: 'bg-white text-red-600 border-red-500 hover:bg-red-50',
  };
  if (as === 'a') {
    return (
      <a href={href} target={target} rel={rel} className={`${base} ${styles[variant]}`}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {children}
    </button>
  );
};

/* ========================== Cache ========================== */
const cacheRead = (k, f) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : f; } catch { return f; } };
const cacheWrite = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const PRICE_CACHE_KEY = (mkt) => `mkt_price_cache_v1_${mkt}`; // 10 min
const METRICS_CACHE_KEY = 'metrics_cache_v1'; // 30 min

/* ========================== Utils + valuation ========================== */
const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
function dcfFairPrice(currentPrice, eps, g, m, r, years = 5) {
  const cf0 = eps * m; let npv = 0;
  for (let t = 1; t <= years; t++) { const cft = cf0 * Math.pow(1 + g, t); npv += cft / Math.pow(1 + r, t); }
  const tcf = cf0 * Math.pow(1 + g, years + 1); const tv = tcf / (r - g);
  const tvPV = tv / Math.pow(1 + r, years); const total = npv + tvPV;
  const fair = Math.max(1, currentPrice * (total / (eps || 1)) * 0.2);
  return parseFloat(fair.toFixed(2));
}
const multiplesFairPrice = (eps, pe) => parseFloat(Math.max(1, eps * pe).toFixed(2));

/* ========================== Markets + TwelveData ========================== */
const MARKET = { SA: 'SA', US: 'US' };
const MARKET_JSON = { SA: '/data/tasi_grouped_by_industry.json', US: '/data/sp500_grouped_by_industry.json' };
const MARKET_SUFFIX = { SA: ':TADAWUL', US: '' };
const MARKET_CCY = { SA: 'SAR', US: 'USD' };
const TWELVE_API_KEY = import.meta.env.VITE_TWELVE_API_KEY || '';
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

async function fetchTwelvePrices(symbols) {
  if (!symbols.length || !TWELVE_API_KEY) return {};
  const result = {};
  for (const c of chunk(symbols, 80)) {
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(c.join(','))}&apikey=${TWELVE_API_KEY}`;
    try {
      const r = await fetch(url); const j = await r.json();
      if (Array.isArray(j)) {
        for (const it of j) { const p = typeof it.price === 'string' ? parseFloat(it.price) : Number(it.price); if (it.symbol && Number.isFinite(p)) result[it.symbol] = p; }
      } else if (j && typeof j === 'object') {
        for (const [sym, obj] of Object.entries(j)) { const p = typeof obj?.price === 'string' ? parseFloat(obj.price) : Number(obj?.price); if (sym && Number.isFinite(p)) result[sym] = p; }
      }
    } catch { /* ignore chunk error */ }
  }
  return result;
}

function useMarketData(market) {
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let stop = false;
    (async () => {
      setLoading(true); setError('');
      try {
        const path = MARKET_JSON[market]; const res = await fetch(`${path}?ts=${Date.now()}`);
        if (!res.ok) throw new Error(`JSON not found at ${path} (HTTP ${res.status})`);
        const raw = await res.json(); const suffix = MARKET_SUFFIX[market];
        const symbols = Object.values(raw).flatMap((list) => list.map((c) => `${String(c.Ticker)}${suffix}`));
        let prices = {};
        try {
          const cached = cacheRead(PRICE_CACHE_KEY(market), { at: 0, prices: {} });
          const ageMin = (Date.now() - cached.at) / 60000;
          if (ageMin < 10 && Object.keys(cached.prices).length) prices = cached.prices;
          else { prices = await fetchTwelvePrices(symbols); cacheWrite(PRICE_CACHE_KEY(market), { at: Date.now(), prices }); }
        } catch { prices = {}; }
        const out = {};
        for (const [industry, companies] of Object.entries(raw)) {
          const list = [];
          for (const company of companies) {
            const sym = `${String(company.Ticker)}${suffix}`; const price = prices[sym];
            list.push({ ticker: String(company.Ticker), companyName: String(company.Company).trim(), price: Number.isFinite(price) ? price : null });
          }
          if (list.length) out[industry] = list;
        }
        if (!stop) setGrouped(out);
      } catch (e) { if (!stop) setError(e?.message || 'Failed to load market'); }
      finally { if (!stop) setLoading(false); }
    })();
    return () => { stop = true; };
  }, [market]);
  return { grouped, loading, error, currency: MARKET_CCY[market] };
}

/* ========================== Valuation metrics (EV/PE/PS) + cache ========================== */
const pctColor = (pct) => (pct >= 25 ? 'text-green-600' : pct >= 0 ? 'text-blue-600' : 'text-red-600');
const bandColor = (v, low, high) => (v < low ? 'text-red-600' : v < high ? 'text-amber-600' : 'text-green-600');

async function fetchValuationMetrics(symbolWithSuffix, currency) {
  if (!TWELVE_API_KEY) {
    return { price: 0, fairEV: 0, fairPE: 0, fairPS: 0, weighted: 0, bookValue: 0, grossMargin: 0, netMargin: 0, opMargin: 0, currency };
  }
  const base = 'https://api.twelvedata.com'; const key = TWELVE_API_KEY; const enc = (s) => encodeURIComponent(s);
  const [priceResp, statsResp, bsResp, isResp] = await Promise.all([
    fetch(`${base}/price?symbol=${enc(symbolWithSuffix)}&apikey=${key}`),
    fetch(`${base}/statistics?symbol=${enc(symbolWithSuffix)}&apikey=${key}`),
    fetch(`${base}/balance_sheet?symbol=${enc(symbolWithSuffix)}&apikey=${key}`),
    fetch(`${base}/income_statement?symbol=${enc(symbolWithSuffix)}&apikey=${key}`),
  ]);
  const priceJson = await priceResp.json(); const statsJson = await statsResp.json(); const bsJson = await bsResp.json(); const isJson = await isResp.json();
  const asNum = (x) => { if (x == null) return 0; if (typeof x === 'number') return x; if (typeof x === 'string') { const n = parseFloat(x.replace(/,/g, '')); return isFinite(n) ? n : 0; } return 0; };
  const price = asNum(priceJson?.price);
  const stats = statsJson?.statistics || {};
  const bs0 = Array.isArray(bsJson?.balance_sheet) ? bsJson.balance_sheet[0] : {};
  const is0 = Array.isArray(isJson?.income_statement) ? isJson.income_statement[0] : {};
  const enterpriseValue = asNum(stats?.valuations_metrics?.enterprise_value);
  const sharesOutstanding = asNum(stats?.stock_statistics?.shares_outstanding);
  const cash = asNum(bs0?.assets?.current_assets?.cash);
  const longTermDebt = asNum(bs0?.liabilities?.non_current_liabilities?.long_term_debt);
  const forwardPE = asNum(stats?.valuations_metrics?.forward_pe);
  const netIncome = asNum(is0?.net_income);
  const priceToSales = asNum(stats?.valuations_metrics?.price_to_sales_ttm);
  const sales = asNum(is0?.sales);
  let fairEV = 0, fairPE = 0, fairPS = 0;
  if (sharesOutstanding > 0) {
    fairEV = (enterpriseValue - longTermDebt + cash) / sharesOutstanding;
    fairPE = (forwardPE * netIncome) / sharesOutstanding;
    fairPS = (priceToSales * sales) / sharesOutstanding;
  }
  const weighted = fairEV * 0.5 + fairPE * 0.25 + fairPS * 0.25;
  const bookValue = asNum(stats?.financials?.balance_sheet?.book_value_per_share_mrq);
  const grossMargin = asNum(stats?.financials?.gross_margin) * 100;
  const netMargin = asNum(stats?.financials?.profit_margin) * 100;
  const opMargin = asNum(stats?.financials?.operating_margin) * 100;
  return { price, fairEV, fairPE, fairPS, weighted, bookValue, grossMargin, netMargin, opMargin, currency };
}
const metricsCacheGet = () => cacheRead(METRICS_CACHE_KEY, {});
const metricsCachePut = (k, data) => { const all = metricsCacheGet(); all[k] = { at: Date.now(), data }; cacheWrite(METRICS_CACHE_KEY, all); };
async function getValuationMetricsCached(symbolWithSuffix, currency) {
  const hit = metricsCacheGet()[symbolWithSuffix]; const fresh = hit && (Date.now() - hit.at) < 30 * 60 * 1000;
  if (fresh) return hit.data; const data = await fetchValuationMetrics(symbolWithSuffix, currency); metricsCachePut(symbolWithSuffix, data); return data;
}

/* ========================== i18n ========================== */
function useLang() {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  useEffect(() => { localStorage.setItem('lang', lang); }, [lang]);
  const T = (ar, en) => (lang === 'ar' ? ar : en);
  return { lang, setLang, T };
}

/* ========================== On-device AI (WebLLM) ========================== */
const MODEL_ID = 'Phi-3-mini-4k-instruct-q4f16_1-MLC';
let __engine = null;
async function getEngine() {
  if (__engine) return __engine;
  const eng = await CreateMLCEngine(MODEL_ID);
  __engine = eng; return eng;
}
function extractJSON(text) {
  if (!text) return null; const fence = /```(?:json)?\n([\s\S]*?)```/i.exec(text); const raw = fence ? fence[1] : text;
  try { return JSON.parse(raw); } catch {}
  const i = raw.lastIndexOf('{'); const j = raw.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(raw.slice(i, j + 1)); } catch {} }
  return null;
}

// Arabic currency names for display
function ccyName(ccy, lang) {
  if (lang === 'ar') {
    if (ccy === 'SAR') return 'ريال سعودي';
    if (ccy === 'USD') return 'دولار أمريكي';
  }
  return ccy;
}

// Ensures the percent sign stays glued to the number in RTL (Arabic) & LTR
const AR_PERCENT = '٪'; // Arabic percent sign
function Pct({ n, lang }) {
  const num = Number.isFinite(n) ? n : 0;
  const symbol = lang === 'ar' ? AR_PERCENT : '%';
  return <bdi>{num.toFixed(2)}{symbol}</bdi>; // bdi avoids bidi flipping
}

// X share link — now includes a concise, localized FV breakdown in the tweet text
function buildXShare({ ticker, company, lang, url, m, aiFV }) {
  const num = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
  const cc = m?.currency || '';
  const diff = (m && Number.isFinite(aiFV) && Number.isFinite(m.weighted) && m.weighted !== 0)
    ? ((aiFV - m.weighted) / m.weighted) * 100
    : null;

  const lines = lang === 'ar'
    ? [
        `📊 ${(company || ticker)} (${ticker})`,
        `السعر: ${num(m?.price)} ${cc}`,
        `العادلة (موزونة): ${num(m?.weighted)} ${cc}`,
        `EV: ${num(m?.fairEV)} • PE: ${num(m?.fairPE)} • PS: ${num(m?.fairPS)}`,
        (diff != null ? `الذكاء الاصطناعي: ${num(aiFV)} ${cc} (${diff.toFixed(2)}${AR_PERCENT} مقابل التطبيق)` : null),
        url,
      ]
    : [
        `📊 ${(company || ticker)} (${ticker})`,
        `Price: ${num(m?.price)} ${cc}`,
        `Fair (Weighted): ${num(m?.weighted)} ${cc}`,
        `EV: ${num(m?.fairEV)} • PE: ${num(m?.fairPE)} • PS: ${num(m?.fairPS)}`,
        (diff != null ? `AI: ${num(aiFV)} ${cc} (${diff.toFixed(2)}% vs app)` : null),
        url,
      ];

  const text = lines.filter(Boolean).join('');
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/* ======== AI cache utils (per-symbol & inputs signature, 24h TTL) ======== */
const AI_TTL_MS = 24 * 60 * 60 * 1000;
const round2 = (n) => Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
const aiInputsSig = (m) => `${round2(m.fairEV)}|${round2(m.fairPE)}|${round2(m.fairPS)}|${round2(m.bookValue)}|${round2(m.price)}`;
const AI_CACHE_KEY = (symbolWithSuffix, sig) => `ai_fv_cache_v1_${MODEL_ID}_${symbolWithSuffix}_${sig}`;

/* ========================== Components ========================== */
function MarketToggle({ value, onChange }) {
  return (
    <div className="flex gap-2 mb-3">
      {[
        { id: MARKET.SA, label: '🇸🇦 Saudi (TASI)' },
        { id: MARKET.US, label: '🇺🇸 U.S. (S&P 500)' },
      ].map((opt) => (
        <button key={opt.id} onClick={() => onChange(opt.id)} className={`px-3 py-1.5 rounded-xl border text-sm ${value === opt.id ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50'}`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MarketBrowser({ onOpen }) {
  const [market, setMarket] = useState(() => localStorage.getItem('mkt') || MARKET.SA);
  useEffect(() => { localStorage.setItem('mkt', market); }, [market]);
  const { grouped, loading, error, currency } = useMarketData(market);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q.trim()) return grouped; const query = q.toLowerCase(); const out = {};
    for (const [industry, list] of Object.entries(grouped)) {
      const lf = list.filter((s) => s.ticker.toLowerCase().includes(query) || s.companyName.toLowerCase().includes(query));
      if (lf.length) out[industry] = lf;
    }
    return out;
  }, [grouped, q]);
  const title = market === MARKET.SA ? '🇸🇦 Saudi Stocks (TASI)' : '🇺🇸 U.S. Stocks (S&P 500)';
  return (
    <Section title={title}>
      <MarketToggle value={market} onChange={setMarket} />
      <div className="mb-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${market === MARKET.SA ? 'TASI' : 'US'} by ticker or company…`} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
      {error && <div className="text-sm text-red-600">{error} — Put JSON files under <code>public/data</code>.</div>}
      {loading && <div className="text-sm text-gray-500">Loading list…</div>}
      {!loading && !error && Object.keys(filtered).length === 0 && <div className="text-sm text-gray-500">No results.</div>}
      {!loading && !error && Object.entries(filtered).map(([industry, list]) => (
        <div key={industry} className="mb-4">
          <div className="relative border rounded-2xl p-3 bg-white">
            <div className="absolute -top-3 right-3 bg-black text-white px-2 py-1 text-xs rounded-lg shadow">{industry}</div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {list.map((s) => (
                <button key={s.ticker} className="text-left rounded-xl border p-3 hover:shadow transition" onClick={() => onOpen({ ticker: s.ticker, company: s.companyName, market })}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{s.ticker}</div>
                    <div className={`font-medium ${s.price == null ? 'text-gray-500' : 'text-green-600'}`}>{s.price == null ? '—' : `${s.price.toFixed(2)} ${currency}`}</div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{s.companyName}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </Section>
  );
}

function MarketStock({ params, onBack, langApi }) {
  const { ticker, company, market } = params;
  const currency = MARKET_CCY[market];
  const { T, lang } = langApi;

  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // AI states + UX
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFV, setAiFV] = useState(null);
  const [aiRationale, setAiRationale] = useState('');
  const [aiCached, setAiCached] = useState(false);
  const [aiError, setAiError] = useState('');
  const [longWait, setLongWait] = useState(false);
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

  useEffect(() => {
    (async () => {
      try {
        const symbolWithSuffix = `${ticker}${MARKET_SUFFIX[market]}`;
        setM(await getValuationMetricsCached(symbolWithSuffix, currency));
      } catch (e) {
        setErr(e?.message || 'Failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [ticker, market, currency]);

  useEffect(() => {
    let t; if (aiBusy) { t = setTimeout(() => setLongWait(true), 15000); } else { setLongWait(false); }
    return () => { if (t) clearTimeout(t); };
  }, [aiBusy]);

  const pct = useMemo(() => (m ? ((m.weighted - (m.price || 1)) / (m.price || 1)) * 100 : 0), [m]);
  const valuationMsg = useMemo(() => {
    if (!m) return '';
    if (pct >= 25) return T('سعر السهم مناسب مقارنةً بقيمة السهم العادلة', 'The stock is undervalued');
    if (pct >= 0) return T('سعر السهم مقيم بشكل عادل', 'The stock is fairly priced');
    return T('سعرالسهم أعلى من قيمة السهم العادلة', 'The stock is overvalued');
  }, [m, pct, T]);

  const ccyLabel = useMemo(() => ccyName(currency, lang), [currency, lang]);

  const xUrl = useMemo(() => buildXShare({
    ticker, company, lang,
    url: (typeof window !== 'undefined' ? window.location.href : 'https://trueprice.cash'),
    m, aiFV,
  }), [ticker, company, lang, m, aiFV]);

  async function askAI() {
    if (!m || aiBusy) return;
    setAiError('');

    const symbolWithSuffix = `${ticker}${MARKET_SUFFIX[market]}`;
    const sig = aiInputsSig(m);
    const key = AI_CACHE_KEY(symbolWithSuffix, sig);
    const cached = cacheRead(key, null);
    if (cached && Date.now() - cached.at < AI_TTL_MS && Number.isFinite(cached.fv)) {
      setAiFV(cached.fv); setAiRationale(cached.rationale || ''); setAiCached(true);
      return;
    }

    setAiBusy(true); setAiFV(null); setAiRationale(''); setAiCached(false);
    try {
      const eng = await getEngine();
      const sys = 'You are a careful equity analyst. Output strict JSON only with keys: fv (number), rationale (string). Do not add any text outside JSON. Never give investment advice.';
      const user = [
        `Compute a fair value per share using: FV = 0.5*EV + 0.25*PE + 0.25*PS.`,
        `Note if BookValue is above/below result in the rationale; numeric fv stays formula-based.`,
        `Currency: ${currency}`,
        `Inputs:`,
        `EV_per_share=${m.fairEV.toFixed(2)}`,
        `PE_per_share=${m.fairPE.toFixed(2)}`,
        `PS_per_share=${m.fairPS.toFixed(2)}`,
        `BookValue_per_share=${m.bookValue.toFixed(2)}`,
        `Current_Price=${m.price.toFixed(2)}`,
        `Return JSON like: {"fv": 123.45, "rationale": "..."}`,
      ].join('\n');

      const resp = await eng.chat.completions.create({
        messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ],
        temperature: 0.2, max_tokens: 180,
      });
      const content = resp?.choices?.[0]?.message?.content || '';
      const j = extractJSON(content);
      if (j && typeof j.fv === 'number') {
        const fvNum = Number(j.fv);
        setAiFV(fvNum);
        setAiRationale(typeof j.rationale === 'string' ? j.rationale : '');
        cacheWrite(key, { at: Date.now(), fv: fvNum, rationale: typeof j.rationale === 'string' ? j.rationale : '' });
      } else {
        setAiError(T('حدث خطأ، حاول مرة أخرى.', 'Something went wrong. Try again.'));
      }
    } catch {
      setAiError(T('حدث خطأ، حاول مرة أخرى.', 'Something went wrong. Try again.'));
    } finally { setAiBusy(false); }
  }

  const showComparison = aiFV != null && m;
  const diffPct = showComparison ? ((aiFV - m.weighted) / (m.weighted || 1)) * 100 : 0;
  const equalWithin = Math.abs(diffPct) < 0.0001; // treat as equal if ~0%
  const compColor = equalWithin ? 'text-blue-600' : (aiFV < (m?.weighted || 0) ? 'text-red-600' : 'text-green-600');

  return (
    <Section title="📋 Stock Details">
      {loading && <div className="text-center font-medium py-6">Loading stock details…</div>}
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {!loading && !err && m && (
        <div className="relative rounded-2xl shadow-sm border p-4 bg-white" aria-busy={aiBusy}>
          {/* Why: Prevents user interaction while the local AI loads/answers */}
          {aiBusy && (
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 pointer-events-auto" aria-hidden="true">
              <div className="absolute left-0 top-0 h-1 w-full overflow-hidden bg-gray-200" role="progressbar" aria-label="AI is thinking">
                <div className="h-full w-1/3 bg-gray-800" style={{ animation: 'trueprice-progress 1.2s ease-in-out infinite' }} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xl font-semibold">{company}</div>
              <div className="text-sm text-gray-500">{ticker}</div>
            </div>
            <div className="text-2xl font-bold">{m.price.toFixed(2)} {m.currency}</div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="font-semibold underline">{T('القيمة العادلة', 'Fair Value')}</div>
              <p>{T('السعر الحالي:', 'Current price:')} <strong>{`${m.price.toFixed(2)} ${ccyLabel}`}</strong></p>
              <p>{T('القيمة العادلة للسهم بناءً على قيمة المؤسسة هي:', 'The fair value of the stock based on Enterprise Value is:')} {`${m.fairEV.toFixed(2)} ${ccyLabel}`}</p>
              <p>{T('القيمة العادلة بناءً على الأرباح هي:', 'The fair value based on Earnings is:')} {`${m.fairPE.toFixed(2)} ${ccyLabel}`}</p>
              <p>{T('القيمة العادلة بناءً على المبيعات (مكرر المبيعات) هي:', 'The fair value based on Sales (Price-to-Sales) is:')} {`${m.fairPS.toFixed(2)} ${ccyLabel}`}</p>
              <p>{T('القيمة الدفترية للسهم:', 'Book Value per share:')} {`${m.bookValue.toFixed(2)} ${ccyLabel}`}</p>
              <p>{T('تقديرنا للقيمة العادلة الموزونة هو:', 'Our weighted fair value estimate is:')} <strong className={`${pctColor(((m.weighted - m.price) / (m.price || 1)) * 100)} font-semibold`}>{`${m.weighted.toFixed(2)} ${ccyLabel}`}</strong></p>
              <div className="mt-2"><span className={`font-semibold ${pctColor(((m.weighted - m.price) / (m.price || 1)) * 100)}`}>{T('التقييم:', 'Valuation:')}</span> <span>{valuationMsg}</span></div>

              <div className="mt-4 flex items-center gap-2">
                <Button onClick={askAI} disabled={aiBusy || !hasWebGPU}>{T('اسأل الذكاء الاصطناعي', 'Ask AI')}</Button>
                <Button as="a" href={xUrl} target="_blank" rel="noopener noreferrer" variant="ghost">Share on X</Button>
                <Button variant="ghost" onClick={onBack}>{T('رجوع', 'Back')}</Button>
              </div>
              {!hasWebGPU && (
                <div className="text-xs text-amber-700 mt-2">
                  {T('يحتاج هذا إلى متصفح يدعم WebGPU (مثل Chrome 121+).', 'Ask AI requires a WebGPU-capable browser (e.g., Chrome 121+).')}
                </div>
              )}
              {longWait && aiBusy && (
                <div className="text-xs text-gray-500 mt-2">
                  {T('قد يستغرق التشغيل الأول دقيقة بسبب تحميل النموذج إلى جهازك…', 'First run can take up to a minute while the on-device model loads…')}
                </div>
              )}
              {aiError && <div className="mt-2 text-sm text-red-600" role="alert">{aiError}</div>}

              {aiFV != null && (
                <div className="mt-4 border rounded-2xl p-3 bg-gray-50">
                  <div className="text-sm">
                    <strong>{T('القيمة العادلة حسب الذكاء الاصطناعي:', 'AI fair value:')}</strong> {aiFV.toFixed(2)} {ccyLabel}
                    {aiCached && <span className="ml-2 text-gray-500 text-xs">{T('(من الذاكرة المؤقتة)', '(from cache)')}</span>}
                  </div>
                  {showComparison && (
                    <div className={`mt-2 text-sm font-semibold ${compColor}`}>
                      {T('مقارنة مع تقدير التطبيق:', 'Comparison vs app estimate:')} <Pct n={diffPct} lang={lang} />
                    </div>
                  )}
                  {aiRationale && (
                    <div className="mt-2 text-xs text-gray-700 whitespace-pre-line">
                      {aiRationale}
                    </div>
                  )}
                </div>
              )}

              <hr className="my-3" />
              <div className="font-semibold underline">{T('المؤشرات المالية', 'Financial Indicators')}</div>
              <p className={`${bandColor(m.grossMargin, 20, 40)}`}>{T('هامش الربح الإجمالي:', 'Gross Margin:')} <Pct n={m.grossMargin} lang={lang} /></p>
              <p className={`${bandColor(m.opMargin, 10, 20)}`}>{T('هامش التشغيل:', 'Operating Margin:')} <Pct n={m.opMargin} lang={lang} /></p>
              <p className={`${bandColor(m.netMargin, 5, 15)}`}>{T('هامش صافي الربح:', 'Net Margin:')} <Pct n={m.netMargin} lang={lang} /></p>

              <div className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                ⚠️ <strong>{T('إخلاء المسؤولية:', 'Disclaimer:')}</strong> {T('هذه ليست نصيحة استثمارية.', 'This is not investment advice.')}
              </div>
            </div>

            <div />
          </div>
        </div>
      )}
    </Section>
  );
}

/* ========================== App */ 
export default function App() {
  const [view, setView] = useState('home');
  const [route, setRoute] = useState({});
  const langApi = useLang();

  useEffect(() => { if (typeof navigator !== 'undefined' && 'gpu' in navigator) { getEngine().catch(() => {}); } }, []);

  return (
    <div dir={langApi.lang === 'ar' ? 'rtl' : 'ltr'} lang={langApi.lang} className="min-h-screen bg-gray-50 text-gray-900">
      <style>{`
        @keyframes trueprice-progress { 0% { transform: translateX(-100%); } 50% { transform: translateX(-20%); } 100% { transform: translateX(100%); } }
      `}</style>

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-lg font-bold cursor-pointer" onClick={() => { setView('home'); setRoute({}); }}>
            Trueprice<span className="text-gray-400">.cash</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => langApi.setLang(langApi.lang === 'ar' ? 'en' : 'ar')}>{langApi.lang === 'ar' ? 'EN' : 'AR'}</Button>
            <Button as="a" href="https://x.com/dr_sam_78" target="_blank" rel="noopener noreferrer" variant="ghost">Contact us</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            {view === 'home' && (
              <MarketBrowser onOpen={({ ticker, company, market }) => { setView('market_stock'); setRoute({ ticker, company, market }); }} />
            )}
            {view === 'market_stock' && (
              <MarketStock
                params={route}
                langApi={langApi}
                onBack={() => { setView('home'); setRoute({}); }}
              />
            )}
          </div>

          </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 pb-8 text-xs text-gray-500">© Trueprice.cash. All rights reserved.</footer>
    </div>
  );
}


