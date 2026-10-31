
import { createClient } from '@supabase/supabase-js';
import './style.css';

const $ = (s) => document.querySelector(s);
const root = $('#app');

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let supabase = null;
let user = null;
let profile = null;
let matches = [];
let predictions = [];
let profiles = [];
let tab = 'matches';

const esc = (v = '') =>
  String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const dateText = d => {
  if (!d) return 'موعد غير محدد';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? 'موعد غير صحيح'
    : date.toLocaleString('ar', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
};

const msg = (text, bad = false) => {
  const el = $('#notice');
  if (el) {
    el.textContent = text;
    el.className = bad ? 'notice bad' : 'notice';
  }
};

function renderSetup() {
  root.innerHTML = `
    <main class="center">
      <section class="panel narrow">
        <div class="logo">⚽</div>
        <h1>تحدّي التوقعات</h1>
        <p class="muted">إعداد الاتصال بقاعدة البيانات</p>
        <p>
          لم يتم العثور على بيانات Supabase.
          تحقق من متغيري البيئة:
          VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY
          في GitHub Actions.
        </p>
      </section>
    </main>
  `;
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
          <input
            id="email"
            type="email"
            autocomplete="email"
            placeholder="name@example.com"
          >
        </div>

        <div class="field">
          <label>كلمة المرور</label>
          <input
            id="password"
            type="password"
            autocomplete="current-password"
            placeholder="6 أحرف على الأقل"
          >
        </div>

        <div class="actions">
          <button id="login">تسجيل الدخول</button>
          <button class="secondary" id="signup">إنشاء حساب</button>
        </div>

        <p id="notice" class="notice"></p>
      </section>
    </main>
  `;

  const emailInput = $('#email');
  const passwordInput = $('#password');
  const loginBtn = $('#login');
  const signupBtn = $('#signup');

  function getCredentials() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !emailInput.validity.valid) {
      msg('أدخل عنوان بريد إلكتروني صحيحاً.', true);
      return null;
    }

    if (!password || password.length < 6) {
      msg('كلمة المرور يجب ألا تقل عن 6 أحرف.', true);
      return null;
    }

    return { email, password };
  }

  async function runAuth(action) {
    const credentials = getCredentials();
    if (!credentials) return;

    loginBtn.disabled = true;
    signupBtn.disabled = true;
    msg('جارٍ تنفيذ الطلب...');

    try {
      let result;

      if (action === 'signup') {
        result = await supabase.auth.signUp(credentials);
      } else {
        result = await supabase.auth.signInWithPassword(credentials);
      }

      const { data, error } = result;

      if (error) {
        msg(
          `${error.message} | Code: ${error.code || 'unknown'} | Status: ${error.status || 'unknown'}`,
          true
        );
        return;
      }

      if (data?.session) {
        user = data.session.user;
        await boot();
        return;
      }

      if (action === 'signup' && data?.user) {
        msg(
          'تم إرسال طلب إنشاء الحساب، لكن لم تُنشأ جلسة دخول. تحقق من إعداد تأكيد البريد في Supabase.'
        );
        return;
      }

      msg('لم يتم إنشاء جلسة دخول. حاول مرة أخرى.', true);

    } catch (error) {
      msg(
        `حدث خطأ: ${error.message || error}`,
        true
      );
    } finally {
      loginBtn.disabled = false;
      signupBtn.disabled = false;
    }
  }

  loginBtn.onclick = () => runAuth('login');
  signupBtn.onclick = () => runAuth('signup');
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
        <button data-tab="matches" class="active">المباريات</button>
        <button data-tab="ranking">الترتيب</button>
        <button data-tab="history">توقعاتي</button>
        ${profile?.role === 'admin'
          ? '<button data-tab="admin">الإدارة</button>'
          : ''}
      </nav>

      <div id="notice" class="notice"></div>
      <section id="content"></section>
    </div>
  `;

  $('#welcome').textContent =
    profile?.display_name || user.email;

  $('#logout').onclick = async () => {
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
    renderAuth();
  };

  root.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      tab = button.dataset.tab;

      root.querySelectorAll('[data-tab]').forEach(item => {
        item.classList.toggle('active', item === button);
      });

      renderTab();
    };
  });

  renderTab();
}

async function loadData() {
  const [m, p, pr] = await Promise.all([
    supabase
      .from('matches')
      .select('*')
      .order('kickoff', { ascending: true }),

    supabase
      .from('predictions')
      .select('*'),

    supabase
      .from('profiles')
      .select('id,display_name,role')
  ]);

  if (m.error || p.error || pr.error) {
    throw (m.error || p.error || pr.error);
  }

  matches = m.data || [];
  predictions = p.data || [];
  profiles = pr.data || [];

  profile = profiles.find(x => x.id === user.id) || {
    id: user.id,
    display_name: user.email,
    role: 'user'
  };
}

