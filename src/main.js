import { createClient } from '@supabase/supabase-js';
import './style.css';

const $ = (s) => document.querySelector(s);
const root = $('#app');
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
let supabase = null, user = null, profile = null, matches = [], predictions = [], profiles = [];
let tab = 'matches';

const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = d => new Date(d).toLocaleString('ar', {dateStyle:'medium', timeStyle:'short'});
const msg = (text, bad=false) => { const el=$('#notice'); if(el){el.textContent=text;el.className=bad?'notice bad':'notice';} };

function renderSetup() {
  root.innerHTML = `<main class="center"><section class="panel narrow">
    <div class="logo">⚽</div><h1>تحدّي التوقعات</h1>
    <p class="muted">إعداد الاتصال بقاعدة البيانات</p>
    <p>لم يتم العثور على بيانات Supabase. أضف متغيري البيئة في GitHub Actions كما هو موضح في ملف <b>README_AR.md</b>.</p>
  </section></main>`;
}

function renderAuth() {
  root.innerHTML = `<main class="center"><section class="panel narrow">
    <div class="logo">⚽</div><h1>تحدّي التوقعات</h1><p class="muted">تنافس مع أصدقائك واجمع النقاط</p>
    <div class="field"><label>البريد الإلكتروني</label><input id="email" type="email" placeholder="name@example.com"></div>
    <div class="field"><label>كلمة المرور</label><input id="password" type="password" placeholder="6 أحرف على الأقل"></div>
    <div class="actions"><button id="login">تسجيل الدخول</button><button class="secondary" id="signup">إنشاء حساب</button></div>
    <p id="notice" class="notice"></p>
  </section></main>`;
  $('#login').onclick = async()=>{const {error}=await supabase.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value}); if(error)msg(error.message,true);else await boot();};
  $('#signup').onclick = async()=>{const {error}=await supabase.auth.signUp({email:$('#email').value.trim(),password:$('#password').value}); if(error)msg(error.message,true);else msg('تم إنشاء الحساب. إذا كان تأكيد البريد مفعّلًا، افتح رسالة التأكيد ثم سجّل الدخول.');};
}

