import { ru } from "./ru";
import { en } from "./en";
import { tg } from "./tg";
import type { Locale } from "../locales";

export type Dictionary = typeof ru;

export const dictionaries: Record<Locale, Dictionary> = { ru, en, tg };