function pointsFor(pred, match) {
  if (
    !match ||
    match.status !== 'finished' ||
    match.home_score === null ||
    match.away_score === null
  ) {
    return 0;
  }

  const exact =
    Number(pred.home_score) === Number(match.home_score) &&
    Number(pred.away_score) === Number(match.away_score);

  const actual = Math.sign(
    Number(match.home_score) - Number(match.away_score)
  );

  const guessed = Math.sign(
    Number(pred.home_score) - Number(pred.away_score)
  );

  let pts = 0;

  if (exact) {
    pts += 5;
  } else if (actual === guessed) {
    pts += 3;
  }

  if (Number(pred.home_score) === Number(match.home_score)) {
    pts += 1;
  }

  if (Number(pred.away_score) === Number(match.away_score)) {
    pts += 1;
  }

  if (
    Number(pred.home_score) - Number(pred.away_score) ===
    Number(match.home_score) - Number(match.away_score)
  ) {
    pts += 2;
  }

  return pts;
}

function renderTab() {
  const c = $('#content');
  if (!c) return;

  if (tab === 'matches') {
    const upcoming = matches.filter(m => m.status !== 'finished');

    c.innerHTML = `
      <h2>المباريات</h2>

      ${
        upcoming.length
          ? upcoming.map(m => {
              const pred = predictions.find(
                p => p.match_id === m.id && p.user_id === user.id
              );

              const locked =
                new Date(m.kickoff) <= new Date() ||
                m.status === 'closed';

              return `
                <article class="match">
                  <div class="league">
                    ${esc(m.competition || 'مباراة')}
                  </div>

                  <div class="teams">
                    <div>
                      <b>${esc(m.home_team)}</b>
                      <small>صاحب الأرض</small>
                    </div>

                    <span class="vs">VS</span>

                    <div>
                      <b>${esc(m.away_team)}</b>
                      <small>الضيف</small>
                    </div>
                  </div>

                  <div class="muted centertext">
                    ${dateText(m.kickoff)}
                  </div>

                  ${
                    locked
                      ? '<p class="muted centertext">التوقعات مغلقة</p>'
                      : `
                        <div class="predict">
                          <label>توقعك</label>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            id="h-${m.id}"
                            value="${pred?.home_score ?? ''}"
                            placeholder="0"
                          >
                          <span>—</span>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            id="a-${m.id}"
                            value="${pred?.away_score ?? ''}"
                            placeholder="0"
                          >
                          <button data-predict="${m.id}">
                            ${pred ? 'تعديل التوقع' : 'إرسال التوقع'}
                          </button>
                        </div>
                      `
                  }

                  ${
                    pred
                      ? `
                        <p class="muted centertext">
                          توقعك الحالي:
                          ${pred.home_score} - ${pred.away_score}
                        </p>
                      `
                      : ''
                  }
                </article>
              `;
            }).join('')
          : '<p class="empty">لا توجد مباريات قادمة حاليًا.</p>'
      }

      <h2>المباريات المنتهية</h2>

      ${
        matches
          .filter(m => m.status === 'finished')
          .map(m => `
            <article class="match compact">
              <b>
                ${esc(m.home_team)}
                ${m.home_score} - ${m.away_score}
                ${esc(m.away_team)}
              </b>
              <small>${esc(m.competition || '')}</small>
            </article>
          `)
          .join('')
      }
    `;

    c.querySelectorAll('[data-predict]').forEach(button => {
      button.onclick = () => savePrediction(button.dataset.predict);
    });

  } else if (tab === 'ranking') {
    const rows = profiles
      .map(p => ({
        p,
        score: predictions
          .filter(x => x.user_id === p.id)
          .reduce((sum, x) => {
            const match = matches.find(m => m.id === x.match_id);
            return sum + pointsFor(x, match);
          }, 0)
      }))
      .sort((a, b) => b.score - a.score);

    c.innerHTML = `
      <h2>ترتيب الأصدقاء</h2>

      <div class="table">
        ${
          rows.map((r, i) => `
            <div class="rank">
              <b>${i === 0 ? '🏆' : i + 1}</b>
              <span>${esc(r.p.display_name || 'لاعب')}</span>
              <strong>${r.score} نقطة</strong>
            </div>
          `).join('')
          || '<p class="empty">لا يوجد لاعبون بعد.</p>'
        }
      </div>
    `;

  } else if (tab === 'history') {
    const mine = predictions.filter(p => p.user_id === user.id);

    c.innerHTML = `
      <h2>توقعاتي</h2>

      ${
        mine.map(p => {
          const m = matches.find(x => x.id === p.match_id);

          return m
            ? `
              <article class="match compact">
                <b>
                  ${esc(m.home_team)}
                  ${p.home_score} - ${p.away_score}
                  ${esc(m.away_team)}
                </b>
                <span class="points">${pointsFor(p, m)} نقطة</span>
              </article>
            `
            : '';
        }).join('')
        || '<p class="empty">لم ترسل أي توقع بعد.</p>'
      }
    `;

  } else if (tab === 'admin') {
    if (profile?.role !== 'admin') {
      msg('ليس لديك صلاحية الوصول إلى لوحة الإدارة.', true);
      tab = 'matches';
      renderTab();
      return;
    }

    renderAdmin(c);
  }
}

