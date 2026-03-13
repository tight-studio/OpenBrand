import { UrlForm } from "@/components/url-form";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { GetStartedTabs } from "@/components/get-started-tabs";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-10 flex items-start justify-between">
          <div>
            <a href="/" className="flex items-center gap-3 mb-2 no-underline">
              <img src="/logo.svg" alt="OpenBrand logo" width={32} height={34} />
              <h1 className="text-3xl font-bold text-neutral-900">
                OpenBrand
              </h1>
            </a>
            <p className="text-neutral-500">
              Enter a website to extract its brand assets - logos, colors, and
              images.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {user && (
              <>
                <a
                  href="/dashboard"
                  className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors font-medium"
                >
                  API Keys
                </a>
                <SignOutButton />
              </>
            )}
            <a
              href="https://github.com/ethanjyx/openbrand"
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="GitHub stars"
                src="https://img.shields.io/github/stars/ethanjyx/openbrand?style=social"
                className="h-6"
              />
            </a>
          </div>
        </div>
        <UrlForm initialUrl={url} />

        <GetStartedTabs isLoggedIn={!!user} />
      </main>
      <footer className="max-w-4xl mx-auto px-6 pb-10 text-center text-sm text-neutral-400">
        OpenBrand is designed, built, and backed by{" "}
        <a
          href="http://tight.software/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-600 transition-colors"
        >
          Tight Software LLC
        </a>
        .
      </footer>
    </div>
  );
}
