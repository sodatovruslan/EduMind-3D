"use client";

import { motion } from "framer-motion";
import { BarChart3, ClipboardList, Target } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { Surface } from "@/components/design-system";

const FEATURE_ICONS = [BarChart3, ClipboardList, Target];

export default function ForTeachers() {
  const { t } = useLocale();

  return (
    <section id="teachers" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-ds-caption font-semibold uppercase tracking-widest text-accent">{t.teachers.eyebrow}</span>
        <h2 className="mt-3 text-ds-display text-text-primary sm:text-4xl">{t.teachers.title}</h2>
        <p className="mt-4 text-ds-body text-text-secondary">{t.teachers.subtitle}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {t.teachers.features.map((feature, i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <Surface elevated className="flex h-full flex-col gap-3 p-6">
                <div className="ds-glass flex h-10 w-10 items-center justify-center rounded-ds-control text-accent">
                  <Icon size={18} />
                </div>
                <h3 className="text-ds-body font-semibold text-text-primary">{feature.title}</h3>
                <p className="text-ds-body text-text-secondary">{feature.description}</p>
              </Surface>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
