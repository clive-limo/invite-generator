"use client";

import { FileSpreadsheet, User } from "lucide-react";
import { useState } from "react";
import { BulkGenerator } from "@/components/bulk/bulk-generator";
import { PageHeader } from "@/components/app/page-header";
import { SingleGenerator, type GeneratorTemplate } from "@/components/invite/single-generator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  initialMode: "single" | "bulk";
  template: GeneratorTemplate;
  claimUrl: string;
  maxRows: number;
}

/** The owner's own generator: the same flows as a share link, without link quotas. */
export function OwnerGenerate({ initialMode, template, claimUrl, maxRows }: Props) {
  const [mode, setMode] = useState(initialMode);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={template.name}
        title="Generate"
        description={<>Make invites yourself — they&apos;re logged in Activity but don&apos;t count against links.</>}
        actions={
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="h-9!">
              <TabsTrigger value="single">
                <User /> One invite
              </TabsTrigger>
              <TabsTrigger value="bulk">
                <FileSpreadsheet /> From a spreadsheet
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {mode === "single" ? (
        <SingleGenerator template={template} claimUrl={claimUrl} />
      ) : (
        <BulkGenerator template={template} claimUrl={claimUrl} maxRows={maxRows} />
      )}
    </div>
  );
}
