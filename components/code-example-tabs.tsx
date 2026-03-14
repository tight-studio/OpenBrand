"use client";

import { useState } from "react";

const languages = ["cURL", "Python", "TypeScript"] as const;
type Language = (typeof languages)[number];

function getExample(lang: Language, apiKey: string): string {
  switch (lang) {
    case "cURL":
      return `curl "https://openbrand.sh/api/extract?url=https://stripe.com" \\
  -H "Authorization: Bearer ${apiKey}"`;
    case "Python":
      return `import requests

response = requests.get(
    "https://openbrand.sh/api/extract",
    params={"url": "https://stripe.com"},
    headers={"Authorization": "Bearer ${apiKey}"},
)
brand = response.json()["data"]`;
    case "TypeScript":
      return `const response = await fetch(
  "https://openbrand.sh/api/extract?url=https://stripe.com",
  { headers: { Authorization: "Bearer ${apiKey}" } },
);
const { data: brand } = await response.json();`;
  }
}

export function CodeExampleTabs({ apiKey = "YOUR_API_KEY" }: { apiKey?: string }) {
  const [active, setActive] = useState<Language>("cURL");

  return (
    <div>
      <div className="flex gap-1 mb-3 bg-neutral-200/60 rounded-lg p-1 w-fit">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => setActive(lang)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              active === lang
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {lang}
          </button>
        ))}
      </div>
      <pre className="px-4 py-3 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto font-mono leading-relaxed">
        <code>{getExample(active, apiKey)}</code>
      </pre>
    </div>
  );
}
