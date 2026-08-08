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
  auth: {
    common: {
      backToHome: "EduMind 3D",
      showPassword: "Show password",
      hidePassword: "Hide password",
    },
    visual: {
      title: "Welcome to the EduMind universe",
      subtitle: "Electricity, chemistry and geography — as interactive 3D worlds you explore with your own hands.",
    },
    login: {
      title: "Sign in to EduMind 3D",
      emailLabel: "Email",
      passwordLabel: "Password",
      submit: "Sign In",
      submitLoading: "Signing in...",
      noAccount: "Don't have an account?",
      registerLink: "Sign up",
      genericError: "Couldn't sign in. Please try again.",
    },
    register: {
      title: "Create your EduMind 3D account",
      nameLabel: "Full name",
      emailLabel: "Email",
      passwordLabel: "Password",
      passwordHint: "At least 8 characters",
      passwordTooShortError: "Password must be at least 8 characters",
      submit: "Sign Up",
      submitLoading: "Creating your account...",
      hasAccount: "Already have an account?",
      loginLink: "Sign in",
      genericError: "Couldn't create your account. Please try again.",
    },
  },
  dashboard: {
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    subtitle: "Continue your learning journey.",
    statLevel: "Level",
    statXp: "XP",
    statLabs: "Labs",
    statStreak: "Streak",
    continueLearning: {
      title: "Continue Learning",
      unfinishedLabel: "Unfinished experiment",
      resumeCta: "Resume",
      recentLabel: "Recent work",
      recentCta: "Open again",
      emptyTitle: "No lessons yet",
      emptyBody: "Choose a world below to start your first experiment.",
    },
    worlds: {
      title: "Explore the worlds",
      subtitle: "Each world is an interactive 3D laboratory.",
      empty: "No simulations available in this world yet.",
      enterCta: "Enter",
      difficultyLabel: "Difficulty",
    },
    progress: {
      title: "Progress",
      level: "Level",
      xp: "XP",
      completedLabs: "Labs completed",
      accuracy: "Accuracy",
      streak: "Mistake-free streak",
      avgHints: "Avg. hints used",
      avgAttempts: "Avg. attempts",
      recommendedNext: "Recommended difficulty for your next task",
      difficultyEasy: "Easy",
      difficultyMedium: "Medium",
      difficultyHard: "Hard",
      strongTopics: "Strong topics",
      weakTopics: "Worth revisiting",
      achievements: "Achievements",
      empty: "Complete your first lab to see your progress.",
    },
    recentResults: {
      title: "Recent results",
      scoreLabel: "Score",
      durationLabel: "min",
      empty: "No completed labs yet.",
    },
    focusNext: {
      title: "Focus next",
      subtitle: "Topics worth revisiting before your next lab.",
      empty: "Nothing to revisit right now — keep it up!",
    },
    teacherFallback: {
      title: "My simulations",
      subtitle: "An overview of the available worlds. The student panel isn't shown to teachers — use the Students section instead.",
    },
  },
  profile: {
    title: "Profile",
    emailLabel: "Email",
    fullNameLabel: "Full name",
    joinedLabel: "Joined",
    save: "Save",
    saving: "Saving...",
    saved: "Changes saved.",
    saveError: "Couldn't save changes",
  },
  shell: {
    nav: {
      home: "Home",
      teacherArea: "Students",
    },
    role: {
      student: "Student",
      teacher: "Teacher",
      admin: "Admin",
    },
    account: {
      profile: "Profile",
      logout: "Log out",
      menuLabel: "Account menu",
    },
    rail: {
      expand: "Expand navigation",
      collapse: "Collapse navigation",
    },
    mobile: {
      openMenu: "Open menu",
      closeMenu: "Close menu",
    },
  },
};
