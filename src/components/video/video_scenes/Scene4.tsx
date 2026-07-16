import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-end z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div 
        className="absolute top-0 left-0 w-[60%] h-full z-0"
        initial={{ opacity: 0, x: -100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/ledger.png`} 
          alt="Ledger" 
          className="w-full h-full object-cover mix-blend-screen opacity-60 mask-image:linear-gradient(to_left,transparent,black_20%)" 
        />
      </motion.div>

      <div className="w-[50%] pr-[10vw] relative z-10 text-right">
        <motion.div
          className="text-[#6ee7b7] font-bold tracking-[0.2em] uppercase text-[1vw] mb-4 flex items-center justify-end gap-4"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          Verification
          <div className="w-8 h-[2px] bg-[#6ee7b7]" />
        </motion.div>

        <motion.h2
          className="text-[4vw] font-bold leading-tight mb-8 font-display text-white"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          EVIDENCE LEDGER
        </motion.h2>

        <div className="grid gap-6 justify-end">
          {['Claims', 'Proofs', 'Receipts'].map((item, i) => (
            <motion.div
              key={item}
              className="bg-[#0a161f]/80 backdrop-blur-md border border-[#6ee7b7]/20 p-6 rounded-xl w-[25vw] flex justify-between items-center"
              initial={{ opacity: 0, x: 50 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
              transition={{ delay: i * 0.15, type: 'spring', stiffness: 200, damping: 20 }}
            >
              <span className="text-[#a9bfcb] text-[1.3vw] font-medium uppercase tracking-wider">{item}</span>
              <div className="flex items-center gap-3">
                <span className="text-[#6ee7b7] text-[0.9vw] uppercase tracking-widest">Verified</span>
                <div className="w-2 h-2 rounded-full bg-[#6ee7b7] shadow-[0_0_10px_#6ee7b7]" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
