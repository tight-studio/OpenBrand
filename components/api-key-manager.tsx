"use client";

import { useState, useEffect } from "react";
import { CodeExampleTabs } from "./code-example-tabs";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    const res = await fetch("/api/keys");
    const data = await res.json();
    setKeys(data.keys || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreatedKey(null);

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName || "Default" }),
    });

    const data = await res.json();
    if (data.key) {
      setCreatedKey(data.key);
      setNewKeyName("");
      fetchKeys();
    }
    setCreating(false);
  };

  const revokeKey = async (id: string) => {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    fetchKeys();
  };

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return <p className="text-neutral-400">Loading API keys...</p>;
  }

  return (
    <div className="space-y-8">
      {/* Create new key */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          Create API Key
        </h2>
        <form onSubmit={createKey} className="flex gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production)"
            className="flex-1 px-4 py-3 rounded-xl border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-shadow"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-6 py-3 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {creating ? "Creating..." : "Create Key"}
          </button>
        </form>
      </div>

      {/* Show newly created key */}
      {createdKey && (
        <div className="px-4 py-4 rounded-xl bg-green-50 border border-green-200">
          <p className="text-sm text-green-800 font-medium mb-2">
            API key created. Copy it now — you won&apos;t see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-white border border-green-200 text-sm text-green-900 font-mono break-all">
              {createdKey}
            </code>
            <button
              onClick={copyKey}
              className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-800 transition-colors shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* List existing keys */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          Your API Keys
        </h2>
        {keys.length === 0 ? (
          <p className="text-neutral-400 text-sm">
            No API keys yet. Create one above.
          </p>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-neutral-200 bg-white"
              >
                <div>
                  <p className="font-medium text-neutral-900">{key.name}</p>
                  <p className="text-sm text-neutral-400 font-mono">
                    {key.key_prefix}...
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    Created{" "}
                    {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at &&
                      ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage example */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Usage</h2>
        <CodeExampleTabs />
      </div>
    </div>
  );
}
