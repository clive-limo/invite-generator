import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { TemplateUpload } from "@/components/upload/template-upload";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requireUser("/templates/new");
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Step 01 · Upload"
        title="New template"
        description={<>Upload the finished design with the personalised parts left blank. You&apos;ll mark where the text goes next.</>}
      />
      <div className="mt-8">
        <TemplateUpload />
      </div>
    </div>
  );
}
