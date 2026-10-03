import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-6">
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (<Skeleton key={i} className="h-28" />))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
