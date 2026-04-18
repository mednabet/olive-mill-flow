/**
 * i18n minimal : dictionnaires FR/AR + hook + provider léger.
 * Stocke la préférence dans localStorage et applique dir="rtl"/lang sur <html>.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { jsx } from "react/jsx-runtime";

export type Locale = "fr" | "ar";

const dict = {
  fr: {
    "app.title": "Moulin à Huile",
    "app.tagline": "Gestion industrielle complète",
    "nav.dashboard": "Tableau de bord",
    "nav.arrivals": "Arrivées",
    "nav.weighing": "Pesage",
    "nav.crushing": "Écrasement",
    "nav.queue": "File d'attente",
    "nav.production": "Production",
    "nav.stocks": "Stocks",
    "nav.clients": "Clients",
    "nav.invoices": "Facturation",
    "nav.public_display": "Écran public",
    "nav.admin": "Administration",
    "nav.settings": "Paramètres",
    "nav.users": "Utilisateurs",
    "nav.lines": "Lignes d'écrasement",
    "nav.audit": "Journal d'audit",
    "auth.signin": "Se connecter",
    "auth.signup": "Créer un compte",
    "auth.signout": "Se déconnecter",
    "auth.email": "Adresse e-mail",
    "auth.password": "Mot de passe",
    "auth.full_name": "Nom complet",
    "auth.have_account": "Déjà un compte ?",
    "auth.no_account": "Pas encore de compte ?",
    "auth.welcome": "Bienvenue",
    "auth.signin_subtitle": "Connectez-vous pour accéder à la plateforme",
    "auth.signup_subtitle": "Premier compte = administrateur du système",
    "auth.error": "Erreur d'authentification",
    "auth.success_signup": "Compte créé. Vous pouvez vous connecter.",
    "common.loading": "Chargement…",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.search": "Rechercher",
    "common.actions": "Actions",
    "common.language": "Langue",
    "common.profile": "Profil",
    "common.welcome_user": "Bonjour",
    "dash.today_arrivals": "Arrivées du jour",
    "dash.in_queue": "En file d'attente",
    "dash.in_progress": "En cours d'écrasement",
    "dash.completed_today": "Terminés aujourd'hui",
    "dash.coming_soon": "Modules métier — bientôt disponibles",
    "dash.coming_soon_desc":
      "Les modules d'arrivées, pesage, écrasement, production et stocks seront ajoutés dans les prochaines itérations.",
    "role.admin": "Administrateur",
    "role.superviseur": "Superviseur",
    "role.peseur": "Peseur",
    "role.operateur": "Opérateur",
    "role.caisse": "Caisse",
    "role.public_display": "Écran public",
    "role.none": "Aucun rôle assigné",
    "role.none_desc":
      "Votre compte n'a aucun rôle. Demandez à un administrateur de vous attribuer un rôle.",
  },
  ar: {
    "app.title": "معصرة الزيت",
    "app.tagline": "نظام إدارة صناعي متكامل",
    "nav.dashboard": "لوحة القيادة",
    "nav.arrivals": "الواردات",
    "nav.weighing": "الوزن",
    "nav.crushing": "العصر",
    "nav.queue": "قائمة الانتظار",
    "nav.production": "الإنتاج",
    "nav.stocks": "المخزون",
    "nav.clients": "العملاء",
    "nav.invoices": "الفوترة",
    "nav.public_display": "شاشة العرض",
    "nav.admin": "الإدارة",
    "nav.settings": "الإعدادات",
    "nav.users": "المستخدمون",
    "nav.lines": "خطوط العصر",
    "nav.audit": "سجل التدقيق",
    "auth.signin": "تسجيل الدخول",
    "auth.signup": "إنشاء حساب",
    "auth.signout": "تسجيل الخروج",
    "auth.email": "البريد الإلكتروني",
    "auth.password": "كلمة المرور",
    "auth.full_name": "الاسم الكامل",
    "auth.have_account": "لديك حساب بالفعل؟",
    "auth.no_account": "ليس لديك حساب؟",
    "auth.welcome": "مرحباً",
    "auth.signin_subtitle": "سجّل الدخول للوصول إلى المنصة",
    "auth.signup_subtitle": "الحساب الأول = مدير النظام",
    "auth.error": "خطأ في المصادقة",
    "auth.success_signup": "تم إنشاء الحساب. يمكنك تسجيل الدخول.",
    "common.loading": "جاري التحميل…",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "common.search": "بحث",
    "common.actions": "إجراءات",
    "common.language": "اللغة",
    "common.profile": "الملف الشخصي",
    "common.welcome_user": "مرحباً",
    "dash.today_arrivals": "واردات اليوم",
    "dash.in_queue": "في قائمة الانتظار",
    "dash.in_progress": "قيد العصر",
    "dash.completed_today": "مكتملة اليوم",
    "dash.coming_soon": "وحدات الأعمال — قريباً",
    "dash.coming_soon_desc":
      "ستتم إضافة وحدات الواردات والوزن والعصر والإنتاج والمخزون في التكرارات القادمة.",
    "role.admin": "مدير",
    "role.superviseur": "مشرف",
    "role.peseur": "وزّان",
    "role.operateur": "مشغّل",
    "role.caisse": "أمين الصندوق",
    "role.public_display": "شاشة العرض",
    "role.none": "لا يوجد دور",
    "role.none_desc": "حسابك لا يحتوي على أي دور. اطلب من المدير تعيين دور لك.",
  },
} as const;

export type TranslationKey = keyof (typeof dict)["fr"];

interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
  dir: "ltr" | "rtl";
}

const I18nContext = createContext<I18nCtx | null>(null);
const STORAGE_KEY = "moulin.locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  // Hydratation depuis localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "fr" || stored === "ar") {
      setLocaleState(stored);
    }
  }, []);

  // Application sur <html> (lang + dir)
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  };

  const t = (key: TranslationKey): string => dict[locale][key] ?? key;
  const dir = locale === "ar" ? "rtl" : "ltr";

  return jsx(I18nContext.Provider, { value: { locale, setLocale, t, dir }, children });
}

export function useI18n(): I18nCtx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
