"use client";

import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { GlassPanel } from "@/components/design-system";

/**
 * D2 — AI Teacher is a small supporting capability, not the product's
 * identity (§10 of the brief): EduMind is interactive 3D learning first,
 * AI-assisted second. Kept compact and glass (floating support), not a
 * full hero-weight section.
 */
export default function AITeacherHighlight() {
  const { t } = useLocale();

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.4 }}>
        <GlassPanel className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
          <div className="ds-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-accent">
            <Bot size={22} />
          </div>
          <div>
            <span className="text-ds-caption font-semibold uppercase tracking-widest text-accent">{t.aiTeacher.eyebrow}</span>
            <h3 className="mt-1 text-ds-title text-text-primary">{t.aiTeacher.title}</h3>
            <p className="mt-2 text-ds-body text-text-secondary">{t.aiTeacher.description}</p>
          </div>
        </GlassPanel>
      </motion.div>
    </section>
  );
}
