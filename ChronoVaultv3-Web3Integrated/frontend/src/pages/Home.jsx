import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Clock, GlobeLock, ArrowRight } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const features = [
  {
    icon: Lock,
    title: 'Standard Vault',
    desc: 'Files are shredded into AES-256 encrypted chunks and distributed across IPFS. Reassembly requires the precise decryption key and CID map.',
    color: 'text-primary',
    bg: 'bg-primary/8',
  },
  {
    icon: Clock,
    title: 'Time-Locked Vault',
    desc: 'Set a strict unlock date. Not even you can access the file until the network time reaches the designated release window.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/8',
  },
  {
    icon: GlobeLock,
    title: 'Geo-Locked Vault',
    desc: 'Data unlocks only when the user is within a specific geographic boundary. Verified cryptographically via GPS coordinates.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/8',
  },
];

const stats = [
  { value: 'AES-256', label: 'Client-Side Encryption' },
  { value: 'IPFS', label: 'Decentralized Storage' },
  { value: '0%', label: 'Data Loss History' },
  { value: '100%', label: 'Open Verification' },
];

const Home = () => {
  return (
    <div className="flex flex-col">
      {/* ─── Hero ─── */}
      <section className="relative">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-28 pb-32 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground mb-6 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Web3 Integrated Storage
            </div>
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
            className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-6"
          >
            Secure. Verifiable.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Future-Proof Storage.
            </span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
            className="text-base sm:text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed"
          >
            Military-grade encryption meets decentralized Web3 infrastructure.
            Lock your files with time or geo-location constraints.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={3}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Link to="/upload">
              <Button size="lg" className="w-full sm:w-auto gap-2 font-semibold h-11 px-6">
                Start Vaulting
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/retrieve">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-11 px-6 border-border/40 backdrop-blur-sm">
                Retrieve Files
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="border-t border-border/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="text-center mb-14"
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Three Layers of Protection
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm sm:text-base">
              Your data is only accessible exactly when, where, and to whom you decide.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Card className="h-full bg-card/50 backdrop-blur-md border-border/30 hover:border-border/60 transition-colors">
                  <CardHeader className="pb-3">
                    <div className={`w-10 h-10 rounded-lg ${f.bg} flex items-center justify-center mb-3`}>
                      <f.icon className={`h-5 w-5 ${f.color}`} />
                    </div>
                    <CardTitle className="text-base font-semibold">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats / Trust ─── */}
      <section className="border-t border-border/30">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Zero-Knowledge Architecture
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
              We can't read your data even if we tried. All encryption happens
              locally before anything leaves your device. Your keys stay yours.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
                className="rounded-lg border border-border/30 bg-card/30 backdrop-blur-sm p-5 text-center"
              >
                <div className="text-xl sm:text-2xl font-bold text-foreground mb-1 font-mono">
                  {s.value}
                </div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;