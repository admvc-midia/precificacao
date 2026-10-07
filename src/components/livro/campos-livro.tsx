import { Field } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';

/** Titulo, subtitulo e apresentacao de um livro — para criar e para alterar. */
export function CamposLivro({
  d = {},
}: {
  d?: { title?: string; subtitle?: string | null; description?: string | null };
}) {
  return (
    <>
      <Field label="Título" htmlFor="l-titulo">
        <Input id="l-titulo" name="title" defaultValue={d.title ?? ''} placeholder="Receitas da família" required />
      </Field>
      <Field label="Subtítulo" htmlFor="l-sub">
        <Input id="l-sub" name="subtitle" defaultValue={d.subtitle ?? ''} placeholder="Amo Brigs · 2026" />
      </Field>
      <Field label="Apresentação" htmlFor="l-desc" hint="Sai na primeira página do livro impresso.">
        <Textarea id="l-desc" name="description" rows={4} defaultValue={d.description ?? ''} />
      </Field>
    </>
  );
}
