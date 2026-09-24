// EDITA TURBO MAX — micro-interações

// Thumbs animadas na fila com dados de vídeo
(function renderThumbs(){
  const grid = document.getElementById('gridThumbs');
  if(!grid) return;

  const videos = [
    {title: 'menteespo...', duration: '0:13', audio: false},
    {title: 'menteespo...', duration: '0:13', audio: false},
    {title: 'sem crítica', duration: '0:21', audio: true},
    {title: 'sem crítica', duration: '0:24', audio: true},
    {title: 'desempenho', duration: '0:18', audio: true},
    {title: 'a minha agora', duration: '0:16', audio: true},
    {title: 'a minha agora', duration: '0:15', audio: true},
    {title: 'menteespo...', duration: '0:15', audio: false},
    {title: 'menteespo...', duration: '0:34', audio: true},
    {title: 'menteespo...', duration: '0:12', audio: true},
    {title: 'menteespo...', duration: '0:14', audio: true},
    {title: 'sem crítica', duration: '0:13', audio: false},
    {title: 'sem crítica', duration: '0:15', audio: true},
    {title: 'sem crítica', duration: '0:15', audio: true},
    {title: 'desempenho', duration: '0:42', audio: true},
    {title: 'desempenho', duration: '0:15', audio: true},
    {title: 'desempenho', duration: '0:18', audio: true},
    {title: 'desempenho', duration: '0:17', audio: true},
    {title: 'compreend...', duration: '0:13', audio: true},
    {title: 'compreend...', duration: '0:42', audio: true},
    {title: 'vida aí', duration: '0:13', audio: true},
    {title: 'vida aí', duration: '0:22', audio: true},
    {title: 'menteespo...', duration: '0:23', audio: true},
    {title: 'menteespo...', duration: '0:20', audio: true}
  ];

  videos.forEach((v, i) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    t.style.animationDelay = (i*30)+'ms';

    // Imagem placeholder com gradiente
    const img = document.createElement('img');
    img.className = 'thumb-img';
    img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 356'%3E%3Cdefs%3E%3ClinearGradient id='g${i}' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23a78bfa;stop-opacity:0.3'/%3E%3Cstop offset='100%25' style='stop-color:%2322d3ee;stop-opacity:0.2'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='356' fill='%230d0d16'/%3E%3Crect width='200' height='356' fill='url(%23g${i})'/%3E%3Ccircle cx='100' cy='178' r='40' fill='none' stroke='%2322d3ee' stroke-width='2' opacity='0.5'/%3E%3Cpolygon points='90,160 90,196 120,178' fill='%2322d3ee' opacity='0.6'/%3E%3C/svg%3E`;

    // Info com título e duração
    const info = document.createElement('div');
    info.className = 'thumb-info';
    info.innerHTML = `
      <span class="thumb-title">${v.title}</span>
      <span class="thumb-time">${v.duration}</span>
    `;

    // Badge "sem áudio"
    if(!v.audio){
      const badge = document.createElement('div');
      badge.className = 'thumb-badge';
      badge.textContent = 'sem áudio';
      t.appendChild(badge);
    }

    t.appendChild(img);
    t.appendChild(info);
    grid.appendChild(t);
  });
})();

// Vagas fake decrescendo (marketing scarcity — número base persistente localmente)
(function vagas(){
  const KEY = 'etm_vagas_seen_v1';
  const base = 50;
  let now = parseInt(localStorage.getItem(KEY) || base, 10);
  if(isNaN(now) || now > base) now = base;
  // Decrementa lentamente com o tempo (2 por dia no máximo, mínimo 12)
  const last = parseInt(localStorage.getItem(KEY+'_ts') || Date.now(), 10);
  const hrs = (Date.now()-last)/36e5;
  if(hrs > 6 && now > 12){
    now = Math.max(12, now - Math.floor(hrs/6));
    localStorage.setItem(KEY, now);
    localStorage.setItem(KEY+'_ts', Date.now());
  }
  const ids = ['vagasTop','vagasMid','vagasCard'];
  ids.forEach(id => { const el = document.getElementById(id); if(el) el.textContent = now; });
})();

// Reveal on scroll
(function reveal(){
  const targets = document.querySelectorAll('.step, .use, .feat-card, .proof-card, .side-card, .price-card, .pain-card');
  targets.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:.12});
  targets.forEach(el => io.observe(el));
})();

// Máscara simples WhatsApp
(function phoneMask(){
  const input = document.querySelector('input[name="whatsapp"]');
  if(!input) return;
  input.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g,'').slice(0,11);
    if(v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/,'($1) $2-$3');
    else if(v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/,'($1) $2-$3');
    else if(v.length > 2) v = v.replace(/^(\d{2})(\d{0,5}).*/,'($1) $2');
    else if(v.length > 0) v = v.replace(/^(\d{0,2}).*/,'($1');
    e.target.value = v;
  });
})();

// Envio de lead — POST pro endpoint interno (fallback: mailto)
async function handleLead(ev){
  ev.preventDefault();
  const form = ev.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const btn = form.querySelector('button[type="submit"]');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Enviando…';

  try{
    const res = await fetch('/lead', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({...data, source:'edita-turbo-max', ts: new Date().toISOString()})
    });
    if(!res.ok) throw new Error('nao ok');
    form.innerHTML = '<div style="text-align:center;padding:20px 0">'+
      '<h3 style="color:var(--green);margin-bottom:12px">Vaga garantida.</h3>'+
      '<p style="color:var(--text-2)">Recebemos seu contato. Em minutos você recebe o link de pagamento pelo WhatsApp <b>'+data.whatsapp+'</b>.</p>'+
      '</div>';
  }catch(err){
    // Fallback: WhatsApp direto
    const msg = encodeURIComponent('Quero garantir a vaga no Edita Turbo Max por R$ 97.\n\nNome: '+data.nome+'\nEmail: '+data.email+'\nUso: '+data.uso);
    window.location.href = 'https://wa.me/5511910075450?text='+msg;
  }
  return false;
}
