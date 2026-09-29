'use client';

/**
 * Troca de produto sem voltar a listagem.
 *
 * Comparar dois produtos era: voltar atras, procurar o outro, entrar. Agora e
 * escolher no seletor. E um `<select>` nativo de proposito — no telemovel abre
 * a roda do sistema, que se usa com uma mao muito melhor do que qualquer lista
 * que eu desenhasse.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';

import { Select } from '@/components/ui/form-controls';

export function ProductSwitcher({
  current,
  products,
}: {
  current: string;
  products: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  // Estado proprio para o seletor mostrar logo a escolha, sem esperar a
  // navegacao — caso contrario parece que o clique nao fez nada.
  const [escolhido, setEscolhido] = useState(current);

  if (products.length < 2) return null;

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Trocar de produto"
        value={escolhido}
        disabled={pendente}
        onChange={(e) => {
          const id = e.target.value;
          setEscolhido(id);
          iniciar(() => router.push(`/precificacao/${id}`));
        }}
        className="w-full sm:w-64"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      {pendente ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
