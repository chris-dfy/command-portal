import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ShieldCheck, Eye, Lock } from 'lucide-react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1300),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const features = [
    { icon: Eye, text: "READ-ONLY", phase: 1 },
    { icon: ShieldCheck, text: "EVIDENCE-BASED", phase: 2 },
    { icon: Lock, text: "SECURE", phase: 3 },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex gap-[4vw] items-center">
        {features.map((item, i) => (
          <motion.div
            key={i}
            className="flex flex-col items-center gap-6"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={phase >= item.phase ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className="w-[8vw] h-[8vw] rounded-2xl bg-[rgba(98,210,255,0.05)] border border-[rgba(98,210,255,0.2)] flex items-center justify-center shadow-[0_0_30px_rgba(98,210,255,0.1)] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-[#62d2ff]/10 to-transparent" />
              <item.icon size="3.5vw" className="text-[#62d2ff]" />
            </div>
            <span className="text-[#eaf5fb] font-semibold text-[1.4vw] tracking-wider uppercase">
              {item.text}
            </span>
          </motion.div>
        ))}
      </div>
      
      <motion.div 
        className="absolute bottom-[20%] text-[#8ba4b4] text-[1.1vw] tracking-widest uppercase border border-[rgba(104,207,242,0.17)] px-6 py-3 rounded-full bg-black/50 backdrop-blur-md"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        Backend-for-Frontend Architecture
      </motion.div>
    </motion.div>
  );
}
