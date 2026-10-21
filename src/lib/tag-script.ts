// The browser side of the Loudpilot Tag, served as /t.js (and the chat
// widget as /w.js). Plain ES2017 so it runs on any site; no template
// literals inside, they would clash with this file's own strings.
//
//   <script async src="https://loudpilot.app/t.js" data-site="lp_…"></script>
//
// Attributes: data-consent="required" (wait for loudpilot('consent', true)),
// data-forms="off" (no automatic Lead from forms), data-test="1" and
// data-preview="<signed token>" (the demo shop: test data, chat before it is
// switched on).
// API: loudpilot('track', name, {value, currency, …}), loudpilot('identify',
// {email, phone, name, user_id, user_hash}), loudpilot('consent', bool),
// loudpilot('page'), loudpilot('chat', 'open' | 'close' | 'hide' | 'show'),
// loudpilot('visitorId', fn).

export const TAG_SCRIPT = String.raw`(function () {
  'use strict';
  var w = window, d = document;
  if (w.__lpTag) return;
  var s = d.currentScript || d.querySelector('script[src*="/t.js"][data-site]');
  if (!s) return;
  w.__lpTag = 1;
  var KEY = s.getAttribute('data-site');
  var BASE = s.src.split('/t.js')[0];
  var TEST = s.getAttribute('data-test') === '1';
  var ATTR_CONSENT = s.getAttribute('data-consent');
  var PREVIEW = s.getAttribute('data-preview');
  var cfg = { consent: ATTR_CONSENT === 'required', forms: s.getAttribute('data-forms') !== 'off', mirror: false, chat: null };
  var ready = false, consent = null, queue = [], ident = null, lastIdent = null, timer = null, lastContact = {}, lastPath = null;
  var vid = null, sid = null, domainAttr = null;
  var SESSION_MS = 30 * 60 * 1000, YEAR_MS = 400 * 24 * 3600 * 1000;
  var CLICK = ['gclid', 'fbclid', 'ttclid', 'msclkid', 'gbraid', 'wbraid'];

  function rid() {
    var a = new Uint8Array(12), h = '', i;
    try { (w.crypto || w.msCrypto).getRandomValues(a); } catch (e) { for (i = 0; i < 12; i++) a[i] = Math.floor(Math.random() * 256); }
    for (i = 0; i < a.length; i++) h += ('0' + a[i].toString(16)).slice(-2);
    return h;
  }
  function getCookie(n) {
    var m = d.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  // The widest domain the browser lets us set (shop.example.com → .example.com),
  // so the visitor id is shared by the shop and its subdomains.
  function rootDomain() {
    var parts = location.hostname.split('.');
    if (parts.length < 2 || /^[\d.]+$/.test(location.hostname)) return '';
    for (var i = 2; i <= parts.length; i++) {
      var dom = '.' + parts.slice(-i).join('.');
      d.cookie = '_lp_t=1;path=/;domain=' + dom;
      if (getCookie('_lp_t')) { d.cookie = '_lp_t=;path=/;max-age=0;domain=' + dom; return dom; }
    }
    return '';
  }
  function setCookie(n, v, ms) {
    if (domainAttr === null) domainAttr = rootDomain();
    d.cookie = n + '=' + encodeURIComponent(v) + ';path=/;max-age=' + Math.round(ms / 1000) + ';SameSite=Lax' +
      (domainAttr ? ';domain=' + domainAttr : '') + (location.protocol === 'https:' ? ';Secure' : '');
  }
  function allowed() { return consent !== false && (!cfg.consent || consent === true); }

  // utm_* and ad click ids of this page: a new campaign starts a new visit.
  function campaignSig() {
    var q = new URLSearchParams(location.search), out = [], keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].concat(CLICK);
    for (var i = 0; i < keys.length; i++) if (q.get(keys[i])) out.push(keys[i] + '=' + q.get(keys[i]));
    return out.join('&');
  }
  function ids() {
    var store = allowed();
    if (!vid) vid = (store && getCookie('_lp_id')) || rid();
    var sig = campaignSig();
    var prev = (store && getCookie('_lp_s')) || '';
    var cut = prev.indexOf('|');
    var prevSid = cut > 0 ? prev.slice(0, cut) : '', prevSig = cut > 0 ? prev.slice(cut + 1) : '';
    if (!sid) sid = prevSid && (!sig || sig === prevSig) ? prevSid : rid();
    if (store) {
      setCookie('_lp_id', vid, YEAR_MS);
      setCookie('_lp_s', sid + '|' + (sig || prevSig), SESSION_MS);
    }
  }
  function fbc() {
    var id = new URLSearchParams(location.search).get('fbclid');
    if (id) {
      var v = 'fb.1.' + Date.now() + '.' + id;
      if (allowed()) setCookie('_lp_fbc', v, 90 * 24 * 3600 * 1000);
      return getCookie('_fbc') || v;
    }
    return getCookie('_fbc') || getCookie('_lp_fbc') || undefined;
  }

  function flush() {
    timer = null;
    if (!ready || !allowed() || (!queue.length && !ident)) return;
    ids();
    var body = { s: KEY, v: vid, sid: sid, ctx: { url: location.href, ref: d.referrer || undefined, fbp: getCookie('_fbp') || undefined, fbc: fbc() }, e: queue.splice(0, 50) };
    if (TEST) body.test = true;
    if (ident) { body.id = ident; ident = null; }
    var data = JSON.stringify(body), url = BASE + '/api/tag/collect', ok = false;
    try { ok = navigator.sendBeacon && navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' })); } catch (e) { ok = false; }
    if (!ok) { try { fetch(url, { method: 'POST', body: data, keepalive: true, headers: { 'content-type': 'text/plain' } }); } catch (e) { /* offline */ } }
    if (queue.length) flush();
  }
  function later() { if (!timer) timer = setTimeout(flush, 250); }

  function track(name, data) {
    data = data || {};
    var ev = { n: String(name), id: rid(), u: location.href, t: d.title }, p = {}, any = false;
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k) && k !== 'value' && k !== 'currency') { p[k] = data[k]; any = true; }
    var val = typeof data.value === 'number' ? data.value : parseFloat(data.value);
    if (isFinite(val)) ev.val = val;
    if (data.currency) ev.cur = String(data.currency);
    if (any) ev.p = p;
    if (!allowed()) return ev.id;
    queue.push(ev);
    if (cfg.mirror && ev.n !== 'PageView' && typeof w.fbq === 'function') { try { w.fbq('track', ev.n, data, { eventID: ev.id }); } catch (e) { /* pixel error */ } }
    later();
    return ev.id;
  }
  function identify(o) {
    if (!o || typeof o !== 'object') return;
    var clean = {}, keys = ['user_id', 'user_hash', 'email', 'phone', 'name'];
    for (var i = 0; i < keys.length; i++) if (o[keys[i]] != null && o[keys[i]] !== '') clean[keys[i]] = String(o[keys[i]]);
    lastIdent = Object.assign({}, lastIdent || {}, clean);
    ident = Object.assign({}, ident || {}, clean);
    later();
  }
  function setConsent(v) {
    consent = !!v;
    if (!consent) {
      queue = []; ident = null;
      ['_lp_id', '_lp_s', '_lp_fbc'].forEach(function (n) { setCookie(n, '', 0); });
    } else later();
  }
  function page() {
    var p = location.pathname + location.search;
    if (p === lastPath) return;
    lastPath = p;
    track('PageView');
  }
  function fillHidden(root) {
    var els = (root || d).querySelectorAll('input[name="lp_visitor_id"]');
    if (!els.length) return;
    ids();
    for (var i = 0; i < els.length; i++) els[i].value = vid;
  }

  // Calls, messengers and e-mail links count as Contact.
  d.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !ready) return;
    var h = a.getAttribute('href') || '', m = null;
    if (/^tel:/i.test(h)) m = 'phone';
    else if (/^mailto:/i.test(h)) m = 'email';
    else if (/wa\.me\/|api\.whatsapp\.com|^whatsapp:/i.test(h)) m = 'whatsapp';
    else if (/^(https?:\/\/)?(t\.me|telegram\.me)\/|^tg:/i.test(h)) m = 'telegram';
    else if (/^viber:/i.test(h)) m = 'viber';
    if (!m || (lastContact[m] && Date.now() - lastContact[m] < 10000)) return;
    lastContact[m] = Date.now();
    track('Contact', { method: m });
    flush();
  }, true);

  // A form with an e-mail or phone field is a Lead (login forms are not).
  d.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.querySelectorAll || !ready) return;
    fillHidden(f);
    if (!cfg.forms || f.hasAttribute('data-lp-ignore') || f.querySelector('input[type=password]')) return;
    var email = null, phone = null, name = null, els = f.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], t = (el.type || '').toLowerCase(), v = el.value;
      var n = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('autocomplete') || '')).toLowerCase();
      if (!v || t === 'hidden' || t === 'password') continue;
      if (!email && (t === 'email' || /e-?mail/.test(n)) && /@/.test(v)) email = v;
      else if (!phone && (t === 'tel' || /phone|tel|mobile/.test(n))) phone = v;
      else if (!name && /name/.test(n) && !/user|company|last/.test(n)) name = v;
    }
    if (!email && !phone) return;
    identify({ email: email, phone: phone, name: name });
    track('Lead', { form: f.getAttribute('id') || f.getAttribute('name') || (f.getAttribute('action') || '').split('?')[0] || location.pathname });
    flush();
  }, true);

  ['pushState', 'replaceState'].forEach(function (k) {
    var orig = history[k];
    history[k] = function () { var r = orig.apply(this, arguments); setTimeout(page, 0); return r; };
  });
  w.addEventListener('popstate', page);
  w.addEventListener('pagehide', flush);
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden') flush(); });

  var chatCalls = [];
  function chat(c) {
    if (w.__lpChat) w.__lpChat.cmd(c);
    else chatCalls.push(c);
  }
  function loadChat() {
    w.__lpChatHost = {
      base: BASE, key: KEY, cfg: cfg.chat, test: TEST, preview: PREVIEW, calls: chatCalls,
      ids: function () { ids(); return { v: vid, sid: sid }; },
      identity: function () { return lastIdent; },
      track: track
    };
    var sc = d.createElement('script');
    sc.async = true;
    sc.src = BASE + '/w.js';
    (d.head || d.body).appendChild(sc);
  }

  function api(cmd, a, b) {
    if (cmd === 'track') return track(a, b);
    if (cmd === 'identify') return identify(a);
    if (cmd === 'consent') return setConsent(a);
    if (cmd === 'page') { lastPath = null; return page(); }
    if (cmd === 'chat') return chat(a);
    if (cmd === 'visitorId' && typeof a === 'function') { ids(); return a(vid); }
    if (cmd === 'ready' && typeof a === 'function') return a();
  }
  var stub = typeof w.loudpilot === 'function' && w.loudpilot.q ? w.loudpilot : function () { stub.q.push(arguments); };
  stub.q = stub.q || [];
  w.loudpilot = stub;

  function start() {
    if (ready) return;
    ready = true;
    var q = stub.q;
    w.loudpilot = api;
    page();
    for (var i = 0; i < q.length; i++) api.apply(null, q[i]);
    fillHidden();
    if (cfg.chat) loadChat();
    later();
  }
  fetch(BASE + '/api/tag/config?s=' + encodeURIComponent(KEY) + (PREVIEW ? '&p=' + encodeURIComponent(PREVIEW) : ''))
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (c) {
      if (!ATTR_CONSENT) cfg.consent = !!c.consent;
      cfg.forms = cfg.forms && c.forms !== false;
      cfg.mirror = !!c.mirror;
      cfg.chat = c.chat || null;
      start();
    }, start);
})();
`

