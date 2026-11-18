import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/session";

async function CurrentUserMenu() {
  const session = await getSession();
  if (!session) return null;
  return <UserMenu name={session.user.name} email={session.user.email} image={session.user.image ?? null} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <nav className="hidden text-sm font-semibold sm:block">
              <Link href="/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">
                Templates
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="lg" className="hidden sm:inline-flex">
              <Link href="/templates/new">
                <Plus /> New template
              </Link>
            </Button>
            <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
              <CurrentUserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
