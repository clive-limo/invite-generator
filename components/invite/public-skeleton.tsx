import { Skeleton } from "@/components/ui/skeleton";

export function PublicSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-2 h-5 w-80 max-w-full" />
      <div className="mt-10 grid gap-8 md:grid-cols-[1.15fr_1fr] md:gap-12">
        <Skeleton className="mx-auto aspect-[5/7] w-full max-w-md rounded-lg" />
        <div className="grid content-start gap-5 rounded-lg border bg-card p-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="grid gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
