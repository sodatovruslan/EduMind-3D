"use client";

import { motion } from "framer-motion";
import { Compass, MousePointerClick, Sparkles } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

const STEP_ICONS = [Compass, MousePointerClick, Sparkles];

export default function HowItWorks() {
  const { t } = useLocale();

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-ds-caption font-semibold uppercase tracking-widest text-accent">{t.howItWorks.eyebrow}</span>
        <h2 className="mt-3 text-ds-display text-text-primary sm:text-4xl">{t.howItWorks.title}</h2>
      </div>

      <div className="relative mt-16 grid grid-cols-1 gap-10 sm:grid-cols-3">
        {/* connecting line — visual flow instead of three disconnected cards */}
        <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-border/25 to-transparent sm:block" aria-hidden="true" />

        {t.howItWorks.steps.map((step, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative flex flex-col items-center text-center"
            >
              <div className="ds-glass flex h-12 w-12 items-center justify-center rounded-full text-accent">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 text-ds-title text-text-primary">{step.title}</h3>
              <p className="mt-2 text-ds-body text-text-secondary">{step.description}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
