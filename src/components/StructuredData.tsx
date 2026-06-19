import { useEffect } from "react";

// Inject a JSON-LD <script> into <head> for the current page and clean it up on unmount.
export const StructuredData = ({ data, id }: { data: Record<string, any>; id: string }) => {
  useEffect(() => {
    const elId = `ld-${id}`;
    let el = document.getElementById(elId) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = elId;
      document.head.appendChild(el);
    }
    el.text = JSON.stringify(data);
    return () => { el?.remove(); };
  }, [data, id]);
  return null;
};

export default StructuredData;