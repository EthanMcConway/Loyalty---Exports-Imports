// ==UserScript==
// @name         Lightspeed Loyalty - Exports & Imports
// @namespace    ls-loyalty-tools
// @version      1.1
// @description  Export CSVs, import customers into Groups, and import New Customers
// @match        https://loyalty.lightspeedapp.com/reports_points*
// @match        https://loyalty.lightspeedapp.com/user_list*
// @match        https://loyalty.lightspeedapp.com/sms_history*
// @match        https://loyalty.lightspeedapp.com/segment_list*
// @match        https://loyalty.lightspeedapp.com/reward_one_time_list*
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  const GIFS = { idle: 'https://media.tenor.com/2NRtE9OCeKUAAAAi/pepe-tea.gif', working: 'https://media1.tenor.com/m/OpuD_5Bf1y8AAAAC/nerding-speech-bubble.gif', done: 'https://media.tenor.com/Vw2sr_UWA6cAAAAi/pepo-party-celebrate.gif' };
  const CHUNK_SIZE = 50000;
  const IMPORT_DELAY_MS = 150;
  const SCRATCH = document.createElement('div');

  whenReady(() => {
    if (location.pathname.includes('/reports_points')) setupPoints();
    if (location.pathname.includes('/user_list')) setupUsers();
    if (location.pathname.includes('/sms_history')) setupSMS();
    if (location.pathname.includes('/segment_list')) setupSegments();
    if (location.pathname.includes('/reward_one_time_list')) setupOneTimeRewards();
  });

  function whenReady(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function waitFor(pred, timeout = 15000, interval = 200) { return new Promise(resolve => { const t0 = Date.now(); const timer = setInterval(() => { try { const ok = pred(); if (ok || Date.now() - t0 > timeout) { clearInterval(timer); resolve(ok || null); } } catch { clearInterval(timer); resolve(null); } }, interval); }); }
  function toCSV(matrix) { const esc = v => { if (v == null) return ''; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return matrix.map(row => row.map(esc).join(',')).join('\r\n'); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function formatInt(n) { return (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function downloadCSV(text, filename) { const blob = new Blob([text], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove(); }
  function buildBar(container) { const bar = document.createElement('div'); bar.style.margin = '8px 0'; bar.style.display = 'flex'; bar.style.alignItems = 'center'; bar.style.gap = '8px'; const icon = document.createElement('img'); icon.src = GIFS.idle; icon.width = 24; icon.height = 24; icon.style.borderRadius = '4px'; icon.style.objectFit = 'cover'; const status = document.createElement('span'); status.style.fontSize = '12px'; status.textContent = 'Idle'; bar.appendChild(icon); bar.appendChild(status); container.prepend(bar); return { bar, icon, status }; }
  function setStatus(targets, state, msg) { if (targets.status) targets.status.textContent = msg; if (targets.icon) targets.icon.src = GIFS[state] || GIFS.idle; }
  function stripHTML(s) { SCRATCH.innerHTML = s; const t = SCRATCH.textContent || ''; SCRATCH.textContent = ''; return t.replace(/\u00a0/g, ' ').trim(); }
  function norm(v) { if (v == null) return ''; if (typeof v === 'number' || typeof v === 'boolean') return String(v); if (typeof v === 'string') return stripHTML(v); if (Array.isArray(v)) return v.map(norm).join(' '); if (typeof v === 'object') { if ('display' in v && v.display != null) return norm(v.display); if ('text' in v && v.text != null) return norm(v.text); if ('value' in v && v.value != null) return norm(v.value); const first = v.firstName || v.first || v.fname || ''; const last = v.lastName || v.last || v.lname || ''; if ((first || last)) return `${norm(first)} ${norm(last)}`.trim(); const name = v.name || v.fullName || v.fullname || v.label || v.username || v.email || v.phone || v.phoneNumber; if (name != null) return norm(name); try { return stripHTML(JSON.stringify(v)); } catch { return String(v); } } return String(v); }
  function raw(v) { if (v == null) return ''; if (typeof v === 'string') return v; if (typeof v === 'object') { if ('display' in v && v.display != null) return String(v.display); if ('text' in v && v.text != null) return String(v.text); if ('value' in v && v.value != null) return String(v.value); } return String(v); }
  function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'export'; }
  function cell(r, i) { if (Array.isArray(r)) return r[i]; if (r && typeof r === 'object') return r[i] ?? r[String(i)]; return undefined; }
  function extractUserId(row) { if (row && !Array.isArray(row) && typeof row === 'object') { const dt = row.DT_RowId || row.DT_RowID || row.DT_Rowid || row.rowId || row.id; if (dt) { const m = String(dt).match(/(\d+)/); if (m) return m[1]; } } const len = Array.isArray(row) ? row.length : 0; for (let i = 0; i < len; i++) { const s = raw(cell(row, i)); if (!s) continue; let m = s.match(/data-(?:rowid|userid|segmentid)="(\d+)"/i) || s.match(/\bid_(\d+)\b/i) || s.match(/[?&](?:id|userId|userid|delete|edit)=(\d+)/i); if (m) return m[1]; } return ''; }
  function parseCSV(text) { const out = []; let i = 0, cur = [], val = '', inQ = false; const push = () => { cur.push(val); val = ''; }; const endRow = () => { push(); out.push(cur); cur = []; }; while (i < text.length) { const c = text[i++]; if (inQ) { if (c === '"') { if (text[i] === '"') { val += '"'; i++; } else inQ = false; } else val += c; } else { if (c === '"') inQ = true; else if (c === ',') push(); else if (c === '\n') endRow(); else if (c === '\r') {} else val += c; } } if (val.length || cur.length) endRow(); return out.filter(r => r.length && r.join('').trim().length); }
  function extractIdsFromCSV(text) { const rows = parseCSV(text); if (!rows.length) return []; const header = rows[0].map(s => String(s || '').trim().toLowerCase()); let idx = header.findIndex(h => h === 'id' || h === 'customer id' || h === 'customer_id'); const body = idx >= 0 ? rows.slice(1) : rows; if (idx < 0) idx = 0; const ids = body.map(r => String(r[idx] || '').trim()).map(s => (s.match(/^\d+$/) ? s : (s.match(/(\d+)/) || [,''])[1] || '')).filter(Boolean); return Array.from(new Set(ids)); }
  function extractNewCustomers(text) { const rows = parseCSV(text); if (!rows.length) return []; const hdr = rows[0].map(x => String(x || '').trim().toLowerCase()); const candidates = ['email','countrycode','phone','phonenumber','first','firstname','last','lastname','giftcardcode']; const hasHeader = candidates.some(k => hdr.includes(k)); let body = rows, mapIdx = {}; if (hasHeader) { body = rows.slice(1); const idx = n => hdr.findIndex(h => h === n); mapIdx = { email: idx('email'), cc: idx('countrycode'), phone: (()=>{const a=idx('phonenumber'),b=idx('phone');return a>=0?a:b;})(), first: (()=>{const a=idx('firstname'),b=idx('first');return a>=0?a:b;})(), last: (()=>{const a=idx('lastname'),b=idx('last');return a>=0?a:b;})(), gc: idx('giftcardcode') }; } const out = []; for (const r of body) { const pull = (i, def='') => (i!=null&&i>=0?String(r[i]||''):def).trim(); const email = hasHeader ? pull(mapIdx.email) : String(r[0]||'').trim(); if (!email) continue; let cc = hasHeader ? pull(mapIdx.cc) : String(r[1]||'').trim(); cc = cc.replace(/[^\d]/g,''); let phone = hasHeader ? pull(mapIdx.phone) : String(r[2]||'').trim(); phone = phone.replace(/[^\d]/g,''); const first = hasHeader ? pull(mapIdx.first) : String(r[3]||'').trim(); const last = hasHeader ? pull(mapIdx.last) : String(r[4]||'').trim(); const gc = hasHeader ? pull(mapIdx.gc,'') : String(r[5]||'').trim(); out.push({ Email: email, CountryCode: cc, PhoneNumber: phone, FirstName: first, LastName: last, GiftCardCode: gc }); } return out; }
  function normalizePhone(cc, phone){ cc=(cc||'').replace(/\D/g,''); phone=(phone||'').replace(/\D/g,''); if(cc==='1'){ if(phone.length===11 && phone.startsWith('1')) phone=phone.slice(1); } else if(cc){ phone=phone.replace(/^0+/, ''); } return { cc, phone }; }

  async function importNewCustomersFromText(text, iconEl, btnEl){
    const rows=extractNewCustomers(text);
    if(!rows.length){ iconEl.src=GIFS.idle; return; }
    iconEl.src=GIFS.working;
    let ok=0, fail=0, done=0;
    const failures=[['Email','CountryCode','PhoneNumber','FirstName','LastName','GiftCardCode','Response']];
    for(const r of rows){
      try{
        const n=normalizePhone(r.CountryCode, r.PhoneNumber);
        const body=new URLSearchParams();
        body.set('Email', r.Email||'');
        body.set('CountryCode', n.cc);
        body.set('PhoneNumber', n.phone);
        body.set('FirstName', r.FirstName||'');
        body.set('LastName', r.LastName||'');
        body.set('GiftCardCode', r.GiftCardCode||'');
        body.set('function', 'ADD_USER');
        const res=await fetch('/controllers/user_add_controller.php',{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
        const txt=await res.text();
        let msg=''; try{ const j=JSON.parse(txt); msg=j.Msg||j.message||j.status||txt; }catch{ msg=txt; }
        const success=/success|added|created|ok/i.test(msg)&&!/exist|duplicate|invalid|error/i.test(msg);
        if(res.ok && success){ ok++; } else { fail++; failures.push([r.Email,n.cc,n.phone,r.FirstName,r.LastName,r.GiftCardCode,String(msg).slice(0,200)]); }
        done++;
        const short=String(msg).trim().replace(/\s+/g,' ').slice(0,80);
        btnEl.textContent=`Importing ${done}/${rows.length} - ${short}`;
        await sleep(IMPORT_DELAY_MS);
      }catch(e){
        fail++; done++;
        const short=String(e).slice(0,200);
        btnEl.textContent=`Importing ${done}/${rows.length} - ${short}`;
        await sleep(IMPORT_DELAY_MS);
      }
    }
    btnEl.textContent=`Imported: ${ok}, Failed: ${fail}`;
    iconEl.src=GIFS.done;
    if(failures.length>1){
      const csv=toCSV(failures);
      downloadCSV(csv, `customer_import_failures_${new Date().toISOString().slice(0,10)}_${fail}.csv`);
    }
    setTimeout(()=>{ btnEl.textContent='Import New Customers'; iconEl.src=GIFS.idle; }, 4000);
  }

  function getShownTotal() {
    const span = document.querySelector('#example_info [reup-loc-key-translated="SHOWING_RESULTS_OF_ENTRIES_STATEMENT_DATATABLE"]') || document.querySelector('#example_info span') || document.querySelector('.dataTables_info span');
    if (!span) return null;
    const raw = span.getAttribute('param2') || span.textContent || '';
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  function setupPoints() { waitFor(() => document.querySelector('#example_wrapper')).then(injectPointsUI); }
  function injectPointsUI() {
    const container = document.querySelector('#example_wrapper .pull-right') || document.querySelector('#example_wrapper .row .col-sm-12') || document.querySelector('.padded') || document.body;
    const { bar, icon, status } = buildBar(container);
    const exportBtn = document.createElement('button'); exportBtn.textContent = 'Usage Export'; exportBtn.className = 'btn btn-primary btn-sm';
    const openBtn = document.createElement('button'); openBtn.textContent = 'Open JSON'; openBtn.className = 'btn btn-default btn-sm';
    bar.appendChild(exportBtn); bar.appendChild(openBtn);
    openBtn.addEventListener('click', () => { const total = getShownTotal(); if (!total) { setStatus({ icon, status }, 'idle', 'Could not detect total entry count.'); return; } const url = buildPointsURL({ iDisplayStart: 0, iDisplayLength: total }); setStatus({ icon, status }, 'working', 'Opening full JSON…'); window.open(url, '_blank'); setStatus({ icon, status }, 'done', 'Opened full JSON.'); });
    exportBtn.addEventListener('click', async () => {
      const total = getShownTotal(); if (!total) { setStatus({ icon, status }, 'idle', 'Could not detect total entry count.'); return; }
      const locMap = buildLocationMap(); const header = ['Username', 'First name', 'Last name', 'Points', 'Source', 'Location', 'Time']; const rows = [];
      try {
        for (let start = 0; start < total; start += CHUNK_SIZE) {
          const len = Math.min(CHUNK_SIZE, total - start);
          setStatus({ icon, status }, 'working', `Fetching ${start + 1}–${start + len} of ${formatInt(total)}…`);
          const url = buildPointsURL({ iDisplayStart: start, iDisplayLength: len });
          const res = await fetch(url, { credentials: 'include' }); const data = await res.json();
          if (!data || !Array.isArray(data.aaData)) throw new Error('Unexpected response format.');
          for (const r of data.aaData) { const locRaw = r[5] == null ? '' : String(r[5]).trim(); const locPretty = locMap[locRaw] || locMap[Number(locRaw)] || locRaw || ''; rows.push([norm(r[0]), norm(r[1]), norm(r[2]), norm(r[3]), norm(r[4]), norm(locPretty), norm(r[6])]); }
          await sleep(150);
        }
        const csv = toCSV([header, ...rows]);
        downloadCSV(csv, `usage_export_${new Date().toISOString().slice(0, 10)}_${formatInt(total)}.csv`);
        setStatus({ icon, status }, 'done', `Done. Downloaded ${formatInt(rows.length)} rows.`);
      } catch (e) { console.error(e); setStatus({ icon, status }, 'idle', `Error: ${e.message}`); }
    });
  }
  function buildLocationMap() { const map = {}; document.querySelectorAll('#locselect option').forEach(opt => { map[String(opt.value)] = (opt.textContent || '').trim(); }); return map; }
  function buildPointsURL({ iDisplayStart, iDisplayLength }) { const base = new URL('/controllers/reports_points_controller.php', location.origin); const params = new URLSearchParams(); const iColumns = 7; params.set('sEcho', '1'); params.set('iColumns', String(iColumns)); params.set('sColumns', ''); params.set('iDisplayStart', String(iDisplayStart)); params.set('iDisplayLength', String(iDisplayLength)); for (let i = 0; i < iColumns; i++) { params.set(`mDataProp_${i}`, String(i)); params.set(`sSearch_${i}`, ''); params.set(`bRegex_${i}`, 'false'); params.set(`bSearchable_${i}`, 'true'); params.set(`bSortable_${i}`, 'true'); } params.set('sSearch', ''); params.set('bRegex', 'false'); params.set('iSortCol_0', '6'); params.set('sSortDir_0', 'desc'); params.set('iSortingCols', '1'); params.set('_', String(Date.now())); base.search = params.toString(); return base.toString(); }

  function setupUsers() { waitFor(() => document.querySelector('#example_wrapper')).then(injectUsersUI); }
  function injectUsersUI() {
    const container = document.querySelector('#example_wrapper .pull-right') || document.querySelector('#example_wrapper .row .col-sm-12') || document.querySelector('.padded') || document.body;
    const { bar, icon, status } = buildBar(container);
    const exportBtn = document.createElement('button'); exportBtn.textContent = 'Escalation Export'; exportBtn.className = 'btn btn-primary btn-sm';
    const openBtn = document.createElement('button'); openBtn.textContent = 'Open JSON'; openBtn.className = 'btn btn-default btn-sm';
    bar.appendChild(exportBtn); bar.appendChild(openBtn);
    const addUserEl = document.querySelector('#Add_User');
    if (addUserEl) {
      const wrap = document.createElement('span'); wrap.style.marginLeft = '8px'; wrap.style.whiteSpace = 'nowrap';
      const icon2 = document.createElement('img'); icon2.src = GIFS.idle; icon2.width = 18; icon2.height = 18; icon2.style.verticalAlign = 'middle'; icon2.style.marginRight = '6px'; icon2.style.borderRadius = '3px';
      const importBtn = document.createElement('button'); importBtn.className = 'btn btn-warning btn-sm'; importBtn.textContent = 'Import New Customers';
      const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.csv,.txt'; fileInput.style.display = 'none';
      wrap.appendChild(icon2); wrap.appendChild(importBtn); wrap.appendChild(fileInput);
      addUserEl.insertAdjacentElement('afterend', wrap);
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0]; if (!file) return;
        const text = await file.text();
        await importNewCustomersFromText(text, icon2, importBtn);
        fileInput.value = '';
      });
    }
    openBtn.addEventListener('click', () => { const total = getShownTotal(); if (!total) { setStatus({ icon, status }, 'idle', 'Could not detect total entry count.'); return; } const { idx, dir } = getSortStateUsers(); const search = getUserSearch(); const url = buildUserListURL({ start: 0, length: total, sortIdx: idx, sortDir: dir, search }); setStatus({ icon, status }, 'working', 'Opening full JSON…'); window.open(url, '_blank'); setStatus({ icon, status }, 'done', 'Opened full JSON.'); });
    exportBtn.addEventListener('click', async () => {
      const total = getShownTotal(); if (!total) { setStatus({ icon, status }, 'idle', 'Could not detect total entry count.'); return; }
      const { idx, dir } = getSortStateUsers(); const search = getUserSearch(); let sawOptIns = false; const baseHeader = ['ID', 'Email', 'Phone number', 'First name', 'Last name', 'Created', 'Points']; const rows = [];
      try {
        for (let start = 0; start < total; start += CHUNK_SIZE) {
          const len = Math.min(CHUNK_SIZE, total - start);
          setStatus({ icon, status }, 'working', `Fetching ${start + 1}–${start + len} of ${formatInt(total)}…`);
          const url = buildUserListURL({ start, length: len, sortIdx: idx, sortDir: dir, search });
          const res = await fetch(url, { credentials: 'include' }); const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { throw new Error('Unexpected response while fetching users.'); }
          if (!data || !Array.isArray(data.aaData)) throw new Error('Unexpected response format.');
          for (const r of data.aaData) {
            const id = extractUserId(r);
            const row = [id, norm(cell(r,0)), norm(cell(r,1)), norm(cell(r,2)), norm(cell(r,3)), norm(cell(r,4)), norm(cell(r,5))];
            if (Array.isArray(r) && r.length >= 9) { row.push(norm(cell(r,7)), norm(cell(r,8))); sawOptIns = true; }
            rows.push(row);
          }
          await sleep(150);
        }
        const header = sawOptIns ? [...baseHeader, 'Email Opt-In', 'SMS Opt-In'] : baseHeader;
        for (const r of rows) while (r.length < header.length) r.push('');
        const csv = toCSV([header, ...rows]);
        downloadCSV(csv, `escalation_export_${new Date().toISOString().slice(0, 10)}_${formatInt(total)}.csv`);
        setStatus({ icon, status }, 'done', `Done. Downloaded ${formatInt(rows.length)} rows.`);
      } catch (e) { console.error(e); setStatus({ icon, status }, 'idle', `Error: ${e.message}`); }
    });
  }
  function getSortStateUsers() { const ths = Array.from(document.querySelectorAll('#example thead th')); let idx = ths.findIndex(th => th.classList.contains('sorting_asc') || th.classList.contains('sorting_desc')); if (idx < 0) idx = 0; let dir = 'asc'; if (ths[idx] && ths[idx].classList.contains('sorting_desc')) dir = 'desc'; if (idx > 6) idx = 0; return { idx, dir }; }
  function getUserSearch() { const input = document.querySelector('#example_filter input'); return input ? input.value.trim() : ''; }
  function buildUserListURL({ start, length, sortIdx, sortDir, search }) { const base = new URL('/controllers/user_list_controller.php', location.origin); const p = new URLSearchParams(); const iColumns = 7; p.set('showPhone', '1'); p.set('segmentIDs', '[]'); p.set('noCredit', '1'); p.set('sEcho', '1'); p.set('iColumns', String(iColumns)); p.set('sColumns', ''); p.set('iDisplayStart', String(start)); p.set('iDisplayLength', String(length)); for (let i = 0; i < iColumns; i++) { p.set(`mDataProp_${i}`, String(i)); p.set(`sSearch_${i}`, ''); p.set(`bRegex_${i}`, 'false'); p.set(`bSearchable_${i}`, 'true'); p.set(`bSortable_${i}`, 'true'); } p.set('sSearch', search || ''); p.set('bRegex', 'false'); p.set('iSortCol_0', String(sortIdx ?? 0)); p.set('sSortDir_0', sortDir || 'asc'); p.set('iSortingCols', '1'); p.set('_', String(Date.now())); base.search = p.toString(); return base.toString(); }

  function setupSMS() { waitFor(() => document.querySelector('#example_wrapper')).then(injectSMSUI); }
  function injectSMSUI() {
    const container = document.querySelector('#example_wrapper .pull-right') || document.querySelector('#example_wrapper .row .col-sm-12') || document.querySelector('.padded') || document.body;
    const { bar, icon, status } = buildBar(container);
    const exportBtn = document.createElement('button'); exportBtn.textContent = 'SMS Export'; exportBtn.className = 'btn btn-primary btn-sm';
    const openBtn = document.createElement('button'); openBtn.textContent = 'Open JSON'; openBtn.className = 'btn btn-default btn-sm';
    bar.appendChild(exportBtn); bar.appendChild(openBtn);
    openBtn.addEventListener('click', () => { const total = getShownTotal(); if (!total) { setStatus({ icon, status }, 'idle', 'Could not detect total entry count.'); return; } const { idx, dir } = getSortStateSMS(); const search = getSMSSearch(); const url = buildSMSURL({ start: 0, length: total, sortIdx: idx, sortDir: dir, search }); setStatus({ icon, status }, 'working', 'Opening full JSON…'); window.open(url, '_blank'); setStatus({ icon, status }, 'done', 'Opened full JSON.'); });
    exportBtn.addEventListener('click', async () => {
      const total = getShownTotal(); if (!total) { setStatus({ icon, status }, 'idle', 'Could not detect total entry count.'); return; }
      const { idx, dir } = getSortStateSMS(); const search = getSMSSearch(); const header = ['SMS message', 'Recipients', 'Date sent']; const rows = [];
      try {
        for (let start = 0; start < total; start += CHUNK_SIZE) {
          const len = Math.min(CHUNK_SIZE, total - start);
          setStatus({ icon, status }, 'working', `Fetching ${start + 1}–${start + len} of ${formatInt(total)}…`);
          const url = buildSMSURL({ start, length: len, sortIdx: idx, sortDir: dir, search });
          const res = await fetch(url, { credentials: 'include' }); const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { throw new Error('Unexpected response while fetching SMS history.'); }
          if (!data || !Array.isArray(data.aaData)) throw new Error('Unexpected response format.');
          for (const r of data.aaData) rows.push([norm(r[0]), norm(r[1]), norm(r[2])]);
          await sleep(150);
        }
        const csv = toCSV([header, ...rows]);
        downloadCSV(csv, `sms_export_${new Date().toISOString().slice(0, 10)}_${formatInt(total)}.csv`);
        setStatus({ icon, status }, 'done', `Done. Downloaded ${formatInt(rows.length)} rows.`);
      } catch (e) { console.error(e); setStatus({ icon, status }, 'idle', `Error: ${e.message}`); }
    });
  }
  function getSortStateSMS() { const ths = Array.from(document.querySelectorAll('#example thead th')); let idx = ths.findIndex(th => th.classList.contains('sorting_asc') || th.classList.contains('sorting_desc')); if (idx < 0) idx = 2; let dir = 'asc'; if (ths[idx] && ths[idx].classList.contains('sorting_desc')) dir = 'desc'; if (idx > 2) idx = 2; return { idx, dir }; }
  function getSMSSearch() { const input = document.querySelector('#example_filter input'); return input ? input.value.trim() : ''; }
  function buildSMSURL({ start, length, sortIdx, sortDir, search }) { const base = new URL('/controllers/sms_history_controller.php', location.origin); const p = new URLSearchParams(); const iColumns = 3; p.set('noChildren', '1'); p.set('isMarketing', '1'); p.set('sEcho', '1'); p.set('iColumns', String(iColumns)); p.set('sColumns', ''); p.set('iDisplayStart', String(start)); p.set('iDisplayLength', String(length)); for (let i = 0; i < iColumns; i++) { p.set(`mDataProp_${i}`, String(i)); p.set(`sSearch_${i}`, ''); p.set(`bRegex_${i}`, 'false'); p.set(`bSearchable_${i}`, 'true'); p.set(`bSortable_${i}`, 'true'); } p.set('sSearch', search || ''); p.set('bRegex', 'false'); p.set('iSortCol_0', String(sortIdx ?? 2)); p.set('sSortDir_0', sortDir || 'desc'); p.set('iSortingCols', '1'); p.set('_', String(Date.now())); base.search = p.toString(); return base.toString(); }

  function setupSegments() {
    const scanAndAugment = () => {
      const rows = document.querySelectorAll('table[id^="segmentListTable"] tbody tr');
      rows.forEach(tr => {
        const actionsCell = tr.querySelector('td.read_only_cells') || tr.querySelectorAll('td')[2];
        const manageBtn = actionsCell ? actionsCell.querySelector('button.view-users[data-segmentid]') : null;
        if (!manageBtn) return;
        if (actionsCell.querySelector('.ls-seg-export-wrap')) return;
        const segId = manageBtn.dataset.segmentid || (tr.id.match(/\d+/) || [])[0];
        if (!segId) return;
        const readOnly = manageBtn.getAttribute('data-read-only') === 'true';
        const groupName = (tr.querySelector('td')?.textContent || '').trim();
        const wrap = document.createElement('span'); wrap.className = 'ls-seg-export-wrap'; wrap.style.whiteSpace = 'nowrap'; wrap.style.marginLeft = '8px';
        const icon = document.createElement('img'); icon.src = GIFS.idle; icon.width = 18; icon.height = 18; icon.style.verticalAlign = 'middle'; icon.style.marginRight = '6px'; icon.style.borderRadius = '3px';
        const exportBtn = document.createElement('button'); exportBtn.className = 'btn btn-xs btn-info'; exportBtn.style.marginRight = '6px'; exportBtn.textContent = 'Groups Export';
        const openBtn = document.createElement('button'); openBtn.className = 'btn btn-xs btn-default'; openBtn.style.marginRight = '6px'; openBtn.textContent = 'Open JSON';
        wrap.appendChild(icon); wrap.appendChild(exportBtn); wrap.appendChild(openBtn);
        let importBtn, fileInput;
        if (!readOnly) {
          importBtn = document.createElement('button'); importBtn.className = 'btn btn-xs btn-warning'; importBtn.textContent = 'Import customers into group';
          importBtn.title = 'Tip: Use “Escalation Export” to get customer IDs, then upload that file to add those customers into this group.';
          fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.csv,.txt'; fileInput.style.display = 'none';
          wrap.appendChild(importBtn); wrap.appendChild(fileInput);
        }
        actionsCell.appendChild(wrap);
        openBtn.addEventListener('click', async () => {
          icon.src = GIFS.working;
          const total = await getSegmentTotal(segId, groupName);
          if (!total) { icon.src = GIFS.idle; return; }
          const url = buildSegmentUsersURL({ segmentId: segId, start: 0, length: total, sortIdx: 0, sortDir: 'asc' });
          window.open(url, '_blank');
          icon.src = GIFS.done;
        });
        exportBtn.addEventListener('click', async () => {
          icon.src = GIFS.working;
          try {
            const total = await getSegmentTotal(segId, groupName);
            if (!total) { icon.src = GIFS.idle; return; }
            const header = ['Username', 'Phone number', 'Full name'];
            const out = [];
            for (let start = 0; start < total; start += CHUNK_SIZE) {
              const len = Math.min(CHUNK_SIZE, total - start);
              const url = buildSegmentUsersURL({ segmentId: segId, start, length: len, sortIdx: 0, sortDir: 'asc' });
              const res = await fetch(url, { credentials: 'include' });
              const txt = await res.text();
              let data; try { data = JSON.parse(txt); } catch { throw new Error('Bad JSON'); }
              if (!data || !Array.isArray(data.aaData)) throw new Error('Unexpected response');
              for (const r of data.aaData) out.push([norm(cell(r,0)), norm(cell(r,1)), norm(cell(r,2))]);
              await sleep(120);
            }
            const csv = toCSV([header, ...out]);
            downloadCSV(csv, `groups_export_${slugify(groupName)}_${new Date().toISOString().slice(0,10)}_${formatInt(total)}.csv`);
            icon.src = GIFS.done;
          } catch (e) { console.error(e); icon.src = GIFS.idle; }
        });
        if (importBtn && fileInput) {
          importBtn.addEventListener('click', () => fileInput.click());
          fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0]; if (!file) return;
            const text = await file.text();
            const ids = extractIdsFromCSV(text);
            if (!ids.length) { icon.src = GIFS.idle; return; }
            icon.src = GIFS.working;
            let ok = 0, fail = 0, done = 0;
            for (const id of ids) {
              try {
                const url = new URL('/controllers/segment_list_user_controller.php', location.origin);
                url.searchParams.set('addUserIDToSegment', id);
                url.searchParams.set('segmentID', String(segId));
                url.searchParams.set('_', String(Date.now()));
                const res = await fetch(url.toString(), { credentials: 'include' });
                const txt = await res.text();
                let msg = ''; try { const j=JSON.parse(txt); msg=j.Msg||j.message||j.Status||txt; } catch { msg=txt; }
                if (res.ok) ok++; else fail++;
                done++;
                const short=String(msg).trim().replace(/\s+/g,' ').slice(0,80);
                importBtn.textContent = `Importing ${done}/${ids.length} - ${short}`;
                await sleep(IMPORT_DELAY_MS);
              } catch(e) {
                fail++; done++;
                const short=String(e).slice(0,200);
                importBtn.textContent = `Importing ${done}/${ids.length} - ${short}`;
                await sleep(IMPORT_DELAY_MS);
              }
            }
            importBtn.textContent = `Imported: ${ok}, Failed: ${fail}`;
            icon.src = GIFS.done;
            setTimeout(() => { importBtn.textContent = 'Import customers into group'; icon.src = GIFS.idle; }, 4000);
            fileInput.value = '';
          });
        }
      });
    };
    const mo = new MutationObserver(() => scanAndAugment());
    mo.observe(document.body, { childList: true, subtree: true });
    scanAndAugment();
  }
  async function getSegmentTotal(segmentId, groupName) { const fallback = parseCountFromName(groupName); if (Number.isFinite(fallback) && fallback > 0) return fallback; try { const url = buildSegmentUsersURL({ segmentId, start: 0, length: 1, sortIdx: 0, sortDir: 'asc' }); const res = await fetch(url, { credentials: 'include' }); const data = await res.json(); const t = parseInt((data.iTotalDisplayRecords ?? data.iTotalRecords ?? 0), 10); return Number.isFinite(t) && t > 0 ? t : null; } catch { return null; } }
  function parseCountFromName(name) { const m = String(name || '').match(/\(([\d,]+)\)\s*$/); if (!m) return null; return parseInt(m[1].replace(/[^\d]/g, ''), 10) || null; }
  function buildSegmentUsersURL({ segmentId, start, length, sortIdx, sortDir }) { const base = new URL('/controllers/segment_list_user_controller.php', location.origin); const p = new URLSearchParams(); const iColumns = 4; p.set('getUsersBySegmentTable', String(segmentId)); p.set('sEcho', '1'); p.set('iColumns', String(iColumns)); p.set('sColumns', ''); p.set('iDisplayStart', String(start)); p.set('iDisplayLength', String(length)); for (let i = 0; i < iColumns; i++) { p.set(`mDataProp_${i}`, String(i)); p.set(`sSearch_${i}`, ''); p.set(`bRegex_${i}`, 'false'); p.set(`bSearchable_${i}`, 'true'); p.set(`bSortable_${i}`, i === 3 ? 'false' : 'true'); } p.set('sSearch', ''); p.set('bRegex', 'false'); p.set('iSortCol_0', String(sortIdx ?? 0)); p.set('sSortDir_0', sortDir || 'asc'); p.set('iSortingCols', '1'); p.set('_', String(Date.now())); base.search = p.toString(); return base.toString(); }

  function setupOneTimeRewards() {
    const scanAndAugment = () => {
      const rows = document.querySelectorAll('tbody tr[id^="id_"]');
      rows.forEach(tr => {
        const btn = tr.querySelector('button.view-users[data-ontimerewardid], button.view-users[data-onetimerewardid]');
        if (!btn) return;
        const rewardId = btn.dataset.ontimerewardid || btn.dataset.onetimerewardid || (tr.id.match(/\d+/) || [])[0];
        if (!rewardId) return;
        const actionsCell = btn.closest('td') || tr.querySelectorAll('td')[3];
        if (!actionsCell || actionsCell.querySelector('.ls-ot-export-wrap')) return;
        const rewardName = (tr.querySelector('td')?.textContent || '').trim();
        const wrap = document.createElement('span'); wrap.className = 'ls-ot-export-wrap'; wrap.style.whiteSpace = 'nowrap'; wrap.style.marginLeft = '8px';
        const icon = document.createElement('img'); icon.src = GIFS.idle; icon.width = 18; icon.height = 18; icon.style.verticalAlign = 'middle'; icon.style.marginRight = '6px'; icon.style.borderRadius = '3px';
        const exportBtn = document.createElement('button'); exportBtn.className = 'btn btn-xs btn-info'; exportBtn.style.marginRight = '6px'; exportBtn.textContent = 'One-Time Reward Export';
        const openBtn   = document.createElement('button'); openBtn.className   = 'btn btn-xs btn-default'; openBtn.style.marginRight   = '6px'; openBtn.textContent   = 'Open JSON';
        wrap.appendChild(icon); wrap.appendChild(exportBtn); wrap.appendChild(openBtn);
        actionsCell.appendChild(wrap);
        openBtn.addEventListener('click', async () => {
          icon.src = GIFS.working;
          const total = await getOneTimeRewardTotal(rewardId);
          if (!total) { icon.src = GIFS.idle; return; }
          const url = buildOneTimeRewardUsersURL({ rewardId, start: 0, length: total, sortIdx: 5, sortDir: 'desc' });
          window.open(url, '_blank');
          icon.src = GIFS.done;
        });
        exportBtn.addEventListener('click', async () => {
          icon.src = GIFS.working;
          try {
            const total = await getOneTimeRewardTotal(rewardId);
            if (!total) { icon.src = GIFS.idle; return; }
            const header = ['User','First name','Last name','Source','Status','Date issued','Expiry date'];
            const out = [];
            for (let start = 0; start < total; start += CHUNK_SIZE) {
              const len = Math.min(CHUNK_SIZE, total - start);
              const url = buildOneTimeRewardUsersURL({ rewardId, start, length: len, sortIdx: 5, sortDir: 'desc' });
              const res = await fetch(url, { credentials: 'include' });
              const txt = await res.text();
              let data; try { data = JSON.parse(txt); } catch { throw new Error('Bad JSON'); }
              if (!data || !Array.isArray(data.aaData)) throw new Error('Unexpected response');
              const fmt = d => {
  if (!d) return '';
  const dt = new Date(d.replace(' ', 'T') + 'Z');
  if (isNaN(dt)) return String(d);
  return dt.toLocaleString(undefined, {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

for (const r of data.aaData) {
  const user = norm(cell(r, 0));
  const first = norm(cell(r, 1));
  const last = norm(cell(r, 2));
  const sourceCode = String(cell(r, 3) ?? '').trim();
  const statusCode = Number(cell(r, 4) ?? 0);
  const issuedRaw = norm(cell(r, 5));
  const expiryRaw = norm(cell(r, 6));

  const sourceLabel = (typeof window.rewardSourceNames === 'object' && window.rewardSourceNames[sourceCode])
    ? window.rewardSourceNames[sourceCode]
    : sourceCode;

  const expiryDate = expiryRaw ? new Date(expiryRaw.replace(' ', 'T') + 'Z') : null;
  let statusLabel = '';
  if (statusCode === 1) statusLabel = 'Redeemed';
  else if (expiryDate && !isNaN(expiryDate) && expiryDate < new Date()) statusLabel = 'Expired';
  else statusLabel = 'Issued';

  out.push([
    user,
    first,
    last,
    sourceLabel,
    statusLabel,
    fmt(issuedRaw),
    fmt(expiryRaw)
  ]);
}

              await sleep(120);
            }
            const csv = toCSV([header, ...out]);
            downloadCSV(csv, `one_time_reward_export_${slugify(rewardName)}_${new Date().toISOString().slice(0,10)}_${formatInt(total)}.csv`);
            icon.src = GIFS.done;
          } catch (e) {
            console.error(e);
            icon.src = GIFS.idle;
          }
        });
      });
    };
    const mo = new MutationObserver(() => scanAndAugment());
    mo.observe(document.body, { childList: true, subtree: true });
    scanAndAugment();
  }
  async function getOneTimeRewardTotal(rewardId) {
    try {
      const url = buildOneTimeRewardUsersURL({ rewardId, start: 0, length: 1, sortIdx: 5, sortDir: 'desc' });
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      const t = parseInt((data.iTotalDisplayRecords ?? data.iTotalRecords ?? 0), 10);
      return Number.isFinite(t) && t > 0 ? t : null;
    } catch { return null; }
  }
  function buildOneTimeRewardUsersURL({ rewardId, start, length, sortIdx, sortDir }) {
    const base = new URL('/controllers/one_time_reward_user_link_controller.php', location.origin);
    const p = new URLSearchParams(); const iColumns = 8;
    p.set('oneTimeRewardID', String(rewardId));
    p.set('sEcho', '1'); p.set('iColumns', String(iColumns)); p.set('sColumns', '');
    p.set('iDisplayStart', String(start)); p.set('iDisplayLength', String(length));
    for (let i = 0; i < iColumns; i++) {
      p.set(`mDataProp_${i}`, String(i));
      p.set(`sSearch_${i}`, ''); p.set(`bRegex_${i}`, 'false');
      p.set(`bSearchable_${i}`, 'true'); p.set(`bSortable_${i}`, 'true');
    }
    p.set('sSearch', ''); p.set('bRegex', 'false');
    p.set('iSortCol_0', String(sortIdx ?? 5));
    p.set('sSortDir_0', sortDir || 'desc');
    p.set('iSortingCols', '1');
    p.set('_', String(Date.now()));
    base.search = p.toString(); return base.toString();
  }
})();
