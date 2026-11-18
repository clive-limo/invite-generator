import { CalendarX2, Hourglass, Link2Off, PauseCircle } from "lucide-react";
import type { LinkProblem as Problem } from "@/lib/templates";

const COPY: Record<Problem, { title: string; body: string; icon: typeof Link2Off }> = {
  not_found: { title: "Link not found", body: "Check that you copied the whole link, or ask the organiser for a new one.", icon: Link2Off },
  disabled: { title: "This link is paused", body: "The organiser has turned this link off for now.", icon: PauseCircle },
  expired: { title: "This link has expired", body: "Ask the organiser if you still need an invite.", icon: CalendarX2 },
  exhausted: { title: "All invites have been claimed", body: "This link has reached its limit. The organiser can raise it.", icon: Hourglass },
  unpublished: { title: "Not ready yet", body: "The organiser is still preparing this invite. Try again soon.", icon: Hourglass },
};

export function LinkProblem({ problem }: { problem: Problem }) {
  const { title, body, icon: Icon } = COPY[problem];
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full border border-foreground/15 bg-card">
        <Icon className="size-6 text-brand-ink" />
      </span>
      <h1 className="mt-5 text-2xl font-medium tracking-[-0.02em]">{title}</h1>
      <p className="mt-2 text-muted-foreground">{body}</p>
    </div>
  );
}
