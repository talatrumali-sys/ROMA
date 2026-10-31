
import { createClient } from '@supabase/supabase-js';
import './style.css';

const $ = s => document.querySelector(s);
const root = $('#app');

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let supabase = null;
let user = null;
let profile = null;
let matches = [];
let predictions = [];
let profiles = [];
let settings = {};
let tab = 'matches';
let pendingAssets = { background: null, logo: null };

const esc = (v = '') =>
  String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  }[c]));

const dateText = d => {
  if (!d) return 'موعد غير محدد';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? 'موعد غير صحيح'
    : date.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
};

function localDateValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function msg(text, bad = false) {
  const el = $('#notice');
  if (el) {
    el.textContent = text;
    el.className = bad ? 'notice bad' : 'notice';
  }
}

function addExtraStyles() {
  if ($('#extra-app-styles')) return;

  const style = document.createElement('style');
  style.id = 'extra-app-styles';
  style.textContent = `
    .admin-section{margin:18px 0}
    .admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}
    .admin-grid input,.admin-grid select,.admin-grid textarea{width:100%;min-width:0}
    .admin-card{margin:12px 0;padding:15px;border:1px solid #ddd;border-radius:12px;background:rgba(255,255,255,.96);color:#222}
    .admin-card h3{margin:5px 0 12px}
    .admin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .admin-actions button{flex:1;min-width:110px}
    .danger{background:#a52626!important;color:white!important}
    .success{background:#246b43!important;color:white!important}
    .status-label{display:inline-block;padding:4px 9px;border-radius:20px;background:#eee;font-size:12px;margin:5px 0}
    .player-row{display:grid;grid-template-columns:minmax(100px,1fr) auto auto;gap:8px;align-items:center;margin:10px 0;padding:10px;border-bottom:1px solid #ddd}
    .player-row input{min-width:0;width:100%}
    .prediction-row{padding:10px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .asset-preview{max-width:150px;max-height:100px;object-fit:contain;display:block;margin:10px 0;border-radius:8px}
    .match-logo{width:38px;height:38px;object-fit:contain;vertical-align:middle;margin-left:8px}
    .hidden-note{padding:10px;border-radius:8px;background:#fff3cd;color:#664d03;margin:10px 0}
    .app{background-size:cover;background-position:center;background-attachment:fixed;min-height:100vh}
    .app:before{content:"";position:fixed;inset:0;background:rgba(15,10,15,.12);pointer-events:none;z-index:-1}
    .admin-card button,.admin-card input,.admin-card select{font-family:inherit}
    @media(max-width:550px){.player-row{grid-template-columns:1fr}.admin-actions button{min-width:100%}}
  `;
  document.head.appendChild(style);
}

function applyAppearance() {
  addExtraStyles();

  const app = $('.app');
  if (app && settings.background_url) {
    app.style.backgroundImage =
      `linear-gradient(rgba(30,10,20,.65),rgba(30,10,20,.65)),url("${settings.background_url}")`;
  }

  const brand = $('.brand');
  if (brand && settings.logo_url) {
    brand.innerHTML =
      `<img class="match-logo" src="${esc(settings.logo_url)}" alt="الشعار"> تحدّي التوقعات`;
  }
}

function renderSetup() {
  root.innerHTML = `
    <main class="center">
      <section class="panel narrow">
        <div class="logo">⚽</div>
        <h1>تحدّي التوقعات</h1>
        <p class="muted">إعداد الاتصال بقاعدة البيانات</p>
        <p>تحقق من متغيري البيئة VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في GitHub Actions.</p>
      </section>
    </main>`;
}

