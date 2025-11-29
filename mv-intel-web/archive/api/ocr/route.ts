// Temporarily disabled - missing tesseract.js dependency
// import { NextRequest, NextResponse } from 'next/server';
// import Tesseract from 'tesseract.js';

// const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// async function visionOCR(imageUrl: string){
//   const res = await fetch('https://api.openai.com/v1/chat/completions', {
//     method:'POST',
//     headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${OPENAI_API_KEY}` },
//     body: JSON.stringify({ model:'gpt-4o-mini', messages:[{ role:'system', content:'Extract exactly the text on the slide. No paraphrasing.' }, { role:'user', content:[{ type:'text', text:'OCR this image' }, { type:'image_url', image_url:{ url:imageUrl }}] }], temperature:0 })
//   });
//   const j = await res.json(); return j.choices?.[0]?.message?.content?.trim()||'';
// }
// function heuristic(txt:string){ const len=txt.length; const words=txt.split(/\s+/).filter(Boolean); const avg=words.length?words.reduce((a,b)=>a+b.length,0)/words.reduce((a,b)=>a+1,0); const alnum=(txt.match(/[A-Za-z0-9]/g)||[]).length/Math.max(1,len); return Math.max(0,Math.min(1,(Math.tanh((len-80)/120)+Math.tanh((avg-3)/3)+alnum)/3)); }

// export async function POST(req: NextRequest){
//   const { imageUrl, language='eng', wantVision=true } = await req.json();
//   const tessP = (async ()=>{ const { data } = await Tesseract.recognize(imageUrl, language, { logger:()=>{} }); return { engine:'tesseract', text:data.text?.trim()||'', conf: data.conf||0 }; })();
//   const visP = wantVision ? visionOCR(imageUrl).then(t=>({ engine:'vision', text:t, conf:0.9 })) : null;
//   const res = await Promise.allSettled([tessP, ...(visP?[visP]:[])]);
//   const cands = res.map(r=> r.status==='fulfilled'? r.value: null).filter(Boolean) as any[];
//   let best=cands[0]||{ engine:'tesseract', text:'', text: '', conf:0 };
//   for (const c of cands){ const score = (c.text.length/2000)+0.6*heuristic(c.text)+0.4*c.conf; const bscore=(best.text.length/2000)+0.6*heuristic(best.text)+0.4*best.conf; if (score>bscore) best=c; }
//   return NextResponse.json({ engine: best.engine, text: best.text });
// }

export async function POST() {
  return new Response('OCR temporarily disabled', { status: 503 });
}