export const WIDGET_SCRIPT = String.raw`(function () {
  'use strict';
  var w = window, d = document, H = w.__lpChatHost;
  if (!H || !H.cfg || w.__lpChat) return;
  var C = H.cfg, LS = 'lp_chat_' + H.key;
  var T = {
    en: { ph: 'Type a message…', send: 'Send', err: 'Could not send. Try again.', open: 'Open chat', close: 'Close chat', team: 'Team', powered: 'Powered by Loudpilot', typing: 'Typing…' },
    ru: { ph: 'Напишите сообщение…', send: 'Отправить', err: 'Не удалось отправить. Попробуйте ещё раз.', open: 'Открыть чат', close: 'Закрыть чат', team: 'Сотрудник', powered: 'Работает на Loudpilot', typing: 'Печатает…' },
    ka: { ph: 'დაწერეთ შეტყობინება…', send: 'გაგზავნა', err: 'ვერ გაიგზავნა. სცადეთ თავიდან.', open: 'ჩატის გახსნა', close: 'ჩატის დახურვა', team: 'გუნდი', powered: 'Loudpilot', typing: 'წერს…' }
  };
  var t = T[(navigator.language || 'en').slice(0, 2)] || T.en;
  var st = { open: false, token: null, status: 'BOT', seen: {}, last: null, busy: false, unread: 0, hidden: false, timer: null };
  try { st.token = localStorage.getItem(LS); } catch (e) { st.token = null; }

  var host = d.createElement('div');
  host.id = 'loudpilot-chat';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var side = C.position === 'left' ? 'left' : 'right';
  var color = /^#[0-9a-fA-F]{3,8}$/.test(C.color || '') ? C.color : '#4f46e5';
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.l{position:fixed;bottom:20px;' + side + ':20px;width:56px;height:56px;border-radius:50%;border:0;background:' + color + ';color:#fff;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.2);z-index:2147483000;display:grid;place-items:center}' +
    '.l svg{width:26px;height:26px}' +
    '.b{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;color:#fff;font-size:12px;font-weight:600;display:none;align-items:center;justify-content:center;padding:0 5px}' +
    '.p{position:fixed;bottom:88px;' + side + ':20px;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 110px);background:#fff;color:#18181b;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.22);z-index:2147483001;display:none;flex-direction:column;overflow:hidden}' +
    '.p.o{display:flex}' +
    '.h{background:' + color + ';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:8px}' +
    '.h b{flex:1;font-size:15px}' +
    '.x{background:transparent;border:0;color:#fff;cursor:pointer;font-size:22px;line-height:1;padding:0 4px}' +
    '.m{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#fafafa}' +
    '.g{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}' +
    '.g a{color:inherit;text-decoration:underline}' +
    '.vi{align-self:flex-end;background:' + color + ';color:#fff;border-bottom-right-radius:4px}' +
    '.bo{align-self:flex-start;background:#fff;border:1px solid #e4e4e7;border-bottom-left-radius:4px}' +
    '.n{align-self:center;font-size:12px;color:#71717a;text-align:center;max-width:90%}' +
    '.who{display:block;font-size:11px;color:#71717a;margin-bottom:2px}' +
    '.ty{align-self:flex-start;font-size:12px;color:#71717a;display:none}' +
    '.f{display:flex;gap:8px;padding:10px;border-top:1px solid #e4e4e7;background:#fff}' +
    '.f textarea{flex:1;resize:none;border:1px solid #d4d4d8;border-radius:10px;padding:9px 10px;font-size:14px;max-height:120px;outline:none;color:#18181b;background:#fff}' +
    '.f textarea:focus{border-color:' + color + '}' +
    '.f button{border:0;border-radius:10px;background:' + color + ';color:#fff;font-weight:600;font-size:14px;padding:0 14px;cursor:pointer}' +
    '.f button:disabled{opacity:.5;cursor:default}' +
    '.e{color:#b91c1c;font-size:12px;padding:0 12px 6px;display:none}' +
    '.ft{font-size:11px;color:#a1a1aa;text-align:center;padding:0 0 8px;background:#fff}' +
    '@media (max-width:480px){.p{bottom:0;' + side + ':0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}}' +
    '</style>' +
    '<button class="l" type="button" aria-label="' + t.open + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="b"></span></button>' +
    '<div class="p" role="dialog" aria-label="' + esc(C.name || 'Chat') + '">' +
    '<div class="h"><b>' + esc(C.name || 'Chat') + '</b><button class="x" type="button" aria-label="' + t.close + '">×</button></div>' +
    '<div class="m" role="log" aria-live="polite"><div class="ty">' + t.typing + '</div></div>' +
    '<div class="e" role="alert"></div>' +
    '<form class="f"><textarea rows="1" maxlength="2000" placeholder="' + t.ph + '" aria-label="' + t.ph + '"></textarea><button type="submit">' + t.send + '</button></form>' +
    '<div class="ft">' + t.powered + '</div>' +
    '</div>';
  var $ = function (q) { return root.querySelector(q); };
  var launcher = $('.l'), panel = $('.p'), list = $('.m'), typing = $('.ty'), form = $('.f'), input = $('textarea'), sendBtn = $('.f button'), errBox = $('.e'), badge = $('.b');

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rich(s) { return esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'); }
  function add(m) {
    if (m.id && st.seen[m.id]) return;
    if (m.id) st.seen[m.id] = 1;
    var el = d.createElement('div');
    if (m.role === 'NOTE') { el.className = 'n'; el.textContent = m.text; }
    else {
      el.className = 'g ' + (m.role === 'VISITOR' ? 'vi' : 'bo');
      el.innerHTML = (m.role === 'AGENT' ? '<span class="who">' + esc(m.by || t.team) + '</span>' : '') + rich(m.text);
    }
    list.insertBefore(el, typing);
    list.scrollTop = list.scrollHeight;
    if (m.at && (!st.last || m.at > st.last)) st.last = m.at;
    if (!st.open && m.role !== 'VISITOR' && m.role !== 'NOTE' && m.id) { st.unread++; showBadge(); }
  }
  function showBadge() { badge.textContent = st.unread > 9 ? '9+' : String(st.unread); badge.style.display = st.unread ? 'flex' : 'none'; }
  function merge(ms) { (ms || []).forEach(add); }
  function err(msg) { errBox.textContent = msg || ''; errBox.style.display = msg ? 'block' : 'none'; }
  function call(path, body) {
    return fetch(H.base + '/api/chat/' + path, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { j.status = r.status; throw j; } return j; }); });
  }
  function forget() { st.token = null; try { localStorage.removeItem(LS); } catch (e) { /* private mode */ } }
  function keep(token) { st.token = token; try { localStorage.setItem(LS, token); } catch (e) { /* private mode */ } }

  function poll() {
    clearTimeout(st.timer);
    if (!st.token || st.hidden) return;
    call('poll', { token: st.token, after: st.last }).then(function (j) {
      st.status = j.status || st.status;
      merge(j.messages);
      schedule();
    }, function (e) { if (e && e.status === 404) forget(); else schedule(); });
  }
  function schedule() {
    clearTimeout(st.timer);
    if (!st.token) return;
    st.timer = setTimeout(poll, st.open ? (st.status === 'HUMAN' ? 4000 : 15000) : 30000);
  }
  function send(text) {
    if (st.busy) return;
    st.busy = true; sendBtn.disabled = true; err('');
    var temp = { id: 'tmp' + Date.now(), role: 'VISITOR', text: text };
    add(temp);
    typing.style.display = st.status === 'HUMAN' ? 'none' : 'block';
    list.scrollTop = list.scrollHeight;
    var ids = H.ids();
    call('send', { token: st.token || undefined, s: H.key, v: ids.v, sid: ids.sid, url: location.href, id: H.identity() || undefined, preview: H.preview || undefined, text: text })
      .then(function (j) {
        keep(j.token);
        st.status = j.status || st.status;
        (j.messages || []).forEach(function (m) { if (m.role === 'VISITOR' && m.text === text) st.seen[m.id] = 1; if (m.at && (!st.last || m.at > st.last)) st.last = m.at; });
        merge(j.messages);
        schedule();
      }, function (e) {
        if (e && e.status === 404) forget();
        err((e && e.error && e.error.message) || t.err);
      })
      .then(function () { st.busy = false; sendBtn.disabled = false; typing.style.display = 'none'; });
  }
  function open() {
    st.open = true; st.unread = 0; showBadge();
    panel.classList.add('o');
    launcher.setAttribute('aria-expanded', 'true');
    if (!list.querySelector('.g') && C.greeting) add({ role: 'BOT', text: C.greeting });
    setTimeout(function () { input.focus(); }, 50);
    poll();
  }
  function close() {
    st.open = false;
    panel.classList.remove('o');
    launcher.setAttribute('aria-expanded', 'false');
    schedule();
  }
  launcher.addEventListener('click', function () { st.open ? close() : open(); });
  $('.x').addEventListener('click', close);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value.trim();
    if (!v) return;
    input.value = '';
    send(v);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.dispatchEvent(new Event('submit', { cancelable: true })); }
  });

  w.__lpChat = {
    cmd: function (c) {
      if (c === 'open') { if (st.hidden) this.cmd('show'); open(); }
      else if (c === 'close') close();
      else if (c === 'hide') { st.hidden = true; close(); host.style.display = 'none'; }
      else if (c === 'show') { st.hidden = false; host.style.display = ''; schedule(); }
    }
  };
  (d.body || d.documentElement).appendChild(host);
  (H.calls || []).forEach(function (c) { w.__lpChat.cmd(c); });
  if (st.token) poll();
})();
`
