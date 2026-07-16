import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-center">
        <motion.div
          className="mb-6 mx-auto w-16 h-16 border border-[#62d2ff] rounded-full flex items-center justify-center relative"
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <div className="absolute inset-2 border border-[#62d2ff] rounded-full opacity-50 border-dashed animate-[spin_10s_linear_infinite]" />
          <div className="w-2 h-2 bg-[#62d2ff] rounded-full shadow-[0_0_10px_#62d2ff]" />
        </motion.div>

        <motion.h1
          className="text-[6vw] font-bold tracking-tight text-white leading-none uppercase font-display"
          style={{ fontFamily: 'var(--font-display, sans-serif)' }}
        >
          {"NEXUS COMMAND".split('').map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ opacity: 0, y: 40, rotateX: 90 }}
              animate={phase >= 1 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: 90 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: phase >= 1 ? i * 0.05 : 0 }}
            >
              {char === ' ' ? '\u00A0' : char}
            </motion.span>
          ))}
        </motion.h1>
        
        <motion.div
          className="mt-6 uppercase tracking-[0.3em] text-[#62d2ff] text-[1.2vw] font-semibold"
          initial={{ opacity: 0, letterSpacing: "0.1em" }}
          animate={phase >= 2 ? { opacity: 1, letterSpacing: "0.3em" } : { opacity: 0, letterSpacing: "0.1em" }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          Executive Operating System
        </motion.div>
      </div>
    </motion.div>
  );
}
