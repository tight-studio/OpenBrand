import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApiKeyManager } from "@/components/api-key-manager";
import { SignOutButton } from "@/components/sign-out-button";
import { Footer } from "@/components/footer";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-10 flex items-start justify-between">
          <div>
            <a href="/" className="flex items-center gap-3 mb-2 no-underline">
              <img
                src="/logo.svg"
                alt="OpenBrand logo"
                width={32}
                height={34}
              />
              <h1 className="text-3xl font-bold text-neutral-900">
                OpenBrand
              </h1>
            </a>
            <p className="text-neutral-500">Manage your API keys</p>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm">
            <SignOutButton />
            <a
              href="https://github.com/tight-studio/openbrand"
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="GitHub stars"
                src="https://img.shields.io/github/stars/tight-studio/openbrand?style=social"
                className="h-6 w-auto"
              />
            </a>
          </div>
        </div>
        <ApiKeyManager />
      </main>
      <Footer className="max-w-4xl mx-auto" />
    </div>
  );
}
