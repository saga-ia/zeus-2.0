'use strict';

// DDDs BR validos oficialmente ativos. Usado como sinal fraco pra decidir se um
// numero de 10 ou 11 digitos SEM DDI eh mesmo BR. Nao rejeita se DDD estiver
// fora dessa lista (rede de baixa concordancia com paises que compartilham
// prefixo eh problema real), mas ajuda a diferenciar de numero internacional
// mal-formatado.
const BR_DDDS = new Set([
  11,12,13,14,15,16,17,18,19,
  21,22,24,27,28,
  31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,
  51,53,54,55,
  61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,
  81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99,
]);

// Normaliza telefone pra formato BR padrao E.164 sem '+':
//   - remove tudo que nao eh digito
//   - retorna { phone, reason? } com reason preenchida quando phone=null
//
// Regras (Fix Smith 2026-07-21):
//   - 10 digitos: fixo BR sem 9 e sem DDI (ex "1133224455"). Se 2 primeiros
//     digitos batem em DDD BR conhecido, prefixa 55. Senao, rejeita como
//     ambiguo.
//   - 11 digitos: celular BR sem DDI. Se 2 primeiros digitos batem em DDD BR
//     conhecido, prefixa 55. Regra "3o digito eh 9" ajuda mas nao eh
//     obrigatoria (fixo com 8 digitos + DDD tambem tem 10, ja tratado acima).
//   - 12 digitos: pode ser 55 + fixo BR (12), pode ser DDI internacional. Se
//     comeca com 55 e 3o+4o batem em DDD BR conhecido, aceita. Senao aceita
//     como internacional generico (nao mexe).
//   - 13 digitos: pode ser 55 + celular BR. Se comeca com 55, aceita.
//     Senao aceita como internacional.
//   - 14-15 digitos: DDI internacional longo, mantem.
//   - < 10 ou > 15: rejeita.
function normalizePhoneExplain(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!digits) return { phone: null, reason: 'empty' };
  const len = digits.length;

  if (len < 10) return { phone: null, reason: 'too_short' };
  if (len > 15) return { phone: null, reason: 'too_long' };

  if (len === 10 || len === 11) {
    const ddd = parseInt(digits.slice(0, 2), 10);
    if (!BR_DDDS.has(ddd)) {
      return { phone: null, reason: 'ambiguous_no_ddi' };
    }
    return { phone: '55' + digits, reason: null };
  }

  if (len === 12 || len === 13) {
    if (digits.startsWith('55')) {
      // Sanity: apos o 55, os 2 proximos digitos deveriam ser DDD BR.
      const ddd = parseInt(digits.slice(2, 4), 10);
      if (!BR_DDDS.has(ddd)) {
        // 55 no comeco mas DDD nao bate: pode ser numero de outro pais que por
        // coincidencia comeca com 55. Aceita como internacional pra nao perder.
        return { phone: digits, reason: null };
      }
      return { phone: digits, reason: null };
    }
    // Sem 55: numero internacional (ex 351 Portugal + numero local). Mantem.
    return { phone: digits, reason: null };
  }

  // 14-15: DDI longo, mantem
  return { phone: digits, reason: null };
}

function normalizePhone(raw) {
  return normalizePhoneExplain(raw).phone;
}

// Versao estrita: garante saida com pelo menos 12 digitos (DDI+DDD+num).
// Retorna null se nao alcancar esse minimo (numero muito curto pra ser util).
function normalizePhoneStrict(raw) {
  const { phone } = normalizePhoneExplain(raw);
  if (!phone) return null;
  if (phone.length < 12) return null;
  return phone;
}

module.exports = { normalizePhone, normalizePhoneStrict, normalizePhoneExplain };
