"use client";

import { useState } from "react";

const tabs = ["With API Key", "Agent Skill", "Self Hosting", "MCP"] as const;
type Tab = (typeof tabs)[number];

export function GetStartedTabs({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [active, setActive] = useState<Tab>("With API Key");

  return (
    <section className="mt-16">
      <h2 className="text-xl font-semibold text-neutral-900 mb-4">
        Get Started
      </h2>

      <div className="flex gap-1 mb-6 bg-neutral-200/60 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === tab
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === "With API Key" ? (
        <ApiKeyContent isLoggedIn={isLoggedIn} />
      ) : active === "Agent Skill" ? (
        <AgentSkillContent />
      ) : active === "MCP" ? (
        <MCPContent isLoggedIn={isLoggedIn} />
      ) : (
        <SelfHostingContent />
      )}
    </section>
  );
}

function ApiKeyContent({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div>
      <a
        href={isLoggedIn ? "/dashboard" : "/login"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
      >
        {isLoggedIn ? "Manage API keys" : "Login to get API key"}
      </a>
    </div>
  );
}

function AgentSkillContent() {
  return (
    <div>
      <p className="text-neutral-500 mb-3 text-sm">
        Add OpenBrand to Claude Code, Cursor, Codex, Gemini CLI, and{" "}
        <a href="https://skills.sh" className="underline hover:text-neutral-700">40+ other agents</a>:
      </p>
      <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto font-mono leading-relaxed mb-4">{`npx skills add tight-studio/openbrand`}</pre>
      <p className="text-neutral-400 text-sm">
        Once installed, your agent automatically knows how to extract brand assets — just ask it to &ldquo;extract brand assets from stripe.com&rdquo;.
      </p>
    </div>
  );
}

function MCPContent({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div>
      <p className="text-neutral-500 mb-3 text-sm">
        Use OpenBrand as an MCP server in Claude Code, Cursor, or any MCP-compatible client.
      </p>
      <p className="text-neutral-500 mb-3 text-sm">
        1. Install the MCP server:
      </p>
      <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto font-mono leading-relaxed mb-4">{`claude mcp add --transport stdio openbrand -- npx -y openbrand-mcp`}</pre>
      <p className="text-neutral-500 mb-3 text-sm">
        2. {isLoggedIn ? (
          <><a href="/dashboard" className="underline hover:text-neutral-700">Get your API key</a> from the dashboard and add it:</>
        ) : (
          <><a href="/login" className="underline hover:text-neutral-700">Login</a> to get your API key, then add it:</>
        )}
      </p>
      <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto font-mono leading-relaxed mb-4">{`claude mcp add --transport stdio \\
  --env OPENBRAND_API_KEY=your_api_key \\
  openbrand -- npx -y openbrand-mcp`}</pre>
      <p className="text-neutral-500 mb-3 text-sm">
        Or add to your <code className="text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded text-xs">.claude/settings.json</code>:
      </p>
      <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto font-mono leading-relaxed mb-4">{`{
  "mcpServers": {
    "openbrand": {
      "command": "npx",
      "args": ["-y", "openbrand-mcp"],
      "env": {
        "OPENBRAND_API_KEY": "your_api_key"
      }
    }
  }
}`}</pre>
      <p className="text-neutral-400 text-sm">
        Then ask Claude to &ldquo;extract brand assets from stripe.com&rdquo; and it will use the tool automatically.
      </p>
    </div>
  );
}

function SelfHostingContent() {
  return (
    <div>
      <p className="text-neutral-500 mb-3 text-sm">
        Install the npm package:
      </p>
      <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto font-mono mb-4">
        npm add openbrand
      </pre>
      <p className="text-neutral-400 text-sm mb-4">
        No API key required. Runs as a library from your server-side code.
      </p>
      <p className="text-neutral-500 mb-3 text-sm">
        Extract brand assets from any URL:
      </p>
      <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-sm overflow-x-auto font-mono leading-relaxed mb-4">{`import { extractBrandAssets } from "openbrand";

const result = await extractBrandAssets("https://stripe.com");
if (result.ok) {
  // result.data.brand_name → "Stripe"
  // result.data.logos → LogoAsset[]
  // result.data.colors → ColorAsset[]
  // result.data.backdrop_images → BackdropAsset[]
}`}</pre>
    </div>
  );
}