function renderAuth() {
  root.innerHTML = `
    <main class="center">
      <section class="panel narrow">
        <div class="logo">⚽</div>
        <h1>تحدّي التوقعات</h1>
        <p class="muted">تنافس مع أصدقائك واجمع النقاط</p>
        <div class="field">
          <label>البريد الإلكتروني</label>
          <input id="email" type="email" autocomplete="email" placeholder="name@example.com">
        </div>
        <div class="field">
          <label>كلمة المرور</label>
          <input id="password" type="password" autocomplete="current-password" placeholder="6 أحرف على الأقل">
        </div>
        <div class="actions">
          <button id="login">تسجيل الدخول</button>
          <button class="secondary" id="signup">إنشاء حساب</button>
        </div>
        <p id="notice" class="notice"></p>
      </section>
    </main>`;

  const emailInput = $('#email');
  const passwordInput = $('#password');
  const loginBtn = $('#login');
  const signupBtn = $('#signup');

  function credentials() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !emailInput.validity.valid) {
      msg('أدخل بريداً إلكترونياً صحيحاً.', true);
      return null;
    }
    if (password.length < 6) {
      msg('كلمة المرور يجب ألا تقل عن 6 أحرف.', true);
      return null;
    }
    return { email, password };
  }

  async function runAuth(action) {
    const data = credentials();
    if (!data) return;

    loginBtn.disabled = true;
    signupBtn.disabled = true;
    msg('جارٍ تنفيذ الطلب...');

    try {
      const result = action === 'signup'
        ? await supabase.auth.signUp(data)
        : await supabase.auth.signInWithPassword(data);

      if (result.error) throw result.error;

      if (result.data?.session) {
        user = result.data.session.user;
        await boot();
      } else if (action === 'signup' && result.data?.user) {
        msg('تم إنشاء طلب الحساب. تحقق من بريدك الإلكتروني إذا كان تأكيد البريد مفعّلاً.');
      } else {
        msg('لم يتم إنشاء جلسة دخول.', true);
      }
    } catch (error) {
      msg(error.message || 'حدث خطأ أثناء تسجيل الدخول.', true);
    } finally {
      loginBtn.disabled = false;
      signupBtn.disabled = false;
    }
  }

  loginBtn.onclick = () => runAuth('login');
  signupBtn.onclick = () => runAuth('signup');
}

function renderNameSetup() {
  root.innerHTML = `
    <main class="center">
      <section class="panel narrow">
        <div class="logo">⚽</div>
        <h1>أهلاً بك في تحدّي التوقعات</h1>
        <p class="muted">اختر الاسم الذي سيظهر أمام أصدقائك.</p>
        <div class="field">
          <label>اسم اللاعب</label>
          <input id="playerName" maxlength="30" minlength="2" placeholder="اكتب اسمك هنا">
        </div>
        <button id="saveName">حفظ ومتابعة</button>
        <p id="notice" class="notice"></p>
        <button class="secondary small" id="nameLogout">تسجيل الخروج</button>
      </section>
    </main>`;

  $('#saveName').onclick = savePlayerName;
  $('#playerName').addEventListener('keydown', e => {
    if (e.key === 'Enter') savePlayerName();
  });
  $('#nameLogout').onclick = logout;
}

async function savePlayerName() {
  const input = $('#playerName');
  const button = $('#saveName');
  const name = input.value.trim();

  if (name.length < 2 || name.length > 30) {
    msg('الاسم يجب أن يكون بين حرفين و30 حرفاً.', true);
    return;
  }

  button.disabled = true;
  msg('جارٍ حفظ الاسم...');

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id)
      .select('id,display_name,role,is_active')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ id: user.id, display_name: name, role: 'user' });
      if (insertError) throw insertError;
    }

    await loadData();

    if (!profile?.display_name) {
      throw new Error('لم يتم العثور على الاسم المحفوظ.');
    }

    tab = 'matches';
    shell();
  } catch (error) {
    msg(`تعذر حفظ الاسم: ${error.message}`, true);
    button.disabled = false;
  }
}

async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    msg(error.message, true);
    return;
  }

  user = null;
  profile = null;
  matches = [];
  predictions = [];
  profiles = [];
  settings = {};
  renderAuth();
}

async function loadData() {
  const [m, p, pr, st] = await Promise.all([
    supabase.from('matches').select('*').order('kickoff', { ascending: true }),
    supabase.from('predictions').select('*'),
    supabase.from('profiles').select('id,display_name,role,is_active'),
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
  ]);

  if (m.error || p.error || pr.error || st.error) {
    throw m.error || p.error || pr.error || st.error;
  }

  matches = m.data || [];
  predictions = p.data || [];
  profiles = pr.data || [];
  settings = st.data || {};

  profile = profiles.find(x => x.id === user.id) || null;
}