async function savePrediction(id) {
  const homeInput = $(`#h-${id}`);
  const awayInput = $(`#a-${id}`);

  if (!homeInput || !awayInput) return;

  const h = Number(homeInput.value);
  const a = Number(awayInput.value);

  if (
    homeInput.value === '' ||
    awayInput.value === '' ||
    !Number.isInteger(h) ||
    !Number.isInteger(a) ||
    h < 0 || a < 0 ||
    h > 20 || a > 20
  ) {
    msg('أدخل نتيجتين صحيحتين من 0 إلى 20.', true);
    return;
  }

  const { error } = await supabase
    .from('predictions')
    .upsert(
      {
        match_id: id,
        user_id: user.id,
        home_score: h,
        away_score: a
      },
      { onConflict: 'match_id,user_id' }
    );

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

    <article class="panel">
      <h3>إضافة مباراة</h3>

      <div class="grid">
        <input id="home" placeholder="الفريق الأول">
        <input id="away" placeholder="الفريق الثاني">
        <input id="competition" placeholder="البطولة">
        <input id="kickoff" type="datetime-local">
      </div>

      <button id="addMatch">إضافة المباراة</button>
    </article>

    <h3>إدارة النتائج</h3>

    ${
      matches.map(m => `
        <article class="match compact">
          <b>${esc(m.home_team)} × ${esc(m.away_team)}</b>

          <small>
            ${dateText(m.kickoff)} — ${esc(m.status)}
          </small>

          <div class="predict">
            <input
              type="number"
              id="rh-${m.id}"
              placeholder="أهداف الأول"
              value="${m.home_score ?? ''}"
            >

            <span>—</span>

            <input
              type="number"
              id="ra-${m.id}"
              placeholder="أهداف الثاني"
              value="${m.away_score ?? ''}"
            >

            <button data-result="${m.id}">
              اعتماد النتيجة وإنهاء
            </button>
          </div>

          <button class="secondary small" data-close="${m.id}">
            إغلاق التوقعات
          </button>
        </article>
      `).join('')
    }
  `;

  $('#addMatch').onclick = async () => {
    const home = $('#home').value.trim();
    const away = $('#away').value.trim();
    const competition = $('#competition').value.trim();
    const kickoffValue = $('#kickoff').value;

    if (!home || !away || !kickoffValue) {
      msg('أكمل أسماء الفريقين وموعد المباراة.', true);
      return;
    }

    const kickoffDate = new Date(kickoffValue);

    if (Number.isNaN(kickoffDate.getTime())) {
      msg('موعد المباراة غير صحيح.', true);
      return;
    }

    const row = {
      home_team: home,
      away_team: away,
      competition,
      kickoff: kickoffDate.toISOString(),
      created_by: user.id,
      status: 'open'
    };

    const { error } = await supabase
      .from('matches')
      .insert(row);

    if (error) {
      msg(error.message, true);
    } else {
      msg('تمت إضافة المباراة.');
      await loadData();
      renderTab();
    }
  };

  c.querySelectorAll('[data-result]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.result;
      const homeValue = $(`#rh-${id}`).value;
      const awayValue = $(`#ra-${id}`).value;

      const h = Number(homeValue);
      const a = Number(awayValue);

      if (
        homeValue === '' ||
        awayValue === '' ||
        !Number.isInteger(h) ||
        !Number.isInteger(a) ||
        h < 0 || a < 0
      ) {
        msg('أدخل نتيجة صحيحة للفريقين.', true);
        return;
      }

      const { error } = await supabase
        .from('matches')
        .update({
          home_score: h,
          away_score: a,
          status: 'finished'
        })
        .eq('id', id);

      if (error) {
        msg(error.message, true);
      } else {
        await loadData();
        renderTab();
        msg('تم اعتماد النتيجة واحتساب النقاط في لوحة الترتيب.');
      }
    };
  });

  c.querySelectorAll('[data-close]').forEach(button => {
    button.onclick = async () => {
      const { error } = await supabase
        .from('matches')
        .update({ status: 'closed' })
        .eq('id', button.dataset.close);

      if (error) {
        msg(error.message, true);
      } else {
        await loadData();
        renderTab();
        msg('تم إغلاق التوقعات.');
      }
    };
  });
}

async function boot() {
  if (
    !url ||
    !key ||
    url.includes('YOUR_') ||
    key.includes('YOUR_')
  ) {
    renderSetup();
    return;
  }

  try {
    if (!supabase) {
      supabase = createClient(url, key);
    }

    const {
      data: { session },
      error
    } = await supabase.auth.getSession();

    if (error) throw error;

    user = session?.user || null;

    if (!user) {
      renderAuth();
      return;
    }

    await loadData();
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
      </main>
    `;

    $('#retry').onclick = () => boot();

    $('#backLogin').onclick = async () => {
      if (supabase) {
        await supabase.auth.signOut();
      }

      user = null;
      profile = null;
      renderAuth();
    };
  }
}

boot();
