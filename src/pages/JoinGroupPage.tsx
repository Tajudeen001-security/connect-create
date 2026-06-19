import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Canonical from "@/components/Canonical";

const JoinGroupPage = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [group, setGroup] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    supabase.from("group_chats").select("*").eq("invite_code", code).eq("is_public", true).maybeSingle()
      .then(({ data }) => setGroup(data));
  }, [code]);

  const join = async () => {
    if (!user) { navigate(`/auth?next=/g/${code}`); return; }
    if (!group) return;
    setBusy(true);
    const { data: existing } = await supabase.from("group_members").select("id").eq("group_id", group.id).eq("user_id", user.id).maybeSingle();
    if (existing) { navigate(`/group/${group.id}`); return; }
    const { error } = await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "member" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Joined ${group.name}`);
    navigate(`/group/${group.id}`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  if (!group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <Canonical path={`/g/${code}`} />
        <Users className="size-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">This invite is invalid or the group is private.</p>
        <button onClick={() => navigate("/groups")} className="mt-6 px-6 py-3 rounded-xl gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest">Discover groups</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <Canonical path={`/g/${code}`} />
      <div className="size-20 rounded-full gold-gradient flex items-center justify-center mb-4"><Users className="size-8 text-primary-foreground" /></div>
      <h1 className="font-display italic text-2xl text-gold mb-1">{group.name}</h1>
      {group.description && <p className="text-sm text-muted-foreground max-w-sm mb-6">{group.description}</p>}
      <button onClick={join} disabled={busy} className="px-8 py-3 rounded-xl gold-gradient text-primary-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-50">
        {busy ? "Joining..." : user ? "Join Group" : "Sign in to Join"}
      </button>
    </div>
  );
};

export default JoinGroupPage;