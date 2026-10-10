const $ = (selector) => document.querySelector(selector);
const results = $('#results');
const title = $('#result-title');
const count = $('#result-count');
const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const showError = (message) => { results.className = 'results'; results.innerHTML = `<div class="error">${escapeHtml(message)}</div>`; };

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
  $('#case-form').classList.toggle('hidden', tab.dataset.tab !== 'case');
  $('#cause-form').classList.toggle('hidden', tab.dataset.tab !== 'cause');
}));

$('#case-form').addEventListener('submit', async (event) => {
  event.preventDefault(); title.textContent = 'Searching NCLT records'; count.textContent = ''; results.className = 'results'; results.innerHTML = '<div class="loading">Connecting to the official case search…</div>';
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/nclt/search', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.errors?.join(' ') || data.persistenceError || 'Search or MongoDB save failed.');
    title.textContent = data.status === 'success' ? 'Matching case records' : data.status === 'manual_action_required' ? 'CAPTCHA needed' : data.status === 'no_records' ? 'No records found' : 'Search issue';
    if (data.status === 'manual_action_required') { showError(`${data.message} Submit again after completing it.`); return; }
    if (data.status !== 'success' || !data.cases?.length) { results.className = 'results empty'; results.innerHTML = `<div class="empty-mark">⌕</div><p>${escapeHtml(data.message || data.error || data.persistenceError || 'No matching case records were returned.')}</p>`; return; }
    count.textContent = `${data.cases.length} record${data.cases.length === 1 ? '' : 's'} · saved`;
    results.innerHTML = data.cases.map((item) => `<article class="case-card"><h3 class="case-title">${escapeHtml(item.caseTitle || 'Case title unavailable')}</h3><div class="case-sub">${escapeHtml(item.caseType)} ${escapeHtml(item.caseNumber)} · Filing ${escapeHtml(item.filingNumber)}</div><div class="details">${[['Bench / court',item.benchLocationAndCourt],['Status',item.caseStatus],['Case stage',item.caseStage],['Next listing',item.nextListingOrDisposeDate],['Filing date',item.filingDate],['Registration date',item.registrationDate]].map(([label,value])=>`<div class="detail"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div></article>`).join('');
    const orderParams = new URLSearchParams(body);
    const orderResponse = await fetch(`/api/nclt/orders?${orderParams}`);
    const orderData = await orderResponse.json();
    if (orderResponse.ok) {
      const orderMarkup = orderData.orders.length
        ? orderData.orders.map((order) => `<article class="match"><div class="match-meta"><span class="chip">Order PDF</span>${order.hearingDate ? `<span class="chip">${escapeHtml(order.hearingDate)}</span>` : ''}${order.sha256 ? `<span class="chip">Downloaded</span>` : ''}</div><p>${order.sourceUrl ? `<a href="${escapeHtml(order.sourceUrl)}" target="_blank" rel="noopener">Open official order source ↗</a>` : 'Source link unavailable'} · Local file: ${escapeHtml(order.pdfPath?.split(/[\\/]/).pop())}</p>${order.extractedTextPath ? `<p>OCR text: ${escapeHtml(order.extractedTextPath.split(/[\\/]/).pop())} · verify against the PDF</p>` : ''}</article>`).join('')
        : '<p class="muted">No downloaded order metadata is saved for this case yet.</p>';
      results.insertAdjacentHTML('beforeend', `<section class="orders-section"><h3>Order information</h3>${orderMarkup}</section>`);
    }
    loadSaved();
  } catch (error) { title.textContent = 'Could not complete search'; showError(error.message); }
});

$('#cause-form').addEventListener('submit', async (event) => {
  event.preventDefault(); title.textContent = 'Searching cause list'; count.textContent = ''; results.className = 'results'; results.innerHTML = '<div class="loading">Reading the cause list PDF…</div>';
  try {
    const form = new FormData(event.currentTarget); const params = new URLSearchParams();
    for (const [key,value] of form) if (String(value).trim()) params.set(key,String(value).trim());
    const response = await fetch(`/api/nclt/cause-list/search?${params}`); const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Cause list search failed.');
    const matches = data.matches || []; title.textContent = matches.length ? 'Hearing matches' : 'No hearing match'; count.textContent = matches.length ? `${matches.length} match${matches.length===1?'':'es'}` : '';
    if (!matches.length) { results.className='results empty'; results.innerHTML='<div class="empty-mark">⌕</div><p>No exact match was found in this cause list PDF.</p>'; return; }
    results.innerHTML=matches.map((match)=>`<article class="match"><div class="match-meta"><span class="chip">Page ${escapeHtml(match.page)}</span>${match.hearingDate?`<span class="chip">Hearing ${escapeHtml(match.hearingDate)}</span>`:''}${match.court?`<span class="chip">${escapeHtml(match.court)}</span>`:''}${match.itemNumber?`<span class="chip">Item ${escapeHtml(match.itemNumber)}</span>`:''}</div><p>${escapeHtml(match.context)}</p></article>`).join('');
  } catch(error) { title.textContent='Could not search cause list'; showError(error.message); }
});

async function loadSaved() {
  const container=$('#saved-cases');
  try {
    const response=await fetch('/api/nclt/cases'); const data=await response.json();
    if(!response.ok) throw new Error(data.message || 'MongoDB is not connected.');
    if(!data.cases.length){container.innerHTML='<p class="muted">No saved searches yet. Successful case searches will appear here.</p>';return;}
    container.innerHTML=data.cases.map((record)=>`<article class="saved-card"><h3>${escapeHtml(record.cases?.[0]?.caseTitle || `${record.input.caseType} ${record.input.caseNumber}/${record.input.caseYear}`)}</h3><p>${escapeHtml(record.input.bench)} bench · ${escapeHtml(record.status)}</p><p>Last checked ${escapeHtml(new Date(record.checkedAt).toLocaleString())}</p></article>`).join('');
  } catch(error) { container.innerHTML=`<p class="muted">${escapeHtml(error.message)}</p>`; }
}
$('#refresh').addEventListener('click', loadSaved);
loadSaved();
