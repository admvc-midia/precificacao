import { describe, expect, it } from 'vitest';

import { lerRede, linkRede, mostrarRede } from '@/lib/pricing/clientes';

describe('lerRede: guarda so o nome de utilizador', () => {
  it('Instagram: @, sem @, link com lixo, maiusculas', () => {
    for (const t of [
      'ana.doces',
      '@ana.doces',
      '  @Ana.Doces ',
      'https://www.instagram.com/ana.doces/',
      'https://instagram.com/ana.doces?igsh=MXk2cWx4&utm_source=qr',
      'instagram.com/Ana.Doces/?hl=pt',
      'http://m.instagram.com/ana.doces',
      'https://www.instagram.com/stories/ana.doces/3456789/',
    ]) {
      expect(lerRede('instagram', t), t).toBe('ana.doces');
    }
  });

  it('TikTok: @nome ou o link do perfil (tambem de um video)', () => {
    expect(lerRede('tiktok', '@ana.doces')).toBe('ana.doces');
    expect(lerRede('tiktok', 'https://www.tiktok.com/@Ana.Doces')).toBe('ana.doces');
    expect(lerRede('tiktok', 'https://www.tiktok.com/@ana.doces/video/7412345678?lang=pt')).toBe('ana.doces');
  });

  it('Facebook: nome, link, e perfis sem nome de utilizador', () => {
    expect(lerRede('facebook', 'amobrigs.doces')).toBe('amobrigs.doces');
    expect(lerRede('facebook', 'https://www.facebook.com/AmoBrigs.Doces/')).toBe('amobrigs.doces');
    expect(lerRede('facebook', 'https://m.facebook.com/profile.php?id=100012345678&mibextid=abc')).toBe('profile.php?id=100012345678');
    expect(lerRede('facebook', 'https://www.facebook.com/people/Ana-Silva/100012345678/')).toBe('profile.php?id=100012345678');
  });

  it('vazio limpa', () => {
    expect(lerRede('instagram', '')).toBeNull();
    expect(lerRede('tiktok', '   ')).toBeNull();
  });

  it('recusa o link de outra rede, de uma publicacao, ou um nome impossivel', () => {
    expect(() => lerRede('instagram', 'https://www.tiktok.com/@ana')).toThrow(/nao e do Instagram/);
    expect(() => lerRede('facebook', 'https://instagram.com/ana')).toThrow(/nao e do Facebook/);
    expect(() => lerRede('instagram', 'https://www.instagram.com/p/C1a2b3c4/')).toThrow(/publicacao/);
    expect(() => lerRede('instagram', 'https://www.instagram.com/reel/C1a2b3c4/')).toThrow(/publicacao/);
    expect(() => lerRede('tiktok', 'https://www.tiktok.com/foryou')).toThrow(/perfil/);
    expect(() => lerRede('facebook', 'https://www.facebook.com/groups/123/')).toThrow(/perfil/);
    expect(() => lerRede('instagram', 'Ana Doces')).toThrow(/nao parece/);
    expect(() => lerRede('instagram', 'a'.repeat(31))).toThrow(/nao parece/);
    expect(() => lerRede('facebook', 'ana')).toThrow(/nao parece/);
  });
});

describe('link e texto', () => {
  it('cada rede abre o perfil', () => {
    expect(linkRede('instagram', 'ana.doces')).toBe('https://www.instagram.com/ana.doces/');
    expect(linkRede('tiktok', 'ana.doces')).toBe('https://www.tiktok.com/@ana.doces');
    expect(linkRede('facebook', 'profile.php?id=1000123')).toBe('https://www.facebook.com/profile.php?id=1000123');
  });

  it('mostra-se com @, menos o Facebook', () => {
    expect(mostrarRede('instagram', 'ana.doces')).toBe('@ana.doces');
    expect(mostrarRede('facebook', 'amobrigs.doces')).toBe('amobrigs.doces');
    expect(mostrarRede('facebook', 'profile.php?id=1')).toBe('perfil');
  });
});
