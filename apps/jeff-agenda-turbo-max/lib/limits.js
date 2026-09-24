// Limites oficiais de publicação por API, usados na validação server-side
// (lib/bulk.createCampaign) e espelhados no frontend (bulk.html).
//
// Fontes:
// - Instagram Graph API — Content Publishing: máximo de 50 posts via API por
//   conta a cada 24h (contagem no endpoint /content_publishing_limit).
//   Recomendação de segurança: ≤25/dia com intervalo mínimo entre posts, pra
//   não disparar heurísticas de spam da Meta.
//   https://developers.facebook.com/docs/instagram-api/guides/content-publishing
// - YouTube Data API v3: quota padrão 10.000 unidades/dia; videos.insert custa
//   1.600 unidades → ~6 uploads/dia sem aumento de quota.
//   https://developers.google.com/youtube/v3/determine_quota_cost
// - TikTok Content Posting API: 2 req/min no init; apps não auditados têm
//   limite baixo de posts públicos por usuário/dia.
//   https://developers.tiktok.com/doc/content-posting-api-reference-direct-post

const PLATFORM_LIMITS = {
  instagram: {
    max_posts_per_day: 25,       // recomendado (limite hard da API é 50)
    hard_max_posts_per_day: 50,
    min_interval_minutes: 0,
    label: 'Instagram'
  },
  // Stories entram no mesmo contador de content publishing (50/24h), mas são
  // naturalmente mais densos que o feed — intervalo mínimo menor.
  // Restrições da API para STORIES: vídeo de até 60s, sem legenda, sem
  // stickers/enquetes/link, sem carrossel.
  instagram_story: {
    max_posts_per_day: 20,
    hard_max_posts_per_day: 50,
    min_interval_minutes: 0,
    max_video_seconds: 60,
    label: 'Instagram Stories'
  },
  youtube: {
    max_posts_per_day: 6,
    min_interval_minutes: 60,
    label: 'YouTube'
  },
  tiktok: {
    max_posts_per_day: 10,
    min_interval_minutes: 15,
    label: 'TikTok'
  }
};

function parseHM(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

// Valida volume/horários de uma campanha contra os limites da plataforma.
// Retorna array de violações (vazio = ok).
// storiesPerBurst: para Stories, cada horário dispara uma sequência de N
// stories — o total diário real é posts_per_day × storiesPerBurst.
function validateCampaignLimits({ posts_per_day, times, jitter_minutes = 5, stories_per_burst = 1, burst_interval_minutes = 3, mirror_to_story = false }, platform = 'instagram') {
  const lim = PLATFORM_LIMITS[platform];
  const violations = [];
  if (!lim) return violations;

  const pd = parseInt(posts_per_day, 10) || 0;
  const burst = Math.max(1, parseInt(stories_per_burst, 10) || 1);
  const list = Array.isArray(times) ? times.filter(Boolean) : [];
  const isStory = platform === 'instagram_story';
  // Espelhamento: cada post do feed gera também um story → dobra o volume,
  // e ambos contam no mesmo limite de content publishing da Meta.
  const totalPerDay = pd * burst * (mirror_to_story ? 2 : 1);

  if (totalPerDay > lim.max_posts_per_day) {
    const conta = mirror_to_story ? `${pd} no feed + ${pd} em stories = ${totalPerDay}`
      : (isStory && burst > 1 ? `${pd} × ${burst} = ${totalPerDay}` : `${totalPerDay}`);
    violations.push(
      `${lim.label}: máximo seguro de ${lim.max_posts_per_day} publicações por dia por conta ` +
      `(você configurou ${conta}). ` +
      `Acima disso a API da plataforma bloqueia ou sinaliza a conta como spam.` +
      (mirror_to_story ? ' O espelhamento no Story dobra o volume — reduza os posts/dia pela metade.' : '')
    );
  }

  if (pd > list.length) {
    violations.push(
      `Você configurou ${pd} ${isStory ? 'sequências' : 'posts'}/dia mas só definiu ${list.length} horário(s). ` +
      `Adicione um horário para cada publicação do dia — horários repetidos caem no mesmo minuto e violam o intervalo mínimo.`
    );
  }

  // intervalo dentro da sequência de stories
  if (isStory && burst > 1 && burst_interval_minutes < lim.min_interval_minutes) {
    violations.push(
      `${lim.label}: intervalo entre os stories da sequência é de ${burst_interval_minutes} min, ` +
      `abaixo do mínimo seguro de ${lim.min_interval_minutes} min.`
    );
  }

  // intervalo mínimo entre horários consecutivos do mesmo dia.
  // Em Stories, a sequência ocupa (burst-1) × intervalo minutos — o próximo
  // horário precisa começar depois que a sequência anterior terminou.
  const burstSpan = isStory ? (burst - 1) * (parseInt(burst_interval_minutes, 10) || 0) : 0;
  const needed = lim.min_interval_minutes + burstSpan;
  const sorted = list.map(parseHM).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap < needed) {
      violations.push(
        `${lim.label}: intervalo mínimo entre horários é de ${needed} minutos` +
        (burstSpan ? ` (${lim.min_interval_minutes} de segurança + ${burstSpan} que a sequência de ${burst} stories ocupa)` : '') +
        ` — há horários com apenas ${gap} min de diferença, e o jitter de ±${jitter_minutes} min pode aproximá-los ainda mais.`
      );
      break;
    }
  }

  return violations;
}

module.exports = { PLATFORM_LIMITS, validateCampaignLimits };
