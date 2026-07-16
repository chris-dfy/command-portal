import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div 
        className="absolute top-0 right-0 w-[60%] h-full z-0"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/architecture.png`} 
          alt="Architecture" 
          className="w-full h-full object-cover mix-blend-screen opacity-60 mask-image:linear-gradient(to_right,transparent,black_20%)" 
        />
      </motion.div>

      <div className="w-[50%] pl-[10vw] relative z-10">
        <motion.div
          className="text-[#62d2ff] font-bold tracking-[0.2em] uppercase text-[1vw] mb-4 flex items-center gap-4"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="w-8 h-[2px] bg-[#62d2ff]" />
          System Architecture
        </motion.div>

        <motion.h2
          className="text-[4.5vw] font-bold leading-tight mb-8 font-display"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          SIX-LAYER <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#eaf5fb] to-[#8ba4b4]">
            VISUALIZATION
          </span>
        </motion.h2>

        <motion.div 
          className="space-y-4 border-l border-[#62d2ff]/30 pl-6"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {['Integration', 'Data & State', 'Execution', 'Intelligence', 'Governance', 'Experience'].map((layer, i) => (
            <motion.div 
              key={layer}
              className="text-[#a9bfcb] text-[1.2vw] font-medium tracking-wide uppercase"
              initial={{ opacity: 0, x: -10 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <span className="text-[#62d2ff] mr-3">{`0${i + 1}`}</span> {layer}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
