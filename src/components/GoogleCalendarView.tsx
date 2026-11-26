import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Hotel } from 'lucide-react';
import { apiRequest } from '../api';
import type { CourseSession, DailyActivity } from '../types';

type Stay = { id: string; description: string; check_in_date: string; check_out_date: string; first_name: string; last_name: string };
type PlannerEvent = { id: string; title: string; start: Date; end: Date; kind: 'course' | 'activity' | 'stay'; detail: string };
const colors = { course: 'bg-emerald-700', activity: 'bg-sky-600', stay: 'bg-indigo-500' };
const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`);
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export const GoogleCalendarView: React.FC = () => {
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [week, setWeek] = useState(() => { const d = new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0); return d; });
  const [error, setError] = useState('');
  useEffect(() => { let live = true; Promise.all([
    apiRequest<CourseSession[]>('/api/sessions'), apiRequest<DailyActivity[]>('/api/activities'), apiRequest<Stay[]>('/api/planner/accommodation-stays'),
  ]).then(([s,a,t]) => { if(live){setSessions(s);setActivities(a);setStays(t);} }).catch((e: unknown)=>{if(live)setError(e instanceof Error?e.message:'Planner data could not be loaded.');}); return ()=>{live=false;}; }, []);
  const days = useMemo(()=>Array.from({length:7},(_,i)=>{const d=new Date(week);d.setDate(d.getDate()+i);return d;}),[week]);
  const events = useMemo<PlannerEvent[]>(()=>[
    ...sessions.filter(x=>x.status!=='cancelled').map(x=>({id:`course-${x.id}`,title:x.course_title||'Course session',start:toDate(x.start_date),end:toDate(x.end_date),kind:'course' as const,detail:[x.instructor_name,x.location].filter(Boolean).join(' · ')})),
    ...activities.map(x=>({id:`activity-${x.id}`,title:x.title,start:toDate(x.activity_date),end:toDate(x.activity_date),kind:'activity' as const,detail:`${x.start_time} · ${x.location}`})),
    ...stays.map(x=>({id:`stay-${x.id}`,title:x.description||'Accommodation',start:toDate(x.check_in_date),end:toDate(x.check_out_date),kind:'stay' as const,detail:`${x.first_name} ${x.last_name}`})),
  ],[sessions,activities,stays]);
  const shift=(n:number)=>setWeek(d=>{const x=new Date(d);x.setDate(x.getDate()+n*7);return x;});
  return <main className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Planner</h1><p className="text-sm text-slate-500">Courses, training weeks, stays, packages, and activities from your ERP records.</p></div><div className="flex items-center gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>{const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));d.setHours(0,0,0,0);setWeek(d);}}>Today</button><button aria-label="Previous week" onClick={()=>shift(-1)} className="rounded-lg border p-2"><ChevronLeft size={18}/></button><button aria-label="Next week" onClick={()=>shift(1)} className="rounded-lg border p-2"><ChevronRight size={18}/></button><strong className="min-w-36 text-center">{days[0].toLocaleDateString('en',{month:'long',year:'numeric'})}</strong></div></header>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))'}} className="border-b bg-slate-50 dark:bg-slate-800">{days.map(d=><div key={iso(d)} className={`min-h-16 border-r p-2 text-center last:border-0 ${iso(d)===iso(new Date())?'bg-blue-50 dark:bg-blue-950/30':''}`}><div className="text-[11px] uppercase text-slate-500">{d.toLocaleDateString('en',{weekday:'short'})}</div><div className={`mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full font-semibold ${iso(d)===iso(new Date())?'bg-blue-600 text-white':''}`}>{d.getDate()}</div></div>)}</div>
    {error&&<p role="alert" className="p-4 text-sm text-rose-700">{error}</p>}
    <div className="min-h-[55vh] space-y-2 p-3">{events.filter(e=>iso(e.end)>=iso(days[0])&&iso(e.start)<=iso(days[6])).length===0?<div className="grid min-h-[45vh] place-items-center text-sm text-slate-500">No scheduled ERP records this week.</div>:events.filter(e=>iso(e.end)>=iso(days[0])&&iso(e.start)<=iso(days[6])).map(e=>{const start=Math.max(0,Math.floor((e.start.getTime()-days[0].getTime())/86400000));const end=Math.min(6,Math.floor((e.end.getTime()-days[0].getTime())/86400000));return <div key={e.id} style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))'}} className="min-h-14 border-b border-slate-100 dark:border-slate-800"><div style={{gridColumn:`${start+1} / ${end+2}`}} className="py-1 pr-1"><article title={`${e.title}${e.detail?` · ${e.detail}`:''}`} className={`${colors[e.kind]} min-h-11 rounded-md px-3 py-2 text-xs text-white shadow-sm`}><div className="flex items-center gap-1 font-semibold">{e.kind==='course'?<GraduationCap size={14}/>:e.kind==='activity'?<Activity size={14}/>:<Hotel size={14}/>}<span className="truncate">{e.title}</span></div><div className="truncate opacity-90">{e.detail}</div></article></div></div>})}</div></section>
    <footer className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300"><span className="flex items-center gap-1"><GraduationCap size={14}/> Courses & packages</span><span className="flex items-center gap-1"><Hotel size={14}/> Accommodation</span><span className="flex items-center gap-1"><Activity size={14}/> Activities</span><span className="ml-auto flex items-center gap-1"><CalendarDays size={14}/>{events.length} scheduled records</span></footer>
  </main>;
};
