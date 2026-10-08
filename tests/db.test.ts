import { describe, expect, it } from 'vitest';

import { ligacaoDoEndereco } from '@/lib/db';

const LOCAL = 'postgresql://u:p@aws-0-x.pooler.supabase.com:5432/postgres?sslmode=require&schema=precificaragao&connection_limit=5';
const VERCEL = 'postgresql://u:p@aws-0-x.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=precificaragao';

describe('ligacaoDoEndereco (Prisma 7 + pg)', () => {
  it('o schema sai do endereco e vai para o adaptador', () => {
    expect(ligacaoDoEndereco(LOCAL).schema).toBe('precificaragao');
    expect(ligacaoDoEndereco(VERCEL).schema).toBe('precificaragao');
  });

  it('sem ?schema= recusa, em vez de cair no public (que e do outro projeto)', () => {
    expect(() => ligacaoDoEndereco('postgresql://u:p@h:5432/postgres?sslmode=require')).toThrow(/schema/);
    expect(() => ligacaoDoEndereco('postgresql://u:p@h:5432/postgres?schema=')).toThrow(/schema/);
    expect(() => ligacaoDoEndereco('isto nao e um endereco')).toThrow(/valido/);
  });

  it('connection_limit vira o tecto da pool; sem ele, 5', () => {
    expect(ligacaoDoEndereco(LOCAL).max).toBe(5);
    expect(ligacaoDoEndereco(VERCEL).max).toBe(1);
    expect(ligacaoDoEndereco('postgresql://u:p@h/db?schema=s').max).toBe(5);
  });

  it('o pg nao recebe os parametros que so o Prisma conhecia', () => {
    const l = ligacaoDoEndereco(VERCEL);
    const params = new URL(l.connectionString).searchParams;
    for (const p of ['schema', 'pgbouncer', 'connection_limit', 'sslmode']) expect(params.has(p), p).toBe(false);
    expect(l.connectionString).toContain('pooler.supabase.com:6543/postgres');
  });

  it('TLS como no Prisma 5 (cifrado, sem verificar o certificado); desligado so com sslmode=disable', () => {
    expect(ligacaoDoEndereco(LOCAL).ssl).toEqual({ rejectUnauthorized: false });
    expect(ligacaoDoEndereco(VERCEL).ssl).toEqual({ rejectUnauthorized: false });
    expect(ligacaoDoEndereco('postgresql://u:p@localhost/db?schema=s&sslmode=disable').ssl).toBe(false);
  });
});
