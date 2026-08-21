"use client";
import { useEffect, useState } from 'react';
import { PageShell, DataNotice, EmptyState, LoadingSheets } from '@/app/dashboard/components/PageShell';
import { useAuthUser, formatArabicDate } from '@/app/dashboard/components/use-page-data';
import { fetchLedger, type CoinEntry } from '@/lib/shop/shop-data';

const SOURCE_LABEL: Record<string,string> = { day_done:'يوم مذاكرة', goal_done:'هدف من المخطط', daily_login:'دخول يومي', streak_day:'سلسلة مذاكرة', badge:'وسام', perfect_week:'أسبوع كامل', wheel:'عجلة المكافآت', break_riddle:'فزورة البريك', break_game:'لعبة بريك', daily_mission:'مهمة يومية', escape_room:'غرفة الهروب', purchase:'شراء من المتجر', box_refund:'تعويض صندوق' };
export default function RewardsPage(){
 const {supabase,session}=useAuthUser(); const [items,setItems]=useState<CoinEntry[]|null>(null);const [error,setError]=useState('');
 useEffect(()=>{if(session.status!=='ready')return;void fetchLedger(supabase,session.user.id).then(r=>r.error?setError(r.error.message):setItems(r.data));},[supabase,session]);
 if(session.status==='loading'||!items&&!error)return <PageShell eyebrow="Gamification" title="سجل المكافآت"><LoadingSheets count={4}/></PageShell>;
 return <PageShell eyebrow="Gamification" title="سجل المكافآت" lede="كل Coins في مكان واحد: مصدرها، قيمتها، وتاريخها. الرصيد يُحسب من هذا السجل نفسه.">
 {error&&<DataNotice message={error}/>} {!error&&items?.length===0&&<EmptyState icon="🪙" title="لسه مفيش حركات" body="أكمل نشاطًا دراسيًا أو مهمة يومية لتظهر مكافآتك هنا."/>}
 <section className="sheet-card divide-y divide-rule">{items?.map(item=><article key={item.id} className="flex items-center justify-between gap-3 p-4"><div><h2 className="text-sm font-bold text-ink">{SOURCE_LABEL[item.source]??item.source}</h2><p className="text-xs text-ink-soft mt-1">{formatArabicDate(item.createdAt)}</p></div><span className={`mono ltr-num text-sm font-bold ${item.amount>0?'text-emerald-600':'text-red-500'}`}>{item.amount>0?'+':''}{item.amount} 🪙</span></article>)}</section>
 </PageShell>;
}