function pointsFor(pred, match) {
  if (!match || match.status !== 'finished' ||
      match.home_score === null || match.away_score === null) return 0;

  const exact =
    Number(pred.home_score) === Number(match.home_score) &&
    Number(pred.away_score) === Number(match.away_score);

  if (exact) return 2;

  const actual = Math.sign(Number(match.home_score) - Number(match.away_score));
  const guessed = Math.sign(Number(pred.home_score) - Number(pred.away_score));

  return actual === guessed ? 1 : 0;
}

function shell() {
  root.innerHTML = `
    <div class="app">
      <header>
        <div>
          <div class="brand">⚽ تحدّي التوقعات</div>
          <small id="welcome"></small>
        </div>
        <button class="secondary small" id="logout">خروج</button>
      </header>

      <nav>
        <button data-tab="matches">المباريات</button>
        <button data-tab="ranking">الترتيب</button>
        <button data-tab="history">توقعاتي</button>
        <button data-tab="allPredictions">توقعات اللاعبين</button>
        ${profile?.role === 'admin' ? '<button data-tab="admin">الإدارة</button>' : ''}
      </nav>

      <div id="notice" class="notice"></div>
      <section id="content"></section>
    </div>`;

  $('#welcome').textContent = profile?.display_name || '';
  $('#logout').onclick = logout;

  root.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      tab = button.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach(x =>
        x.classList.toggle('active', x === button)
      );
      renderTab();
    };
  });

  applyAppearance();
  renderTab();
}

function renderTab() {
  const c = $('#content');
  if (!c) return;

  if (tab === 'matches') renderMatches(c);
  else if (tab === 'ranking') renderRanking(c);
  else if (tab === 'history') renderHistory(c);
  else if (tab === 'allPredictions') renderAllPredictions(c);
  else if (tab === 'admin') {
    if (profile?.role !== 'admin') {
      tab = 'matches';
      renderMatches(c);
      return;
    }
    renderAdmin(c);
  }
}

function renderMatches(c) {
  const upcoming = matches.filter(m => m.status !== 'finished');
  const finished = matches.filter(m => m.status === 'finished');

  c.innerHTML = `
    <h2>المباريات القادمة</h2>
    ${upcoming.length ? upcoming.map(m => {
      const pred = predictions.find(p => p.match_id === m.id && p.user_id === user.id);
      const locked = new Date(m.kickoff) <= new Date() || m.status === 'closed';

      return `
        <article class="match">
          <div class="league">${esc(m.competition || 'مباراة')}</div>
          <div class="teams">
            <div><b>${esc(m.home_team)}</b><small>صاحب الأرض</small></div>
            <span class="vs">VS</span>
            <div><b>${esc(m.away_team)}</b><small>الضيف</small></div>
          </div>
          <div class="muted centertext">${dateText(m.kickoff)}</div>
          ${locked ? '<p class="muted centertext">التوقعات مغلقة</p>' : `
            <div class="predict">
              <label>توقعك</label>
              <input type="number" min="0" max="20" id="h-${m.id}" value="${pred?.home_score ?? ''}" placeholder="0">
              <span>—</span>
              <input type="number" min="0" max="20" id="a-${m.id}" value="${pred?.away_score ?? ''}" placeholder="0">
              <button data-predict="${m.id}">${pred ? 'تعديل التوقع' : 'إرسال التوقع'}</button>
            </div>`}
          ${pred ? `<p class="muted centertext">توقعك الحالي: ${pred.home_score} - ${pred.away_score}</p>` : ''}
        </article>`;
    }).join('') : '<p class="empty">لا توجد مباريات قادمة حالياً.</p>'}

    <h2>المباريات المنتهية</h2>
    ${finished.length ? finished.map(m => `
      <article class="match compact">
        <b>${esc(m.home_team)} ${m.home_score} - ${m.away_score} ${esc(m.away_team)}</b>
        <small>${esc(m.competition || '')}</small>
      </article>`).join('') : '<p class="empty">لا توجد مباريات منتهية.</p>'}
  `;

  c.querySelectorAll('[data-predict]').forEach(b =>
    b.onclick = () => savePrediction(b.dataset.predict)
  );
}

