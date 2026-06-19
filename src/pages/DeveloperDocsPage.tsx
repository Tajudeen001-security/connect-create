import { ArrowLeft, BookOpen, Zap, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_BASE = "https://tmmeymhaxkrvngjfhave.supabase.co/functions/v1/ai-v1-chat";

const Section = ({ title, children, icon: Icon }: any) => (
  <section className="p-4 rounded-xl bg-surface border border-border/30 space-y-3">
    <h2 className="text-sm font-semibold text-champagne flex items-center gap-2">
      <Icon className="size-4 text-gold" /> {title}
    </h2>
    {children}
  </section>
);

const Code = ({ children }: { children: string }) => (
  <div className="rounded-lg bg-background/60 border border-border/30 p-3 overflow-x-auto">
    <pre className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre"><code>{children}</code></pre>
  </div>
);

const DeveloperDocsPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen pb-24 bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <BookOpen className="size-5 text-gold" />
          <h1 className="font-display italic text-xl text-gold">API Documentation</h1>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="p-4 rounded-xl glass gold-glow">
          <h2 className="text-lg font-bold text-champagne">JagX AI API · v1</h2>
          <p className="text-xs text-muted-foreground mt-1">
            OpenAI-compatible chat completions powered by Gemini & GPT-5. Bring your own client SDK,
            point it at our base URL, and pass your JagX key as the bearer token.
          </p>
        </div>

        <Section title="Authentication" icon={ShieldCheck}>
          <p className="text-xs text-muted-foreground">
            Each request must include your key in the <code className="text-gold">Authorization</code> header.
            Keys cost <span className="text-gold font-bold">70 🪙</span> on
            <button onClick={() => navigate("/developer")} className="text-gold underline mx-1">/developer</button>.
            Keep them secret — never ship them in client-side code.
          </p>
          <Code>{`Authorization: Bearer jagx_live_xxxxxxxxxxxxxxxxxx`}</Code>
        </Section>

        <Section title="Base URL" icon={Zap}>
          <Code>{API_BASE}</Code>
          <p className="text-[11px] text-muted-foreground">Single endpoint, POST only.</p>
        </Section>

        <Section title="Example · cURL" icon={Sparkles}>
          <Code>{`curl ${API_BASE} \\
  -H "Authorization: Bearer jagx_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "google/gemini-3-flash-preview",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user",   "content": "Explain JagX in one sentence."}
    ]
  }'`}</Code>
        </Section>

        <Section title="Example · Node / TypeScript (OpenAI SDK)" icon={Sparkles}>
          <Code>{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.JAGX_API_KEY!,
  baseURL: "${API_BASE.replace("/ai-v1-chat", "")}/ai-v1-chat",
  // The endpoint accepts /chat/completions shape directly.
});

const res = await client.chat.completions.create({
  model: "google/gemini-3-flash-preview",
  messages: [{ role: "user", content: "Hello JagX!" }],
});
console.log(res.choices[0].message.content);`}</Code>
        </Section>

        <Section title="Example · Python" icon={Sparkles}>
          <Code>{`import requests

r = requests.post(
    "${API_BASE}",
    headers={"Authorization": f"Bearer {JAGX_API_KEY}"},
    json={
        "model": "openai/gpt-5-mini",
        "messages": [{"role": "user", "content": "Hi"}],
    },
)
print(r.json()["choices"][0]["message"]["content"])`}</Code>
        </Section>

        <Section title="Streaming (SSE)" icon={Zap}>
          <p className="text-xs text-muted-foreground">Set <code className="text-gold">"stream": true</code> to receive tokens as Server-Sent Events.</p>
          <Code>{`{
  "model": "google/gemini-3-flash-preview",
  "stream": true,
  "messages": [{"role": "user", "content": "Write a haiku"}]
}`}</Code>
        </Section>

        <Section title="Supported Models" icon={Sparkles}>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li><code className="text-gold">google/gemini-3-flash-preview</code> — fast, multimodal, recommended default</li>
            <li><code className="text-gold">google/gemini-2.5-pro</code> — long context, deep reasoning</li>
            <li><code className="text-gold">openai/gpt-5</code> — highest quality, slower</li>
            <li><code className="text-gold">openai/gpt-5-mini</code> — fast, cheap GPT-class</li>
            <li><code className="text-gold">openai/gpt-5-nano</code> — ultra-cheap, very fast</li>
          </ul>
        </Section>

        <Section title="Rate Limits & Quotas" icon={ShieldCheck}>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>· <span className="text-champagne">60 requests / minute</span> per key (burstable)</li>
            <li>· <span className="text-champagne">No hard daily cap</span> while platform quota is healthy</li>
            <li>· Max input context: depends on model (1M tokens for Gemini 2.5 Pro)</li>
            <li>· Streaming connections close after 5 minutes of inactivity</li>
            <li>· Abuse (spam, illegal content, scraping) revokes keys without refund</li>
          </ul>
        </Section>

        <Section title="Error Responses" icon={AlertTriangle}>
          <p className="text-xs text-muted-foreground">All errors return JSON in the OpenAI error shape:</p>
          <Code>{`{ "error": { "message": "...", "type": "..." } }`}</Code>
          <table className="w-full text-[11px] text-muted-foreground mt-2">
            <thead className="text-champagne text-left">
              <tr><th className="py-1">Status</th><th>type</th><th>Meaning</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-border/30"><td className="py-1.5">401</td><td>invalid_request_error</td><td>Missing or malformed key</td></tr>
              <tr className="border-t border-border/30"><td className="py-1.5">401</td><td>authentication_error</td><td>Key is revoked or doesn't exist</td></tr>
              <tr className="border-t border-border/30"><td className="py-1.5">400</td><td>invalid_request_error</td><td>messages[] missing / bad model</td></tr>
              <tr className="border-t border-border/30"><td className="py-1.5">405</td><td>—</td><td>Use POST, not GET</td></tr>
              <tr className="border-t border-border/30"><td className="py-1.5">429</td><td>rate_limit_error</td><td>Slow down — retry with backoff</td></tr>
              <tr className="border-t border-border/30"><td className="py-1.5">500</td><td>server_error</td><td>Gateway not configured / internal</td></tr>
              <tr className="border-t border-border/30"><td className="py-1.5">502</td><td>upstream_error</td><td>Model provider returned an error</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Best Practices" icon={ShieldCheck}>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>· Always store keys server-side (env vars / secrets manager)</li>
            <li>· Implement exponential backoff on 429 / 5xx</li>
            <li>· Use <code className="text-gold">stream: true</code> for chat UIs to reduce perceived latency</li>
            <li>· Rotate keys regularly via the /developer dashboard</li>
            <li>· Set per-user spend caps in your own app — we don't enforce them</li>
          </ul>
        </Section>

        <div className="p-4 rounded-xl bg-surface border border-border/30 text-center">
          <p className="text-xs text-muted-foreground">Questions? Email <span className="text-gold">jagwazorld@gmail.com</span></p>
        </div>
      </div>
    </div>
  );
};

export default DeveloperDocsPage;