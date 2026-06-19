import { useState, useEffect } from "react";
import { ArrowLeft, Settings, Camera, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const EditProfilePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [aiConsent, setAiConsent] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setUsername(data.username || "");
          setDisplayName(data.display_name || "");
          setBio(data.bio || "");
          setLocation(data.location || "");
          setFirstName((data as any).first_name || "");
          setMiddleName((data as any).middle_name || "");
          setLastName((data as any).last_name || "");
          setDob((data as any).date_of_birth || "");
          setSex((data as any).sex || "");
          setCountry((data as any).country || "");
          setRegion((data as any).region || "");
          setCity((data as any).city || "");
          setAddress((data as any).address || "");
          setAiConsent(!!(data as any).ai_training_consent);
        }
      });
  }, [user]);

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
      setProfile((p: any) => ({ ...p, avatar_url: publicUrl }));
      toast.success("Avatar updated!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/banner.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ banner_url: publicUrl }).eq("user_id", user.id);
      setProfile((p: any) => ({ ...p, banner_url: publicUrl }));
      toast.success("Banner updated!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const update: any = {
      username, display_name: displayName, bio, location,
      first_name: firstName || null, middle_name: middleName || null, last_name: lastName || null,
      date_of_birth: dob || null, sex: sex || null,
      region: region || null, city: city || null, address: address || null,
      ai_training_consent: aiConsent,
    };
    // Country is locked unless VPN flag set (handled server-side later).
    if (profile?.country_locked === false) update.country = country || null;
    const { error } = await supabase.from("profiles").update(update).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else { toast.success("Profile updated!"); navigate("/profile"); }
    setSaving(false);
  };

  if (!profile) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="size-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <h1 className="text-sm font-semibold text-champagne">Edit Profile</h1>
          <button onClick={saveProfile} disabled={saving} className="text-gold text-sm font-semibold disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      {/* Banner */}
      <div className="relative h-32 bg-surface overflow-hidden">
        {profile.banner_url && <img src={profile.banner_url} className="w-full h-full object-cover" />}
        <label className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer">
          <Camera className="size-6 text-white/70" />
          <input type="file" accept="image/*" onChange={uploadBanner} className="hidden" />
        </label>
      </div>

      {/* Avatar */}
      <div className="px-4 -mt-10 relative z-10">
        <div className="relative inline-block">
          <div className="size-20 rounded-full border-4 border-background overflow-hidden bg-surface">
            {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center text-2xl font-display italic text-gold">{(username || "U")[0].toUpperCase()}</div>}
          </div>
          <label className="absolute bottom-0 right-0 size-7 rounded-full gold-gradient flex items-center justify-center cursor-pointer">
            <Camera className="size-3.5 text-primary-foreground" />
            <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
          </label>
        </div>
        {uploading && <p className="text-xs text-gold mt-1">Uploading...</p>}
      </div>

      {/* Form */}
      <div className="p-4 space-y-4 mt-4">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Display Name</label>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Bio</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary resize-none" placeholder="Tell the world about yourself..." />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Location</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country"
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">First name</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Last name</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Middle name (optional)</label>
          <input type="text" value={middleName} onChange={e => setMiddleName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Date of birth</label>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Sex</label>
            <select value={sex} onChange={e => setSex(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary">
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
            Country {profile?.country_locked && <span className="text-gold normal-case tracking-normal">🔒 locked to signup country</span>}
          </label>
          <input type="text" value={country} disabled={profile?.country_locked !== false} onChange={e => setCountry(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary disabled:opacity-60" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Region / State" value={region} onChange={e => setRegion(e.target.value)}
            className="px-3 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
          <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)}
            className="px-3 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Address (optional)</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm outline-none focus:border-primary" />
        </div>

        {/* AI training consent */}
        <div className="p-4 rounded-xl bg-surface border border-border/30">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={aiConsent} onChange={e => setAiConsent(e.target.checked)} className="mt-1 accent-gold size-4" />
            <div>
              <p className="text-sm font-semibold text-champagne">Help train JagX AI</p>
              <p className="text-[11px] text-muted-foreground mt-1">Off by default. When on, your future messages may be used to improve JagX AI. We never sell or share with third parties.</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default EditProfilePage;
