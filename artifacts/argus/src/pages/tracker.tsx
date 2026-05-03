import { useState, useEffect, useRef, useCallback } from "react";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask, getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, parseISO } from "date-fns";
import {
  Plus, Trash2, Flag, Check, X, Target, Flame, Repeat2,
  CheckCircle2, Circle, Timer, Play, Pause, RotateCcw,
  ChevronRight, ChevronLeft, CalendarDays, Clock, Pencil,
  Sparkles, LayoutDashboard, CheckSquare, BarChart2,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════
   SHARED TYPES
   ══════════════════════════════════════════════════════════ */
type Priority = "low" | "medium" | "high";
type Filter = "all" | "today" | "upcoming" | "high";
type Tab = "overview" | "tasks" | "habits";

interface Goal    { id: string; text: string; }
interface FocusItem { id: string; text: string; done: boolean; }
interface Habit   { id: string; name: string; emoji: string; frequency: "daily"|"weekdays"|"weekly"; completions: Record<string,boolean>; }
interface Subtask { id: string; text: string; done: boolean; }

/* ══════════════════════════════════════════════════════════
   CONSTANTS & CONFIG
   ══════════════════════════════════════════════════════════ */
const PRIORITY_CFG: Record<Priority,{ label:string; color:string; ring:string; bg:string; dot:string }> = {
  high:   { label:"High",   color:"text-rose-500",  ring:"border-rose-500",  bg:"bg-rose-500/10",  dot:"bg-rose-500"  },
  medium: { label:"Medium", color:"text-amber-500", ring:"border-amber-500", bg:"bg-amber-500/10", dot:"bg-amber-500" },
  low:    { label:"Low",    color:"text-blue-400",  ring:"border-blue-400",  bg:"bg-blue-400/10",  dot:"bg-blue-400"  },
};
const POMODORO = 25 * 60;
const TIMER_KEY = "argus_timer_v2";
const TASK_TIMES_KEY = "argus_task_times";
const GOALS_KEY = "argus_goals";
const HABITS_KEY = "argus_habits_v2";
const HABIT_EMOJIS = ["🏃","📚","💧","🧘","💪","🎯","🛌","🥗","✍️","🌿","🎵","🧹"];
const FREQ_LABELS: Record<Habit["frequency"],string> = { daily:"Daily", weekdays:"Weekdays", weekly:"Weekly (Mon)" };
const BASE = import.meta.env.BASE_URL.replace(/\/$/,"");

/* ══════════════════════════════════════════════════════════
   STORAGE HELPERS
   ══════════════════════════════════════════════════════════ */
function ls<T>(key:string, fb:T):T { try { const v=localStorage.getItem(key); return v?JSON.parse(v):fb; } catch { return fb; } }
function lsSet(k:string,v:unknown){ try { localStorage.setItem(k,JSON.stringify(v)); } catch {} }
function getAllTaskTimes():Record<string,string>{ return ls(TASK_TIMES_KEY,{}); }
function saveTaskTime(id:number,t:string){ const a=getAllTaskTimes(); if(t){a[String(id)]=t;}else{delete a[String(id)];} lsSet(TASK_TIMES_KEY,a); }
function getTaskTime(id:number):string{ return getAllTaskTimes()[String(id)]??""; }
function fmt12(t:string):string{
  if(!t)return""; const[h,m]=t.split(":").map(Number);
  return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;
}
const focusKey=(d:string)=>`argus_focus_${d}`;

/* ══════════════════════════════════════════════════════════
   HOOKS
   ══════════════════════════════════════════════════════════ */
function useClock(){ const[now,set]=useState(new Date()); useEffect(()=>{ const iv=setInterval(()=>set(new Date()),1000); return()=>clearInterval(iv); },[]); return now; }

function useTaskTime(taskId:number|null){
  const[time,setTime]=useState<string>(()=>taskId?getTaskTime(taskId):"");
  useEffect(()=>{ setTime(taskId?getTaskTime(taskId):""); },[taskId]);
  const save=(t:string)=>{ setTime(t); if(taskId!==null)saveTaskTime(taskId,t); };
  return { time, save };
}

interface TimerState { taskId:number|null; remainingSeconds:number; running:boolean; startedAt:number|null; }
function initTimer():TimerState{
  try{ const s=localStorage.getItem(TIMER_KEY); if(s){ const p:TimerState=JSON.parse(s); if(p.running&&p.startedAt){ const el=Math.floor((Date.now()-p.startedAt)/1000); const rem=Math.max(0,p.remainingSeconds-el); return{...p,remainingSeconds:rem,running:rem>0}; } return p; } } catch{}
  return{taskId:null,remainingSeconds:POMODORO,running:false,startedAt:null};
}
function saveTmr(s:TimerState){ try{localStorage.setItem(TIMER_KEY,JSON.stringify(s));}catch{} }
function useTaskTimer(){
  const[st,setSt]=useState<TimerState>(initTimer); const stRef=useRef(st); stRef.current=st;
  useEffect(()=>{ if(!st.running)return; const iv=setInterval(()=>{ setSt(prev=>{ if(!prev.running||!prev.startedAt)return prev; const el=Math.floor((Date.now()-prev.startedAt)/1000); const rem=Math.max(0,prev.remainingSeconds-el); if(rem<=0){const nx={...prev,running:false,remainingSeconds:0,startedAt:null};saveTmr(nx);return nx;} return{...prev}; }); },500); return()=>clearInterval(iv); },[st.running]);
  const getRem=()=>{ const s=stRef.current; if(s.running&&s.startedAt)return Math.max(0,s.remainingSeconds-Math.floor((Date.now()-s.startedAt)/1000)); return s.remainingSeconds; };
  const start=useCallback((id:number)=>{ const nx:TimerState={taskId:id,remainingSeconds:POMODORO,running:true,startedAt:Date.now()}; setSt(nx);saveTmr(nx); },[]);
  const pause=useCallback(()=>{ setSt(p=>{ const rem=p.startedAt?Math.max(0,p.remainingSeconds-Math.floor((Date.now()-p.startedAt)/1000)):p.remainingSeconds; const nx={...p,remainingSeconds:rem,running:false,startedAt:null}; saveTmr(nx);return nx; }); },[]);
  const resume=useCallback(()=>{ setSt(p=>{ const nx={...p,running:true,startedAt:Date.now()};saveTmr(nx);return nx; }); },[]);
  const reset=useCallback(()=>{ const nx:TimerState={taskId:null,remainingSeconds:POMODORO,running:false,startedAt:null};setSt(nx);saveTmr(nx); },[]);
  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  return{taskId:st.taskId,running:st.running,getRem,fmt,start,pause,resume,reset};
}

function useSubtasks(taskId:number|null){
  const key=taskId?`argus_subtasks_${taskId}`:null;
  const[items,setItems]=useState<Subtask[]>(()=>{ if(!key)return[]; try{return JSON.parse(localStorage.getItem(key)??"[]");}catch{return[];} });
  useEffect(()=>{ if(!key){setItems([]);return;} try{setItems(JSON.parse(localStorage.getItem(key)??"[]"));}catch{setItems([]);} },[key]);
  const save=(nx:Subtask[])=>{ setItems(nx); if(key)try{localStorage.setItem(key,JSON.stringify(nx));}catch{} };
  return{ items, add:(t:string)=>save([...items,{id:crypto.randomUUID(),text:t,done:false}]), toggle:(id:string)=>save(items.map(s=>s.id===id?{...s,done:!s.done}:s)), remove:(id:string)=>save(items.filter(s=>s.id!==id)), doneCount:items.filter(s=>s.done).length };
}

/* ══════════════════════════════════════════════════════════
   TASK COMPONENTS
   ══════════════════════════════════════════════════════════ */
function TimerRing({remaining,size=96,stroke=7}:{remaining:number;size?:number;stroke?:number}){
  const r=(size-stroke)/2; const circ=2*Math.PI*r; const pct=remaining/POMODORO; const offset=circ*(1-pct);
  const color=pct>0.5?"hsl(217 91% 62%)":pct>0.2?"hsl(38 92% 50%)":"hsl(0 82% 60%)";
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)"}}><circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} stroke="hsl(var(--muted))"/><circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} stroke={color} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.5s linear,stroke 1s ease"}}/></svg>);
}

