import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <h1 className="font-display italic text-xl text-gold">Privacy &amp; Terms</h1>
        </div>
      </header>
      <article className="prose prose-invert max-w-2xl mx-auto px-4 py-6 text-sm text-foreground space-y-5">
        <p className="text-xs text-muted-foreground">Last updated: June 5, 2026</p>

        <section>
          <h2 className="text-base font-semibold text-champagne">1. Acceptance &amp; "As-Is" Use</h2>
          <p>JagX Buddy Connect ("the Service"), operated under JRI License, is provided strictly on an
            <strong> AS-IS </strong> and <strong>AS-AVAILABLE</strong> basis. By creating an account or using
            any feature you agree that you use the Service entirely at your own risk and that you
            <strong> will not sue, file claims against, or seek damages from </strong> JagX, JRI License, its
            owners, staff, contractors, hosting providers (including Lovable, Vercel and Supabase) for any
            loss, harm, content, transaction, downtime, account action, or interaction that happens on or
            because of this Service.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">2. No Liability</h2>
          <p>To the maximum extent permitted by law, JagX and JRI License are not liable for: lost data,
            lost JagX Coins, missed withdrawals, harassment by other users, content posted by other users,
            failed AI responses, ad performance, copyright disputes, or any indirect, incidental, special,
            consequential or punitive damages.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">3. Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account details (email, username, optional phone, optional avatar/banner).</li>
            <li>Content you create (posts, reels, comments, stories, messages, AI prompts).</li>
            <li>Interactions (likes, follows, views, gifts, coin transactions, ads).</li>
            <li>Device, IP and analytics signals used for security, abuse-prevention and SEO.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">4. How We Use Your Data</h2>
          <p>To operate the Service, personalise your feed, deliver messages and notifications, process
            JagX Coin and withdrawal requests via OPay (admin <code>9160654415</code> /
            <code> jagwazorld@gmail.com</code>), serve relevant ads (including Google AdSense
            <code> ca-pub-6037723607677223</code>), and comply with law.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">5. User Conduct</h2>
          <p>No CSAM, no terrorism, no hate speech, no fraud, no scraping, no spamming, no impersonation,
            no copyright infringement. Violations cause permanent ban and forfeiture of any pending coin
            balance or withdrawal.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">6. Ads &amp; Monetisation</h2>
          <p>Users can spend JagX Coins to place sponsored posts. All sponsored content is clearly
            labelled "Sponsored" inside the feed. We may also serve third-party Google AdSense inventory
            on reels and feed. We do not guarantee ad performance or returns.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">7. JagX Coins &amp; Withdrawals</h2>
          <p>JagX Coins have no cash value outside the Service. The current withdrawal cap is
            ₦20,000 per request. We may delay, reject or claw-back fraudulent or abusive transactions.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">8. AI &amp; Developer API</h2>
          <p>JagX Buddy AI replies are generated and may be wrong. Do not rely on them for medical, legal
            or financial decisions. Developer API keys (prefixed <code>jagx_live_</code>) are personal,
            non-transferable, rate-limited and may be revoked at any time for abuse.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">9. Indemnity</h2>
          <p>You agree to defend, indemnify and hold JagX, JRI License and its operators harmless from any
            claim arising from your use of the Service or breach of these terms.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-champagne">10. Contact</h2>
          <p>Email <a href="mailto:jagwazorld@gmail.com" className="text-gold underline">jagwazorld@gmail.com</a>
            for any privacy, copyright or account questions.</p>
        </section>
      </article>
    </div>
  );
};

export default PrivacyPolicyPage;