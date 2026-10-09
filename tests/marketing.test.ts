import { describe, expect, it } from 'vitest';

import { inicioDoPerfil, rotaPermitida } from '@/lib/auth';
import { lerTexto } from '@/lib/cardapio/texto';
import { atrasada, lerCodigos, mesmaPessoa, progresso, proximaTarefa } from '@/lib/marketing/contas';
import { campanhasDoModelo, GUIA_DO_MODELO, somarDias } from '@/lib/marketing/modelo';

describe('perfil Marketing', () => {
  it('so abre as campanhas, o guia, a conta e a ajuda', () => {
    for (const ok of ['/marketing', '/marketing/guia', '/marketing/abc', '/conta', '/ajuda']) {
      expect(rotaPermitida('MARKETING', ok), ok).toBe(true);
    }
    for (const nao of ['/', '/encomendas', '/receitas', '/livros', '/loja/cupoes', '/loja/cardapio', '/clientes', '/api/receitas/x/foto', '/marketingx']) {
      expect(rotaPermitida('MARKETING', nao), nao).toBe(false);
    }
    expect(inicioDoPerfil('MARKETING')).toBe('/marketing');
  });
  it('a cozinha e a leitura nao entram no marketing; o livro continua delas', () => {
    expect(rotaPermitida('KITCHEN', '/marketing')).toBe(false);
    expect(rotaPermitida('READER', '/marketing/guia')).toBe(false);
    expect(rotaPermitida('READER', '/receitas')).toBe(true);
    expect(rotaPermitida('OWNER', '/marketing')).toBe(true);
  });
});

describe('tarefas', () => {
  const hoje = '2026-10-09';
  it('atrasada so por fazer e com o prazo ja passado', () => {
    expect(atrasada({ done: false, dueAt: '2026-10-08' }, hoje)).toBe(true);
    expect(atrasada({ done: false, dueAt: hoje }, hoje)).toBe(false);
    expect(atrasada({ done: true, dueAt: '2026-10-01' }, hoje)).toBe(false);
    expect(atrasada({ done: false, dueAt: null }, hoje)).toBe(false);
  });
  it('progresso e proxima tarefa', () => {
    const ts = [
      { id: 'a', title: 'A', assignee: null, dueAt: null, done: false },
      { id: 'b', title: 'B', assignee: 'Ana', dueAt: '2026-10-20', done: false },
      { id: 'c', title: 'C', assignee: null, dueAt: '2026-10-12', done: true },
    ];
    expect(progresso(ts)).toEqual({ feitas: 1, total: 3 });
    expect(proximaTarefa(ts)?.id).toBe('b');
    expect(proximaTarefa([ts[0]])?.id).toBe('a');
    expect(proximaTarefa([ts[2]])).toBeNull();
  });
  it('a mesma pessoa escrita de outra forma', () => {
    expect(mesmaPessoa(' Ines ', 'inês')).toBe(true);
    expect(mesmaPessoa('', '')).toBe(false);
    expect(mesmaPessoa('Ana', 'Rita')).toBe(false);
  });
  it('codigos de cupao arrumados', () => {
    expect(lerCodigos('bemvinda10, IG10 ig10;  salão-maria')).toEqual(['BEMVINDA10', 'IG10', 'SALAO-MARIA']);
    expect(lerCodigos('  ')).toEqual([]);
  });
});

describe('o plano de partida', () => {
  it('6 campanhas com tarefas e datas coerentes, e o guia le-se', () => {
    const hoje = '2026-10-09';
    const cs = campanhasDoModelo(hoje);
    expect(cs).toHaveLength(6);
    for (const c of cs) {
      expect(c.tasks.length, c.title).toBeGreaterThan(0);
      if (c.startsAt && c.endsAt) expect(c.endsAt >= c.startsAt, c.title).toBe(true);
      for (const t of c.tasks) if (t.emDias !== undefined) expect(t.emDias, t.title).toBeGreaterThan(0);
    }
    expect(cs.find((c) => c.title.startsWith('Natal'))?.endsAt).toBe('2026-12-20');
    // Em janeiro, o Natal e o do proprio ano; o verao, o deste ano.
    expect(campanhasDoModelo('2027-01-05').find((c) => c.title.startsWith('Verão'))?.startsAt).toBe('2027-06-01');
    for (const g of GUIA_DO_MODELO) expect(lerTexto(g.body).length, g.title).toBeGreaterThan(0);
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
  });
});
