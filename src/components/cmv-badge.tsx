import { Badge } from '@/components/ui/badge';
import { formatPercent } from '@/lib/money';

/** Semaforo de CMV: verde ate 30%, ambar ate 40%, vermelho acima. */
export function CmvBadge({ cmv, locale }: { cmv: number; locale: string }) {
  const variant = cmv <= 0.3 ? 'success' : cmv <= 0.4 ? 'warning' : 'destructive';
  return <Badge variant={variant}>{formatPercent(cmv, locale)}</Badge>;
}
