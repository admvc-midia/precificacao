import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, Plus, Sparkles } from 'lucide-react';

import { ActionForm, ConfirmDelete, FormDialog, SubmitButton } from '@/components/action-form';
import { AjudaLink } from '@/components/ajuda-link';
import { ComponentesCombo, type FichaDoCombo } from '@/components/cardapio/componentes-combo';
import { CopiarLink } from '@/components/cardapio/copiar-link';
import { FotoDialogo } from '@/components/cardapio/foto-dialogo';
import { Miniatura } from '@/components/miniatura';
import { Alert, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import {
  adicionarProduto,
  alternarItem,
  apagarItem,
  apagarSecao,
  comecarComModelo,
  guardarCombo,
  guardarDefinicoesDoCardapio,
  guardarFotoItem,
  guardarFotoSecao,
  guardarItem,
  guardarSecao,
  moverItem,
  moverSecao,
  tirarFotoItem,
  tirarFotoSecao,
  usarPrecoDeTabela,
} from '@/lib/actions/cardapio';
import { caminhoDaFoto, fotoDaSecaoSrc, fotoPublicaSrc, getCardapioDoDono } from '@/lib/cardapio/consultas';
import { num } from '@/lib/mappers';
import { formatMoney, type CurrencyConfig } from '@/lib/money';
import { avisoDePreco } from '@/lib/pricing/cardapio';
import { grossOf } from '@/lib/pricing/encomendas';
import { priceForRecipe, referenceChannel } from '@/lib/pricing/sugerido';
import { getCostedRecipes, getSettings } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const LAYOUT_LABEL = {
  LIST: 'Lista',
  GALLERY: 'Galeria (fotos grandes)',
  CARDS: 'Cartões (tamanhos)',
  TEXT: 'Só texto',
} as const;

const AJUDA_TEXTO = (
  <>
    <code>## Título</code> subtítulo rosa · <code>### Título</code> pílula lilás ·{' '}
    <code>- item</code> marcador · <code>&gt; texto</code> destaque roxo · <code>~ texto</code> nota
    pequena · <code>**negrito**</code>
  </>
);

type Dados = Awaited<ReturnType<typeof getCardapioDoDono>>;
type Item = Dados['itens'][number];
type Secao = Dados['secoes'][number];

export default async function CardapioDonoPage() {
  const [{ secoes, itens }, { recipes, settings, currency, channels }, s, h] = await Promise.all([
    getCardapioDoDono(),
    getCostedRecipes(),
    getSettings(),
    headers(),
  ]);

  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const url = `${proto}://${host}/cardapio`;

  const ref = referenceChannel(channels);
  const produtos = recipes.filter((r) => r.kind === 'PRODUCT' && !r.error);
  const tabela = new Map(
    produtos.map((r) => {
      const p = priceForRecipe(r, ref, settings);
      return [r.id, p?.feasible && p.price > 0 ? p.price : null];
    }),
  );
  const custo = new Map(produtos.map((r) => [r.id, r.cost ? r.cost.foodCostPerUnit + r.cost.packagingCost : null]));
  const usadas = new Set(itens.map((i) => i.recipeId).filter(Boolean));
  const livres = produtos.filter((r) => !usadas.has(r.id));
  const fichasDoCombo: FichaDoCombo[] = produtos.map((r) => {
    const menu = itens.find((i) => i.recipeId === r.id);
    return { id: r.id, name: r.name, price: menu ? num(menu.price) : (tabela.get(r.id) ?? null), cost: custo.get(r.id) ?? null };
  });

  const bruto = (v: number) => grossOf(v, settings);
  const ivaAParte = settings.vatMode === 'ADDED';
  const publicados = itens.filter((i) => i.published).length;

  const ctx = { secoes, tabela, currency, bruto, livres, produtos, fichasDoCombo, total: itens.length };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Cardápio
            <AjudaLink secao="cardapio" />
          </h1>
          <p className="text-sm text-muted-foreground">
            O que o cliente vê no link público. {publicados} de {itens.length} itens publicados.
            {ivaAParte ? ' Os preços aqui são sem IVA; o cliente vê-os com IVA.' : ''}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cardapio" target="_blank">
            <ExternalLink className="h-4 w-4" />
            Ver como o cliente vê
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Link público</CardTitle>
          <CardDescription>
            Para a bio do Instagram. Quem abre vê o cardápio e encomenda pelo WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopiarLink url={url} />
          {!s.menuPublished ? (
            <Alert tone="info">O link está desligado: quem o abre vê &quot;O cardápio volta em breve&quot;.</Alert>
          ) : null}
          <ActionForm action={guardarDefinicoesDoCardapio} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="menuPublishedSubmitted" value="1" />
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
              <input type="checkbox" name="menuPublished" defaultChecked={s.menuPublished} className="h-4 w-4" />
              Link ligado (o cardápio aparece ao público)
            </label>
            <Field label="WhatsApp da casa" htmlFor="c-wa" hint="Com indicativo. Sem número não aparece o botão de encomendar.">
              <Input id="c-wa" name="whatsappNumber" inputMode="tel" defaultValue={s.whatsappNumber ? `+${s.whatsappNumber}` : ''} placeholder="+351 924 005 977" />
            </Field>
            <Field label="Instagram" htmlFor="c-ig">
              <Input id="c-ig" name="instagramHandle" defaultValue={s.instagramHandle ?? ''} placeholder="amo_brigs" />
            </Field>
            <Field label="Facebook" htmlFor="c-fb" hint="O nome de utilizador ou o link da página.">
              <Input id="c-fb" name="facebookHandle" defaultValue={s.facebookHandle ?? ''} />
            </Field>
            <Field label="Texto do topo" htmlFor="c-intro" className="sm:col-span-2" hint={AJUDA_TEXTO}>
              <Textarea id="c-intro" name="menuIntro" rows={2} defaultValue={s.menuIntro ?? ''} placeholder="Bolos e brigadeiros por encomenda, feitos com muito carinho." />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      {secoes.length === 0 && itens.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Começar com o menu do PDF</CardTitle>
            <CardDescription>
              Cria as secções do &quot;Menu Bolos&quot;: Bolos (16 e 20 cm), Caseirinhos (9 sabores),
              Informações importantes e Cuidados extras, com os textos e preços do PDF. Os itens
              ficam sem ficha técnica até os ligar. O link continua desligado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={comecarComModelo}>
              <SubmitButton>
                <Sparkles className="h-4 w-4" />
                Criar a partir do PDF
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <FormDialog
          action={guardarSecao}
          title="Nova secção"
          trigger={
            <Button variant="outline">
              <Plus className="h-4 w-4" />
              Secção
            </Button>
          }
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        >
          <CamposSecao />
        </FormDialog>
        <FormDialog
          action={adicionarProduto}
          title="Juntar produto"
          description="Uma ficha técnica (o preço começa no de tabela), ou só um nome e preço para ligar a uma ficha depois."
          trigger={
            <Button variant="outline">
              <Plus className="h-4 w-4" />
              Produto
            </Button>
          }
        >
          <Field label="Ficha técnica" htmlFor="np-ficha" hint="Sem ficha, o item aparece no link mas não entra nas encomendas da app.">
            <Select id="np-ficha" name="recipeId" defaultValue="">
              <option value="">Sem ficha (só nome e preço)</option>
              {livres.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {tabela.get(r.id) != null ? ` — ${formatMoney(tabela.get(r.id)!, currency)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nome no cardápio" htmlFor="np-nome" hint="Vazio usa o nome da ficha.">
            <Input id="np-nome" name="name" />
          </Field>
          <Field label="Descrição" htmlFor="np-desc">
            <Input id="np-desc" name="description" placeholder="Massa de chocolate com cobertura de chocolate." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço" htmlFor="np-preco" hint="Vazio usa o de tabela.">
              <Input id="np-preco" name="price" inputMode="decimal" />
            </Field>
            <Field label="Unidade" htmlFor="np-un">
              <Input id="np-un" name="unitLabel" placeholder="caixa de 12" />
            </Field>
          </div>
          <SelectSecao secoes={secoes} />
        </FormDialog>
        <FormDialog
          action={guardarCombo}
          title="Novo combo"
          description="Várias fichas a um preço fixo. Numa encomenda, desdobra-se nas fichas, com o preço repartido."
          trigger={
            <Button variant="outline">
              <Plus className="h-4 w-4" />
              Combo
            </Button>
          }
          className="max-h-[90vh] overflow-y-auto"
        >
          <Field label="Nome" htmlFor="nc-nome">
            <Input id="nc-nome" name="name" required placeholder="Kit festa" />
          </Field>
          <Field label="Descrição" htmlFor="nc-desc">
            <Input id="nc-desc" name="description" />
          </Field>
          <ComponentesCombo fichas={fichasDoCombo} iniciais={[]} precoInicial="" currency={currency} />
          <SelectSecao secoes={secoes} />
        </FormDialog>
      </div>

      {secoes.map((sec, n) => (
        <CartaoSecao
          key={sec.id}
          sec={sec}
          primeira={n === 0}
          ultima={n === secoes.length - 1}
          itens={itens.filter((i) => i.sectionId === sec.id)}
          ctx={ctx}
        />
      ))}

      {itens.some((i) => !i.sectionId) ? (
        <CartaoSecao sec={null} primeira ultima itens={itens.filter((i) => !i.sectionId)} ctx={ctx} />
      ) : null}
    </div>
  );
}

interface Ctx {
  secoes: Secao[];
  tabela: Map<string, number | null>;
  currency: CurrencyConfig;
  bruto: (v: number) => number;
  livres: Array<{ id: string; name: string }>;
  produtos: Array<{ id: string; name: string }>;
  fichasDoCombo: FichaDoCombo[];
}

function SelectSecao({ secoes, atual }: { secoes: Secao[]; atual?: string | null }) {
  return (
    <Field label="Secção" htmlFor="sel-secao">
      <Select id="sel-secao" name="sectionId" defaultValue={atual ?? secoes.find((s) => s.layout !== 'TEXT')?.id ?? ''}>
        <option value="">Sem secção (aparece em &quot;Outros&quot;)</option>
        {secoes
          .filter((s) => s.layout !== 'TEXT')
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </Select>
    </Field>
  );
}

function CamposSecao({ s }: { s?: Secao }) {
  return (
    <>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" htmlFor="s-nome">
          <Input id="s-nome" name="name" defaultValue={s?.name ?? ''} required placeholder="Caseirinhos" />
        </Field>
        <Field label="Apresentação" htmlFor="s-layout">
          <Select id="s-layout" name="layout" defaultValue={s?.layout ?? 'LIST'}>
            {Object.entries(LAYOUT_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Texto antes dos itens" htmlFor="s-desc" hint={AJUDA_TEXTO}>
        <Textarea id="s-desc" name="description" rows={3} defaultValue={s?.description ?? ''} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título dos itens" htmlFor="s-tit">
          <Input id="s-tit" name="itemsTitle" defaultValue={s?.itemsTitle ?? ''} placeholder="Tamanho e valores" />
        </Field>
        <Field label="Faixa de destaque" htmlFor="s-dest">
          <Input id="s-dest" name="highlight" defaultValue={s?.highlight ?? ''} placeholder="Bolos de dois andares, valores sob consulta." />
        </Field>
      </div>
      <Field label="Nota depois dos itens" htmlFor="s-nota">
        <Input id="s-nota" name="footnote" defaultValue={s?.footnote ?? ''} placeholder="*Exceto a decoração." />
      </Field>
      <Field label="Texto depois dos itens" htmlFor="s-corpo" hint={<>Massas, recheios, informações. {AJUDA_TEXTO}</>}>
        <Textarea id="s-corpo" name="body" rows={8} defaultValue={s?.body ?? ''} className="font-mono text-xs" />
      </Field>
      <input type="hidden" name="publishedSubmitted" value="1" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={s?.published ?? true} className="h-4 w-4" />
        Visível no link público
      </label>
    </>
  );
}

function BotaoMover({ action, id, sentido, disabled }: { action: typeof moverSecao; id: string; sentido: 'cima' | 'baixo'; disabled: boolean }) {
  return (
    <ActionForm action={action} showSuccess={false} className="space-y-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sentido" value={sentido} />
      <Button type="submit" variant="ghost" size="sm" disabled={disabled} className="text-muted-foreground">
        {sentido === 'cima' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        <span className="sr-only">{sentido === 'cima' ? 'Subir' : 'Descer'}</span>
      </Button>
    </ActionForm>
  );
}

function CartaoSecao({
  sec,
  primeira,
  ultima,
  itens,
  ctx,
}: {
  sec: Secao | null;
  primeira: boolean;
  ultima: boolean;
  itens: Item[];
  ctx: Ctx;
}) {
  return (
    <Card className={sec && !sec.published ? 'opacity-70' : undefined}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {sec?.name ?? 'Sem secção'}
            {sec ? <Badge variant="outline">{LAYOUT_LABEL[sec.layout]}</Badge> : null}
            {sec && !sec.published ? <Badge variant="secondary">Escondida</Badge> : null}
          </CardTitle>
          {!sec ? <CardDescription>Aparecem no fim do link, em &quot;Outros&quot;.</CardDescription> : null}
          {sec?.layout === 'TEXT' ? (
            <CardDescription className="line-clamp-2">{sec.body ?? 'Sem texto.'}</CardDescription>
          ) : null}
        </div>
        {sec ? (
          <div className="flex items-center">
            {sec.layout !== 'TEXT' ? (
              <FotoDialogo
                id={sec.id}
                nome={sec.name}
                src={fotoDaSecaoSrc(sec.id, sec.photoPath)}
                guardar={guardarFotoSecao}
                remover={tirarFotoSecao}
              />
            ) : null}
            <BotaoMover action={moverSecao} id={sec.id} sentido="cima" disabled={primeira} />
            <BotaoMover action={moverSecao} id={sec.id} sentido="baixo" disabled={ultima} />
            <FormDialog action={guardarSecao} title={sec.name} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <CamposSecao s={sec} />
            </FormDialog>
            <ConfirmDelete
              action={apagarSecao}
              fields={{ id: sec.id }}
              title={`Apagar a secção ${sec.name}?`}
              description="Os itens dela não se apagam: ficam em &quot;Sem secção&quot;."
            />
          </div>
        ) : null}
      </CardHeader>
      {sec?.layout !== 'TEXT' ? (
        <CardContent className="p-0">
          {itens.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Sem itens. Junte um produto ou um combo.</p>
          ) : (
            <ul className="divide-y">
              {itens.map((i, n) => (
                <LinhaItem key={i.id} i={i} primeiro={n === 0} ultimo={n === itens.length - 1} ctx={ctx} />
              ))}
            </ul>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function LinhaItem({ i, primeiro, ultimo, ctx }: { i: Item; primeiro: boolean; ultimo: boolean; ctx: Ctx }) {
  const { currency } = ctx;
  const nome = i.name || i.recipe?.name || 'Sem nome';
  const preco = num(i.price);
  const tab = i.recipeId ? (ctx.tabela.get(i.recipeId) ?? null) : null;
  const aviso = avisoDePreco(preco, tab);
  const foto = caminhoDaFoto(i);
  const fotoMini = fotoPublicaSrc(i.id, foto?.photoThumbPath ?? foto?.photoPath, 'mini');

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
      {fotoMini ? (
        // eslint-disable-next-line @next/next/no-img-element -- rota propria, ver Miniatura
        <img src={fotoMini} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md border object-cover" />
      ) : (
        <Miniatura recipeId={i.id} nome={nome} caminho={null} className="h-12 w-12" />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {nome}
          {i.kind === 'COMBO' ? <Badge variant="secondary">Combo</Badge> : null}
          {!i.published ? <Badge variant="outline">Rascunho</Badge> : null}
          {i.soldOut ? <Badge variant="warning">Esgotado</Badge> : null}
          {i.priceOnRequest ? <Badge variant="outline">Sob consulta</Badge> : null}
          {i.kind === 'PRODUCT' && !i.recipeId ? <Badge variant="warning">Sem ficha</Badge> : null}
          {i.promotions.length ? <Badge variant="success">Em promoção</Badge> : null}
          {!foto ? <Badge variant="outline">Sem foto</Badge> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {i.kind === 'COMBO'
            ? `Leva ${i.components.map((c) => `${num(c.qty)} × ${c.recipe.name}`).join(', ')}`
            : i.recipe && i.name
              ? `Ficha: ${i.recipe.name}`
              : null}
          {i.unitLabel ? ` · ${i.unitLabel}` : ''}
        </p>
        {aviso ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            A tabela agora diz {formatMoney(tab!, currency)} ({aviso.diferenca > 0 ? '+' : ''}
            {formatMoney(aviso.diferenca, currency)}). O cardápio só muda se quiser.
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums">{formatMoney(preco, currency)}</p>
        {ctx.bruto(preco) !== preco ? (
          <p className="text-xs text-muted-foreground">{formatMoney(ctx.bruto(preco), currency)} c/ IVA</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center">
        {aviso ? (
          <ActionForm action={usarPrecoDeTabela} showSuccess={false} className="space-y-0">
            <input type="hidden" name="id" value={i.id} />
            <Button type="submit" variant="ghost" size="sm" className="text-xs">
              Usar tabela
            </Button>
          </ActionForm>
        ) : null}
        <FotoDialogo
          id={i.id}
          nome={nome}
          src={fotoPublicaSrc(i.id, i.photoPath)}
          herdada={Boolean(i.recipeId)}
          guardar={guardarFotoItem}
          remover={tirarFotoItem}
        />
        <ActionForm action={alternarItem} showSuccess={false} className="space-y-0">
          <input type="hidden" name="id" value={i.id} />
          <input type="hidden" name="campo" value="published" />
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" title={i.published ? 'Esconder do link' : 'Publicar'}>
            {i.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="sr-only">{i.published ? 'Esconder do link' : 'Publicar'}</span>
          </Button>
        </ActionForm>
        <BotaoMover action={moverItem} id={i.id} sentido="cima" disabled={primeiro} />
        <BotaoMover action={moverItem} id={i.id} sentido="baixo" disabled={ultimo} />
        <FormDialog
          action={i.kind === 'COMBO' ? guardarCombo : guardarItem}
          title={nome}
          className="max-h-[90vh] overflow-y-auto"
        >
          <input type="hidden" name="id" value={i.id} />
          {i.kind === 'PRODUCT' ? (
            <Field label="Ficha técnica" htmlFor={`fi-${i.id}`} hint="Sem ficha, não entra nas encomendas da app.">
              <Select id={`fi-${i.id}`} name="recipeId" defaultValue={i.recipeId ?? ''}>
                <option value="">Sem ficha</option>
                {ctx.produtos
                  .filter((r) => r.id === i.recipeId || ctx.livres.some((l) => l.id === r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Nome no cardápio" htmlFor={`n-${i.id}`} hint={i.kind === 'PRODUCT' ? 'Vazio usa o nome da ficha.' : undefined}>
            <Input id={`n-${i.id}`} name="name" defaultValue={i.name ?? ''} required={i.kind === 'COMBO'} />
          </Field>
          <Field label="Descrição" htmlFor={`d-${i.id}`}>
            <Textarea id={`d-${i.id}`} name="description" rows={2} defaultValue={i.description ?? ''} />
          </Field>
          <Field label="Unidade" htmlFor={`u-${i.id}`} hint="caixa de 12, bolo de 1,2 kg, 14 a 16 fatias">
            <Input id={`u-${i.id}`} name="unitLabel" defaultValue={i.unitLabel ?? ''} />
          </Field>
          {i.kind === 'COMBO' ? (
            <ComponentesCombo
              fichas={ctx.fichasDoCombo}
              iniciais={i.components.map((c) => ({ recipeId: c.recipeId, qty: num(c.qty) }))}
              precoInicial={preco.toFixed(2).replace('.', ',')}
              currency={currency}
            />
          ) : (
            <Field label="Preço" htmlFor={`p-${i.id}`} hint={tab != null ? `Tabela: ${formatMoney(tab, currency)}` : undefined}>
              <Input id={`p-${i.id}`} name="price" inputMode="decimal" defaultValue={preco.toFixed(2).replace('.', ',')} required />
            </Field>
          )}
          <SelectSecao secoes={ctx.secoes} atual={i.sectionId} />
          <input type="hidden" name="publishedSubmitted" value="1" />
          <input type="hidden" name="soldOutSubmitted" value="1" />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="published" defaultChecked={i.published} className="h-4 w-4" />
              Publicado
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="soldOut" defaultChecked={i.soldOut} className="h-4 w-4" />
              Esgotado
            </label>
            {i.kind === 'PRODUCT' ? (
              <label className="flex items-center gap-2">
                <input type="hidden" name="priceOnRequestSubmitted" value="1" />
                <input type="checkbox" name="priceOnRequest" defaultChecked={i.priceOnRequest} className="h-4 w-4" />
                Sob consulta
              </label>
            ) : null}
          </div>
        </FormDialog>
        <ConfirmDelete
          action={apagarItem}
          fields={{ id: i.id }}
          title={`Tirar ${nome} do cardápio?`}
          description="A ficha técnica e as encomendas não mudam."
        />
      </div>
    </li>
  );
}
