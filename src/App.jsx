// path: src/App.jsx
// Ask AI button + messages INSIDE Financial Indicators card (top-right), comparison BELOW button.
// Full-width charts, trend messages, compact labels (Bill/Mill/K).

import React, { useEffect, useMemo, useState } from 'react';
import { CreateMLCEngine } from '@mlc-ai/web-llm';

/* ---------------- Crash Boundaries ---------------- */
function GlobalCrashBoundary({ children }) {
  const [crash, setCrash] = useState(null);
  useEffect(() => {
    const onErr = (e) => { console.error('Global error:', e?.error || e); setCrash('error'); };
    const onRej = (e) => { console.error('Unhandled rejection:', e?.reason || e); setCrash('rejection'); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);
  if (crash) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-xl border bg-white shadow-sm p-6 text-center">
          <div className="text-lg font-semibold mb-1">Something went wrong. Try again later.</div>
          <div className="text-sm text-gray-500">The app recovered from an unexpected error.</div>
        </div>
      </div>
    );
  }
  return children;
}
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={ hasError:false }; }
  static getDerivedStateFromError(){ return { hasError:true }; }
  componentDidCatch(err, info){ console.error('UI crashed:', err, info); }
  render(){
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="rounded-xl border bg-white shadow-sm p-6 text-center">
            <div className="text-lg font-semibold mb-1">Something went wrong. Try again later.</div>
            <div className="text-sm text-gray-500">If this persists, reload the page.</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- UI primitives ---------------- */
const Button = ({ children, onClick, variant='primary', disabled, as='button', href, target, rel, className='' }) => {
  const base='inline-flex items-center justify-center px-3.5 py-2 rounded-lg text-sm font-medium border transition focus:outline-none focus:ring-2 focus:ring-offset-1';
  const styles={
    primary:'bg-gray-900 text-white border-gray-900 hover:opacity-90 focus:ring-gray-300',
    ghost:'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-gray-300',
    subtle:'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200 focus:ring-gray-300',
    danger:'bg-white text-red-600 border-red-500 hover:bg-red-50 focus:ring-red-300',
  };
  const cls=`${base} ${styles[variant]} ${disabled?'opacity-60 cursor-not-allowed':''} ${className}`;
  if (as==='a') return <a href={href} target={target} rel={rel} className={cls}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
};
const Card = ({ title, subtitle, actions, children, className='' }) => (
  <section className={`rounded-xl border bg-white shadow-sm ${className}`}>
    {(title||subtitle||actions)&&(
      <header className="px-4 py-3 border-b flex items-center gap-3">
        <div className="min-w-0">
          {title&&<div className="text-sm font-semibold text-gray-900 truncate">{title}</div>}
          {subtitle&&<div className="text-xs text-gray-500 truncate">{subtitle}</div>}
        </div>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);
const AILoadBadge = ({ label='Loading…' }) => (
  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-gray-50">
    <span className="h-2 w-2 rounded-full bg-gray-900 animate-pulse" aria-hidden="true"/>
    {label}
  </span>
);

/* ---------------- Layout ---------------- */
const ShellLayout = ({ lang, onLogoClick, headerActions, sidebar, children }) => (
  <div className="min-h-screen bg-gray-50 text-gray-900">
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        {lang==='ar'?(
          <>
            <div className="flex items-center gap-2">{headerActions}</div>
            <div className="flex-1"/>
            <div className="text-lg font-bold tracking-tight cursor-pointer" onClick={onLogoClick}>
              <span className="text-gray-900">Trueprice</span><span className="text-gray-400">.cash</span>
            </div>
          </>
        ):(
          <>
            <div className="text-lg font-bold tracking-tight cursor-pointer" onClick={onLogoClick}>
              <span className="text-gray-900">Trueprice</span><span className="text-gray-400">.cash</span>
            </div>
            <div className="flex-1"/>
            <div className="flex items-center gap-2">{headerActions}</div>
          </>
        )}
      </div>
    </header>

    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-12 gap-6">
      <aside className="col-span-12 md:col-span-3">{sidebar}</aside>
      <main className="col-span-12 md:col-span-9">{children}</main>
    </div>

    <footer className="max-w-7xl mx-auto px-4 pb-8 text-xs text-gray-500">© Trueprice.cash. All rights reserved.</footer>
  </div>
);

/* ---------------- Const, i18n, utils ---------------- */
const cacheRead=(k,f)=>{try{const s=localStorage.getItem(k);return s?JSON.parse(s):f;}catch{return f;}};
const cacheWrite=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const PRICE_CACHE_KEY=(mkt)=>`mkt_price_cache_v1_${mkt}`;
const METRICS_CACHE_KEY='metrics_cache_v1';
const MARKET={ SA:'SA', US:'US' };
const MARKET_JSON={ SA:'/data/tasi_grouped_by_industry.json', US:'/data/sp500_grouped_by_industry.json' };
const MARKET_SUFFIX={ SA:':TADAWUL', US:'' };
const MARKET_CCY={ SA:'SAR', US:'USD' };
const TWELVE_API_KEY=import.meta.env.VITE_TWELVE_API_KEY||'';
const PREFETCH_DELAY=Number(import.meta.env.VITE_PREFETCH_DELAY_MS||5000);
const chunk=(arr,n)=>{const out=[];for(let i=0;i<arr.length;i+=n)out.push(arr.slice(i,i+n));return out;};

function useLang(){
  const [lang,setLang]=useState(()=>localStorage.getItem('lang')||'en');
  useEffect(()=>{localStorage.setItem('lang',lang);},[lang]);
  const T=(ar,en)=>(lang==='ar'?ar:en);
  return { lang, setLang, T };
}
function ccyName(ccy,lang){ if(lang==='ar'){ if(ccy==='SAR') return 'ريال سعودي'; if(ccy==='USD') return 'دولار أمريكي'; } return ccy; }
const genericErr=(lang)=>(lang==='ar'?'حدث خطأ ما. حاول مرة أخرى لاحقًا.':'Something went wrong. Try again later.');
const AR_PERCENT='٪';
function Pct({ n, lang }){ const v=Number.isFinite(n)?n:0; return <bdi>{v.toFixed(2)}{lang==='ar'?AR_PERCENT:'%'}</bdi>; }
const pctColor=(pct)=>(pct>=25?'text-green-600':pct>=0?'text-blue-600':'text-red-600');
const bandColor=(v,low,high)=>(v<low?'text-red-600':v<high?'text-amber-600':'text-green-600');

/* Numbers */
const parseHumanNumber=(x)=>{
  if(x==null||x===''||x==='—'||x==='-')return NaN;
  if(typeof x==='number')return x;
  let s=String(x).trim(),neg=false;
  if(/^\(.*\)$/.test(s)){neg=true;s=s.slice(1,-1);}
  s=s.replace(/,/g,'');
  const m=/^(-?\d*\.?\d+)\s*([KMBT])?$/i.exec(s);
  const mul={K:1e3,M:1e6,B:1e9,T:1e12}[(m?.[2]||'').toUpperCase()]||1;
  const val=m?parseFloat(m[1])*mul:Number(s);
  const n=Number.isFinite(val)?val:NaN;
  return neg?-Math.abs(n):n;
};
const numOr0=(n)=>(Number.isFinite(n)?n:0);
const fmt2=(n)=>(Number.isFinite(n)?n:0).toFixed(2);
const coalesce=(...vals)=>{for(const v of vals){const n=parseHumanNumber(v);if(Number.isFinite(n))return n;}return 0;};

/* Compact labels */
function formatBillMill(n,lang){
  const abs=Math.abs(n); const sign=n<0?'-':'';
  const lab=(en,ar)=>lang==='ar'?ar:en;
  const scaled=(div,en,ar)=>{
    const s=abs/div; const fd=s<10?1:0;
    const nf=new Intl.NumberFormat(undefined,{minimumFractionDigits:fd,maximumFractionDigits:fd});
    return `${sign}${nf.format(s)} ${lab(en,ar)}`;
  };
  if(abs>=1e12) return scaled(1e12,'Trill','ترليون');
  if(abs>=1e9)  return scaled(1e9,'Bill','مليار');
  if(abs>=1e6)  return scaled(1e6,'Mill','مليون');
  if(abs>=1e3)  return scaled(1e3,'K','ألف');
  return `${sign}${new Intl.NumberFormat().format(abs)}`;
}

/* Fetch helper */
async function safeJson(url){
  try{const res=await fetch(url); if(!res.ok) return {__nojson:true,__status:res.status};
    try{ return await res.json(); }catch{ return {__nojson:true,__status:res.status}; }
  }catch{ return {__nojson:true,__status:0}; }
}

/* ---------------- Market data + prices ---------------- */
async function fetchTwelvePrices(symbols){
  if(!symbols.length||!TWELVE_API_KEY) return {};
  const result={};
  for(const c of chunk(symbols,80)){
    const url=`https://api.twelvedata.com/price?symbol=${encodeURIComponent(c.join(','))}&apikey=${TWELVE_API_KEY}`;
    const j=await safeJson(url); if(j.__nojson) continue;
    if(Array.isArray(j)) for(const it of j){ const p=+it.price; if(it.symbol&&Number.isFinite(p)) result[it.symbol]=p; }
    else for(const [sym,obj] of Object.entries(j)){ const p=+obj?.price; if(sym&&Number.isFinite(p)) result[sym]=p; }
  }
  return result;
}
function useMarketData(market){
  const [grouped,setGrouped]=useState({}); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  useEffect(()=>{
    let stop=false;
    (async()=>{
      setLoading(true); setError('');
      try{
        const path=MARKET_JSON[market]; const res=await fetch(`${path}?ts=${Date.now()}`);
        if(!res.ok) throw new Error(`JSON not found at ${path} (HTTP ${res.status})`);
        const raw=await res.json(); const suffix=MARKET_SUFFIX[market];
        const symbols=Object.values(raw).flatMap(list=>list.map(c=>`${String(c.Ticker)}${suffix}`));
        let prices={};
        try{
          const cached=cacheRead(PRICE_CACHE_KEY(market),{at:0,prices:{}});
          const ageMin=(Date.now()-cached.at)/60000;
          if(ageMin<10&&Object.keys(cached.prices).length) prices=cached.prices;
          else { prices=await fetchTwelvePrices(symbols); cacheWrite(PRICE_CACHE_KEY(market),{at:Date.now(),prices}); }
        }catch{ prices={}; }
        const out={};
        for(const [industry,companies] of Object.entries(raw)){
          const list=[];
          for(const company of companies){
            const sym=`${String(company.Ticker)}${suffix}`; const price=prices[sym];
            list.push({ ticker:String(company.Ticker), companyName:String(company.Company).trim(), price:Number.isFinite(price)?price:null });
          }
          if(list.length) out[industry]=list;
        }
        if(!stop) setGrouped(out);
      }catch(e){ if(!stop) setError(e?.message||'Failed to load market'); }
      finally{ if(!stop) setLoading(false); }
    })();
    return()=>{stop=true;};
  },[market]);
  return { grouped, loading, error, currency: MARKET_CCY[market] };
}

/* ---------------- Valuation metrics ---------------- */
async function fetchValuationMetrics(symbolWithSuffix, currency){
  if(!TWELVE_API_KEY){
    return { price:0,fairEV:0,fairPE:0,fairPS:0,weighted:0,bookValue:0,grossMargin:0,netMargin:0,opMargin:0,currency };
  }
  const base='https://api.twelvedata.com', enc=encodeURIComponent;
  const priceJson=await safeJson(`${base}/price?symbol=${enc(symbolWithSuffix)}&apikey=${TWELVE_API_KEY}`);
  const statsJson=await safeJson(`${base}/statistics?symbol=${enc(symbolWithSuffix)}&apikey=${TWELVE_API_KEY}`);
  const bsJson   =await safeJson(`${base}/balance_sheet?symbol=${enc(symbolWithSuffix)}&apikey=${TWELVE_API_KEY}`);
  const isJson   =await safeJson(`${base}/income_statement?symbol=${enc(symbolWithSuffix)}&apikey=${TWELVE_API_KEY}`);

  if(priceJson.__nojson||statsJson.__nojson||bsJson.__nojson||isJson.__nojson){
    return { price:0,fairEV:0,fairPE:0,fairPS:0,weighted:0,bookValue:0,grossMargin:0,netMargin:0,opMargin:0,currency };
  }

  const stats=statsJson?.statistics||statsJson||{};
  const bs0=Array.isArray(bsJson?.balance_sheet)?bsJson.balance_sheet[0]
    :Array.isArray(bsJson?.balance_sheet?.annual)?bsJson.balance_sheet.annual.at(-1)
    :bsJson?.balance_sheet||{};
  const is0=Array.isArray(isJson?.income_statement)?isJson.income_statement[0]
    :Array.isArray(isJson?.income_statement?.annual)?isJson.income_statement.annual.at(-1)
    :isJson?.income_statement||{};

  const price=numOr0(parseHumanNumber(priceJson?.price));
  const sharesOutstanding=Math.max(0,coalesce(
    stats?.stock_statistics?.shares_outstanding,
    stats?.stock_statistics?.shares_outstanding_5y_avg,
    stats?.shares_outstanding
  ));
  const evFromStats=coalesce(
    stats?.valuations_metrics?.enterprise_value,
    stats?.valuation?.enterprise_value,
    stats?.enterprise_value
  );
  const longTermDebt=coalesce(bs0?.liabilities?.non_current_liabilities?.long_term_debt,stats?.financials?.long_term_debt);
  const shortTermDebt=coalesce(bs0?.liabilities?.current_liabilities?.short_term_debt,stats?.financials?.short_term_debt);
  const totalDebtApprox=longTermDebt+shortTermDebt;
  const cashEq=coalesce(
    bs0?.assets?.current_assets?.cash_and_cash_equivalents,
    bs0?.assets?.current_assets?.cash,
    stats?.financials?.cash_and_cash_equivalents
  );
  const marketCap=coalesce(
    stats?.valuations_metrics?.market_capitalization,
    stats?.market_cap,
    stats?.valuation?.market_cap
  );
  const enterpriseValue=evFromStats||Math.max(0,marketCap+totalDebtApprox-cashEq);

  const forwardPE=coalesce(stats?.valuations_metrics?.forward_pe);
  const netIncome=coalesce(is0?.net_income,is0?.net_income_loss);
  const priceToSales=coalesce(stats?.valuations_metrics?.price_to_sales_ttm);
  const sales=coalesce(is0?.sales,is0?.revenue,is0?.total_revenue);

  let fairEV=0,fairPE=0,fairPS=0;
  if(sharesOutstanding>0){
    fairEV=numOr0((enterpriseValue-longTermDebt+cashEq)/sharesOutstanding);
    fairPE=numOr0((forwardPE*netIncome)/sharesOutstanding);
    fairPS=numOr0((priceToSales*sales)/sharesOutstanding);
  }

  const weighted=numOr0(fairEV)*0.5+numOr0(fairPE)*0.25+numOr0(fairPS)*0.25;
  const bookValue=coalesce(stats?.financials?.balance_sheet?.book_value_per_share_mrq);
  const grossMargin=numOr0(coalesce(stats?.financials?.gross_margin))*100;
  const netMargin  =numOr0(coalesce(stats?.financials?.profit_margin))*100;
  const opMargin   =numOr0(coalesce(stats?.financials?.operating_margin))*100;

  return { price,fairEV,fairPE,fairPS,weighted,bookValue,grossMargin,netMargin,opMargin,currency };
}
const metricsCacheGet=()=>cacheRead(METRICS_CACHE_KEY,{});
const metricsCachePut=(k,data)=>{const all=metricsCacheGet(); all[k]={at:Date.now(),data}; cacheWrite(METRICS_CACHE_KEY,all);};
async function getValuationMetricsCached(symbolWithSuffix,currency){
  const hit=metricsCacheGet()[symbolWithSuffix]; const fresh=hit&&(Date.now()-hit.at)<30*60*1000;
  if(fresh) return hit.data; const data=await fetchValuationMetrics(symbolWithSuffix,currency); metricsCachePut(symbolWithSuffix,data); return data;
}

/* ---------------- WebLLM ---------------- */
const MODEL_CANDIDATES=['Phi-3-mini-4k-instruct-q4f16_1-MLC','Llama-3.2-1B-Instruct-q4f16_1-MLC','Qwen2.5-1.5B-Instruct-q4f16_1-MLC'];
let __engine=null;
async function tryCreateEngine(modelId){ try{ return await CreateMLCEngine(modelId); }catch(e1){ try{ return await CreateMLCEngine({model:modelId}); }catch(e2){ const err=new Error(`Failed to init model ${modelId}: ${e2?.message||e1?.message||'unknown'}`); err.cause=e2||e1; throw err; } } }
async function getEngine(){ if(__engine) return __engine; let lastErr; for(const mid of MODEL_CANDIDATES){ try{ const eng=await tryCreateEngine(mid); __engine=eng; return eng; }catch(e){ lastErr=e; } } throw lastErr||new Error('No WebLLM model could be initialized.'); }
function extractJSON(text){ if(!text) return null; const fence=/```(?:json)?\s*([\s\S]*?)```/i.exec(text); const raw=fence?fence[1]:text; try{ return JSON.parse(raw); }catch{} const i=raw.lastIndexOf('{'); const j=raw.lastIndexOf('}'); if(i>=0&&j>i){ try{ return JSON.parse(raw.slice(i,j+1)); }catch{} } return null; }
function readLLMContent(resp){ return resp?.choices?.[0]?.message?.content ?? resp?.output_text ?? ''; }

/* ---------------- Charts ---------------- */
const extractAnnual=(obj,key)=>Array.isArray(obj?.[key])?obj[key]:(Array.isArray(obj?.[key]?.annual)?obj[key].annual:(Array.isArray(obj?.data)?obj.data:[]));

function MiniLineChart({ title, series, lang }){
  const safeSeries=Array.isArray(series)?series.filter(s=>Number.isFinite(s?.value)).sort((a,b)=>Number(a.label)-Number(b.label)):[];
  if(!safeSeries.length) return <div className="text-xs text-gray-500">{title}: No data.</div>;

  const w=1600,h=260; const pad={t:34,r:24,b:44,l:56};
  const innerW=Math.max(1,w-pad.l-pad.r), innerH=Math.max(1,h-pad.t-pad.b);

  const values=safeSeries.map(s=>s.value);
  let minY=Math.min(...values), maxY=Math.max(...values);
  if(minY===maxY){ const d=Math.abs(minY||1)*0.1; minY-=d; maxY+=d; }
  const span=maxY-minY; minY-=span*0.1; maxY+=span*0.1;

  const xStep=innerW/((safeSeries.length-1)||1);
  const x=(i)=>pad.l+i*xStep;
  const y=(v)=>pad.t+(1-(v-minY)/(maxY-minY))*innerH;

  const pathD=safeSeries.map((s,i)=>`${i?'L':'M'} ${x(i)} ${y(s.value)}`).join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%',height:h,display:'block'}} preserveAspectRatio="none" role="img" aria-label={title}>
        <text x={w/2} y={20} textAnchor="middle" className="fill-gray-800 text-[14px] font-semibold">{title}</text>
        <line x1={pad.l} y1={h-pad.b} x2={w-pad.r} y2={h-pad.b} stroke="#e5e7eb"/>
        <path d={pathD} fill="none" stroke="#0f4a5a" strokeWidth="2"/>
        {safeSeries.map((s,i)=>{
          const px=x(i), py=y(s.value); const ly=(py>pad.t+20)?py-8:py+14; const label=formatBillMill(s.value,lang);
          return (
            <g key={`${s.label}-${i}`}>
              <circle cx={px} cy={py} r="3.5" fill="#0f4a5a"/>
              <text x={px} y={ly} textAnchor="middle" className="fill-[#0f4a5a] text-[11px] font-semibold">{label}</text>
              <text x={px} y={h-pad.b+18} textAnchor="middle" className="fill-gray-500 text-[10px]">{s.label}</text>
              <title>{`${s.label}: ${label}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* Trend helpers */
function linearRegressionSlope(values){
  const n=values.length; if(n<2) return 0;
  let sumX=0,sumY=0,sumXY=0,sumXX=0;
  for(let i=0;i<n;i++){ sumX+=i; sumY+=values[i]; sumXY+=i*values[i]; sumXX+=i*i; }
  const denom=n*sumXX-sumX*sumX; if(!denom) return 0;
  return (n*sumXY-sumX*sumY)/denom;
}
function analyzeTrend(series){
  const vals=Array.isArray(series)?series.map(s=>s.value).filter(Number.isFinite):[];
  if(vals.length<2) return {dir:'flat',pct:0};
  const slope=linearRegressionSlope(vals);
  const first=vals[0], last=vals[vals.length-1];
  const base=Math.abs(first)>1e-9?Math.abs(first):Math.abs(last)||1;
  const pct=((last-first)/base)*100;
  const th=5;
  if(slope>0&&pct>th) return {dir:'up',pct};
  if(slope<0&&pct<-th) return {dir:'down',pct};
  return {dir:'flat',pct};
}
function trendText(dir, metricName, pct, T, lang){
  const pctNode=<Pct n={pct} lang={lang}/>;
  if(dir==='up')   return <span className="text-green-700">{T(`${metricName} في اتجاه صاعد — مؤشر إيجابي ويدل على صحة مالية جيدة. التغير: `,`${metricName} is in an uptrend — positive, indicates healthy financials. Change: `)}{pctNode}</span>;
  if(dir==='down') return <span className="text-red-700">{T(`${metricName} في اتجاه هابط — مؤشر سلبي وقد يعكس تراجعًا في الأداء. التغير: `,`${metricName} is in a downtrend — negative, may reflect weakening performance. Change: `)}{pctNode}</span>;
  return <span className="text-amber-700">{T(`${metricName} مستقر تقريبًا — لا توجد إشارة اتجاهية واضحة. التغير: `,`${metricName} is roughly flat — no clear directional signal. Change: `)}{pctNode}</span>;
}
function TrendChartRow({ title, metricName, series, lang, T }){
  const {dir,pct}=analyzeTrend(series);
  return (
    <Card className="w-full max-w-none">
      <div className="-mx-4 md:-mx-6 lg:-mx-8">
        <MiniLineChart title={title} series={series} lang={lang}/>
      </div>
      <div className="mt-2 text-sm">{trendText(dir,metricName,pct,T,lang)}</div>
    </Card>
  );
}

/* ---------------- Annual series fetchers ---------------- */
const FUND_BASE='https://api.twelvedata.com';
const withAnnual=(endpoint,symbol)=>`${FUND_BASE}/${endpoint}?symbol=${encodeURIComponent(symbol)}&period=annual&order=asc&apikey=${TWELVE_API_KEY}`;
async function fetchIncomeSeries(symbol){ if(!TWELVE_API_KEY) return {rows:[],error:'GENERIC'};
  const j=await safeJson(withAnnual('income_statement',symbol)); if(j.__nojson) return {rows:[],error:'GENERIC'};
  const arr=extractAnnual(j,'income_statement');
  const rows=arr.map(r=>{const y=String(r?.fiscal_date??r?.fiscalDateEnding??r?.year??r?.fiscal_year??r?.date??'').slice(0,4);
    return {year:y,sales:numOr0(parseHumanNumber(r?.sales??r?.revenue??r?.total_revenue)),opIncome:numOr0(parseHumanNumber(r?.operating_income??r?.operating_income_loss??r?.operating_profit)),netIncome:numOr0(parseHumanNumber(r?.net_income??r?.net_income_loss??r?.net_income_applicable_to_common_shares))};}).filter(r=>r.year);
  return rows.length?{rows,error:''}:{rows:[],error:'GENERIC'};
}
async function fetchBalanceSeries(symbol){ if(!TWELVE_API_KEY) return {rows:[],error:'GENERIC'};
  const j=await safeJson(withAnnual('balance_sheet',symbol)); if(j.__nojson) return {rows:[],error:'GENERIC'};
  const arr=extractAnnual(j,'balance_sheet');
  const rows=arr.map(r=>{const y=String(r?.fiscal_date??r?.fiscalDateEnding??r?.year??r?.fiscal_year??r?.date??'').slice(0,4);
    const eq=r?.shareholders_equity?.total_shareholders_equity??r?.total_shareholders_equity??r?.shareholders_equity?.total_equity;
    return {year:y,shEquity:numOr0(parseHumanNumber(eq))};}).filter(r=>r.year&&Number.isFinite(r.shEquity));
  return rows.length?{rows,error:''}:{rows:[],error:'GENERIC'};
}
async function fetchCashFlowSeries(symbol){ if(!TWELVE_API_KEY) return {rows:[],error:'GENERIC'};
  const j=await safeJson(withAnnual('cash_flow',symbol)); if(j.__nojson) return {rows:[],error:'GENERIC'};
  const arr=extractAnnual(j,'cash_flow');
  const rows=arr.map(r=>{const y=String(r?.fiscal_date??r?.fiscalDateEnding??r?.year??r?.fiscal_year??r?.date??'').slice(0,4);
    const fcfDirect=parseHumanNumber(r?.free_cash_flow??r?.free_cash_flow_ttm);
    const ocf=numOr0(parseHumanNumber(r?.operating_cash_flow??r?.net_cash_provided_by_operating_activities));
    const capex=numOr0(parseHumanNumber(r?.capital_expenditures??r?.capex));
    const fcf=Number.isFinite(fcfDirect)&&fcfDirect!==0?numOr0(fcfDirect):(ocf-Math.abs(capex));
    return {year:y,fcf:numOr0(fcf)};}).filter(r=>r.year&&Number.isFinite(r.fcf));
  return rows.length?{rows,error:''}:{rows:[],error:'GENERIC'};
}

/* ---------------- Charts container ---------------- */
function FinancialCharts({ symbolWithSuffix, currency, langApi, ready, delayLeft }){
  const { lang, T } = langApi;
  const [income,setIncome]=useState({loading:false,rows:[],error:''});
  const [balance,setBalance]=useState({loading:false,rows:[],error:''});
  const [cash,setCash]=useState({loading:false,rows:[],error:''});

  useEffect(()=>{
    let stop=false;
    if(!ready){ setIncome({loading:false,rows:[],error:''}); setBalance({loading:false,rows:[],error:''}); setCash({loading:false,rows:[],error:''}); return; }
    (async()=>{
      setIncome({loading:true,rows:[],error:''}); setBalance({loading:true,rows:[],error:''}); setCash({loading:true,rows:[],error:''});
      const [is,bs,cf]=await Promise.all([fetchIncomeSeries(symbolWithSuffix),fetchBalanceSeries(symbolWithSuffix),fetchCashFlowSeries(symbolWithSuffix)]);
      if(!stop){ setIncome({loading:false,rows:is.rows,error:is.error}); setBalance({loading:false,rows:bs.rows,error:bs.error}); setCash({loading:false,rows:cf.rows,error:cf.error}); }
    })();
    return()=>{stop=true;};
  },[symbolWithSuffix,ready]);

  const toSeries=(rows,key)=>rows.slice().sort((a,b)=>Number(a.year)-Number(b.year)).map(r=>({label:r.year,value:numOr0(r[key])}));

  const revenueSeries=toSeries(income.rows,'sales');
  const opIncSeries  =toSeries(income.rows,'opIncome');
  const netIncSeries =toSeries(income.rows,'netIncome');
  const equitySeries =toSeries(balance.rows,'shEquity');
  const fcfSeries    =toSeries(cash.rows,'fcf');

  return (
    <div className="space-y-4 w-full max-w-none">
      {!ready&&(
        <div className="text-xs text-gray-600 inline-flex items-center gap-2">
          <AILoadBadge label={`Starting in ${delayLeft}s…`}/>
          <span>{T('انتظار قبل جلب البيانات…','Waiting before requesting data…')}</span>
        </div>
      )}

      {income.loading&&<div className="text-sm text-gray-500">Loading…</div>}
      {!income.loading&&income.error&&<div className="text-sm text-red-600">{genericErr(lang)}</div>}

      {revenueSeries.length>0&&<TrendChartRow title={T('الإيرادات','Revenue')} metricName={T('الإيرادات','Revenue')} series={revenueSeries} lang={lang} T={langApi.T}/>}
      {opIncSeries.length>0  &&<TrendChartRow title={T('دخل التشغيل','Operating Income')} metricName={T('دخل التشغيل','Operating Income')} series={opIncSeries} lang={lang} T={langApi.T}/>}
      {netIncSeries.length>0 &&<TrendChartRow title={T('صافي الدخل','Net Income')} metricName={T('صافي الدخل','Net Income')} series={netIncSeries} lang={lang} T={langApi.T}/>}

      {balance.loading&&<div className="text-sm text-gray-500">Loading…</div>}
      {!balance.loading&&balance.error&&<div className="text-sm text-red-600">{genericErr(lang)}</div>}
      {equitySeries.length>0 &&<TrendChartRow title={T('إجمالي حقوق المساهمين','Total Shareholders’ Equity')} metricName={T('إجمالي حقوق المساهمين','Shareholders’ Equity')} series={equitySeries} lang={lang} T={langApi.T}/>}

      {cash.loading&&<div className="text-sm text-gray-500">Loading…</div>}
      {!cash.loading&&cash.error&&<div className="text-sm text-red-600">{genericErr(lang)}</div>}
      {fcfSeries.length>0  &&<TrendChartRow title={T('التدفق النقدي الحر','Free Cash Flow')} metricName={T('التدفق النقدي الحر','Free Cash Flow')} series={fcfSeries} lang={lang} T={langApi.T}/>}
    </div>
  );
}

/* ---------------- Sidebar & list ---------------- */
function MarketToggle({ value, onChange }){
  const opts=[{id:MARKET.SA,label:'🇸🇦 Saudi (TASI)'},{id:MARKET.US,label:'🇺🇸 U.S. (S&P 500)'}];
  return (
    <div className="inline-flex items-center rounded-lg border bg-white shadow-sm overflow-hidden">
      {opts.map(opt=>{
        const active=value===opt.id;
        return (
          <button key={opt.id} onClick={()=>onChange(opt.id)} className={`px-3 py-1.5 text-sm font-medium ${active?'bg-gray-900 text-white':'text-gray-700 hover:bg-gray-50'}`}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
function Sidebar({ market, setMarket, q, setQ, T }){
  return (
    <div className="space-y-4">
      <Card title={T('السوق','Market')}>
        <MarketToggle value={market} onChange={setMarket}/>
        <div className="mt-4">
          <label className="text-xs text-gray-600">{T('بحث','Search')}</label>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder={T('ابحث بالرمز أو الشركة…','Search by ticker or company…')} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300"/>
        </div>
      </Card>
      <Card title={T('تلميحات','Tips')}>
        <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
          <li>{T('الأسعار تُحدّث كل 10 دقائق.','Prices refresh every 10 minutes.')}</li>
          <li>{T('المؤشرات تُخزَّن 30 دقيقة.','Metrics cached for 30 minutes.')}</li>
          <li>{T('الذكاء الاصطناعي يعمل على جهازك.','AI runs fully on-device.')}</li>
        </ul>
      </Card>
    </div>
  );
}
function IndustryTable({ title, rows, currency, onOpen, T }){
  return (
    <Card title={title} className="mb-4">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left font-medium text-gray-600 py-2 px-2">Ticker</th>
              <th className="text-left font-medium text-gray-600 py-2 px-2">Company</th>
              <th className="text-right font-medium text-gray-600 py-2 px-2">Price</th>
              <th className="text-right font-medium text-gray-600 py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s)=>(
              <tr key={s.ticker} className="border-t">
                <td className="py-2 px-2 font-mono">{s.ticker}</td>
                <td className="py-2 px-2">{s.companyName}</td>
                <td className="py-2 px-2 text-right">{s.price==null?<span className="text-gray-400">—</span>:`${fmt2(s.price)} ${currency}`}</td>
                <td className="py-2 px-2 text-right"><Button variant="subtle" onClick={()=>onOpen({ticker:s.ticker,company:s.companyName})}>{T('فتح','Open')}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function MarketBrowser({ onOpen, T, langApi, onLogoClick }){
  const [market,setMarket]=useState(()=>localStorage.getItem('mkt')||MARKET.SA);
  useEffect(()=>{ localStorage.setItem('mkt',market); },[market]);
  const {grouped,loading,error,currency}=useMarketData(market);
  const [q,setQ]=useState('');
  const filtered=useMemo(()=>{ if(!q.trim()) return grouped; const query=q.toLowerCase(); const out={};
    for(const [industry,list] of Object.entries(grouped)){
      const lf=list.filter(s=>s.ticker.toLowerCase().includes(query)||s.companyName.toLowerCase().includes(query));
      if(lf.length) out[industry]=lf;
    } return out; },[grouped,q]);

  const headerActions=(<>
    <Button variant="ghost" onClick={()=>langApi.setLang(langApi.lang==='ar'?'en':'ar')}>{langApi.lang==='ar'?'EN':'AR'}</Button>
    <Button as="a" href="https://x.com/dr_sam_78" target="_blank" rel="noopener noreferrer" variant="ghost">Contact us</Button>
  </>);

  return (
    <ShellLayout lang={langApi.lang} onLogoClick={onLogoClick} headerActions={headerActions} sidebar={<Sidebar market={market} setMarket={setMarket} q={q} setQ={setQ} T={T}/>}>
      <div className="space-y-4">
        <Card title={market===MARKET.SA?'🇸🇦 Saudi Stocks (TASI)':'🇺🇸 U.S. Stocks (S&P 500)'} subtitle={T('تصفّح حسب الصناعة وافتح السهم للتفاصيل.','Browse by industry and open a stock for details.')}>
          {error&&<div className="text-sm text-red-600">{error} — put JSON under <code>public/data</code>.</div>}
          {loading&&<div className="text-sm text-gray-500">Loading…</div>}
          {!loading&&!error&&Object.keys(filtered).length===0&&<div className="text-sm text-gray-500">No results.</div>}
        </Card>
        {!loading&&!error&&Object.entries(filtered).map(([industry,list])=>(
          <IndustryTable key={industry} title={industry} rows={list} currency={currency} onOpen={({ticker,company})=>onOpen({ticker,company,market})} T={T}/>
        ))}
      </div>
    </ShellLayout>
  );
}

/* ---------------- Stock view ---------------- */
function MarketStock({ params, onBack, langApi, onLogoClick }){
  const { ticker, company, market } = params;
  const currency=MARKET_CCY[market];
  const { T, lang } = langApi;

  const [m,setM]=useState(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');

  const [aiBusy,setAiBusy]=useState(false);
  const [aiFV,setAiFV]=useState(null);
  const [aiError,setAiError]=useState('');
  const [pendingAsk,setPendingAsk]=useState(false);
  const hasWebGPU=typeof navigator!=='undefined'&&'gpu' in navigator;

  const [delayLeft,setDelayLeft]=useState(Math.ceil(PREFETCH_DELAY/1000));
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    setReady(false); setDelayLeft(Math.ceil(PREFETCH_DELAY/1000)); setPendingAsk(false);
    const endAt=Date.now()+PREFETCH_DELAY;
    const id=setInterval(()=>{ const left=Math.max(0,Math.ceil((endAt-Date.now())/1000)); setDelayLeft(left); if(left<=0){clearInterval(id); setReady(true);} },250);
    return()=>clearInterval(id);
  },[ticker,market]);

  useEffect(()=>{
    if(!ready) return;
    (async()=>{
      setLoading(true); setErr('');
      try{
        const symbolWithSuffix=`${ticker}${MARKET_SUFFIX[market]}`;
        const data=await getValuationMetricsCached(symbolWithSuffix,currency);
        setM({
          price:numOr0(data.price), fairEV:numOr0(data.fairEV), fairPE:numOr0(data.fairPE),
          fairPS:numOr0(data.fairPS), weighted:numOr0(data.weighted), bookValue:numOr0(data.bookValue),
          grossMargin:numOr0(data.grossMargin), netMargin:numOr0(data.netMargin), opMargin:numOr0(data.opMargin),
          currency:data.currency||currency
        });
      }catch{ setErr(genericErr(lang)); } finally{ setLoading(false); }
    })();
  },[ready,ticker,market,currency,lang]);

  async function askAI(){
    if(!ready||!m||aiBusy) return;
    if(!hasWebGPU){ setAiError(genericErr(lang)); return; }
    setAiError(''); setAiBusy(true); setAiFV(null);
    try{
      const eng=await getEngine().catch(()=>null); if(!eng){ setAiError(genericErr(lang)); return; }
      const sys='You are a careful equity analyst. Output strict JSON only with keys: fv (number).';
      const user=[
        `Compute FV per share using: FV = 0.5*EV + 0.25*PE + 0.25*PS.`,
        `Currency: ${currency}`,
        `EV=${fmt2(m.fairEV)} PE=${fmt2(m.fairPE)} PS=${fmt2(m.fairPS)} Book=${fmt2(m.bookValue)} Price=${fmt2(m.price)}`,
        `Return JSON like: {"fv": 123.45}`
      ].join('\n');
      const resp=await eng.chat.completions.create({messages:[{role:'system',content:sys},{role:'user',content:user}],temperature:0.2,max_tokens:60});
      const j=extractJSON(readLLMContent(resp));
      if(j&&typeof j.fv==='number'&&isFinite(j.fv)) setAiFV(Number(j.fv));
      else setAiError(genericErr(lang));
    }catch{ setAiError(genericErr(lang)); }
    finally{ setAiBusy(false); }
  }
  const onAskClick=()=>{ if(!ready){ setPendingAsk(true); return; } void askAI(); };

  const showComparison=aiFV!=null&&m;
  const diffPct=showComparison?((aiFV-(m.weighted||0))/((m.weighted||1)))*100:0;

  const pct=useMemo(()=> (m?((m.weighted-(m.price||1))/(m.price||1))*100:0),[m]);
  const valuationMsg=m
    ? (pct>=25?T('سعر السهم مناسب مقارنةً بقيمة السهم العادلة','The stock is undervalued')
      : pct>=0?T('سعر السهم مقيم بشكل عادل','The stock is fairly priced')
      : T('سعرالسهم أعلى من قيمة السهم العادلة','The stock is overvalued'))
    : '';
  const ccyLabel=useMemo(()=>ccyName(currency,lang),[currency,lang]);
  const symbolWithSuffix=`${ticker}${MARKET_SUFFIX[market]}`;

  const headerActions=(<>
    <Button variant="ghost" onClick={onBack}>{T('الرجوع','Back')}</Button>
    <Button variant="ghost" onClick={()=>langApi.setLang(langApi.lang==='ar'?'en':'ar')}>{langApi.lang==='ar'?'EN':'AR'}</Button>
    <Button as="a" href="https://x.com/dr_sam_78" target="_blank" rel="noopener noreferrer" variant="ghost">Contact us</Button>
  </>);

  return (
    <ShellLayout lang={langApi.lang} onLogoClick={onLogoClick} headerActions={headerActions} sidebar={
      <Card title={T('نظرة عامة','Overview')}>
        <div className="space-y-2">
          <div className="text-lg font-semibold">{company}</div>
          <div className="text-sm text-gray-500">{ticker}</div>
        </div>
      </Card>
    }>
      <div className="space-y-4">
        <Card title="📋 Stock Details">
          {!ready&&(
            <div className="mb-3">
              <AILoadBadge label={`Starting in ${delayLeft}s…`}/>
              <span className="ml-2 text-xs text-gray-600">{T('انتظار قبل جلب البيانات…','Waiting before requesting data…')}</span>
            </div>
          )}

          {loading&&<div className="text-center font-medium py-6">Loading stock details…</div>}
          {err&&<div className="text-red-600 text-sm">{err}</div>}

          {ready&&!loading&&!err&&m&&(
            <>
              {/* top grid */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-bold">{fmt2(m.price)} {m.currency}</div>
                      <div className="text-xs text-gray-500">{valuationMsg}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">{T('القيمة العادلة الموزونة','Weighted Fair Value')}</div>
                      <div className={`text-xl font-semibold ${pctColor(((m.weighted-m.price)/(m.price||1))*100)}`}>{fmt2(m.weighted)} {ccyLabel}</div>
                    </div>
                  </div>

                  {/* Fair Value box */}
                  <Card title={T('القيمة العادلة للسهم','Stock Fair Value')}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">{T('قيمة المؤسسة','Enterprise value')}</div><div className="text-lg font-medium">{fmt2(m.fairEV)} {ccyLabel}</div></div>
                      <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">{T('قيمة الأرباح','Earning value')}</div><div className="text-lg font-medium">{fmt2(m.fairPE)} {ccyLabel}</div></div>
                      <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">{T('قيمة المبيعات','Sales value')}</div><div className="text-lg font-medium">{fmt2(m.fairPS)} {ccyLabel}</div></div>
                      <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">{T('القيمة الدفترية','Book value')}</div><div className="text-lg font-medium">{fmt2(m.bookValue)} {ccyLabel}</div></div>
                    </div>
                  </Card>
                </div>

                {/* >>> Financial Indicators card — Ask AI + messages INSIDE here <<< */}
                <div className="space-y-3">
                  <Card title={T('المؤشرات المالية','Financial Indicators')}>
                    <div className="space-y-3">
                      <ul className="space-y-2 text-sm">
                        <li className={`${bandColor(m.grossMargin,20,40)}`}>{T('هامش الربح الإجمالي:','Gross Margin:')} <Pct n={m.grossMargin} lang={lang}/></li>
                        <li className={`${bandColor(m.opMargin,10,20)}`}>{T('هامش التشغيل:','Operating Margin:')} <Pct n={m.opMargin} lang={lang}/></li>
                        <li className={`${bandColor(m.netMargin,5,15)}`}>{T('هامش صافي الربح:','Net Margin:')} <Pct n={m.netMargin} lang={lang}/></li>
                      </ul>

                      {/* Ask AI button row */}
                      <div className="flex items-center gap-2">
                        <Button onClick={onAskClick} disabled={aiBusy||!ready||pendingAsk}>
                          {pendingAsk&&!ready?T('مجدول…','Queued…'):T('اسأل الذكاء الاصطناعي','Ask AI')}
                        </Button>
                        {(aiBusy||!ready||pendingAsk)&&(
                          <AILoadBadge label={aiBusy?T('جاري تحميل النموذج…','Loading model…'):(!ready?`Starting in ${delayLeft}s…`:T('مجدول…','Queued…'))}/>
                        )}
                      </div>

                      {/* error under button */}
                      {aiError&&<div className="text-sm text-red-600">{aiError}</div>}

                      {/* comparison BELOW the button */}
                      {showComparison&&(
                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="text-sm">
                            <strong>{T('القيمة العادلة حسب الذكاء الاصطناعي:','AI fair value:')}</strong> {fmt2(aiFV)} {ccyLabel}
                          </div>
                          <div className={`mt-1 text-sm font-semibold ${Math.abs(diffPct)<0.0001?'text-blue-600':(aiFV<(m?.weighted||0)?'text-red-600':'text-green-600')}`}>
                            {T('مقارنة مع تقدير التطبيق:','Comparison vs app estimate:')} <Pct n={diffPct} lang={lang}/>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>

              {/* Full-width charts */}
              <div className="mt-4 w-full max-w-none">
                <FinancialCharts symbolWithSuffix={symbolWithSuffix} currency={currency} langApi={langApi} ready={ready} delayLeft={delayLeft}/>
              </div>

              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                ⚠️ <strong>{T('إخلاء المسؤولية:','Disclaimer:')}</strong> {T('هذه ليست نصيحة استثمارية.','This is not investment advice.')}
              </div>
            </>
          )}
        </Card>
      </div>
    </ShellLayout>
  );
}

/* ---------------- App root ---------------- */
export default function App(){
  const [view,setView]=useState('home');
  const [route,setRoute]=useState({});
  const langApi=useLang();

  useEffect(()=>{ if(typeof navigator!=='undefined'&&'gpu' in navigator){ getEngine().catch(()=>{}); } },[]);
  const onLogoClick=()=>{ setView('home'); setRoute({}); };

  return (
    <GlobalCrashBoundary>
      <ErrorBoundary>
        <div dir={langApi.lang==='ar'?'rtl':'ltr'} lang={langApi.lang}>
          {view==='home'&&(
            <MarketBrowser
              T={langApi.T}
              langApi={langApi}
              onLogoClick={onLogoClick}
              onOpen={({ticker,company,market})=>{ setView('market_stock'); setRoute({ticker,company,market}); }}
            />
          )}
          {view==='market_stock'&&(
            <MarketStock
              params={route}
              langApi={langApi}
              onLogoClick={onLogoClick}
              onBack={()=>{ setView('home'); setRoute({}); }}
            />
          )}
        </div>
      </ErrorBoundary>
    </GlobalCrashBoundary>
  );
}