async function renderRanking(c) {
  c.innerHTML = '<h2>ترتيب الأصدقاء</h2><p>جارٍ تحميل الترتيب...</p>';

  const { data, error } = await supabase.rpc('get_leaderboard');

  if (error) {
    c.innerHTML = `<h2>ترتيب الأصدقاء</h2><p class="notice bad">${esc(error.message)}</p>`;
    return;
  }

  c.innerHTML = `
    <h2>ترتيب الأصدقاء</h2>
    <div class="table">
      ${(data || []).map((r, i) => `
        <div class="rank">
          <b>${i === 0 ? '🏆' : i + 1}</b>
          <span>${esc(r.display_name || 'لاعب')}</span>
          <strong>${Number(r.points || 0)} نقطة</strong>
        </div>`).join('') || '<p class="empty">لا يوجد لاعبون بعد.</p>'}
    </div>`;
}

function renderHistory(c) {
  const mine = predictions.filter(p => p.user_id === user.id);

  c.innerHTML = `
    <h2>توقعاتي</h2>
    ${mine.map(p => {
      const m = matches.find(x => x.id === p.match_id);
      if (!m) return '';
      return `
        <article class="match compact">
          <b>${esc(m.home_team)} ${p.home_score} - ${p.away_score} ${esc(m.away_team)}</b>
          <span class="points">${pointsFor(p, m)} نقطة</span>
        </article>`;
    }).join('') || '<p class="empty">لم ترسل أي توقع بعد.</p>'}`;
}

function renderAllPredictions(c) {
  c.innerHTML = `
    <h2>توقعات اللاعبين</h2>
    <p class="muted">تظهر التوقعات التي سمح المدير بعرضها، وتبقى توقعاتك ظاهرة لك دائماً.</p>
    ${matches.map(m => {
      const visible = m.predictions_visible === true;
      const list = predictions.filter(p =>
        p.match_id === m.id && (visible || p.user_id === user.id || profile.role === 'admin')
      );

      return `
        <article class="match">
          <h3>${esc(m.home_team)} × ${esc(m.away_team)}</h3>
          <small>${esc(m.competition || '')} — ${dateText(m.kickoff)}</small>
          ${!visible && profile.role !== 'admin'
            ? '<div class="hidden-note">توقعات هذه المباراة لم يُسمح بعرضها بعد.</div>'
            : ''}
          ${list.length ? list.map(p => {
            const player = profiles.find(x => x.id === p.user_id);
            return `
              <div class="prediction-row">
                <span>${esc(player?.display_name || 'لاعب')}</span>
                <strong>${p.home_score} - ${p.away_score}</strong>
              </div>`;
          }).join('') : '<p class="empty">لا توجد توقعات ظاهرة لهذه المباراة.</p>'}
        </article>`;
    }).join('') || '<p class="empty">لا توجد مباريات.</p>'}`;
}

async function savePrediction(id) {
  const hi = $(`#h-${id}`);
  const ai = $(`#a-${id}`);
  if (!hi || !ai) return;

  const h = Number(hi.value);
  const a = Number(ai.value);

  if (hi.value === '' || ai.value === '' ||
      !Number.isInteger(h) || !Number.isInteger(a) ||
      h < 0 || a < 0 || h > 20 || a > 20) {
    msg('أدخل نتيجتين صحيحتين من 0 إلى 20.', true);
    return;
  }

  const { error } = await supabase.from('predictions').upsert({
    match_id: id,
    user_id: user.id,
    home_score: h,
    away_score: a
  }, { onConflict: 'match_id,user_id' });

  if (error) {
    msg(error.message, true);
  } else {
    msg('تم حفظ توقعك بنجاح.');
    await loadData();
    renderTab();
  }
}

function renderAdmin(c) {
  c.innerHTML = `
    <h2>لوحة المدير</h2>

    <div class="admin-actions">
      <button data-admin-tab="matches">إدارة المباريات</button>
      <button data-admin-tab="players">إدارة اللاعبين</button>
      <button data-admin-tab="appearance">الشعار والخلفية</button>
    </div>

    <div id="adminContent"></div>`;

  c.querySelectorAll('[data-admin-tab]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.adminTab === 'matches') renderAdminMatches($('#adminContent'));
      if (b.dataset.adminTab === 'players') renderAdminPlayers($('#adminContent'));
      if (b.dataset.adminTab === 'appearance') renderAdminAppearance($('#adminContent'));
    };
  });

  renderAdminMatches($('#adminContent'));
}