function PriorityPicker({value,onChange}:{value:Priority;onChange:(p:Priority)=>void}){
  return(<div className="flex gap-1.5">{(["high","medium","low"] as Priority[]).map(p=>{ const c=PRIORITY_CFG[p]; const active=value===p; return(<button key={p} onClick={()=>onChange(p)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active?`${c.bg} ${c.color} border-current/30`:"bg-muted/40 border-border text-muted-foreground hover:border-primary/25 hover:text-foreground"}`}><span className={`w-2 h-2 rounded-full ${c.dot}`}/>{c.label}</button>); })}</div>);
}

function TaskDetail({task,onClose,onUpdate,onDelete,timer,onTimeChange}:{task:any;onClose:()=>void;onUpdate:(id:number,d:any)=>void;onDelete:(id:number)=>void;timer:ReturnType<typeof useTaskTimer>;onTimeChange:()=>void;}){
  const[title,setTitle]=useState(task.title);
  const[desc,setDesc]=useState(task.description??"");
  const[dueDate,setDueDate]=useState(task.dueDate??"");
  const taskTime=useTaskTime(task.id);
  const subtasks=useSubtasks(task.id);
  const{add:addSubtask}=subtasks;
  const[newSub,setNewSub]=useState("");
  const todayStr=new Date().toISOString().split("T")[0];
  const[rem,setRem]=useState(timer.getRem());
  useEffect(()=>{ const iv=setInterval(()=>setRem(timer.getRem()),500); return()=>clearInterval(iv); },[timer]);
  const isTimerTask=timer.taskId===task.id;
  const saveTitle=()=>{ if(title.trim()&&title!==task.title)onUpdate(task.id,{title:title.trim()}); };
  const saveDesc=()=>{ if(desc!==(task.description??""))onUpdate(task.id,{description:desc||null}); };
  const saveDue=(v:string)=>{ setDueDate(v);onUpdate(task.id,{dueDate:v||null});if(!v){taskTime.save("");onTimeChange();} };
  const saveTime=(v:string)=>{ taskTime.save(v);onTimeChange(); };
  const savePriority=(p:Priority)=>onUpdate(task.id,{priority:p});
  const handleAddSub=(e:React.FormEvent)=>{ e.preventDefault();if(newSub.trim()){addSubtask(newSub.trim());setNewSub("");} };
  return(
    <div className="flex flex-col h-full bg-background" style={{animation:"slide-right-fade 0.18s ease-out both"}}>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-card/80 glass shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-all"><ChevronLeft className="w-4 h-4"/></button>
        <input value={title} onChange={e=>setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={e=>{if(e.key==="Enter"){saveTitle();(e.target as HTMLInputElement).blur();}}} className="flex-1 min-w-0 bg-transparent text-[15px] font-bold tracking-tight focus:outline-none"/>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={()=>onUpdate(task.id,{completed:!task.completed})} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${task.completed?"bg-emerald-500/12 text-emerald-500":"text-muted-foreground hover:bg-muted hover:text-emerald-500"}`}><Check className="w-4 h-4"/></button>
          <button onClick={()=>{onDelete(task.id);onClose();}} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"><Trash2 className="w-4 h-4"/></button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          <div><label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Priority</label><PriorityPicker value={(task.priority as Priority)||"medium"} onChange={savePriority}/></div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Schedule</label>
            <div className="flex gap-2">
              <div className="relative flex-1"><CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/><input type="date" value={dueDate} onChange={e=>saveDue(e.target.value)} min={todayStr} className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-muted/30 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"/></div>
              <div className={`relative transition-all duration-200 ${dueDate?"opacity-100 w-32":"opacity-40 w-32 pointer-events-none"}`}><Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/><input type="time" value={taskTime.time} onChange={e=>saveTime(e.target.value)} disabled={!dueDate} className="w-full h-9 pl-9 pr-2 rounded-lg border border-input bg-muted/30 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all disabled:cursor-not-allowed"/></div>
              {dueDate&&<button onClick={()=>saveDue("")} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-all shrink-0"><X className="w-3.5 h-3.5"/></button>}
            </div>
            {dueDate&&taskTime.time&&<p className="mt-1.5 text-[11px] text-primary/80 font-semibold flex items-center gap-1"><Clock className="w-3 h-3"/>Scheduled for {format(parseISO(dueDate),"MMM d")} at {fmt12(taskTime.time)}</p>}
          </div>
          <div><label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Notes</label><textarea value={desc} onChange={e=>setDesc(e.target.value)} onBlur={saveDesc} placeholder="Add notes, links, or context…" rows={4} className="w-full px-3.5 py-3 rounded-lg border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 resize-none leading-relaxed placeholder:text-muted-foreground/40 transition-all"/></div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Subtasks{subtasks.items.length>0?` · ${subtasks.doneCount}/${subtasks.items.length}`:""}</label>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {subtasks.items.length>0&&<div className="divide-y divide-border/50">{subtasks.items.map(sub=>(<div key={sub.id} className="flex items-center gap-3 px-3.5 py-2.5 group"><button onClick={()=>subtasks.toggle(sub.id)} className="shrink-0 transition-all hover:scale-110">{sub.done?<CheckCircle2 className="w-4 h-4 text-emerald-500"/>:<Circle className="w-4 h-4 text-muted-foreground/35 hover:text-primary transition-colors"/>}</button><span className={`flex-1 text-sm leading-snug ${sub.done?"line-through text-muted-foreground/45":""}`}>{sub.text}</span><button onClick={()=>subtasks.remove(sub.id)} className="w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"><X className="w-3 h-3"/></button></div>))}</div>}
              <form onSubmit={handleAddSub} className={`flex items-center gap-2 px-3.5 py-2.5 ${subtasks.items.length>0?"border-t border-border/50":""}`}><Plus className="w-3.5 h-3.5 text-muted-foreground/35 shrink-0"/><input value={newSub} onChange={e=>setNewSub(e.target.value)} placeholder="Add a step…" className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/35"/>{newSub.trim()&&<button type="submit" className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">Add</button>}</form>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">Focus Timer · 25 min</label>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-5">
                <div className="relative shrink-0"><TimerRing remaining={isTimerTask?rem:POMODORO}/><div className="absolute inset-0 flex items-center justify-center"><span className={`text-[13px] font-black tabular-nums ${isTimerTask&&timer.running?"text-primary":"text-foreground"}`}>{timer.fmt(isTimerTask?rem:POMODORO)}</span></div></div>
                <div className="flex-1 space-y-2.5">
                  {isTimerTask?(<><p className="text-xs text-muted-foreground">{timer.running?"Focus session running":"Session paused"}</p><div className="flex gap-2"><button onClick={()=>timer.running?timer.pause():timer.resume()} className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-all active:scale-95 ${timer.running?"bg-amber-500/12 text-amber-500 hover:bg-amber-500/18":"bg-primary/12 text-primary hover:bg-primary/18"}`}>{timer.running?<><Pause className="w-3 h-3"/>Pause</>:<><Play className="w-3 h-3"/>Resume</>}</button><button onClick={()=>timer.reset()} className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground transition-all active:scale-95"><RotateCcw className="w-3.5 h-3.5"/></button></div></>):(<><p className="text-xs text-muted-foreground">Start a 25-minute focused session</p><button onClick={()=>timer.start(task.id)} className="w-full flex items-center justify-center gap-2 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-sm shadow-primary/20"><Play className="w-3 h-3"/>Start Focus</button></>)}
                </div>
              </div>
              {isTimerTask&&rem===0&&<div className="mt-3 pt-3 border-t border-border/50 text-center"><p className="text-emerald-500 font-semibold text-sm">Session complete — great work.</p><button onClick={()=>timer.reset()} className="mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Reset</button></div>}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground/45 space-y-0.5 pb-2"><p>Created {format(parseISO(task.createdAt),"MMM d, yyyy 'at' h:mm a")}</p>{task.updatedAt!==task.createdAt&&<p>Updated {format(parseISO(task.updatedAt),"MMM d, yyyy 'at' h:mm a")}</p>}</div>
        </div>
      </ScrollArea>
    </div>
  );
}

function TaskCard({task,isSelected,onSelect,onToggle,onDelete,timer,todayStr,taskTime}:{task:any;isSelected:boolean;taskTime:string;onSelect:()=>void;onToggle:(id:number,c:boolean)=>void;onDelete:(id:number)=>void;timer:ReturnType<typeof useTaskTimer>;todayStr:string;}){
  const p=(task.priority as Priority)||"medium"; const pc=PRIORITY_CFG[p];
  const isOverdue=!task.completed&&task.dueDate&&task.dueDate<todayStr;
  const isDueToday=!task.completed&&task.dueDate&&task.dueDate===todayStr;
  const tomStr=new Date(new Date().setDate(new Date().getDate()+1)).toISOString().split("T")[0];
  const isTomorrow=!task.completed&&task.dueDate&&task.dueDate===tomStr;
  const isTimerActive=timer.taskId===task.id;
  const timeSuffix=taskTime?` · ${fmt12(taskTime)}`:"";
  const dueLabel=(()=>{ if(!task.dueDate)return null; if(isOverdue)return{text:`Overdue · ${format(parseISO(task.dueDate),"MMM d")}${timeSuffix}`,color:"text-rose-500"}; if(isDueToday)return{text:`Today${timeSuffix}`,color:"text-amber-500"}; if(isTomorrow)return{text:`Tomorrow${timeSuffix}`,color:"text-blue-400"}; return{text:`${format(parseISO(task.dueDate),"MMM d")}${timeSuffix}`,color:"text-muted-foreground/65"}; })();
  return(
    <div onClick={onSelect} className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${isSelected?"border-primary/25 bg-primary/5":isOverdue?"border-rose-500/15 bg-rose-500/3 hover:border-rose-500/25":"border-border bg-card hover:border-border/80 hover:bg-muted/15"}`}>
      <button onClick={e=>{e.stopPropagation();onToggle(task.id,task.completed);}} className="shrink-0 transition-all hover:scale-110 active:scale-95">{task.completed?<CheckCircle2 className="w-5 h-5 text-emerald-500"/>:<Circle className={`w-5 h-5 ${pc.color} opacity-35 hover:opacity-100 transition-opacity`}/>}</button>
      <div className="flex-1 min-w-0"><p className={`text-[13px] font-medium leading-snug ${task.completed?"line-through text-muted-foreground/45":"text-foreground"}`}>{task.title}</p><div className="flex items-center gap-2 mt-0.5 flex-wrap">{dueLabel&&<span className={`inline-flex items-center gap-1 text-[11px] font-medium ${dueLabel.color}`}><CalendarDays className="w-3 h-3 shrink-0"/>{dueLabel.text}</span>}{p!=="medium"&&!task.completed&&<span className={`inline-flex items-center gap-1 text-[11px] font-medium ${pc.color} opacity-75`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pc.dot}`}/>{pc.label}</span>}{isTimerActive&&<span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"><Timer className="w-3 h-3"/>{timer.running?"Focusing":"Paused"}</span>}</div></div>
      <div className="flex items-center gap-1 shrink-0"><button onClick={e=>{e.stopPropagation();onDelete(task.id);}} className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all"><Trash2 className="w-3.5 h-3.5"/></button><ChevronRight className={`w-4 h-4 transition-all ${isSelected?"text-primary":"text-border group-hover:text-muted-foreground/50"}`}/></div>
    </div>
  );
}

function AddTaskForm({onCreate}:{onCreate:(d:{title:string;priority:Priority;dueDate?:string;dueTime?:string})=>void}){
  const[open,setOpen]=useState(false); const[title,setTitle]=useState(""); const[priority,setPriority]=useState<Priority>("medium"); const[dueDate,setDueDate]=useState(""); const[dueTime,setDueTime]=useState(""); const inputRef=useRef<HTMLInputElement>(null); const todayStr=new Date().toISOString().split("T")[0];
  const handleSubmit=(e:React.FormEvent)=>{ e.preventDefault();if(!title.trim())return; onCreate({title:title.trim(),priority,...(dueDate?{dueDate}:{}),...(dueDate&&dueTime?{dueTime}:{})}); setTitle("");setDueDate("");setDueTime("");setPriority("medium");setOpen(false); };
  return(
    <div className={`rounded-xl border bg-card transition-all duration-200 ${open?"border-primary/30 shadow-sm shadow-primary/8":"border-border hover:border-border/60"}`}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 px-4 py-3"><div className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center shrink-0"><Plus className="w-2.5 h-2.5 text-muted-foreground/35"/></div><input ref={inputRef} value={title} onChange={e=>setTitle(e.target.value)} onFocus={()=>setOpen(true)} placeholder="Add a task…" className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/35 focus:outline-none"/>{title.trim()&&<button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 shrink-0 shadow-sm shadow-primary/15"><Check className="w-3 h-3"/>Add</button>}</div>
        {open&&(<div className="px-4 py-2.5 border-t border-border/50 bg-muted/15 space-y-2.5">
          <div className="flex items-center gap-2"><Flag className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0"/><div className="flex gap-1.5">{(["high","medium","low"] as Priority[]).map(p=>{ const cfg=PRIORITY_CFG[p]; return(<button key={p} type="button" onClick={()=>setPriority(p)} title={cfg.label} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${priority===p?`${cfg.ring} ${cfg.dot}`:"border-border bg-muted/50 hover:border-muted-foreground/40"}`}>{priority===p&&<Check className="w-2.5 h-2.5 text-white"/>}</button>); })}<span className="text-xs text-muted-foreground self-center ml-1">{PRIORITY_CFG[priority].label}</span></div></div>
          <div className="flex items-center gap-2 flex-wrap"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0"/><input type="date" value={dueDate} onChange={e=>{setDueDate(e.target.value);if(!e.target.value)setDueTime("");}} min={todayStr} className="h-7 text-xs bg-transparent focus:outline-none text-muted-foreground w-28"/>{dueDate&&<><Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0"/><input type="time" value={dueTime} onChange={e=>setDueTime(e.target.value)} className="h-7 text-xs bg-transparent focus:outline-none text-muted-foreground w-20"/></>}<button type="button" onClick={()=>{setOpen(false);setTitle("");}} className="ml-auto text-muted-foreground/40 hover:text-foreground transition-colors"><X className="w-3.5 h-3.5"/></button></div>
        </div>)}
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TASKS TAB
   ══════════════════════════════════════════════════════════ */
