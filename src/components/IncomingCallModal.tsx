import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface IncomingCall {
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  callType: "video" | "audio";
}

interface IncomingCallModalProps {
  onAccept: (call: IncomingCall) => void;
  onReject: (callerId: string) => void;
}

const IncomingCallModal = ({ onAccept, onReject }: IncomingCallModalProps) => {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`incoming-calls-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: `callee_id=eq.${user.id}`,
      }, async (payload: any) => {
        const signal = payload.new;
        if (signal.signal_type !== "call-request") return;

        // Fetch caller profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("user_id", signal.caller_id)
          .single();

        setIncomingCall({
          callerId: signal.caller_id,
          callerName: profile?.display_name || profile?.username || "Unknown",
          callerAvatar: profile?.avatar_url,
          callType: signal.call_type as "video" | "audio",
        });
      })
      .subscribe();

    // Also listen for call-ended to dismiss
    const endChannel = supabase.channel(`call-end-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: `callee_id=eq.${user.id}`,
      }, (payload: any) => {
        if (payload.new.signal_type === "call-ended") {
          setIncomingCall(null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(endChannel);
    };
  }, [user]);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[99] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-5 max-w-xs w-full mx-4 animate-in fade-in slide-in-from-bottom-4">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-3xl font-bold text-black overflow-hidden">
          {incomingCall.callerAvatar ? (
            <img src={incomingCall.callerAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            incomingCall.callerName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="text-center">
          <h3 className="text-foreground text-lg font-semibold">{incomingCall.callerName}</h3>
          <p className="text-muted-foreground text-sm flex items-center gap-1 justify-center mt-1">
            {incomingCall.callType === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            Incoming {incomingCall.callType} call...
          </p>
        </div>
        <div className="flex gap-8 mt-2">
          <button
            onClick={() => { onReject(incomingCall.callerId); setIncomingCall(null); }}
            className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-lg"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
          <button
            onClick={() => { onAccept(incomingCall); setIncomingCall(null); }}
            className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shadow-lg animate-pulse"
          >
            <Phone className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
