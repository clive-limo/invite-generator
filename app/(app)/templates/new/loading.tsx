import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-2 h-5 w-full max-w-md" />
      <Skeleton className="mt-6 h-72 rounded-2xl" />
    </div>
  );
}