const FILTERS:[Filter,string][] = [["all","All"],["today","Today"],["upcoming","Upcoming"],["high","Priority"]];

function TasksTab(){
  const isMobile=useIsMobile(); const queryClient=useQueryClient();
  const[filter,setFilter]=useState<Filter>("all"); const[selectedId,setSelectedId]=useState<number|null>(null);
  const timer=useTaskTimer(); const[timesVersion,setTimesVersion]=useState(0);
  const{data:tasks,isLoading}=useListTasks({filter:(filter==="high"?"all":filter) as any});
  const{mutate:createTask}=useCreateTask(); const{mutate:updateTask}=useUpdateTask(); const{mutate:deleteTask}=useDeleteTask();
  const todayStr=new Date().toISOString().split("T")[0];
  const filtered=(()=>{ if(!tasks)return[]; if(filter==="high")return tasks.filter(t=>!t.completed&&t.priority==="high"); return tasks; })();
  const pending=filtered.filter(t=>!t.completed); const done=filtered.filter(t=>t.completed);
  const overdueCount=pending.filter(t=>t.dueDate&&t.dueDate<todayStr).length;
  const selected=tasks?.find(t=>t.id===selectedId)??null;
  const inv=()=>queryClient.invalidateQueries({queryKey:getListTasksQueryKey()});
  const handleCreate=(data:{title:string;priority:Priority;dueDate?:string;dueTime?:string})=>{
    const{dueTime,...taskData}=data;
    createTask({data:taskData},{onSuccess:(t:any)=>{ if(dueTime&&t?.id)saveTaskTime(t.id,dueTime); inv(); }});
  };
  const handleToggle=(id:number,c:boolean)=>updateTask({id,data:{completed:!c}},{onSuccess:inv});
  const handleUpdate=(id:number,data:any)=>updateTask({id,data},{onSuccess:inv});
  const handleDelete=(id:number)=>{ if(selectedId===id)setSelectedId(null); deleteTask({id},{onSuccess:inv}); };

  const ListPane=()=>(
    <div className="h-full flex flex-col">
      <div className="px-5 sm:px-6 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-0.5">
          <h2 className="text-xl font-bold tracking-tight">All Tasks</h2>
          {timer.taskId&&<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold"><Timer className="w-3 h-3"/><span className="tabular-nums">{timer.fmt(timer.getRem())}</span></div>}
        </div>
        <p className="text-[12px] text-muted-foreground">{pending.length} pending{overdueCount>0&&<span className="text-rose-500 font-medium"> · {overdueCount} overdue</span>}{done.length>0&&<span className="text-muted-foreground/50"> · {done.length} done</span>}</p>
        <div className="flex gap-1.5 mt-3">{FILTERS.map(([v,l])=>(<button key={v} onClick={()=>setFilter(v)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 ${filter===v?v==="high"?"bg-rose-500 text-white shadow-sm shadow-rose-500/20":"bg-primary text-primary-foreground shadow-sm shadow-primary/20":"bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"}`}>{l}</button>))}</div>
      </div>
      <ScrollArea className="flex-1 px-5 sm:px-6">
        <div className="pb-8 space-y-2">
          <AddTaskForm onCreate={handleCreate}/>
          {isLoading?(<div className="space-y-2 mt-2">{[...Array(4)].map((_,i)=><div key={i} className="h-14 rounded-xl shimmer" style={{animationDelay:`${i*70}ms`}}/>)}</div>):!filtered.length?(<div className="flex flex-col items-center justify-center py-20"><div className="w-14 h-14 rounded-2xl bg-emerald-500/8 flex items-center justify-center mb-4"><CheckSquare className="w-6 h-6 text-emerald-500/60"/></div><p className="font-semibold text-sm text-muted-foreground">{filter==="today"?"Nothing due today":filter==="upcoming"?"Nothing coming up":filter==="high"?"No high priority tasks":"All caught up"}</p><p className="text-xs mt-1 text-muted-foreground/50">Add a task above to get started</p></div>):(
            <div className="space-y-1.5 mt-1">
              {pending.length>0&&<><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 py-1">Pending · {pending.length}</p>{pending.map(task=>(<TaskCard key={`${task.id}-${timesVersion}`} task={task} isSelected={selectedId===task.id} onSelect={()=>setSelectedId(selectedId===task.id?null:task.id)} onToggle={handleToggle} onDelete={handleDelete} timer={timer} todayStr={todayStr} taskTime={getTaskTime(task.id)}/>))}</>}
              {done.length>0&&<><div className="flex items-center gap-2 pt-3 pb-1"><div className="h-px flex-1 bg-border/40"/><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/35 px-2">Completed · {done.length}</span><div className="h-px flex-1 bg-border/40"/></div><div className="space-y-1 opacity-55">{done.map(task=>(<TaskCard key={`${task.id}-${timesVersion}`} task={task} isSelected={selectedId===task.id} onSelect={()=>setSelectedId(selectedId===task.id?null:task.id)} onToggle={handleToggle} onDelete={handleDelete} timer={timer} todayStr={todayStr} taskTime={getTaskTime(task.id)}/>))}</div></>}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  if(isMobile){ return selected?<TaskDetail task={selected} onClose={()=>setSelectedId(null)} onUpdate={handleUpdate} onDelete={handleDelete} timer={timer} onTimeChange={()=>setTimesVersion(v=>v+1)}/>:<ListPane/>; }
  return(
    <div className="flex h-full overflow-hidden">
      <div className={`transition-all duration-300 ${selected?"w-[55%] min-w-[320px]":"w-full"} border-r border-border overflow-hidden`}><ListPane/></div>
      {selected&&<div className="flex-1 min-w-0 overflow-hidden"><TaskDetail task={selected} onClose={()=>setSelectedId(null)} onUpdate={handleUpdate} onDelete={handleDelete} timer={timer} onTimeChange={()=>setTimesVersion(v=>v+1)}/></div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   OVERVIEW COMPONENTS
   ══════════════════════════════════════════════════════════ */
function FlipDigit({val}:{val:string}){
  return(<div className="flex flex-col items-center justify-center w-14 h-16 rounded-xl bg-card border border-border shadow-md"><span className="text-3xl font-black tabular-nums tracking-tight leading-none text-foreground">{val}</span></div>);
}
function LiveClock(){
  const now=useClock(); const hh=String(now.getHours()).padStart(2,"0"); const mm=String(now.getMinutes()).padStart(2,"0"); const ss=String(now.getSeconds()).padStart(2,"0"); const ampm=now.getHours()>=12?"PM":"AM";
  return(<div className="flex flex-col gap-2"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Clock</p><div className="flex items-center gap-1.5"><FlipDigit val={hh}/><span className="text-2xl font-black text-muted-foreground/50 pb-0.5">:</span><FlipDigit val={mm}/><span className="text-2xl font-black text-muted-foreground/50 pb-0.5">:</span><FlipDigit val={ss}/><span className="ml-1 text-sm font-bold text-muted-foreground self-end pb-1">{ampm}</span></div><p className="text-xs text-muted-foreground/60">{format(now,"EEEE, MMMM d, yyyy")}</p></div>);
}

function TodaysFocus(){
  const today=new Date().toISOString().split("T")[0]; const key=focusKey(today);
  const[items,setItems]=useState<FocusItem[]>(()=>ls(key,[])); const[input,setInput]=useState(""); const inputRef=useRef<HTMLInputElement>(null);
  const save=(nx:FocusItem[])=>{ setItems(nx);lsSet(key,nx); };
  const add=(e:React.FormEvent)=>{ e.preventDefault();if(!input.trim())return; save([...items,{id:crypto.randomUUID(),text:input.trim(),done:false}]);setInput("");inputRef.current?.focus(); };
  const toggle=(id:string)=>save(items.map(f=>f.id===id?{...f,done:!f.done}:f));
  const remove=(id:string)=>save(items.filter(f=>f.id!==id));
  return(
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today's Focus</p>{items.length>0&&<span className="text-[10px] font-semibold text-muted-foreground/60">{items.filter(f=>f.done).length}/{items.length}</span>}</div>
      <div className="flex-1 space-y-1 min-h-0">{items.length===0&&<p className="text-xs text-muted-foreground/40 italic py-1">What are you focusing on today?</p>}{items.map(item=>(<div key={item.id} className="flex items-center gap-2.5 group"><button onClick={()=>toggle(item.id)} className="shrink-0 hover:scale-110 transition-transform">{item.done?<CheckCircle2 className="w-4 h-4 text-emerald-500"/>:<Circle className="w-4 h-4 text-muted-foreground/30 hover:text-primary transition-colors"/>}</button><span className={`flex-1 text-sm leading-snug ${item.done?"line-through text-muted-foreground/40":""}`}>{item.text}</span><button onClick={()=>remove(item.id)} className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all"><X className="w-3 h-3"/></button></div>))}</div>
      <form onSubmit={add} className="flex items-center gap-2 pt-1 border-t border-border/40"><Plus className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0"/><input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} placeholder="Add focus item…" className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/30"/>{input.trim()&&<button type="submit" className="text-[11px] font-semibold text-primary">Add</button>}</form>
    </div>
  );
}

function MissionSection(){
  const[goals,setGoals]=useState<Goal[]>(()=>ls(GOALS_KEY,[])); const[input,setInput]=useState(""); const[editing,setEditing]=useState<string|null>(null); const[editText,setEditText]=useState("");
  const save=(nx:Goal[])=>{ setGoals(nx);lsSet(GOALS_KEY,nx); };
  const add=(e:React.FormEvent)=>{ e.preventDefault();if(!input.trim())return; save([...goals,{id:crypto.randomUUID(),text:input.trim()}]);setInput(""); };
  const commitEdit=()=>{ if(editing)save(goals.map(g=>g.id===editing?{...g,text:editText.trim()||g.text}:g));setEditing(null); };
  return(
    <div>
      <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-primary"/><h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">The Mission</h2></div>
      {goals.length===0?<p className="text-xs text-muted-foreground/40 italic mb-3">Define what matters — add your goals below</p>:<div className="flex flex-wrap gap-2 mb-3">{goals.map(g=>(<div key={g.id} className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:border-primary/25 transition-all">{editing===g.id?<input value={editText} onChange={e=>setEditText(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")setEditing(null);}} autoFocus className="text-xs bg-transparent focus:outline-none min-w-[80px]"/>:<span className="text-xs font-medium">{g.text}</span>}<div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={()=>{setEditing(g.id);setEditText(g.text);}} className="w-4 h-4 flex items-center justify-center text-muted-foreground/50 hover:text-primary"><Pencil className="w-2.5 h-2.5"/></button><button onClick={()=>save(goals.filter(x=>x.id!==g.id))} className="w-4 h-4 flex items-center justify-center text-muted-foreground/50 hover:text-destructive"><X className="w-2.5 h-2.5"/></button></div></div>))}</div>}
      <form onSubmit={add} className="flex items-center gap-2"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Add a mission goal…" className="flex-1 h-8 px-3 rounded-lg border border-border bg-muted/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-muted-foreground/35 transition-all"/>{input.trim()&&<button type="submit" className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95">Add</button>}</form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   AI WEEKLY REVIEW
   ══════════════════════════════════════════════════════════ */
function WeeklyReview(){
  const{data:allTasks}=useListTasks({});
  const[review,setReview]=useState<string>(()=>ls("argus_weekly_review",""));
  const[savedAt,setSavedAt]=useState<string>(()=>ls("argus_weekly_review_date",""));
  const[loading,setLoading]=useState(false);

  const generateReview=async()=>{
    setLoading(true); setReview("");
    const today=new Date(); const weekAgo=new Date(today); weekAgo.setDate(weekAgo.getDate()-7);
    const weekAgoStr=weekAgo.toISOString().split("T")[0];
    const recentDone=(allTasks??[]).filter(t=>t.completed).length;
    const total=(allTasks??[]).length;
    const habits:Habit[]=ls(HABITS_KEY,[]);
    const days=Array.from({length:7},(_,i)=>{ const d=new Date();d.setDate(d.getDate()-i);return d.toISOString().split("T")[0]; });
    const habitLines=habits.map(h=>{ const done=days.filter(d=>h.completions[d]).length; return`${h.emoji} ${h.name}: ${done}/7 days`; }).join(", ")||"No habits tracked";
    const focusKey2=`argus_focus_${today.toISOString().split("T")[0]}`;
    const focus:FocusItem[]=ls(focusKey2,[]);
    const focusDone=focus.filter(f=>f.done).length;
    const goals:Goal[]=ls(GOALS_KEY,[]);
    const context=`Tasks completed: ${recentDone} out of ${total} total\nHabits this week: ${habitLines}\nFocus items today: ${focusDone}/${focus.length} done\nActive goals: ${goals.map(g=>g.text).join(", ")||"None set"}`;
    try{
      const res=await fetch(`${BASE}/api/tracker/review`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context})});
      const reader=res.body!.getReader(); const decoder=new TextDecoder(); let buf=""; let full="";
      while(true){ const{done,value}=await reader.read(); if(done)break; buf+=decoder.decode(value,{stream:true}); const lines=buf.split("\n"); buf=lines.pop()??""; for(const line of lines){ if(line.startsWith("data: ")){ try{ const d=JSON.parse(line.slice(6)); if(d.content){full+=d.content;setReview(r=>r+d.content);} if(d.done)break; }catch{} } } }
      lsSet("argus_weekly_review",full); lsSet("argus_weekly_review_date",new Date().toLocaleDateString()); setSavedAt(new Date().toLocaleDateString());
    }catch{ setReview("Failed to generate review. Please try again."); }
    setLoading(false);
  };

  return(
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary"/><h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Weekly Review</h2>{savedAt&&<span className="text-[10px] text-muted-foreground/40">· {savedAt}</span>}</div>
        <button onClick={generateReview} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/18 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
          {loading?<><span className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin shrink-0"/>Generating…</>:<><Sparkles className="w-3 h-3"/>Generate</>}
        </button>
      </div>
      {review?(
        <p className="text-sm text-foreground/90 leading-relaxed">{review}</p>
      ):(
        <p className="text-sm text-muted-foreground/50 italic">Click Generate to get an AI-powered weekly productivity review based on your tasks, habits, and focus items.</p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HABITS TAB
   ══════════════════════════════════════════════════════════ */
function getDates(n:number):string[]{ return Array.from({length:n},(_,i)=>{ const d=new Date();d.setDate(d.getDate()-(n-1-i));return d.toISOString().split("T")[0]; }); }
function habitShouldRun(h:Habit,d:string):boolean{ if(h.frequency==="daily")return true; const day=new Date(d+"T12:00:00").getDay(); if(h.frequency==="weekdays")return day>=1&&day<=5; if(h.frequency==="weekly")return day===1; return true; }
function getStreak(h:Habit):number{ let s=0; const today=new Date().toISOString().split("T")[0]; const c=new Date(); for(let i=0;i<365;i++){ const d=c.toISOString().split("T")[0]; if(!habitShouldRun(h,d)){c.setDate(c.getDate()-1);continue;} if(d===today&&!h.completions[d]){c.setDate(c.getDate()-1);continue;} if(h.completions[d]){s++;c.setDate(c.getDate()-1);}else break; } return s; }

function HabitsTab(){
  const[habits,setHabits]=useState<Habit[]>(()=>ls(HABITS_KEY,[]));
  const[adding,setAdding]=useState(false); const[newName,setNewName]=useState(""); const[newEmoji,setNewEmoji]=useState("🏃"); const[newFreq,setNewFreq]=useState<Habit["frequency"]>("daily");
  const today=new Date().toISOString().split("T")[0]; const days=getDates(7);
  const save=(nx:Habit[])=>{ setHabits(nx);lsSet(HABITS_KEY,nx); };
  const toggle=(hid:string,date:string)=>save(habits.map(h=>{ if(h.id!==hid)return h; const c={...h.completions}; if(c[date]){delete c[date];}else{c[date]=true;} return{...h,completions:c}; }));
  const addHabit=(e:React.FormEvent)=>{ e.preventDefault();if(!newName.trim())return; save([...habits,{id:crypto.randomUUID(),name:newName.trim(),emoji:newEmoji,frequency:newFreq,completions:{}}]); setNewName("");setNewEmoji("🏃");setNewFreq("daily");setAdding(false); };

  const total=habits.length; const completedToday=habits.filter(h=>h.completions[today]&&habitShouldRun(h,today)).length;
  const applicableToday=habits.filter(h=>habitShouldRun(h,today)).length;

  return(
    <ScrollArea className="h-full">
      <div className="px-6 py-6 pb-12 space-y-6">
        {/* Stats strip */}
        {total>0&&(
          <div className="grid grid-cols-3 gap-3">
            {[{label:"Tracked",val:total,color:"text-foreground"},{label:"Done Today",val:`${completedToday}/${applicableToday}`,color:"text-emerald-500"},{label:"Best Streak",val:habits.length?Math.max(...habits.map(getStreak)):0,color:"text-orange-400"}].map(s=>(<div key={s.label} className="surface p-4 text-center"><p className={`text-2xl font-black ${s.color}`}>{s.val}</p><p className="text-[11px] text-muted-foreground font-medium mt-0.5">{s.label}</p></div>))}
          </div>
        )}

        {/* Habits grid */}
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2"><Repeat2 className="w-4 h-4 text-emerald-500"/><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Habit Tracker</span></div>
            <button onClick={()=>setAdding(a=>!a)} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"><Plus className="w-3 h-3"/>New habit</button>
          </div>

          {adding&&(
            <form onSubmit={addHabit} className="p-4 border-b border-border space-y-2.5 bg-muted/20" style={{animation:"slide-down-fade 0.15s ease-out both"}}>
              <div className="flex items-center gap-2">
                <div className="relative group/emoji"><button type="button" className="w-9 h-9 rounded-lg border border-border bg-muted flex items-center justify-center text-lg hover:border-primary/30 transition-all">{newEmoji}</button><div className="absolute top-full left-0 mt-1 z-20 flex flex-wrap gap-1 p-2 rounded-xl border border-border bg-popover shadow-xl w-52 opacity-0 pointer-events-none group-hover/emoji:opacity-100 group-hover/emoji:pointer-events-auto transition-all">{HABIT_EMOJIS.map(e=>(<button key={e} type="button" onClick={()=>setNewEmoji(e)} className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all hover:bg-muted ${newEmoji===e?"bg-primary/10":""}`}>{e}</button>))}</div></div>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Habit name…" autoFocus className="flex-1 h-9 px-3 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-muted-foreground/35 transition-all"/>
              </div>
              <div className="flex items-center gap-2"><select value={newFreq} onChange={e=>setNewFreq(e.target.value as Habit["frequency"])} className="h-8 px-2 rounded-lg border border-border bg-muted/30 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 flex-1"><option value="daily">Daily</option><option value="weekdays">Weekdays only</option><option value="weekly">Weekly (Mon)</option></select><button type="submit" className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95">Create</button><button type="button" onClick={()=>setAdding(false)} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button></div>
            </form>
          )}

          {habits.length===0?(<div className="py-16 text-center"><p className="text-2xl mb-3">🌱</p><p className="text-sm font-semibold text-muted-foreground">No habits yet</p><p className="text-xs text-muted-foreground/50 mt-1">Click "New habit" to start building your streak</p></div>):(
            <div>
              {/* Column labels */}
              <div className="flex items-center gap-2 px-5 py-2 border-b border-border/40 bg-muted/10">
                <div className="flex-1"/>
                <div className="flex gap-1">{days.map(d=>{ const isT=d===today; return(<div key={d} className={`w-8 text-center text-[10px] font-bold ${isT?"text-primary":"text-muted-foreground/40"}`}>{new Date(d+"T12:00:00").toLocaleDateString("en",{weekday:"short"}).slice(0,1)}</div>); })}</div>
                <div className="w-16 text-right text-[10px] font-bold text-muted-foreground/40 pr-1">Streak</div>
              </div>
              {habits.map((h,i)=>{ const streak=getStreak(h); return(<div key={h.id} className={`group flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors ${i<habits.length-1?"border-b border-border/30":""}`}><span className="text-xl shrink-0">{h.emoji}</span><div className="flex-1 min-w-0"><p className="text-[13px] font-medium leading-tight truncate">{h.name}</p><p className="text-[10px] text-muted-foreground/50">{FREQ_LABELS[h.frequency]}</p></div><div className="flex gap-1 shrink-0">{days.map(d=>{ const ok=habitShouldRun(h,d); const done=!!h.completions[d]; const isT=d===today; return(<button key={d} onClick={()=>ok&&toggle(h.id,d)} disabled={!ok} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${!ok?"opacity-15 cursor-default":done?"bg-emerald-500 shadow-sm shadow-emerald-500/25 hover:bg-emerald-400 active:scale-95":isT?"border-2 border-border hover:border-primary/40 hover:bg-muted/50 active:scale-95":"border border-border/40 opacity-40"}`} title={d}>{done&&<Check className="w-3.5 h-3.5 text-white"/>}</button>); })}</div><div className="w-16 flex items-center justify-end gap-1 shrink-0">{streak>0&&<Flame className="w-3 h-3 text-orange-400"/>}<span className={`text-xs font-bold tabular-nums ${streak>0?"text-orange-400":"text-muted-foreground/30"}`}>{streak>0?streak:"—"}</span><button onClick={()=>save(habits.filter(x=>x.id!==h.id))} className="opacity-0 group-hover:opacity-100 ml-1 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all"><X className="w-3 h-3"/></button></div></div>); })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

/* ══════════════════════════════════════════════════════════
   OVERVIEW TAB
   ══════════════════════════════════════════════════════════ */
function OverviewTab({onSwitchToTasks}:{onSwitchToTasks:()=>void}){
  const now=useClock();
  const greeting=(()=>{ const h=now.getHours(); if(h<12)return"Good morning"; if(h<17)return"Good afternoon"; return"Good evening"; })();
  const{data:tasks}=useListTasks({});
  const todayStr=new Date().toISOString().split("T")[0];
  const todayTasks=(tasks??[]).filter(t=>t.dueDate===todayStr);
  const todayPending=todayTasks.filter(t=>!t.completed);
  const queryClient=useQueryClient();

  const toggle=async(task:any)=>{
    const res=await fetch(`${BASE}/api/tasks/${task.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({completed:!task.completed})});
    if(res.ok)queryClient.invalidateQueries({queryKey:getListTasksQueryKey()});
  };

  return(
    <ScrollArea className="h-full">
      <div className="pb-12">
        {/* Banner */}
        <div className="relative w-full h-44 overflow-hidden">
          <img src="/tracker-banner.jpg" alt="Banner" className="w-full h-full object-cover object-center" style={{imageRendering:"pixelated"}}/>
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-background"/>
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent"/>
        </div>

        {/* Header */}
        <div className="px-6 -mt-2 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-3xl -mt-1 shrink-0">📋</span>
            <div><h1 className="text-2xl font-black tracking-tight leading-tight">Habit &amp; Goal Tracker</h1><p className="text-sm text-muted-foreground mt-0.5">{greeting} · {format(now,"EEEE, MMMM d")}</p></div>
          </div>
        </div>

        <div className="px-6 space-y-5">
          {/* Clock + Focus */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="surface p-5"><LiveClock/></div>
            <div className="surface p-5"><TodaysFocus/></div>
          </div>

          {/* Mission */}
          <div className="surface p-5"><MissionSection/></div>

          {/* Today's tasks preview */}
          <div className="surface p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary"/><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today's Tasks</span><span className="text-[10px] text-muted-foreground/50">{todayTasks.filter(t=>t.completed).length}/{todayTasks.length} done</span></div>
              <button onClick={onSwitchToTasks} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">View all →</button>
            </div>
            {todayTasks.length===0?<p className="text-xs text-muted-foreground/40 italic py-2">No tasks scheduled today — <button onClick={onSwitchToTasks} className="text-primary underline-offset-2 hover:underline">add one</button></p>:(
              <div className="space-y-1">
                {todayPending.slice(0,4).map(t=>(<div key={t.id} className="flex items-center gap-2.5 group px-1 py-1.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={()=>toggle(t)}><Circle className="w-4 h-4 text-muted-foreground/30 hover:text-primary transition-colors shrink-0"/><span className="flex-1 text-[13px] leading-snug">{t.title}</span>{t.priority==="high"&&<span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"/>}</div>))}
                {todayTasks.filter(t=>t.completed).slice(0,2).map(t=>(<div key={t.id} className="flex items-center gap-2.5 px-1 py-1.5 opacity-45"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0"/><span className="flex-1 text-[13px] leading-snug line-through text-muted-foreground/60">{t.title}</span></div>))}
                {todayTasks.length>6&&<p className="text-[11px] text-muted-foreground/50 pl-1 pt-1">+{todayTasks.length-6} more — <button onClick={onSwitchToTasks} className="text-primary">view all</button></p>}
              </div>
            )}
          </div>

          {/* AI Weekly Review */}
          <WeeklyReview/>

          {/* Quick Actions */}
          <div className="surface p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {[{label:"All Tasks",onClick:onSwitchToTasks,emoji:"✅",color:"bg-emerald-500/8 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/14"},{label:"New Chat",href:"/chat",emoji:"💬",color:"bg-violet-500/8 text-violet-600 border-violet-500/20 hover:bg-violet-500/14"},{label:"Research",href:"/research",emoji:"🔬",color:"bg-orange-500/8 text-orange-600 border-orange-500/20 hover:bg-orange-500/14"},{label:"Write Post",href:"/posts",emoji:"✍️",color:"bg-pink-500/8 text-pink-600 border-pink-500/20 hover:bg-pink-500/14"}].map(a=>(
                a.onClick
                  ? <button key={a.label} onClick={a.onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${a.color}`}><span className="text-base">{a.emoji}</span>{a.label}</button>
                  : <a key={a.label} href={a.href!} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${a.color}`}><span className="text-base">{a.emoji}</span>{a.label}</a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN — TAB SHELL
   ══════════════════════════════════════════════════════════ */
const TABS:[Tab,string,React.ReactNode][]=[
  ["overview","Overview",<LayoutDashboard className="w-3.5 h-3.5"/>],
  ["tasks","Tasks",<CheckSquare className="w-3.5 h-3.5"/>],
  ["habits","Habits",<BarChart2 className="w-3.5 h-3.5"/>],
];

export default function Tracker(){
  const[tab,setTab]=useState<Tab>("overview");

  const TabBar=()=>(
    <div className="flex items-center gap-1 px-5 py-2.5 border-b border-border bg-card/60 glass shrink-0">
      {TABS.map(([v,l,icon])=>(<button key={v} onClick={()=>setTab(v)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${tab===v?"bg-primary/10 text-primary":"text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>{icon}{l}</button>))}
    </div>
  );

  /* Tasks tab needs its own h-full non-scrollable layout */
  if(tab==="tasks"){
    return(
      <div className="h-full flex flex-col bg-background">
        <TabBar/>
        <div className="flex-1 min-h-0 overflow-hidden"><TasksTab/></div>
      </div>
    );
  }

  /* Overview + Habits are scrollable */
  return(
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {tab==="habits"&&<TabBar/>}
      {tab==="overview"&&(
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {/* Tab bar floats over the banner with glass */}
          <div className="absolute top-0 left-0 right-0 z-10">
            <TabBar/>
          </div>
          <div className="h-full pt-[49px]">
            <OverviewTab onSwitchToTasks={()=>setTab("tasks")}/>
          </div>
        </div>
      )}
      {tab==="habits"&&<div className="flex-1 min-h-0 overflow-hidden"><HabitsTab/></div>}
    </div>
  );
}