function renderAdminMatches(c) {
  c.innerHTML = `
    <article class="admin-card">
      <h3>إضافة مباراة جديدة</h3>
      <div class="admin-grid">
        <input id="newHome" placeholder="الفريق الأول">
        <input id="newAway" placeholder="الفريق الثاني">
        <input id="newCompetition" placeholder="البطولة">
        <input id="newKickoff" type="datetime-local">
      </div>
      <button id="addMatch">إضافة المباراة</button>
    </article>

    <h3>المباريات وإدارتها</h3>
    ${matches.map(m => `
      <article class="admin-card">
        <h3>${esc(m.home_team)} × ${esc(m.away_team)}</h3>
        <span class="status-label">${esc(m.status)}</span>
        <div class="admin-grid">
          <input id="editHome-${m.id}" value="${esc(m.home_team)}" placeholder="الفريق الأول">
          <input id="editAway-${m.id}" value="${esc(m.away_team)}" placeholder="الفريق الثاني">
          <input id="editComp-${m.id}" value="${esc(m.competition || '')}" placeholder="البطولة">
          <input id="editDate-${m.id}" type="datetime-local" value="${localDateValue(m.kickoff)}">
        </div>
        <button data-edit-match="${m.id}">حفظ تعديلات المباراة</button>

        <h4>النتيجة النهائية</h4>
        <div class="predict">
          <input type="number" min="0" max="20" id="rh-${m.id}" value="${m.home_score ?? ''}" placeholder="أهداف الأول">
          <span>—</span>
          <input type="number" min="0" max="20" id="ra-${m.id}" value="${m.away_score ?? ''}" placeholder="أهداف الثاني">
          <button data-result="${m.id}">اعتماد النتيجة وإنهاء</button>
        </div>

        <div class="admin-actions">
          <button class="secondary" data-status="${m.id}" data-value="${m.status === 'closed' ? 'open' : 'closed'}">
            ${m.status === 'closed' ? 'فتح التوقعات' : 'إغلاق التوقعات'}
          </button>
          <button class="${m.predictions_visible ? 'danger' : 'success'}" data-reveal="${m.id}" data-value="${!m.predictions_visible}">
            ${m.predictions_visible ? 'إخفاء توقعات اللاعبين' : 'إظهار توقعات اللاعبين'}
          </button>
          <button class="danger" data-delete-match="${m.id}">حذف المباراة</button>
        </div>
        <small>موعد المباراة: ${dateText(m.kickoff)}</small>
      </article>
    `).join('') || '<p class="empty">لا توجد مباريات.</p>'}
  `;

  $('#addMatch').onclick = async () => {
    const home = $('#newHome').value.trim();
    const away = $('#newAway').value.trim();
    const competition = $('#newCompetition').value.trim();
    const date = $('#newKickoff').value;

    if (!home || !away || !date) {
      msg('أكمل الفريقين وموعد المباراة.', true);
      return;
    }

    const kickoff = new Date(date);
    if (Number.isNaN(kickoff.getTime())) {
      msg('الموعد غير صحيح.', true);
      return;
    }

    const { error } = await supabase.from('matches').insert({
      home_team: home,
      away_team: away,
      competition,
      kickoff: kickoff.toISOString(),
      created_by: user.id,
      status: 'open',
      predictions_visible: false
    });

    if (error) return msg(error.message, true);
    await refreshAdmin('تمت إضافة المباراة.');
  };

  c.querySelectorAll('[data-edit-match]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.editMatch;
      const home = $(`#editHome-${id}`).value.trim();
      const away = $(`#editAway-${id}`).value.trim();
      const competition = $(`#editComp-${id}`).value.trim();
      const date = $(`#editDate-${id}`).value;

      if (!home || !away || !date) return msg('أكمل بيانات المباراة.', true);

      const kickoff = new Date(date);
      if (Number.isNaN(kickoff.getTime())) return msg('الموعد غير صحيح.', true);

      const { error } = await supabase.from('matches').update({
        home_team: home,
        away_team: away,
        competition,
        kickoff: kickoff.toISOString()
      }).eq('id', id);

      if (error) return msg(error.message, true);
      await refreshAdmin('تم تعديل بيانات المباراة.');
    };
  });

  c.querySelectorAll('[data-result]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.result;
      const hv = $(`#rh-${id}`).value;
      const av = $(`#ra-${id}`).value;
      const h = Number(hv);
      const a = Number(av);

      if (hv === '' || av === '' || !Number.isInteger(h) ||
          !Number.isInteger(a) || h < 0 || a < 0 || h > 20 || a > 20) {
        return msg('أدخل نتيجة صحيحة من 0 إلى 20.', true);
      }

      const { error } = await supabase.from('matches').update({
        home_score: h,
        away_score: a,
        status: 'finished'
      }).eq('id', id);

      if (error) return msg(error.message, true);
      await refreshAdmin('تم اعتماد النتيجة واحتساب النقاط.');
    };
  });

  c.querySelectorAll('[data-status]').forEach(b => {
    b.onclick = async () => {
      const { error } = await supabase.from('matches')
        .update({ status: b.dataset.value })
        .eq('id', b.dataset.status);

      if (error) return msg(error.message, true);
      await refreshAdmin(b.dataset.value === 'open' ? 'تم فتح التوقعات.' : 'تم إغلاق التوقعات.');
    };
  });

  c.querySelectorAll('[data-reveal]').forEach(b => {
    b.onclick = async () => {
      const { error } = await supabase.from('matches')
        .update({ predictions_visible: b.dataset.value === 'true' })
        .eq('id', b.dataset.reveal);

      if (error) return msg(error.message, true);
      await refreshAdmin(b.dataset.value === 'true'
        ? 'أصبحت توقعات هذه المباراة ظاهرة للجميع.'
        : 'تم إخفاء توقعات هذه المباراة.');
    };
  });

  c.querySelectorAll('[data-delete-match]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('هل أنت متأكد من حذف المباراة؟ سيتم حذف توقعاتها أيضاً.')) return;

      const { error } = await supabase.from('matches')
        .delete().eq('id', b.dataset.deleteMatch);

      if (error) return msg(error.message, true);
      await refreshAdmin('تم حذف المباراة وتوقعاتها.');
    };
  });
}

