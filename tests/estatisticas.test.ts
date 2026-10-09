import { describe, expect, it } from 'vitest';

import { abertaSemSessao } from '@/lib/auth';
import { eRobo, origemDoPedido, resumir, segundaDe, type LinhaDeEstatistica } from '@/lib/cardapio/estatisticas';

describe('de onde veio a visita', () => {
  it('o ?o= do link ganha ao sitio anterior', () => {
    expect(origemDoPedido('ig', 'https://www.google.com/')).toBe('instagram');
    expect(origemDoPedido('QR', null)).toBe('qr');
    expect(origemDoPedido('wa', null)).toBe('whatsapp');
  });
  it('sem ?o=, pelo sitio anterior', () => {
    expect(origemDoPedido(null, 'https://l.instagram.com/?u=x')).toBe('instagram');
    expect(origemDoPedido(undefined, 'https://m.facebook.com/')).toBe('facebook');
    expect(origemDoPedido('', 'https://www.google.pt/')).toBe('google');
    expect(origemDoPedido(null, 'https://exemplo.pt/')).toBe('outro');
    expect(origemDoPedido(null, null)).toBe('direto');
    expect(origemDoPedido('inventado', 'lixo')).toBe('outro');
  });
});

describe('robos', () => {
  it('pre-visualizacoes e indexadores nao contam; telemoveis sim', () => {
    expect(eRobo('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(eRobo('facebookexternalhit/1.1')).toBe(true);
    expect(eRobo('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(eRobo(null)).toBe(true);
    expect(eRobo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0')).toBe(false);
    expect(eRobo('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36')).toBe(false);
  });
});

describe('resumo', () => {
  const l = (day: string, event: LinhaDeEstatistica['event'], source: string, count: number) => ({ day, event, source, count });
  const linhas = [
    l('2026-10-09', 'VIEW', 'instagram', 10),
    l('2026-10-09', 'ORDER', 'instagram', 2),
    l('2026-10-08', 'VIEW', 'direto', 5),
    l('2026-10-08', 'QUOTE', 'direto', 1),
    l('2026-08-01', 'VIEW', 'instagram', 99), // fora dos 30 dias
  ];
  it('ultimos 30 dias, taxa e origens', () => {
    const r = resumir(linhas, '2026-10-09');
    expect(r).toMatchObject({ visitas: 15, encomendar: 2, orcamentos: 1 });
    expect(r.taxa).toBeCloseTo(2 / 15);
    expect(r.porOrigem.map((o) => o.origem)).toEqual(['instagram', 'direto']);
  });
  it('semanas de segunda a domingo, a mais recente no fim', () => {
    expect(segundaDe('2026-10-09')).toBe('2026-10-05'); // sexta → segunda
    expect(segundaDe('2026-10-05')).toBe('2026-10-05');
    expect(segundaDe('2026-10-11')).toBe('2026-10-05'); // domingo
    const r = resumir(linhas, '2026-10-09');
    expect(r.porSemana).toHaveLength(8);
    expect(r.porSemana.at(-1)).toEqual({ semana: '2026-10-05', visitas: 15, encomendar: 2 });
  });
  it('sem visitas, sem taxa', () => {
    expect(resumir([], '2026-10-09').taxa).toBeNull();
  });
  it('a rota dos cliques e publica; o resto da API nao', () => {
    expect(abertaSemSessao('/api/cardapio/evento')).toBe(true);
    expect(abertaSemSessao('/api/cardapio/eventos')).toBe(false);
  });
});
