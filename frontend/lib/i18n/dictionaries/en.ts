import { ru } from "./ru";

// English — natural copy, not a literal translation of ru.ts. Typed against
// `typeof ru` so a missing/renamed key fails the build instead of silently
// falling back or rendering blank.
export const en: typeof ru = {
  common: {
    getStarted: "Get Started",
    signIn: "Sign In",
    openDashboard: "Open Dashboard",
    exploreWorlds: "Explore Worlds",
  },
  nav: {
    worlds: "Worlds",
    howItWorks: "How It Works",
    students: "For Students",
    teachers: "For Teachers",
    signIn: "Sign In",
    getStarted: "Get Started",
    openDashboard: "Open Dashboard",
    profile: "Profile",
    menu: "Open menu",
    close: "Close menu",
  },
  hero: {
    eyebrow: "Interactive 3D Learning",
    headlineLine1: "Don't just read science —",
    headlineLine2: "step inside it.",
    subcopy:
      "EduMind 3D turns physics, chemistry and geography into interactive worlds where students learn through experiment, interaction and direct exploration.",
    ctaPrimary: "Get Started",
    ctaSecondary: "Explore Worlds",
    subjectsLine: "Physics · Chemistry · Geography",
  },
  heroHud: {
    electricity: { title: "Electricity Lab", subtitle: "Interactive circuits" },
    chemistry: { title: "Chemistry World", subtitle: "Virtual experiments" },
    geo: { title: "GeoWorld", subtitle: "Explore the planet" },
  },
  worlds: {
    eyebrow: "Three Worlds",
    title: "Explore the EduMind worlds",
    subtitle: "Each world is a full 3D laboratory, not a textbook illustration.",
    cta: "Open world",
    items: {
      electricity: {
        name: "Electricity Lab",
        tagline: "Build, switch on, measure",
        description:
          "Connect wires, build real circuits, and watch current come alive — with live measurements and feedback.",
      },
      chemistry: {
        name: "Chemistry World",
        tagline: "Mix, heat, observe",
        description:
          "Pour reagents, heat test tubes, and watch reactions unfold — with a real safety system and guided lab steps.",
      },
      geo: {
        name: "GeoWorld",
        tagline: "Rotate, zoom, explore",
        description:
          "Explore Earth as a true 3D object — spin the globe, zoom into regions, and study geography in space, not on a flat map.",
      },
    },
  },
  howItWorks: {
    eyebrow: "How It Works",
    title: "Learn by doing",
    steps: [
      { title: "Choose a world", description: "Electricity, chemistry or geography — start with what you're learning right now." },
      { title: "Interact", description: "Build circuits, mix substances, spin the globe — hands-on, in real 3D." },
      { title: "Understand", description: "Work through guided steps, get hints, and track your progress." },
    ],
  },
  students: {
    eyebrow: "For Students",
    title: "Learn by doing",
    subtitle: "Real 3D laboratories instead of static illustrations.",
    features: [
      { title: "Full 3D interaction", description: "Drag objects, connect wires, pour liquids — control the lab directly, with your own hands." },
      { title: "Guided lab work", description: "Every experiment breaks down into clear steps with checks and hints." },
      { title: "Progress & achievements", description: "Track your level, XP, and streak of completed experiments." },
      { title: "AI Teacher on hand", description: "Ask questions mid-experiment and get an answer grounded in what's actually happening." },
    ],
  },
  teachers: {
    eyebrow: "For Teachers",
    title: "See your class, clearly",
    subtitle: "EduMind doesn't replace the teacher — it surfaces what's easy to miss otherwise.",
    features: [
      { title: "Class performance at a glance", description: "Average score, completion rate and student activity — without collecting reports by hand." },
      { title: "Every student's results", description: "Open the full lab history for any student individually." },
      { title: "Where students actually struggle", description: "See weak topics and recurring mistakes, not just a final grade." },
    ],
  },
  aiTeacher: {
    eyebrow: "AI Teacher",
    title: "Guidance exactly when it's needed",
    description:
      "The AI Teacher sees the current state of the experiment and answers questions grounded in what's actually happening — a support for learning, not a replacement for it.",
  },
  finalCta: {
    title: "Ready to enter the lesson?",
    subtitle: "Open your first world and learn by interacting, not memorizing.",
    ctaPrimary: "Get Started",
    ctaSecondary: "Explore Worlds",
  },
  footer: {
    description: "An interactive learning platform — physics, chemistry and geography as 3D worlds you learn by experimenting in.",
    navTitle: "Navigation",
    accountTitle: "Account",
    rights: "© 2026 EduMind 3D",
  },
};
