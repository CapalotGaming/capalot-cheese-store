/* Capalot Cheese — real Supabase auth override */
(function () {
  'use strict';

  const $ = (s, ctx) => (ctx || document).querySelector(s);
  const $$ = (s, ctx) => Array.from((ctx || document).querySelectorAll(s));

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function toast(message) {
    const el = $('.toast');
    if (el) {
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(window.__capalotToastTimer);
      window.__capalotToastTimer = setTimeout(() => el.classList.remove('show'), 3200);
    } else {
      alert(message);
    }
  }

  function setFieldError(field, message) {
    if (!field) return;
    const errorEl = $('.fieldError', field);
    if (errorEl) errorEl.textContent = message || '';
    field.classList.toggle('hasError', Boolean(message));
  }

  function clearErrors(form) {
    $$('.field', form).forEach((field) => setFieldError(field, ''));
  }

  function setLoading(form, loading) {
    const btn = $('button[type="submit"]', form);
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
  }

  function simpleValidate(form) {
    let ok = true;
    $$('.field', form).forEach((field) => {
      const input = $('.input, textarea', field);
      if (!input) return;
      const value = input.value.trim();
      if (input.hasAttribute('required') && !value) {
        setFieldError(field, 'This field is required.');
        ok = false;
        return;
      }
      if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setFieldError(field, 'Enter a valid email address.');
        ok = false;
        return;
      }
      const minLength = input.getAttribute('minlength');
      if (minLength && value && value.length < Number(minLength)) {
        setFieldError(field, `Must be at least ${minLength} characters.`);
        ok = false;
        return;
      }
      setFieldError(field, '');
    });
    return ok;
  }

  function getClient() {
    if (!window.supabase || !window.CAPALOT_SUPABASE_URL || !window.CAPALOT_SUPABASE_ANON_KEY) {
      console.error('Supabase is not loaded or config is missing.');
      return null;
    }
    if (!window.capalotSupabase) {
      window.capalotSupabase = window.supabase.createClient(
        window.CAPALOT_SUPABASE_URL,
        window.CAPALOT_SUPABASE_ANON_KEY
      );
    }
    return window.capalotSupabase;
  }

  function localUserFromSupabase(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'Account',
      email: user.email || ''
    };
  }

  async function getCurrentUser() {
    const client = getClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data?.user || null;
  }

  async function syncLocalUser() {
    const user = await getCurrentUser();
    const local = localUserFromSupabase(user);
    if (local) localStorage.setItem('capalotUser', JSON.stringify(local));
    else localStorage.removeItem('capalotUser');
    updateNav(local);
    return local;
  }

  function updateNav(localUser) {
    let user = localUser;
    if (!user) {
      try { user = JSON.parse(localStorage.getItem('capalotUser') || 'null'); } catch (_) {}
    }
    $$('.login').forEach((el) => {
      if (user) {
        const first = (user.name || user.email || 'Account').split(' ')[0];
        el.textContent = `HI, ${first.toUpperCase()}`;
        el.setAttribute('href', 'account.html');
      } else {
        el.textContent = 'LOGIN';
        el.setAttribute('href', 'login.html');
      }
    });
  }

  function bindAuthForms() {
    const client = getClient();
    if (!client) return;

    const loginForm = $('#loginForm');
    const signupForm = $('#signupForm');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        clearErrors(loginForm);
        if (!simpleValidate(loginForm)) return;

        const email = $('#loginEmail').value.trim();
        const password = $('#loginPassword').value;

        setLoading(loginForm, true);
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        setLoading(loginForm, false);

        if (error) {
          setFieldError($('#loginPassword')?.closest('.field'), error.message || 'Login failed.');
          return;
        }

        const local = localUserFromSupabase(data.user);
        localStorage.setItem('capalotUser', JSON.stringify(local));
        updateNav(local);
        toast(`Welcome back, ${local.name}!`);
        window.location.href = 'account.html';
      }, true);
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        clearErrors(signupForm);
        if (!simpleValidate(signupForm)) return;

        const name = $('#signupName').value.trim();
        const email = $('#signupEmail').value.trim();
        const password = $('#signupPassword').value;

        setLoading(signupForm, true);
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { name } }
        });
        setLoading(signupForm, false);

        if (error) {
          setFieldError($('#signupEmail')?.closest('.field'), error.message || 'Signup failed.');
          return;
        }

        if (!data.session) {
          toast('Account created. Check your email to confirm your account, then log in.');
          signupForm.reset();
          return;
        }

        const local = localUserFromSupabase(data.user);
        localStorage.setItem('capalotUser', JSON.stringify(local));
        updateNav(local);
        toast(`Account created — welcome, ${local.name}!`);
        window.location.href = 'account.html';
      }, true);
    }
  }

  async function renderAccountPage() {
    const view = $('#accountView');
    if (!view) return;

    const client = getClient();
    if (!client) return;

    const { data } = await client.auth.getUser();
    const user = data?.user;

    if (!user) {
      localStorage.removeItem('capalotUser');
      updateNav(null);
      view.innerHTML = `<div class="panel reveal center reveal-visible">
        <h2>You're not logged in</h2>
        <p style="color:#cbd0d6">Log in or create an account to see your details and order history here.</p>
        <a class="btn primary" href="login.html" style="margin-top:14px">Go to Login ›</a>
      </div>`;
      return;
    }

    const local = localUserFromSupabase(user);
    localStorage.setItem('capalotUser', JSON.stringify(local));
    updateNav(local);

    let orders = [];
    try { orders = JSON.parse(localStorage.getItem('capalotOrders') || '[]'); } catch (_) {}

    const ordersHtml = orders.length
      ? orders.map((o) => `<div class="orderRow">
          <div><div class="orderId">#${escapeHtml(o.id)}</div><div class="orderDate">${new Date(o.date).toLocaleDateString()} — ${o.items.length} item${o.items.length === 1 ? '' : 's'}</div></div>
          <b>$${Number(o.total || 0).toFixed(2)}</b>
        </div>`).join('')
      : `<p style="color:var(--muted)">No orders yet — <a href="games.html" style="color:var(--yellow)">browse games</a> to get started.</p>`;

    const initial = (local.name || local.email || '?').charAt(0).toUpperCase();
    view.innerHTML = `
      <div class="panel reveal reveal-visible">
        <div class="accountHeader">
          <div class="accountAvatar" aria-hidden="true">${escapeHtml(initial)}</div>
          <div>
            <h2 style="margin:0">${escapeHtml(local.name || 'Account')}</h2>
            <div class="accountMeta">${escapeHtml(local.email || '')}</div>
            <div class="accountMeta">Supabase User ID: ${escapeHtml(user.id)}</div>
          </div>
        </div>
        <button class="btn block" type="button" id="logoutBtn">Log Out</button>
      </div>
      <div class="panel reveal reveal-visible">
        <h2>Order History</h2>
        ${ordersHtml}
      </div>`;

    $('#logoutBtn')?.addEventListener('click', async () => {
      await client.auth.signOut();
      localStorage.removeItem('capalotUser');
      updateNav(null);
      toast('Logged out');
      renderAccountPage();
    });
  }

  function boot() {
    getClient();
    bindAuthForms();
    syncLocalUser().then(renderAccountPage);
    const client = getClient();
    if (client) {
      client.auth.onAuthStateChange(() => {
        syncLocalUser().then(renderAccountPage);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
