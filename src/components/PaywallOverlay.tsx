import { useEffect, useState } from "react";
import { Lock, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PaywallOverlayProps {
  postId: string;
  ownerId: string;
  price: number;
  onUnlocked: () => void;
}

const PaywallOverlay = ({ postId, ownerId, price, onUnlocked }: PaywallOverlayProps) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.id === ownerId) { onUnlocked(); return; }
    supabase.from("post_unlocks").select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) onUnlocked(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, postId, ownerId]);

  const unlock = async () => {
    if (!user) { toast.error("Sign in to unlock"); return; }
    setBusy(true);
    const { error } = await supabase.from("post_unlocks").insert({ post_id: postId, user_id: user.id, coin_amount: price });
    setBusy(false);
    if (error) { toast.error(error.message.includes("Insufficient") ? "Not enough JagX coins" : "Could not unlock"); return; }
    toast.success(`Unlocked for ${price} 🪙`);
    onUnlocked();
  };

  return (
    <div className="absolute inset-0 z-20 backdrop-blur-2xl bg-background/70 flex flex-col items-center justify-center gap-3 rounded-lg">
      <div className="size-14 rounded-full gold-gradient flex items-center justify-center">
        <Lock className="size-6 text-primary-foreground" />
      </div>
      <p className="text-sm text-champagne font-semibold">Premium content</p>
      <button onClick={unlock} disabled={busy} className="px-5 py-2 rounded-xl gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-50">
        <Coins className="size-3.5" /> Unlock for {price}
      </button>
    </div>
  );
};

export default PaywallOverlay;
