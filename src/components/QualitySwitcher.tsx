import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { StreamQuality } from "@/components/LiveRoom";

interface Props {
  value: StreamQuality;
  onChange: (q: StreamQuality) => void;
}

const opts: { v: StreamQuality; label: string }[] = [
  { v: "auto", label: "Auto" },
  { v: "low", label: "Low" },
  { v: "medium", label: "Medium" },
  { v: "high", label: "High" },
];

const QualitySwitcher = ({ value, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="px-2 py-1 rounded-full glass flex items-center gap-1.5">
        <Settings2 className="size-3" />
        <span className="text-[10px] font-bold uppercase">{value}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-28 rounded-xl bg-surface border border-border/50 shadow-lg overflow-hidden z-10">
          {opts.map(o => (
            <button key={o.v} onClick={() => { onChange(o.v); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs ${value === o.v ? "bg-gold/15 text-gold" : "text-foreground hover:bg-background/40"}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default QualitySwitcher;