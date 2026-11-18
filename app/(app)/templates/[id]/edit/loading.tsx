import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid flex-1 place-items-center p-12">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