function renderAdminPlayers(c) {
  c.innerHTML = `
    <h3>إدارة اللاعبين</h3>
    <p class="muted">إيقاف اللاعب يمنعه من استخدام التطبيق، مع الاحتفاظ بحسابه وتوقعاته ونقاطه.</p>
    ${profiles.map(p => `
      <article class="admin-card">
        <div class="player-row">
          <input id="player-${p.id}" value="${esc(p.display_name || '')}" maxlength="30">
          <span class="status-label">${p.is_active === false ? 'موقوف' : 'نشط'}</span>
          <strong>${p.role === 'admin' ? 'مدير' : 'لاعب'}</strong>
        </div>
        <div class="admin-actions">
          <button data-save-player="${p.id}">حفظ الاسم</button>
          ${p.id !== user.id ? `
            <button class="${p.is_active === false ? 'success' : 'danger'}"
              data-toggle-player="${p.id}"
              data-active="${p.is_active === false}">
              ${p.is_active === false ? 'إعادة تفعيل اللاعب' : 'إيقاف مؤقت'}
            </button>` : '<span class="muted">هذا حسابك الإداري</span>'}
        </div>
      </article>
    `).join('') || '<p class="empty">لا يوجد لاعبون.</p>'}
  `;

  c.querySelectorAll('[data-save-player]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.savePlayer;
      const name = $(`#player-${id}`).value.trim();

      if (name.length < 2 || name.length > 30) {
        return msg('الاسم يجب أن يكون بين حرفين و30 حرفاً.', true);
      }

      const { error } = await supabase.from('profiles')
        .update({ display_name: name }).eq('id', id);

      if (error) return msg(error.message, true);
      await refreshAdmin('تم حفظ اسم اللاعب.');
    };
  });

  c.querySelectorAll('[data-toggle-player]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.togglePlayer;
      const active = b.dataset.active === 'true';

      const { error } = await supabase.from('profiles')
        .update({ is_active: active }).eq('id', id);

      if (error) return msg(error.message, true);
      await refreshAdmin(active ? 'تمت إعادة تفعيل اللاعب.' : 'تم إيقاف اللاعب مؤقتاً.');
    };
  });
}