function shell() {
  root.innerHTML = `<div class="app">
    <header><div><div class="brand">⚽ تحدّي التوقعات</div><small id="welcome"></small></div><button class="secondary small" id="logout">خروج</button></header>
    <nav><button data-tab="matches" class="active">المباريات</button><button data-tab="ranking">الترتيب</button><button data-tab="history">توقعاتي</button>${profile?.role==='admin'?'<button data-tab="admin">الإدارة</button>':''}</nav>
    <div id="notice" class="notice"></div><section id="content"></section>
  </div>`;
  $('#welcome').textContent = user.email;
  $('#logout').onclick=async()=>{await supabase.auth.signOut();user=null;renderAuth();};
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;root.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));renderTab();});
  renderTab();
}
async function loadData(){
  const [m,p,pr]=await Promise.all([
    supabase.from('matches').select('*').order('kickoff',{ascending:true}),
    supabase.from('predictions').select('*'),
    supabase.from('profiles').select('id,display_name,role')
  ]);
  if(m.error||p.error||pr.error) throw (m.error||p.error||pr.error);
  matches=m.data||[];predictions=p.data||[];profiles=pr.data||[];
  profile=profiles.find(x=>x.id===user.id)||{id:user.id,display_name:user.email,role:'user'};
}
function pointsFor(pred, match){
  if(match.status!=='finished'||match.home_score===null||match.away_score===null)return 0;
  let pts=0, exact=pred.home_score===match.home_score&&pred.away_score===match.away_score;
  const actual= Math.sign(match.home_score-match.away_score), guessed=Math.sign(pred.home_score-pred.away_score);
  if(exact) pts+=5; else if(actual===guessed) pts+=3;
  if(pred.home_score===match.home_score)pts+=1;
  if(pred.away_score===match.away_score)pts+=1;
  if((pred.home_score-pred.away_score)===(match.home_score-match.away_score))pts+=2;
  return pts;
}
function renderTab(){
  const c=$('#content'); if(!c)return;
  if(tab==='matches'){
    const upcoming=matches.filter(m=>m.status!=='finished');
    c.innerHTML=`<h2>المباريات</h2>${upcoming.length?upcoming.map(m=>{
      const pred=predictions.find(p=>p.match_id===m.id&&p.user_id===user.id);
      const locked=new Date(m.kickoff)<=new Date()||m.status==='closed';
      return `<article class="match"><div class="league">${esc(m.competition||'مباراة')}</div><div class="teams"><div><b>${esc(m.home_team)}</b><small>صاحب الأرض</small></div><span class="vs">VS</span><div><b>${esc(m.away_team)}</b><small>الضيف</small></div></div><div class="muted centertext">${dateText(m.kickoff)}</div>
      ${locked?'<p class="muted centertext">التوقعات مغلقة</p>':`<div class="predict"><label>توقعك</label><input type="number" min="0" max="20" id="h-${m.id}" value="${pred?.home_score??''}" placeholder="0"><span>—</span><input type="number" min="0" max="20" id="a-${m.id}" value="${pred?.away_score??''}" placeholder="0"><button data-predict="${m.id}">${pred?'تعديل التوقع':'إرسال التوقع'}</button></div>`}
      ${pred?`<p class="muted centertext">توقعك الحالي: ${pred.home_score} - ${pred.away_score}</p>`:''}</article>`;
    }).join(''):'<p class="empty">لا توجد مباريات قادمة حاليًا.</p>'}
    <h2>المباريات المنتهية</h2>${matches.filter(m=>m.status==='finished').map(m=>`<article class="match compact"><b>${esc(m.home_team)} ${m.home_score} - ${m.away_score} ${esc(m.away_team)}</b><small>${esc(m.competition||'')}</small></article>`).join('')}`;
    c.querySelectorAll('[data-predict]').forEach(b=>b.onclick=()=>savePrediction(b.dataset.predict));
  } else if(tab==='ranking'){
    const rows=profiles.map(p=>({p,score:predictions.filter(x=>x.user_id===p.id).reduce((s,x)=>s+pointsFor(x,matches.find(m=>m.id===x.match_id)||{}),0)})).sort((a,b)=>b.score-a.score);
    c.innerHTML=`<h2>ترتيب الأصدقاء</h2><div class="table">${rows.map((r,i)=>`<div class="rank"><b>${i===0?'🏆':i+1}</b><span>${esc(r.p.display_name||'لاعب')}</span><strong>${r.score} نقطة</strong></div>`).join('')||'<p class="empty">لا يوجد لاعبون بعد.</p>'}</div>`;
  } else if(tab==='history'){
    const mine=predictions.filter(p=>p.user_id===user.id);
    c.innerHTML=`<h2>توقعاتي</h2>${mine.map(p=>{const m=matches.find(x=>x.id===p.match_id);return m?`<article class="match compact"><b>${esc(m.home_team)} ${p.home_score} - ${p.away_score} ${esc(m.away_team)}</b><span class="points">${pointsFor(p,m)} نقطة</span></article>`:''}).join('')||'<p class="empty">لم ترسل أي توقع بعد.</p>'}`;
  } else if(tab==='admin') renderAdmin(c);
}
async function savePrediction(id){
  const h=Number($(`#h-${id}`).value),a=Number($(`#a-${id}`).value);
  if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0||h>20||a>20){msg('أدخل نتيجتين صحيحتين من 0 إلى 20.',true);return;}
  const {error}=await supabase.from('predictions').upsert({match_id:id,user_id:user.id,home_score:h,away_score:a},{onConflict:'match_id,user_id'});
  if(error)msg(error.message,true);else{msg('تم حفظ توقعك بنجاح.');await loadData();renderTab();}
}
function renderAdmin(c){
  c.innerHTML=`<h2>لوحة المدير</h2><article class="panel"><h3>إضافة مباراة</h3>
  <div class="grid"><input id="home" placeholder="الفريق الأول"><input id="away" placeholder="الفريق الثاني"><input id="competition" placeholder="البطولة"><input id="kickoff" type="datetime-local"></div><button id="addMatch">إضافة المباراة</button></article>
  <h3>إدارة النتائج</h3>${matches.map(m=>`<article class="match compact"><b>${esc(m.home_team)} × ${esc(m.away_team)}</b><small>${dateText(m.kickoff)} — ${esc(m.status)}</small><div class="predict"><input type="number" id="rh-${m.id}" placeholder="أهداف الأول" value="${m.home_score??''}"><span>—</span><input type="number" id="ra-${m.id}" placeholder="أهداف الثاني" value="${m.away_score??''}"><button data-result="${m.id}">اعتماد النتيجة وإنهاء</button></div><button class="secondary small" data-close="${m.id}">إغلاق التوقعات</button></article>`).join('')}`;
  $('#addMatch').onclick=async()=>{
    const row={home_team:$('#home').value.trim(),away_team:$('#away').value.trim(),competition:$('#competition').value.trim(),kickoff:new Date($('#kickoff').value).toISOString(),created_by:user.id,status:'open'};
    if(!row.home_team||!row.away_team||!$('#kickoff').value){msg('أكمل أسماء الفريقين وموعد المباراة.',true);return;}
    const {error}=await supabase.from('matches').insert(row);if(error)msg(error.message,true);else{msg('تمت إضافة المباراة.');await loadData();renderTab();}
  };
  c.querySelectorAll('[data-result]').forEach(b=>b.onclick=async()=>{const id=b.dataset.result;const {error}=await supabase.from('matches').update({home_score:Number($(`#rh-${id}`).value),away_score:Number($(`#ra-${id}`).value),status:'finished'}).eq('id',id);if(error)msg(error.message,true);else{await loadData();renderTab();msg('تم اعتماد النتيجة واحتساب النقاط في لوحة الترتيب.');}});
  c.querySelectorAll('[data-close]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('matches').update({status:'closed'}).eq('id',b.dataset.close);if(error)msg(error.message,true);else{await loadData();renderTab();}});
}
async function boot(){
  if(!url||!key||url.includes('YOUR_')||key.includes('YOUR_')){renderSetup();return;}
  supabase=createClient(url,key);
  const {data:{session}}=await supabase.auth.getSession();user=session?.user||null;
  if(!user){renderAuth();return;}
  try{await loadData();shell();}catch(e){root.innerHTML=`<main class="center"><section class="panel"><h2>تعذر تحميل البيانات</h2><p>${esc(e.message)}</p><p>تحقق من إعداد قاعدة البيانات وسياسات الوصول.</p><button onclick="location.reload()">إعادة المحاولة</button></section></main>`;}
}
boot();