import { describe, expect, it } from 'vitest';

import { fotoSrc } from '@/lib/foto-url';
import { lerImagem, tipoDaImagem } from '@/lib/fotos';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));

describe('tipo da imagem pelos primeiros bytes', () => {
  it('reconhece JPEG, PNG e WebP', () => {
    expect(tipoDaImagem(JPEG)).toBe('image/jpeg');
    expect(tipoDaImagem(PNG)).toBe('image/png');
    expect(tipoDaImagem(WEBP)).toBe('image/webp');
  });

  it('recusa o resto, mesmo com nome de imagem', () => {
    expect(tipoDaImagem(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(tipoDaImagem(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(tipoDaImagem(new Uint8Array([]))).toBeNull();
  });
});

describe('lerImagem', () => {
  it('le uma imagem valida', async () => {
    const r = await lerImagem(new File([JPEG], 'f.jpg', { type: 'image/jpeg' }), 1000, 'foto');
    expect(r.tipo).toBe('image/jpeg');
  });

  it('recusa em falta, grande demais e o que nao e imagem', async () => {
    await expect(lerImagem(null, 1000, 'foto')).rejects.toThrow(/Falta a foto/);
    await expect(lerImagem(new File([new Uint8Array(2000)], 'f.jpg'), 1000, 'foto')).rejects.toThrow(/grande demais/);
    // O browser diz que e JPEG; os bytes dizem que nao.
    await expect(
      lerImagem(new File(['nao sou imagem'], 'f.jpg', { type: 'image/jpeg' }), 1000, 'foto'),
    ).rejects.toThrow(/nao e uma imagem/);
  });
});

describe('endereco da foto', () => {
  it('muda com o caminho, para a cache nunca mostrar a antiga', () => {
    const a = fotoSrc('r1', 'fotos/r1-AbC123.jpg');
    const b = fotoSrc('r1', 'fotos/r1-XyZ789.jpg');
    expect(a).toMatch(/^\/api\/fotos\/r1\?v=/);
    expect(a).not.toBe(b);
    expect(fotoSrc('r1', 'fotos/r1-mini-AbC.jpg', 'mini')).toMatch(/\?tam=mini&v=/);
    expect(fotoSrc('r1', null)).toBeNull();
  });
});
