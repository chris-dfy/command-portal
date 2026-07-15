import { AudioLines, Compass, Sparkles } from "lucide-react";

export function FutureBriefingDock() {
  return <aside className="future-briefing-dock" aria-label="Reserved future executive briefing area">
    <div className="briefing-orb" aria-hidden="true"><Sparkles size={22} /></div>
    <div>
      <span>Reserved presence</span>
      <strong>Executive briefing position</strong>
      <p>Future guided briefings, narration, and page navigation can occupy this consistent location without changing the shell.</p>
    </div>
    <div className="briefing-capabilities" aria-label="Future capabilities, not currently available"><span><AudioLines size={13} /> Narration — future</span><span><Compass size={13} /> Guidance — future</span></div>
  </aside>;
}
