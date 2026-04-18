/**
 * i18n minimal : dictionnaires FR/AR + hook + provider léger.
 * Stocke la préférence dans localStorage et applique dir="rtl"/lang sur <html>.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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
    "common.add": "Ajouter",
    "common.edit": "Modifier",
    "common.delete": "Supprimer",
    "common.create": "Créer",
    "common.update": "Mettre à jour",
    "common.confirm": "Confirmer",
    "common.close": "Fermer",
    "common.yes": "Oui",
    "common.no": "Non",
    "common.optional": "optionnel",
    "common.required": "requis",
    "common.notes": "Observations",
    "common.empty": "Aucun résultat",
    "common.error": "Une erreur est survenue",
    "common.success": "Opération réussie",
    "common.back": "Retour",
    "common.print": "Imprimer",
    "common.history": "Historique",
    "common.never": "Jamais",
    "common.active": "Actif",
    "common.inactive": "Inactif",
    "common.status": "Statut",
    "common.created_at": "Créé le",
    "common.total": "Total",
    "common.no_data": "Aucune donnée",
    "common.try_search": "Essayez une autre recherche.",
    // Clients
    "client.title": "Clients",
    "client.subtitle": "Gestion du fichier client",
    "client.new": "Nouveau client",
    "client.edit": "Modifier le client",
    "client.code": "Code",
    "client.full_name": "Nom complet",
    "client.phone": "Téléphone",
    "client.address": "Adresse",
    "client.preferred_language": "Langue préférée",
    "client.notes": "Observations",
    "client.search_placeholder": "Rechercher par nom, code ou téléphone…",
    "client.empty_title": "Aucun client",
    "client.empty_desc": "Commencez par créer votre premier client.",
    "client.code_auto": "Code auto-généré",
    "client.created_success": "Client créé",
    "client.updated_success": "Client mis à jour",
    "client.deleted_success": "Client supprimé",
    "client.delete_confirm": "Supprimer ce client ?",
    "client.delete_confirm_desc": "Cette action est irréversible. Les arrivées liées seront conservées.",
    "client.vehicles": "Véhicules",
    "client.history": "Historique des arrivées",
    "client.activate": "Activer",
    "client.deactivate": "Désactiver",
    "client.fr": "Français",
    "client.ar": "العربية",
    // Vehicles
    "vehicle.title": "Véhicules",
    "vehicle.new": "Nouveau véhicule",
    "vehicle.edit": "Modifier le véhicule",
    "vehicle.plate": "Immatriculation",
    "vehicle.type": "Type",
    "vehicle.type_placeholder": "Ex: Camionnette, Tracteur, Voiture…",
    "vehicle.empty": "Aucun véhicule enregistré pour ce client.",
    "vehicle.created_success": "Véhicule ajouté",
    "vehicle.updated_success": "Véhicule modifié",
    "vehicle.deleted_success": "Véhicule supprimé",
    "vehicle.delete_confirm": "Supprimer ce véhicule ?",
    // Arrivals
    "arrival.title": "Arrivées",
    "arrival.subtitle": "Enregistrement des arrivées clients",
    "arrival.new": "Nouvelle arrivée",
    "arrival.ticket": "N° Ticket",
    "arrival.client": "Client",
    "arrival.vehicle": "Véhicule",
    "arrival.service": "Service demandé",
    "arrival.service.weigh_simple": "Pesage simple",
    "arrival.service.weigh_double": "Double pesage",
    "arrival.service.crushing": "Écrasement",
    "arrival.status.open": "Ouverte",
    "arrival.status.routed": "Orientée",
    "arrival.status.closed": "Clôturée",
    "arrival.status.cancelled": "Annulée",
    "arrival.created_success": "Arrivée enregistrée — Ticket %s",
    "arrival.cancel_confirm": "Annuler cette arrivée ?",
    "arrival.cancel_success": "Arrivée annulée",
    "arrival.search_placeholder": "Rechercher par ticket, client…",
    "arrival.client_required": "Sélectionnez un client",
    "arrival.no_vehicle": "Aucun véhicule",
    "arrival.today_only": "Aujourd'hui",
    "arrival.all": "Toutes",
    "arrival.print_ticket": "Imprimer ticket",
    "arrival.go_to_weighing": "Aller au pesage",
    "arrival.empty": "Aucune arrivée",
    "arrival.empty_today": "Aucune arrivée aujourd'hui.",
    "arrival.select_client_first": "Sélectionnez d'abord un client",
    "arrival.select_or_search": "Sélectionner ou rechercher…",
    "arrival.create_client_inline": "+ Nouveau client",
    // Validation
    "validation.required": "Ce champ est requis",
    "validation.min_length": "Minimum %s caractères",
    "validation.max_length": "Maximum %s caractères",
    "validation.invalid_phone": "Numéro de téléphone invalide",
    // Dashboard
    "dash.today_arrivals": "Arrivées du jour",
    "dash.in_queue": "En file d'attente",
    "dash.in_progress": "En cours d'écrasement",
    "dash.completed_today": "Terminés aujourd'hui",
    "dash.coming_soon": "Modules métier — bientôt disponibles",
    "dash.coming_soon_desc":
      "Les modules de pesage, écrasement, production et stocks seront ajoutés dans les prochaines itérations.",
    "dash.quick_actions": "Actions rapides",
    "dash.new_arrival": "Nouvelle arrivée",
    "dash.new_client": "Nouveau client",
    // Roles
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
    "common.add": "إضافة",
    "common.edit": "تعديل",
    "common.delete": "حذف",
    "common.create": "إنشاء",
    "common.update": "تحديث",
    "common.confirm": "تأكيد",
    "common.close": "إغلاق",
    "common.yes": "نعم",
    "common.no": "لا",
    "common.optional": "اختياري",
    "common.required": "مطلوب",
    "common.notes": "ملاحظات",
    "common.empty": "لا توجد نتائج",
    "common.error": "حدث خطأ",
    "common.success": "تمت العملية بنجاح",
    "common.back": "رجوع",
    "common.print": "طباعة",
    "common.history": "السجل",
    "common.never": "أبداً",
    "common.active": "نشط",
    "common.inactive": "غير نشط",
    "common.status": "الحالة",
    "common.created_at": "تاريخ الإنشاء",
    "common.total": "المجموع",
    "common.no_data": "لا توجد بيانات",
    "common.try_search": "جرّب بحثاً آخر.",
    // Clients
    "client.title": "العملاء",
    "client.subtitle": "إدارة ملف العملاء",
    "client.new": "عميل جديد",
    "client.edit": "تعديل العميل",
    "client.code": "الرمز",
    "client.full_name": "الاسم الكامل",
    "client.phone": "الهاتف",
    "client.address": "العنوان",
    "client.preferred_language": "اللغة المفضّلة",
    "client.notes": "ملاحظات",
    "client.search_placeholder": "ابحث بالاسم أو الرمز أو الهاتف…",
    "client.empty_title": "لا يوجد عملاء",
    "client.empty_desc": "ابدأ بإنشاء أول عميل.",
    "client.code_auto": "رمز تلقائي",
    "client.created_success": "تم إنشاء العميل",
    "client.updated_success": "تم تحديث العميل",
    "client.deleted_success": "تم حذف العميل",
    "client.delete_confirm": "حذف هذا العميل؟",
    "client.delete_confirm_desc": "هذا الإجراء لا يمكن التراجع عنه. سيتم الاحتفاظ بالواردات المرتبطة.",
    "client.vehicles": "المركبات",
    "client.history": "سجل الواردات",
    "client.activate": "تفعيل",
    "client.deactivate": "تعطيل",
    "client.fr": "Français",
    "client.ar": "العربية",
    // Vehicles
    "vehicle.title": "المركبات",
    "vehicle.new": "مركبة جديدة",
    "vehicle.edit": "تعديل المركبة",
    "vehicle.plate": "رقم اللوحة",
    "vehicle.type": "النوع",
    "vehicle.type_placeholder": "مثال: شاحنة صغيرة، جرّار، سيارة…",
    "vehicle.empty": "لا توجد مركبات مسجّلة لهذا العميل.",
    "vehicle.created_success": "تمت إضافة المركبة",
    "vehicle.updated_success": "تم تعديل المركبة",
    "vehicle.deleted_success": "تم حذف المركبة",
    "vehicle.delete_confirm": "حذف هذه المركبة؟",
    // Arrivals
    "arrival.title": "الواردات",
    "arrival.subtitle": "تسجيل واردات العملاء",
    "arrival.new": "وارد جديد",
    "arrival.ticket": "رقم التذكرة",
    "arrival.client": "العميل",
    "arrival.vehicle": "المركبة",
    "arrival.service": "الخدمة المطلوبة",
    "arrival.service.weigh_simple": "وزن بسيط",
    "arrival.service.weigh_double": "وزن مزدوج",
    "arrival.service.crushing": "عصر",
    "arrival.status.open": "مفتوحة",
    "arrival.status.routed": "موجّهة",
    "arrival.status.closed": "مغلقة",
    "arrival.status.cancelled": "ملغاة",
    "arrival.created_success": "تم تسجيل الوارد — تذكرة %s",
    "arrival.cancel_confirm": "إلغاء هذا الوارد؟",
    "arrival.cancel_success": "تم إلغاء الوارد",
    "arrival.search_placeholder": "ابحث بالتذكرة أو العميل…",
    "arrival.client_required": "اختر عميلاً",
    "arrival.no_vehicle": "بدون مركبة",
    "arrival.today_only": "اليوم",
    "arrival.all": "الكل",
    "arrival.print_ticket": "طباعة التذكرة",
    "arrival.go_to_weighing": "الذهاب إلى الوزن",
    "arrival.empty": "لا توجد واردات",
    "arrival.empty_today": "لا توجد واردات اليوم.",
    "arrival.select_client_first": "اختر عميلاً أولاً",
    "arrival.select_or_search": "اختر أو ابحث…",
    "arrival.create_client_inline": "+ عميل جديد",
    // Validation
    "validation.required": "هذا الحقل مطلوب",
    "validation.min_length": "%s أحرف على الأقل",
    "validation.max_length": "%s أحرف كحد أقصى",
    "validation.invalid_phone": "رقم هاتف غير صالح",
    // Dashboard
    "dash.today_arrivals": "واردات اليوم",
    "dash.in_queue": "في قائمة الانتظار",
    "dash.in_progress": "قيد العصر",
    "dash.completed_today": "مكتملة اليوم",
    "dash.coming_soon": "وحدات الأعمال — قريباً",
    "dash.coming_soon_desc":
      "ستتم إضافة وحدات الوزن والعصر والإنتاج والمخزون في التكرارات القادمة.",
    "dash.quick_actions": "إجراءات سريعة",
    "dash.new_arrival": "وارد جديد",
    "dash.new_client": "عميل جديد",
    // Roles
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
  t: (key: TranslationKey, ...args: (string | number)[]) => string;
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

  const t = (key: TranslationKey, ...args: (string | number)[]): string => {
    let str: string = dict[locale][key] ?? key;
    args.forEach((a) => {
      str = str.replace("%s", String(a));
    });
    return str;
  };
  const dir = locale === "ar" ? "rtl" : "ltr";

  return <I18nContext.Provider value={{ locale, setLocale, t, dir }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
