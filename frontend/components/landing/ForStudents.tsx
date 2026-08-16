"use client";

import { motion } from "framer-motion";
import { Bot, Hand, ListChecks, Trophy } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { Surface } from "@/components/design-system";

const FEATURE_ICONS = [Hand, ListChecks, Trophy, Bot];

export default function ForStudents() {
  const { t } = useLocale();

  return (
    <section id="students" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-ds-caption font-semibold uppercase tracking-widest text-accent">{t.students.eyebrow}</span>
        <h2 className="mt-3 text-ds-display text-text-primary sm:text-4xl">{t.students.title}</h2>
        <p className="mt-4 text-ds-body text-text-secondary">{t.students.subtitle}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {t.students.features.map((feature, i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Surface elevated className="flex h-full gap-4 p-5">
                <div className="ds-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-control text-accent">
                  <Icon size={18} />
                </div>
                <div>
                  <h3 className="text-ds-body font-semibold text-text-primary">{feature.title}</h3>
                  <p className="mt-1 text-ds-body text-text-secondary">{feature.description}</p>
                </div>
              </Surface>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