function renderAdminAppearance(c) {
  pendingAssets = { background: null, logo: null };

  c.innerHTML = `
    <h3>تغيير مظهر التطبيق</h3>
    <article class="admin-card">
      <h4>صورة الخلفية</h4>
      <p class="muted">اختر صورة من جهازك. يفضّل صورة عريضة مناسبة للشاشة.</p>
      <input id="backgroundFile" type="file" accept="image/*">
      <img id="backgroundPreview" class="asset-preview"
        src="${esc(settings.background_url || '')}"
        style="${settings.background_url ? '' : 'display:none'}">
    </article>

    <article class="admin-card">
      <h4>شعار التطبيق</h4>
      <input id="logoFile" type="file" accept="image/*">
      <img id="logoPreview" class="asset-preview"
        src="${esc(settings.logo_url || '')}"
        style="${settings.logo_url ? '' : 'display:none'}">
    </article>

    <button id="saveAppearance">حفظ المظهر للجميع</button>
    <p class="muted">التغييرات تظهر للمستخدمين عند فتح التطبيق أو تحديثه، دون إعادة تثبيت APK.</p>
  `;

  function previewFile(inputId, previewId, type) {
    const input = $(`#${inputId}`);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        msg('يرجى اختيار ملف صورة.', true);
        input.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        msg('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.', true);
        input.value = '';
        return;
      }

      pendingAssets[type] = file;
      const preview = $(`#${previewId}`);
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    };
  }

  previewFile('backgroundFile', 'backgroundPreview', 'background');
  previewFile('logoFile', 'logoPreview', 'logo');

  $('#saveAppearance').onclick = async () => {
    const button = $('#saveAppearance');
    button.disabled = true;
    msg('جارٍ رفع الصور وحفظ المظهر...');

    try {
      const updates = {};

      for (const type of ['background', 'logo']) {
        const file = pendingAssets[type];
        if (!file) continue;

        const extension = (file.name.split('.').pop() || 'jpg')
          .toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${type}-${Date.now()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('app-assets')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('app-assets')
          .getPublicUrl(path);

        updates[type === 'background' ? 'background_url' : 'logo_url'] =
          data.publicUrl;
      }

      if (Object.keys(updates).length) {
        const { error } = await supabase.from('app_settings')
          .update(updates).eq('id', 1);
        if (error) throw error;
      }

      await loadData();
      pendingAssets = { background: null, logo: null };
      shell();
      tab = 'admin';
      renderTab();
      msg('تم حفظ المظهر بنجاح.');
    } catch (error) {
      msg(`تعذر حفظ المظهر: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  };
}

async function refreshAdmin(message) {
  await loadData();
  renderTab();
  msg(message);
}

async function boot() {
  if (!url || !key || url.includes('YOUR_') || key.includes('YOUR_')) {
    renderSetup();
    return;
  }

  try {
    if (!supabase) supabase = createClient(url, key);

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;

    user = session?.user || null;

    if (!user) {
      renderAuth();
      return;
    }

    await loadData();

    if (!profile) {
      throw new Error('لم يتم العثور على ملف اللاعب في قاعدة البيانات.');
    }

    if (profile.is_active === false) {
      await supabase.auth.signOut();
      user = null;
      root.innerHTML = `
        <main class="center">
          <section class="panel narrow">
            <h2>الحساب موقوف مؤقتاً</h2>
            <p>تم إيقاف هذا الحساب من قبل مدير المسابقة. يرجى التواصل معه.</p>
            <button id="backLogin">العودة</button>
          </section>
        </main>`;
      $('#backLogin').onclick = renderAuth;
      return;
    }

    if (!profile.display_name ||
        profile.display_name.trim() === '' ||
        profile.display_name === user.email) {
      renderNameSetup();
      return;
    }

    tab = 'matches';
    shell();

  } catch (error) {
    root.innerHTML = `
      <main class="center">
        <section class="panel">
          <h2>تعذر تحميل البيانات</h2>
          <p>${esc(error.message || 'حدث خطأ غير معروف')}</p>
          <p>تحقق من اتصال قاعدة البيانات وسياسات الوصول.</p>
          <button id="retry">إعادة المحاولة</button>
          <button class="secondary" id="backLogin">العودة لتسجيل الدخول</button>
        </section>
      </main>`;

    $('#retry').onclick = boot;
    $('#backLogin').onclick = async () => {
      if (supabase) await supabase.auth.signOut();
      user = null;
      profile = null;
      renderAuth();
    };
  }
}

boot();
