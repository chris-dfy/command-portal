import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-10 bg-[#050b10]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="text-center">
        <motion.div
          className="mb-8 mx-auto w-20 h-20 bg-gradient-to-br from-[#62d2ff]/20 to-[#6ee7b7]/10 rounded-2xl border border-[#62d2ff]/30 flex items-center justify-center shadow-[0_0_50px_rgba(98,210,255,0.15)] relative overflow-hidden"
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <div className="w-8 h-8 bg-gradient-to-br from-[#62d2ff] to-[#6ee7b7] rounded-lg shadow-[0_0_20px_#62d2ff]" />
        </motion.div>

        <motion.h1
          className="text-[4vw] font-bold tracking-tight text-white mb-4 uppercase font-display"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          NEXUS COMMAND
        </motion.h1>

        <motion.div
          className="text-[#8ba4b4] text-[1.2vw] tracking-[0.2em] uppercase max-w-[40vw] mx-auto leading-relaxed"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1 }}
        >
          The Single Pane of Glass <br/>
          <span className="text-[#62d2ff] font-semibold mt-2 block">For Executive Oversight</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
