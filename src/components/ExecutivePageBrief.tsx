import { ArrowRight, Ban, CircleHelp, ShieldCheck } from "lucide-react";

export function ExecutivePageBrief({ happening, matters, next, blocked }: { happening: string; matters: string; next: string; blocked: string }) {
  const items = [
    { label: "What is happening", value: happening, icon: CircleHelp },
    { label: "Why it matters", value: matters, icon: ShieldCheck },
    { label: "What happens next", value: next, icon: ArrowRight },
    { label: "What is blocked", value: blocked, icon: Ban }
  ];
  return <section className="executive-page-brief" aria-label="Executive page briefing">{items.map((item) => <article key={item.label}><item.icon size={15} aria-hidden="true" /><div><span>{item.label}</span><strong>{item.value}</strong></div></article>)}</section>;
}
