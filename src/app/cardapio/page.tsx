/**
 * O cardapio publico — o link da bio do Instagram.
 *
 * Aberto sem sessao (`abertaSemSessao` em `lib/auth.ts`) e sem a barra da app
 * (`layout.tsx`). Com a identidade do site (logotipo, paleta, estampa) e
 * claro/escuro: ver `cardapio.css` e `TemaCardapio`.
 *
 * Os dados vem de `getCardapioPublico`, em cache: nada de custos, so o que o
 * cliente pode ler. O dia de hoje (para as promocoes) e calculado a cada
 * pedido, fora da cache, para uma promocao acabar a meia-noite certa.
 */

import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { Facebook, Instagram, Phone } from 'lucide-react';

import { CardapioInterativo } from '@/components/cardapio/cardapio-interativo';
import { TemaCardapio } from '@/components/cardapio/tema-cardapio';
import { TextoCardapio } from '@/components/cardapio/texto-cardapio';
import { getCardapioPublico } from '@/lib/cardapio/consultas';
import { eRobo, origemDoPedido } from '@/lib/cardapio/estatisticas';
import { contar } from '@/lib/cardapio/estatisticas-base';
import { diaEmLisboa } from '@/lib/datas';
import { linkRede, mostrarRede } from '@/lib/pricing/clientes';
import { COOKIE_TEMA, lerTema } from '@/lib/tema';

import './cardapio.css';

export const dynamic = 'force-dynamic';

/** O nome da casa no cardapio. */
const NOME = 'AmoBrigs Confeitaria';

export async function generateMetadata(): Promise<Metadata> {
  const d = await getCardapioPublico();
  const descricao = d.intro?.replace(/\*\*/g, '') ?? 'Bolos e brigadeiros por encomenda. Escolha e encomende pelo WhatsApp.';
  return {
    title: `${NOME} · Cardápio`,
    description: descricao,
    // A unica pagina que se quer encontrada; o resto da app esta atras do login.
    robots: { index: true, follow: false },
    openGraph: {
      title: `${NOME} · Cardápio`,
      description: descricao,
      type: 'website',
      locale: 'pt_PT',
      images: [{ url: '/cardapio-partilha.png', width: 1200, height: 630, alt: NOME }],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // A barra do browser em vinho, como a app.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#5b1c32' },
    { media: '(prefers-color-scheme: dark)', color: '#3f1323' },
  ],
};

/** "351924005977" → "924 005 977"; outros numeros com o indicativo. */
function telefoneLegivel(n: string): string {
  const local = n.startsWith('351') ? n.slice(3) : `+${n}`;
  return local.startsWith('+') ? local : local.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
}

export default async function CardapioPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const dados = await getCardapioPublico();
  const hoje = diaEmLisboa(new Date());
  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);

  // A visita conta-se depois de a pagina sair, e so de pessoas: os robos que
  // fazem a pre-visualizacao do link no WhatsApp/Instagram nao contam.
  const h = await headers();
  const origem = origemDoPedido((await searchParams).o, h.get('referer'));
  if (dados.aberto && !eRobo(h.get('user-agent'))) after(() => contar('VIEW', origem));

  return (
    <div className="cardapio">
      <main className="relative mx-auto max-w-2xl px-4 pb-40 pt-6">
        <div className="flex justify-end">
          <TemaCardapio inicial={tema} />
        </div>
        <header className="mb-10 flex flex-col items-center gap-6 text-center">
          {/* O logotipo do site: vinho no claro, creme no escuro (o CSS mostra um). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-vinho.png" alt={NOME} className="ab-logo-claro w-full max-w-xs" width={1200} height={342} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-creme.png" alt={NOME} className="ab-logo-escuro w-full max-w-xs" width={1200} height={342} />
          <p className="ab-serif border-y border-[var(--ab-rosa)] px-4 py-0.5 text-2xl uppercase tracking-[0.3em] text-[var(--ab-titulo)]">
            Menu
          </p>
          <div className="h-2" aria-hidden />
          <TextoCardapio texto={dados.intro} className="max-w-md text-center [&_p]:text-center" />
        </header>

        {dados.aberto && dados.secoes.length ? (
          <CardapioInterativo dados={dados} hoje={hoje} origem={origem} />
        ) : (
          <p className="ab-serif py-16 text-center text-2xl text-[var(--ab-titulo)]">
            O cardápio volta em breve.
            <span className="mt-2 block text-base font-normal text-[var(--ab-texto)]">
              Entretanto, fale connosco pelos contactos abaixo.
            </span>
          </p>
        )}

        <footer className="mt-20 space-y-6 text-center">
          <h2 className="ab-serif text-5xl text-[var(--ab-titulo)]">Contactos</h2>
          <ul className="mx-auto inline-flex flex-col items-start gap-3 text-lg">
            {dados.whatsapp ? (
              <Contacto href={`https://wa.me/${dados.whatsapp}`} icone={<Phone className="h-5 w-5" />}>
                {telefoneLegivel(dados.whatsapp)}
              </Contacto>
            ) : null}
            {dados.instagram ? (
              <Contacto href={linkRede('instagram', dados.instagram)} icone={<Instagram className="h-5 w-5" />}>
                @{dados.instagram}
              </Contacto>
            ) : null}
            {dados.facebook ? (
              <Contacto href={linkRede('facebook', dados.facebook)} icone={<Facebook className="h-5 w-5" />}>
                {mostrarRede('facebook', dados.facebook) === 'perfil' ? NOME : dados.facebook}
              </Contacto>
            ) : null}
          </ul>
          <p className="text-xs text-[var(--ab-texto-suave)]">
            Preços com IVA incluído. O total é uma estimativa: confirmamos tudo na conversa.
            <br />
            Alergénios: a informação de cada produto está em &quot;Alergénios&quot;. Na dúvida,
            pergunte-nos.
          </p>
        </footer>
      </main>
    </div>
  );
}

function Contacto({ href, icone, children }: { href: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 hover:underline">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ab-pilula)] text-[var(--ab-pilula-texto)]">
          {icone}
        </span>
        {children}
      </a>
    </li>
  );
}
