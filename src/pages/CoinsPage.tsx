import { useState } from "react";
import { ArrowLeft, Coins, Upload, CheckCircle, BadgeCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

const COIN_PACKAGES = [
  { coins: 100, price: "₦1,000" },
  { coins: 500, price: "₦4,500" },
  { coins: 1000, price: "₦8,500" },
  { coins: 5000, price: "₦40,000" },
  { coins: 10000, price: "₦75,000" },
];

const VERIFICATION_PRICE = "₦10,000";
const OPAY_NUMBER = "9160654415";
const ADMIN_EMAIL = "jagwazorld@gmail.com";

type Tab = "coins" | "verification";

const CoinsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("coins");
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [receiptUploaded, setReceiptUploaded] = useState(false);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "coins" | "verification") => {
    if (!e.target.files?.[0] || !user) return;
    setUploading(true);

    try {
      const file = e.target.files[0];
      const filePath = `${user.id}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      if (type === "coins" && selectedPackage !== null) {
        const pkg = COIN_PACKAGES[selectedPackage];
        const { error } = await supabase.from("coin_transactions").insert({
          user_id: user.id,
          amount: pkg.coins,
          transaction_type: "purchase",
          receipt_url: filePath,
          opay_reference: OPAY_NUMBER,
          status: "pending",
        });
        if (error) throw error;
        toast.success(`Receipt uploaded! Your ${pkg.coins} JagX Coins will be credited after review.`);
      } else if (type === "verification") {
        const { error } = await supabase.from("verification_requests").insert({
          user_id: user.id,
          payment_proof_url: filePath,
          status: "pending",
        });
        if (error) throw error;

        const { error: txError } = await supabase.from("coin_transactions").insert({
          user_id: user.id,
          amount: 0,
          transaction_type: "verification_purchase",
          receipt_url: filePath,
          opay_reference: OPAY_NUMBER,
          status: "pending",
        });
        if (txError) throw txError;
        toast.success("Verification request submitted! You'll be verified after review.");
      }

      setReceiptUploaded(true);
    } catch (error: any) {
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-24">
        <Coins className="size-16 text-gold mb-4" />
        <h2 className="text-lg font-semibold text-champagne mb-2">Sign in Required</h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          You need to sign in to purchase JagX Coins or get verified.
        </p>
        <button
          onClick={() => navigate("/auth")}
          className="px-8 py-3 rounded-xl gold-gradient text-primary-foreground text-sm font-bold uppercase tracking-widest"
        >
          Sign In
        </button>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-display italic text-xl text-gold">JagX Store</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border/30">
        <button
          onClick={() => { setTab("coins"); setReceiptUploaded(false); }}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
            tab === "coins" ? "border-primary text-gold" : "border-transparent text-muted-foreground"
          }`}
        >
          <Coins className="size-4 inline mr-2" />Buy Coins
        </button>
        <button
          onClick={() => { setTab("verification"); setReceiptUploaded(false); }}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
            tab === "verification" ? "border-primary text-gold" : "border-transparent text-muted-foreground"
          }`}
        >
          <BadgeCheck className="size-4 inline mr-2" />Get Verified
        </button>
      </div>

      <div className="p-4 space-y-4">
        {tab === "coins" ? (
          <>
            {/* OPay info */}
            <div className="p-4 rounded-xl glass gold-glow">
              <p className="text-xs text-muted-foreground mb-1">Send payment via OPay to:</p>
              <p className="text-2xl font-bold text-gold tracking-wider">{OPAY_NUMBER}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Receipt will be sent to {ADMIN_EMAIL} for verification
              </p>
            </div>

            {/* Packages */}
            <div className="space-y-2">
              {COIN_PACKAGES.map((pkg, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPackage(i)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-colors ${
                    selectedPackage === i
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Coins className={`size-5 ${selectedPackage === i ? "text-gold" : "text-muted-foreground"}`} />
                    <span className="text-sm font-semibold text-champagne">{pkg.coins.toLocaleString()} Coins</span>
                  </div>
                  <span className="text-sm font-bold text-gold">{pkg.price}</span>
                </button>
              ))}
            </div>

            {selectedPackage !== null && !receiptUploaded && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground text-center">
                  Send {COIN_PACKAGES[selectedPackage].price} to OPay {OPAY_NUMBER}, then upload your receipt
                </p>
                <label className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl gold-gradient text-primary-foreground text-sm font-bold uppercase tracking-widest cursor-pointer">
                  <Upload className="size-4" />
                  {uploading ? "Uploading..." : "Upload Receipt"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleReceiptUpload(e, "coins")}
                    disabled={uploading}
                  />
                </label>
              </div>
            )}

            {receiptUploaded && (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle className="size-12 text-green-500" />
                <p className="text-sm font-semibold text-champagne">Receipt Submitted!</p>
                <p className="text-xs text-muted-foreground text-center">
                  Your coins will be credited once the admin at {ADMIN_EMAIL} approves your payment.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Verification */}
            <div className="p-6 rounded-xl glass gold-glow text-center">
              <BadgeCheck className="size-12 text-gold mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-champagne mb-2">Get Verified</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Skip the requirements and get your verification badge instantly by purchasing it.
              </p>
              <p className="text-3xl font-bold text-gold mb-1">{VERIFICATION_PRICE}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">One-time payment</p>
            </div>

            <div className="p-4 rounded-xl bg-surface border border-border">
              <p className="text-xs text-muted-foreground mb-1">Send payment via OPay to:</p>
              <p className="text-xl font-bold text-gold tracking-wider">{OPAY_NUMBER}</p>
            </div>

            {!receiptUploaded ? (
              <label className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl gold-gradient text-primary-foreground text-sm font-bold uppercase tracking-widest cursor-pointer">
                <Upload className="size-4" />
                {uploading ? "Uploading..." : "Upload Payment Proof"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleReceiptUpload(e, "verification")}
                  disabled={uploading}
                />
              </label>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle className="size-12 text-green-500" />
                <p className="text-sm font-semibold text-champagne">Request Submitted!</p>
                <p className="text-xs text-muted-foreground text-center">
                  You'll receive your verification badge after admin review.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default CoinsPage;
