// Tiny dependency-free i18n. Dictionary-per-key so locales stay aligned;
// missing entries fall back to English, then to the caller's fallback text.
import { useSyncExternalStore } from "react";

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
] as const;
export type Locale = (typeof LOCALES)[number]["code"];
const CODES = LOCALES.map((l) => l.code) as readonly string[];

const M: Record<string, Partial<Record<Locale, string>>> = {
  /* ---- nav ---- */
  "nav.features": { en: "Features", es: "Funciones", fr: "Fonctionnalités", de: "Funktionen", pt: "Recursos", zh: "功能", ja: "機能", hi: "विशेषताएँ", ar: "المميزات" },
  "nav.pricing": { en: "Pricing", es: "Precios", fr: "Tarifs", de: "Preise", pt: "Preços", zh: "价格", ja: "料金", hi: "मूल्य", ar: "الأسعار" },
  "nav.download": { en: "Download", es: "Descargar", fr: "Télécharger", de: "Download", pt: "Baixar", zh: "下载", ja: "ダウンロード", hi: "डाउनलोड", ar: "تنزيل" },
  "nav.status": { en: "Status", es: "Estado", fr: "Statut", de: "Status", pt: "Status", zh: "状态", ja: "ステータス", hi: "स्थिति", ar: "الحالة" },
  "nav.account": { en: "Account", es: "Cuenta", fr: "Compte", de: "Konto", pt: "Conta", zh: "账户", ja: "アカウント", hi: "खाता", ar: "الحساب" },
  "nav.get": { en: "Get the app →", es: "Obtener la app →", fr: "Obtenir l'app →", de: "App holen →", pt: "Baixar o app →", zh: "获取应用 →", ja: "アプリを入手 →", hi: "ऐप पाएं →", ar: "احصل على التطبيق ←" },

  /* ---- hero ---- */
  "hero.eyebrow": { en: "// personal finance, leveled up", es: "// finanzas personales, a otro nivel", fr: "// finances personnelles, niveau supérieur", de: "// persönliche Finanzen, next level", pt: "// finanças pessoais, em outro nível", zh: "// 个人理财，全面升级", ja: "// パーソナルファイナンスをレベルアップ", hi: "// पर्सनल फाइनेंस, अगले स्तर पर", ar: "// أموالك الشخصية بمستوى أعلى" },
  "hero.title1": { en: "Master your money.", es: "Domina tu dinero.", fr: "Maîtrisez votre argent.", de: "Meistere dein Geld.", pt: "Domine seu dinheiro.", zh: "掌控你的财务。", ja: "お金を、思いのままに。", hi: "अपने पैसों पर पूरी पकड़।", ar: "تحكَّم في أموالك." },
  "hero.title2": { en: "Cyber-clean.", es: "Ciber-limpio.", fr: "Cyber-net.", de: "Cyber-clean.", pt: "Cyber-limpo.", zh: "赛博式清爽。", ja: "サイバー・クリーン。", hi: "साइबर-क्लीन।", ar: "بأسلوب رقمي أنيق." },
  "hero.sub": { en: "Budgets, goals, debt payoff, investments, and a true net worth. Track everything, owe less, build more.", es: "Presupuestos, metas, pago de deudas, inversiones y tu patrimonio real. Controla todo, debe menos, construye más.", fr: "Budgets, objectifs, remboursement de dettes, investissements et patrimoine réel. Suivez tout, devez moins, bâtissez plus.", de: "Budgets, Ziele, Schuldenabbau, Investments und dein echtes Nettovermögen. Alles im Blick, weniger Schulden, mehr Vermögen.", pt: "Orçamentos, metas, quitação de dívidas, investimentos e patrimônio real. Acompanhe tudo, deva menos, construa mais.", zh: "预算、目标、还债、投资和真实净资产。掌握一切，少欠债，多积累。", ja: "予算・目標・借金返済・投資・純資産をまとめて管理。すべてを把握し、負債を減らし、資産を築く。", hi: "बजट, लक्ष्य, कर्ज़ चुकाना, निवेश और असली नेट वर्थ। सब कुछ ट्रैक करें, कम कर्ज़, ज़्यादा बचत।", ar: "ميزانيات وأهداف وسداد ديون واستثمارات وصافي ثروة حقيقي. تتبَّع كل شيء، قلِّل ديونك، ونمِّ ثروتك." },
  "hero.ctaDownload": { en: "⤓ Download free", es: "⤓ Descargar gratis", fr: "⤓ Télécharger gratuitement", de: "⤓ Kostenlos laden", pt: "⤓ Baixar grátis", zh: "⤓ 免费下载", ja: "⤓ 無料ダウンロード", hi: "⤓ मुफ़्त डाउनलोड", ar: "⤓ تنزيل مجاني" },
  "hero.ctaPricing": { en: "See pricing", es: "Ver precios", fr: "Voir les tarifs", de: "Preise ansehen", pt: "Ver preços", zh: "查看价格", ja: "料金を見る", hi: "मूल्य देखें", ar: "عرض الأسعار" },
  "hero.statModules": { en: "modules", es: "módulos", fr: "modules", de: "Module", pt: "módulos", zh: "个模块", ja: "モジュール", hi: "मॉड्यूल", ar: "وحدات" },
  "hero.statPlatforms": { en: "platforms", es: "plataformas", fr: "plateformes", de: "Plattformen", pt: "plataformas", zh: "个平台", ja: "プラットフォーム", hi: "प्लेटफ़ॉर्म", ar: "منصات" },
  "hero.statStart": { en: "to start", es: "para empezar", fr: "pour commencer", de: "zum Start", pt: "para começar", zh: "起步价", ja: "で始められる", hi: "शुरुआत के लिए", ar: "للبدء" },

  /* ---- features section ---- */
  "feat.eyebrow": { en: "// everything in one place", es: "// todo en un solo lugar", fr: "// tout au même endroit", de: "// alles an einem Ort", pt: "// tudo em um só lugar", zh: "// 一切尽在一处", ja: "// すべてをひとつに", hi: "// सब कुछ एक जगह", ar: "// كل شيء في مكان واحد" },
  "feat.title": { en: "One app. Your whole financial life.", es: "Una app. Toda tu vida financiera.", fr: "Une app. Toute votre vie financière.", de: "Eine App. Dein ganzes Finanzleben.", pt: "Um app. Toda a sua vida financeira.", zh: "一款应用，管好你的全部财务。", ja: "ひとつのアプリで、お金のすべてを。", hi: "एक ऐप। आपकी पूरी वित्तीय ज़िंदगी।", ar: "تطبيق واحد لحياتك المالية كلها." },
  "feat.sub": { en: "No spreadsheets, no five apps. BudgetSmart turns raw transactions into clarity.", es: "Sin hojas de cálculo ni cinco apps. BudgetSmart convierte transacciones en claridad.", fr: "Ni tableurs, ni cinq applis. BudgetSmart transforme vos transactions en clarté.", de: "Keine Tabellen, keine fünf Apps. BudgetSmart macht aus Rohdaten Klarheit.", pt: "Sem planilhas, sem cinco apps. O BudgetSmart transforma transações em clareza.", zh: "不用表格，不用五个应用。BudgetSmart 让交易一目了然。", ja: "表計算も複数アプリも不要。BudgetSmartが取引を明快に整理します。", hi: "न स्प्रेडशीट, न पाँच ऐप्स। BudgetSmart लेन-देन को स्पष्टता में बदलता है।", ar: "بلا جداول ولا خمسة تطبيقات. BudgetSmart يحوِّل معاملاتك إلى وضوح." },
  "feat1.t": { en: "Budgets & safe-to-spend", es: "Presupuestos y saldo seguro", fr: "Budgets & reste-à-dépenser", de: "Budgets & Safe-to-Spend", pt: "Orçamentos e saldo seguro", zh: "预算与可安全支出", ja: "予算＆使える残高", hi: "बजट और खर्च-योग्य राशि", ar: "الميزانيات والمتاح للإنفاق" },
  "feat1.b": { en: "Monthly limits, rollover, and a real-time number you can safely spend right now.", es: "Límites mensuales, saldo acumulable y una cifra en tiempo real que puedes gastar con seguridad.", fr: "Limites mensuelles, report, et un montant en temps réel que vous pouvez dépenser sans risque.", de: "Monatslimits, Übertrag und eine Echtzeit-Zahl, die du jetzt sicher ausgeben kannst.", pt: "Limites mensais, saldo acumulado e um número em tempo real que você pode gastar com segurança.", zh: "月度限额、结转，以及一个实时可放心消费的数字。", ja: "月次上限、繰り越し、そして今すぐ安心して使える金額をリアルタイム表示。", hi: "मासिक सीमाएँ, रोलओवर, और रीयल-टाइम राशि जो आप अभी सुरक्षित खर्च कर सकते हैं।", ar: "حدود شهرية وترحيل للرصيد ورقم فوري يمكنك إنفاقه بأمان الآن." },
  "feat2.t": { en: "Goals", es: "Metas", fr: "Objectifs", de: "Ziele", pt: "Metas", zh: "目标", ja: "目標", hi: "लक्ष्य", ar: "الأهداف" },
  "feat2.b": { en: "Targets with required-monthly pacing, projected dates, and milestone celebrations.", es: "Objetivos con ritmo mensual necesario, fechas proyectadas y celebración de hitos.", fr: "Des cibles avec rythme mensuel requis, dates projetées et jalons célébrés.", de: "Ziele mit Monatsrate, prognostizierten Daten und Meilenstein-Feiern.", pt: "Metas com ritmo mensal necessário, datas projetadas e celebração de marcos.", zh: "目标含每月所需进度、预计达成日期和里程碑庆祝。", ja: "必要月額ペース、達成予定日、マイルストーンのお祝い付きの目標管理。", hi: "मासिक गति, अनुमानित तिथियाँ और माइलस्टोन जश्न के साथ लक्ष्य।", ar: "أهداف بوتيرة شهرية مطلوبة وتواريخ متوقعة واحتفالات بالإنجازات." },
  "feat3.t": { en: "Debt payoff", es: "Pago de deudas", fr: "Remboursement de dettes", de: "Schuldenabbau", pt: "Quitação de dívidas", zh: "债务清偿", ja: "借金返済", hi: "कर्ज़ चुकाना", ar: "سداد الديون" },
  "feat3.b": { en: "Snowball or avalanche planners that show your debt-free date and interest saved.", es: "Planes bola de nieve o avalancha que muestran tu fecha libre de deudas y el interés ahorrado.", fr: "Méthodes boule de neige ou avalanche : date de libération et intérêts économisés.", de: "Schneeball- oder Lawinen-Pläne mit schuldenfreiem Datum und gesparten Zinsen.", pt: "Planos bola de neve ou avalanche que mostram sua data livre de dívidas e juros economizados.", zh: "雪球或雪崩式还款计划，显示无债日期和节省的利息。", ja: "スノーボール／アバランチ方式で完済日と節約利息を可視化。", hi: "स्नोबॉल या एवलांच प्लानर — कर्ज़-मुक्त तिथि और बचा ब्याज दिखाते हैं।", ar: "خطط كرة الثلج أو الانهيار تُظهر تاريخ تحررك من الدين والفوائد الموفَّرة." },
  "feat4.t": { en: "Investments", es: "Inversiones", fr: "Investissements", de: "Investments", pt: "Investimentos", zh: "投资", ja: "投資", hi: "निवेश", ar: "الاستثمارات" },
  "feat4.b": { en: "Portfolio, allocation, cost basis, and a compounding growth projector.", es: "Cartera, asignación, coste base y proyector de crecimiento compuesto.", fr: "Portefeuille, allocation, prix de revient et projection de croissance composée.", de: "Portfolio, Allokation, Einstandskurs und Zinseszins-Projektion.", pt: "Carteira, alocação, custo base e projetor de crescimento composto.", zh: "投资组合、配置、成本基础和复利增长预测。", ja: "ポートフォリオ、配分、取得原価、複利成長シミュレーター。", hi: "पोर्टफोलियो, आवंटन, कॉस्ट बेसिस और चक्रवृद्धि ग्रोथ प्रोजेक्टर।", ar: "المحفظة والتوزيع وأساس التكلفة ومحاكي النمو المركب." },
  "feat5.t": { en: "Net worth", es: "Patrimonio neto", fr: "Patrimoine net", de: "Nettovermögen", pt: "Patrimônio líquido", zh: "净资产", ja: "純資産", hi: "नेट वर्थ", ar: "صافي الثروة" },
  "feat5.b": { en: "Accounts, investments, and debts unified into one true number — with history.", es: "Cuentas, inversiones y deudas unificadas en una cifra real, con historial.", fr: "Comptes, investissements et dettes réunis en un chiffre vrai — avec historique.", de: "Konten, Investments und Schulden vereint in einer echten Zahl — mit Verlauf.", pt: "Contas, investimentos e dívidas unificados em um número real — com histórico.", zh: "账户、投资和债务汇成一个真实数字，含历史记录。", ja: "口座・投資・負債をひとつの本当の数字に統合。履歴つき。", hi: "खाते, निवेश और कर्ज़ — एक सच्चे आँकड़े में, इतिहास सहित।", ar: "حسابات واستثمارات وديون موحَّدة في رقم واحد حقيقي — مع السجل." },
  "feat6.t": { en: "Reports & export", es: "Informes y exportación", fr: "Rapports & export", de: "Berichte & Export", pt: "Relatórios e exportação", zh: "报表与导出", ja: "レポート＆エクスポート", hi: "रिपोर्ट और निर्यात", ar: "التقارير والتصدير" },
  "feat6.b": { en: "Cashflow, trends, category & merchant breakdowns. One-click CSV export.", es: "Flujo de caja, tendencias, desglose por categoría y comercio. Exporta a CSV con un clic.", fr: "Trésorerie, tendances, ventilation par catégorie et marchand. Export CSV en un clic.", de: "Cashflow, Trends, Kategorie- & Händler-Aufschlüsselung. CSV-Export mit einem Klick.", pt: "Fluxo de caixa, tendências, detalhamento por categoria e comerciante. Exportação CSV em um clique.", zh: "现金流、趋势、类别与商家明细。一键导出 CSV。", ja: "キャッシュフロー、トレンド、カテゴリ・店舗別内訳。ワンクリックCSV出力。", hi: "कैशफ़्लो, ट्रेंड, श्रेणी और मर्चेंट विवरण। एक क्लिक में CSV निर्यात।", ar: "التدفق النقدي والاتجاهات وتفصيل الفئات والتجّار. تصدير CSV بنقرة." },
  "feat7.t": { en: "Subscription detection", es: "Detección de suscripciones", fr: "Détection d'abonnements", de: "Abo-Erkennung", pt: "Detecção de assinaturas", zh: "订阅检测", ja: "サブスク検出", hi: "सब्सक्रिप्शन पहचान", ar: "كشف الاشتراكات" },
  "feat7.b": { en: "We find recurring charges automatically and predict the next bill.", es: "Encontramos cargos recurrentes automáticamente y predecimos la próxima factura.", fr: "Nous repérons les prélèvements récurrents et prédisons la prochaine facture.", de: "Wir finden wiederkehrende Abbuchungen automatisch und sagen die nächste Rechnung voraus.", pt: "Encontramos cobranças recorrentes automaticamente e prevemos a próxima fatura.", zh: "自动发现周期性扣费并预测下一笔账单。", ja: "定期的な請求を自動検出し、次回請求を予測します。", hi: "आवर्ती शुल्क अपने आप ढूँढते हैं और अगला बिल बताते हैं।", ar: "نكتشف الرسوم المتكررة تلقائيًا ونتوقع الفاتورة القادمة." },
  "feat8.t": { en: "Rewards", es: "Recompensas", fr: "Récompenses", de: "Belohnungen", pt: "Recompensas", zh: "奖励", ja: "リワード", hi: "इनाम", ar: "المكافآت" },
  "feat8.b": { en: "XP, levels, streaks, and achievements that make good money habits stick.", es: "XP, niveles, rachas y logros que consolidan buenos hábitos financieros.", fr: "XP, niveaux, séries et succès qui ancrent les bonnes habitudes.", de: "XP, Level, Serien und Erfolge, die gute Geldgewohnheiten festigen.", pt: "XP, níveis, sequências e conquistas que firmam bons hábitos financeiros.", zh: "经验值、等级、连击和成就，让好习惯坚持下去。", ja: "XP・レベル・連続記録・実績で良いお金の習慣が身につく。", hi: "XP, लेवल, स्ट्रीक और उपलब्धियाँ — अच्छी आदतें पक्की करें।", ar: "نقاط ومستويات وسلاسل وإنجازات ترسِّخ العادات المالية الجيدة." },

  /* ---- pricing ---- */
  "price.eyebrow": { en: "// simple, honest pricing", es: "// precios simples y honestos", fr: "// des prix simples et honnêtes", de: "// einfache, ehrliche Preise", pt: "// preços simples e honestos", zh: "// 简单诚实的定价", ja: "// シンプルで正直な料金", hi: "// सरल, ईमानदार मूल्य", ar: "// أسعار بسيطة وصادقة" },
  "price.title": { en: "Pick your tier.", es: "Elige tu plan.", fr: "Choisissez votre offre.", de: "Wähle deine Stufe.", pt: "Escolha seu plano.", zh: "选择你的方案。", ja: "プランを選ぶ。", hi: "अपना प्लान चुनें।", ar: "اختر باقتك." },
  "price.sub": { en: "Start free. Upgrade when you want goals, reports, investing, or a plan for the whole family.", es: "Empieza gratis. Mejora cuando quieras metas, informes, inversión o un plan familiar.", fr: "Commencez gratuitement. Passez au niveau supérieur pour les objectifs, rapports, l'investissement ou la famille.", de: "Starte kostenlos. Upgrade für Ziele, Berichte, Investieren oder die ganze Familie.", pt: "Comece grátis. Faça upgrade quando quiser metas, relatórios, investimentos ou um plano para a família.", zh: "免费开始。需要目标、报表、投资或全家方案时再升级。", ja: "無料で開始。目標・レポート・投資・家族プランが欲しくなったらアップグレード。", hi: "मुफ़्त शुरू करें। लक्ष्य, रिपोर्ट, निवेश या पारिवारिक प्लान चाहिए तो अपग्रेड करें।", ar: "ابدأ مجانًا وارتقِ عندما تريد الأهداف والتقارير والاستثمار أو خطة للعائلة كلها." },
  "price.gFree": { en: "Free", es: "Gratis", fr: "Gratuit", de: "Kostenlos", pt: "Grátis", zh: "免费", ja: "無料", hi: "मुफ़्त", ar: "مجاني" },
  "price.gInd": { en: "Individual", es: "Individual", fr: "Individuel", de: "Einzeln", pt: "Individual", zh: "个人", ja: "個人", hi: "व्यक्तिगत", ar: "فردي" },
  "price.gFam": { en: "Family — up to 5 people", es: "Familia — hasta 5 personas", fr: "Famille — jusqu'à 5 personnes", de: "Familie — bis zu 5 Personen", pt: "Família — até 5 pessoas", zh: "家庭 — 最多 5 人", ja: "ファミリー — 最大5人", hi: "परिवार — 5 लोगों तक", ar: "العائلة — حتى 5 أشخاص" },
  "price.gCustom": { en: "Custom", es: "Personalizado", fr: "Sur mesure", de: "Individuell", pt: "Personalizado", zh: "定制", ja: "カスタム", hi: "कस्टम", ar: "مخصص" },
  "price.popular": { en: "POPULAR", es: "POPULAR", fr: "POPULAIRE", de: "BELIEBT", pt: "POPULAR", zh: "热门", ja: "人気", hi: "लोकप्रिय", ar: "الأكثر شيوعًا" },
  "price.free": { en: "Free", es: "Gratis", fr: "Gratuit", de: "Kostenlos", pt: "Grátis", zh: "免费", ja: "無料", hi: "मुफ़्त", ar: "مجاني" },
  "price.mo": { en: " /mo", es: " /mes", fr: " /mois", de: " /Mon.", pt: " /mês", zh: " /月", ja: " /月", hi: " /माह", ar: " /شهر" },
  "price.once": { en: " one-time", es: " pago único", fr: " en une fois", de: " einmalig", pt: " pagamento único", zh: " 一次性", ja: " 買い切り", hi: " एकमुश्त", ar: " دفعة واحدة" },
  "price.members": { en: "up to {n} member{s}", es: "hasta {n} miembro{s}", fr: "jusqu'à {n} membre{s}", de: "bis zu {n} Mitglied(er)", pt: "até {n} membro{s}", zh: "最多 {n} 名成员", ja: "最大{n}人", hi: "{n} सदस्य तक", ar: "حتى {n} أعضاء" },
  "price.getApp": { en: "Get the app", es: "Obtener la app", fr: "Obtenir l'app", de: "App holen", pt: "Baixar o app", zh: "获取应用", ja: "アプリを入手", hi: "ऐप पाएं", ar: "احصل على التطبيق" },
  "price.choose": { en: "Choose plan", es: "Elegir plan", fr: "Choisir l'offre", de: "Plan wählen", pt: "Escolher plano", zh: "选择方案", ja: "プランを選択", hi: "प्लान चुनें", ar: "اختر الخطة" },

  /* ---- downloads ---- */
  "dl.eyebrow": { en: "// get the app", es: "// obtén la app", fr: "// obtenir l'app", de: "// hol dir die App", pt: "// baixe o app", zh: "// 获取应用", ja: "// アプリを入手", hi: "// ऐप पाएं", ar: "// احصل على التطبيق" },
  "dl.title": { en: "Download BudgetSmart.", es: "Descarga BudgetSmart.", fr: "Téléchargez BudgetSmart.", de: "BudgetSmart herunterladen.", pt: "Baixe o BudgetSmart.", zh: "下载 BudgetSmart。", ja: "BudgetSmartをダウンロード。", hi: "BudgetSmart डाउनलोड करें।", ar: "نزِّل BudgetSmart." },
  "dl.sub": { en: "Windows, Linux, and Android are available now — iOS and macOS are on the way.", es: "Windows, Linux y Android ya disponibles — iOS y macOS en camino.", fr: "Windows, Linux et Android sont disponibles — iOS et macOS arrivent.", de: "Windows, Linux und Android sind da — iOS und macOS folgen.", pt: "Windows, Linux e Android já disponíveis — iOS e macOS a caminho.", zh: "Windows、Linux 和 Android 现已上线 — iOS 和 macOS 即将推出。", ja: "Windows・Linux・Androidは提供中 — iOS・macOSは近日公開。", hi: "Windows, Linux और Android अभी उपलब्ध — iOS और macOS जल्द।", ar: "Windows وLinux وAndroid متاحة الآن — iOS وmacOS قريبًا." },
  "dl.btn": { en: "⤓ Download", es: "⤓ Descargar", fr: "⤓ Télécharger", de: "⤓ Herunterladen", pt: "⤓ Baixar", zh: "⤓ 下载", ja: "⤓ ダウンロード", hi: "⤓ डाउनलोड", ar: "⤓ تنزيل" },
  "dl.soon": { en: "Coming soon", es: "Próximamente", fr: "Bientôt", de: "Bald verfügbar", pt: "Em breve", zh: "即将推出", ja: "近日公開", hi: "जल्द आ रहा है", ar: "قريبًا" },
  "dl.apkNote": { en: "Android is a direct APK — open it and allow “install from unknown sources.” Your financial data stays on your device.", es: "Android es un APK directo: ábrelo y permite «instalar de orígenes desconocidos». Tus datos financieros permanecen en tu dispositivo.", fr: "Android : APK direct — ouvrez-le et autorisez « sources inconnues ». Vos données financières restent sur votre appareil.", de: "Android ist ein direktes APK — öffnen und „Unbekannte Quellen“ erlauben. Deine Finanzdaten bleiben auf deinem Gerät.", pt: "Android é um APK direto — abra e permita “fontes desconhecidas”. Seus dados financeiros ficam no seu dispositivo.", zh: "Android 为直接 APK — 打开并允许「未知来源安装」。财务数据保存在你的设备上。", ja: "AndroidはAPK直接配布 — 開いて「提供元不明のアプリ」を許可してください。財務データは端末内に保存されます。", hi: "Android सीधा APK है — खोलें और “अज्ञात स्रोत” की अनुमति दें। आपका वित्तीय डेटा आपके डिवाइस पर रहता है।", ar: "أندرويد ملف APK مباشر — افتحه واسمح بـ«مصادر غير معروفة». تبقى بياناتك المالية على جهازك." },
  "dl.aptTitle": { en: "🐧 Install on Debian / Ubuntu via apt", es: "🐧 Instalar en Debian / Ubuntu con apt", fr: "🐧 Installer sur Debian / Ubuntu via apt", de: "🐧 Auf Debian / Ubuntu per apt installieren", pt: "🐧 Instalar no Debian / Ubuntu via apt", zh: "🐧 通过 apt 在 Debian / Ubuntu 上安装", ja: "🐧 Debian / Ubuntuにaptでインストール", hi: "🐧 Debian / Ubuntu पर apt से इंस्टॉल करें", ar: "🐧 التثبيت على Debian / Ubuntu عبر apt" },
  "dl.aptNote": { en: "Signed repository — updates arrive through", es: "Repositorio firmado — las actualizaciones llegan con", fr: "Dépôt signé — les mises à jour arrivent via", de: "Signiertes Repository — Updates kommen über", pt: "Repositório assinado — atualizações chegam via", zh: "已签名仓库 — 更新通过以下命令获取：", ja: "署名済みリポジトリ — 更新は次で届きます:", hi: "हस्ताक्षरित रिपॉज़िटरी — अपडेट आते हैं:", ar: "مستودع موقَّع — تصل التحديثات عبر" },

  /* ---- status ---- */
  "status.eyebrow": { en: "// system status", es: "// estado del sistema", fr: "// état du système", de: "// Systemstatus", pt: "// status do sistema", zh: "// 系统状态", ja: "// システム状況", hi: "// सिस्टम स्थिति", ar: "// حالة النظام" },
  "status.title": { en: "All systems operational.", es: "Todos los sistemas operativos.", fr: "Tous les systèmes opérationnels.", de: "Alle Systeme betriebsbereit.", pt: "Todos os sistemas operacionais.", zh: "所有系统运行正常。", ja: "全システム正常稼働中。", hi: "सभी सिस्टम चालू।", ar: "جميع الأنظمة تعمل." },
  "status.operational": { en: "operational", es: "operativo", fr: "opérationnel", de: "betriebsbereit", pt: "operacional", zh: "正常", ja: "正常", hi: "चालू", ar: "يعمل" },
  "status.api": { en: "API", es: "API", fr: "API", de: "API", pt: "API", zh: "API", ja: "API", hi: "API", ar: "API" },
  "status.sync": { en: "Sync engine", es: "Motor de sincronización", fr: "Moteur de synchro", de: "Sync-Engine", pt: "Motor de sincronização", zh: "同步引擎", ja: "同期エンジン", hi: "सिंक इंजन", ar: "محرك المزامنة" },
  "status.bank": { en: "Bank connections", es: "Conexiones bancarias", fr: "Connexions bancaires", de: "Bankverbindungen", pt: "Conexões bancárias", zh: "银行连接", ja: "銀行接続", hi: "बैंक कनेक्शन", ar: "اتصالات البنوك" },
  "status.web": { en: "Web & downloads", es: "Web y descargas", fr: "Web & téléchargements", de: "Web & Downloads", pt: "Web e downloads", zh: "网站与下载", ja: "Web＆ダウンロード", hi: "वेब और डाउनलोड", ar: "الويب والتنزيلات" },
  "status.notif": { en: "Notifications", es: "Notificaciones", fr: "Notifications", de: "Benachrichtigungen", pt: "Notificações", zh: "通知", ja: "通知", hi: "सूचनाएँ", ar: "الإشعارات" },

  /* ---- faq ---- */
  "faq.eyebrow": { en: "// questions", es: "// preguntas", fr: "// questions", de: "// Fragen", pt: "// perguntas", zh: "// 常见问题", ja: "// よくある質問", hi: "// सवाल", ar: "// أسئلة" },
  "faq.title": { en: "FAQ", es: "Preguntas frecuentes", fr: "FAQ", de: "FAQ", pt: "Perguntas frequentes", zh: "常见问题", ja: "FAQ", hi: "अक्सर पूछे जाने वाले प्रश्न", ar: "الأسئلة الشائعة" },
  "faq.q1": { en: "How much does BudgetSmart cost?", es: "¿Cuánto cuesta BudgetSmart?", fr: "Combien coûte BudgetSmart ?", de: "Was kostet BudgetSmart?", pt: "Quanto custa o BudgetSmart?", zh: "BudgetSmart 多少钱？", ja: "BudgetSmartの料金は？", hi: "BudgetSmart की कीमत क्या है?", ar: "كم يكلف BudgetSmart؟" },
  "faq.a1": { en: "The Base app is free forever. Individual plans are $5–$13/mo (or $44.99–$114.99/yr) and Family plans for up to 5 people are $12.99–$32.99/mo (or $119.99–$299.99/yr) — unlocking automation, reports, investing, and full tax tools.", es: "La app Base es gratis para siempre. Los planes individuales cuestan $5–$13/mes (o $44.99–$114.99/año) y los familiares para hasta 5 personas $12.99–$32.99/mes (o $119.99–$299.99/año), con automatización, informes, inversión y herramientas fiscales.", fr: "L'app de base est gratuite à vie. Les offres individuelles vont de 5 à 13 $/mois (ou 44,99–114,99 $/an) et les offres famille (5 personnes) de 12,99 à 32,99 $/mois (ou 119,99–299,99 $/an) : automatisation, rapports, investissement et outils fiscaux.", de: "Die Basis-App ist für immer kostenlos. Einzelpläne kosten $5–$13/Monat (oder $44,99–$114,99/Jahr), Familienpläne für bis zu 5 Personen $12,99–$32,99/Monat (oder $119,99–$299,99/Jahr) — mit Automatisierung, Berichten, Investieren und Steuer-Tools.", pt: "O app Base é grátis para sempre. Planos individuais custam $5–$13/mês (ou $44,99–$114,99/ano) e planos família para até 5 pessoas $12,99–$32,99/mês (ou $119,99–$299,99/ano) — com automação, relatórios, investimentos e ferramentas fiscais.", zh: "基础版永久免费。个人方案 $5–$13/月（或 $44.99–$114.99/年），家庭方案（最多 5 人）$12.99–$32.99/月（或 $119.99–$299.99/年）— 解锁自动化、报表、投资和完整税务工具。", ja: "ベースアプリは永久無料。個人プランは月$5〜$13（年$44.99〜$114.99）、最大5人のファミリープランは月$12.99〜$32.99（年$119.99〜$299.99）。自動化・レポート・投資・税務ツールが使えます。", hi: "बेस ऐप हमेशा मुफ़्त है। व्यक्तिगत प्लान $5–$13/माह (या $44.99–$114.99/वर्ष) और 5 लोगों तक के पारिवारिक प्लान $12.99–$32.99/माह (या $119.99–$299.99/वर्ष) — ऑटोमेशन, रिपोर्ट, निवेश और टैक्स टूल्स के साथ।", ar: "التطبيق الأساسي مجاني للأبد. الخطط الفردية من 5 إلى 13 دولارًا شهريًا (أو 44.99–114.99 سنويًا) وخطط العائلة حتى 5 أشخاص من 12.99 إلى 32.99 شهريًا (أو 119.99–299.99 سنويًا) — مع الأتمتة والتقارير والاستثمار وأدوات الضرائب." },
  "faq.q2": { en: "Which platforms are supported?", es: "¿Qué plataformas son compatibles?", fr: "Quelles plateformes sont prises en charge ?", de: "Welche Plattformen werden unterstützt?", pt: "Quais plataformas são compatíveis?", zh: "支持哪些平台？", ja: "対応プラットフォームは？", hi: "कौन से प्लेटफ़ॉर्म समर्थित हैं?", ar: "ما المنصات المدعومة؟" },
  "faq.a2": { en: "Windows, Linux, and Android are available now. macOS and iOS are on the way — your account and subscription sync across devices.", es: "Windows, Linux y Android ya están disponibles. macOS e iOS vienen en camino — tu cuenta y suscripción se sincronizan entre dispositivos.", fr: "Windows, Linux et Android sont disponibles. macOS et iOS arrivent — compte et abonnement se synchronisent entre appareils.", de: "Windows, Linux und Android sind verfügbar. macOS und iOS folgen — Konto und Abo synchronisieren sich über Geräte hinweg.", pt: "Windows, Linux e Android já estão disponíveis. macOS e iOS estão a caminho — sua conta e assinatura sincronizam entre dispositivos.", zh: "Windows、Linux 和 Android 现已可用。macOS 和 iOS 即将推出 — 账户和订阅跨设备同步。", ja: "Windows・Linux・Androidは利用可能。macOS・iOSは準備中 — アカウントとサブスクは端末間で同期します。", hi: "Windows, Linux और Android अभी उपलब्ध हैं। macOS और iOS जल्द — खाता और सदस्यता सभी डिवाइस पर सिंक होती है।", ar: "Windows وLinux وAndroid متاحة الآن. macOS وiOS قادمة — يتزامن حسابك واشتراكك عبر الأجهزة." },
  "faq.q3": { en: "How do family plans work?", es: "¿Cómo funcionan los planes familiares?", fr: "Comment fonctionnent les offres famille ?", de: "Wie funktionieren Familienpläne?", pt: "Como funcionam os planos família?", zh: "家庭方案如何运作？", ja: "ファミリープランの仕組みは？", hi: "पारिवारिक प्लान कैसे काम करते हैं?", ar: "كيف تعمل خطط العائلة؟" },
  "faq.a3": { en: "Add up to 5 members by email invite. As the owner you add money to a member's wallet (allowance only); they decide whether to spend or invest it, and you get a family overview.", es: "Añade hasta 5 miembros por invitación de correo. Como titular, agregas dinero a la cartera de un miembro (solo mesada); ellos deciden gastarlo o invertirlo, y tú ves el panorama familiar.", fr: "Ajoutez jusqu'à 5 membres par invitation e-mail. En tant que titulaire, vous alimentez le portefeuille d'un membre (argent de poche) ; il choisit de dépenser ou d'investir, et vous avez la vue famille.", de: "Füge bis zu 5 Mitglieder per E-Mail-Einladung hinzu. Als Inhaber zahlst du Geld in die Wallet eines Mitglieds (nur Taschengeld); es entscheidet über Ausgeben oder Investieren, du behältst den Familienüberblick.", pt: "Adicione até 5 membros por convite de e-mail. Como titular, você adiciona dinheiro à carteira de um membro (mesada); ele decide gastar ou investir, e você tem a visão da família.", zh: "通过邮件邀请最多 5 名成员。作为所有者，你可向成员钱包充值（仅限零用钱）；由他们决定消费或投资，你则掌握家庭总览。", ja: "メール招待で最大5人を追加。オーナーはメンバーのウォレットに送金（お小遣いのみ）。使うか投資するかは本人が決め、あなたは家族全体を見渡せます。", hi: "ईमेल आमंत्रण से 5 सदस्य तक जोड़ें। मालिक के रूप में आप सदस्य के वॉलेट में पैसे डालते हैं (केवल भत्ता); खर्च या निवेश वे तय करते हैं, और आपको पारिवारिक अवलोकन मिलता है।", ar: "أضف حتى 5 أعضاء عبر دعوة بالبريد. بصفتك المالك تضيف مالًا إلى محفظة العضو (مصروف فقط)؛ وهو يقرر إنفاقه أو استثماره، وتحصل أنت على نظرة عامة للعائلة." },
  "faq.q4": { en: "Is my financial data secure?", es: "¿Están seguros mis datos financieros?", fr: "Mes données financières sont-elles sécurisées ?", de: "Sind meine Finanzdaten sicher?", pt: "Meus dados financeiros estão seguros?", zh: "我的财务数据安全吗？", ja: "財務データは安全ですか？", hi: "क्या मेरा वित्तीय डेटा सुरक्षित है?", ar: "هل بياناتي المالية آمنة؟" },
  "faq.a4": { en: "BudgetSmart is local-first — your financial data stays on your device with local encryption, biometric login, and an incognito mode. Email verification secures your account and payments run through Stripe.", es: "BudgetSmart es local-first: tus datos financieros permanecen en tu dispositivo con cifrado local, acceso biométrico y modo incógnito. La verificación de correo protege tu cuenta y los pagos pasan por Stripe.", fr: "BudgetSmart est local-first : vos données restent sur votre appareil avec chiffrement local, connexion biométrique et mode incognito. La vérification e-mail sécurise votre compte et les paiements passent par Stripe.", de: "BudgetSmart ist local-first — deine Finanzdaten bleiben auf deinem Gerät, mit lokaler Verschlüsselung, biometrischem Login und Inkognito-Modus. E-Mail-Verifizierung sichert dein Konto, Zahlungen laufen über Stripe.", pt: "O BudgetSmart é local-first — seus dados financeiros ficam no seu dispositivo com criptografia local, login biométrico e modo anônimo. A verificação de e-mail protege sua conta e os pagamentos passam pela Stripe.", zh: "BudgetSmart 本地优先 — 财务数据留在你的设备上，带本地加密、生物识别登录和隐身模式。邮箱验证保护账户，支付通过 Stripe 处理。", ja: "BudgetSmartはローカルファースト — 財務データはローカル暗号化・生体認証ログイン・シークレットモードとともに端末内に保存。メール認証でアカウントを保護し、決済はStripe経由です。", hi: "BudgetSmart लोकल-फ़र्स्ट है — आपका वित्तीय डेटा लोकल एन्क्रिप्शन, बायोमेट्रिक लॉगिन और इनकॉग्निटो मोड के साथ आपके डिवाइस पर रहता है। ईमेल सत्यापन खाता सुरक्षित करता है और भुगतान Stripe से होते हैं।", ar: "BudgetSmart يعمل محليًا أولًا — تبقى بياناتك المالية على جهازك مع تشفير محلي وتسجيل دخول بالبصمة ووضع التخفي. التحقق بالبريد يؤمِّن حسابك والمدفوعات عبر Stripe." },

  /* ---- account page ---- */
  "acct.loading": { en: "Loading…", es: "Cargando…", fr: "Chargement…", de: "Laden…", pt: "Carregando…", zh: "加载中…", ja: "読み込み中…", hi: "लोड हो रहा है…", ar: "جارٍ التحميل…" },
  "acct.signin": { en: "Sign in", es: "Iniciar sesión", fr: "Se connecter", de: "Anmelden", pt: "Entrar", zh: "登录", ja: "サインイン", hi: "साइन इन", ar: "تسجيل الدخول" },
  "acct.create": { en: "Create account", es: "Crear cuenta", fr: "Créer un compte", de: "Konto erstellen", pt: "Criar conta", zh: "创建账户", ja: "アカウント作成", hi: "खाता बनाएँ", ar: "إنشاء حساب" },
  "acct.namePh": { en: "Name", es: "Nombre", fr: "Nom", de: "Name", pt: "Nome", zh: "姓名", ja: "名前", hi: "नाम", ar: "الاسم" },
  "acct.passPh": { en: "Password (min 8 chars)", es: "Contraseña (mín. 8)", fr: "Mot de passe (min. 8)", de: "Passwort (min. 8)", pt: "Senha (mín. 8)", zh: "密码（至少 8 位）", ja: "パスワード（8文字以上）", hi: "पासवर्ड (न्यूनतम 8)", ar: "كلمة المرور (8 أحرف على الأقل)" },
  "acct.or": { en: "or", es: "o", fr: "ou", de: "oder", pt: "ou", zh: "或", ja: "または", hi: "या", ar: "أو" },
  "acct.google": { en: "Continue with Google", es: "Continuar con Google", fr: "Continuer avec Google", de: "Weiter mit Google", pt: "Continuar com o Google", zh: "使用 Google 继续", ja: "Googleで続ける", hi: "Google से जारी रखें", ar: "المتابعة عبر Google" },
  "acct.signedInAs": { en: "Signed in as", es: "Sesión iniciada como", fr: "Connecté en tant que", de: "Angemeldet als", pt: "Conectado como", zh: "已登录：", ja: "サインイン中:", hi: "इस रूप में साइन इन:", ar: "مسجَّل الدخول باسم" },
  "acct.plan": { en: "Plan:", es: "Plan:", fr: "Offre :", de: "Plan:", pt: "Plano:", zh: "方案：", ja: "プラン:", hi: "प्लान:", ar: "الخطة:" },
  "acct.theme": { en: "🌓 Theme", es: "🌓 Tema", fr: "🌓 Thème", de: "🌓 Design", pt: "🌓 Tema", zh: "🌓 主题", ja: "🌓 テーマ", hi: "🌓 थीम", ar: "🌓 السمة" },
  "acct.billing": { en: "Manage billing", es: "Gestionar facturación", fr: "Gérer la facturation", de: "Abrechnung verwalten", pt: "Gerenciar cobrança", zh: "管理账单", ja: "請求を管理", hi: "बिलिंग प्रबंधित करें", ar: "إدارة الفواتير" },
  "acct.signout": { en: "Sign out", es: "Cerrar sesión", fr: "Se déconnecter", de: "Abmelden", pt: "Sair", zh: "退出登录", ja: "サインアウト", hi: "साइन आउट", ar: "تسجيل الخروج" },
  "acct.syncNote": { en: "After you subscribe, open the desktop app and reload — your plan syncs automatically.", es: "Tras suscribirte, abre la app de escritorio y recárgala: tu plan se sincroniza automáticamente.", fr: "Après votre abonnement, ouvrez l'app de bureau et rechargez — votre offre se synchronise automatiquement.", de: "Nach dem Abo die Desktop-App öffnen und neu laden — dein Plan synchronisiert sich automatisch.", pt: "Depois de assinar, abra o app de desktop e recarregue — seu plano sincroniza automaticamente.", zh: "订阅后打开桌面应用并刷新 — 方案会自动同步。", ja: "購読後、デスクトップアプリを開いて再読み込みすると、プランが自動同期されます。", hi: "सदस्यता के बाद डेस्कटॉप ऐप खोलें और रीलोड करें — प्लान अपने आप सिंक होगा।", ar: "بعد الاشتراك افتح تطبيق سطح المكتب وأعد تحميله — تتزامن خطتك تلقائيًا." },
  "acct.profile": { en: "Your profile", es: "Tu perfil", fr: "Votre profil", de: "Dein Profil", pt: "Seu perfil", zh: "个人资料", ja: "プロフィール", hi: "आपकी प्रोफ़ाइल", ar: "ملفك الشخصي" },
  "acct.birthday": { en: "Birthday", es: "Cumpleaños", fr: "Anniversaire", de: "Geburtstag", pt: "Aniversário", zh: "生日", ja: "誕生日", hi: "जन्मदिन", ar: "تاريخ الميلاد" },
  "acct.location": { en: "Location", es: "Ubicación", fr: "Localisation", de: "Ort", pt: "Localização", zh: "所在地", ja: "所在地", hi: "स्थान", ar: "الموقع" },
  "acct.saveProfile": { en: "Save profile", es: "Guardar perfil", fr: "Enregistrer le profil", de: "Profil speichern", pt: "Salvar perfil", zh: "保存资料", ja: "プロフィールを保存", hi: "प्रोफ़ाइल सहेजें", ar: "حفظ الملف الشخصي" },
  "acct.language": { en: "Language", es: "Idioma", fr: "Langue", de: "Sprache", pt: "Idioma", zh: "语言", ja: "言語", hi: "भाषा", ar: "اللغة" },
  "acct.twofa": { en: "🔒 Two-factor authentication", es: "🔒 Autenticación en dos pasos", fr: "🔒 Authentification à deux facteurs", de: "🔒 Zwei-Faktor-Authentifizierung", pt: "🔒 Autenticação em duas etapas", zh: "🔒 双重验证", ja: "🔒 二要素認証", hi: "🔒 टू-फ़ैक्टर प्रमाणीकरण", ar: "🔒 المصادقة الثنائية" },
  "acct.enable2fa": { en: "Enable 2FA", es: "Activar 2FA", fr: "Activer la 2FA", de: "2FA aktivieren", pt: "Ativar 2FA", zh: "启用双重验证", ja: "2FAを有効化", hi: "2FA चालू करें", ar: "تفعيل المصادقة الثنائية" },
  "acct.turnOff": { en: "Turn off", es: "Desactivar", fr: "Désactiver", de: "Deaktivieren", pt: "Desativar", zh: "关闭", ja: "オフにする", hi: "बंद करें", ar: "إيقاف" },
  "acct.twofaHint": { en: "Add a second step at sign-in using any authenticator app.", es: "Añade un segundo paso al iniciar sesión con cualquier app de autenticación.", fr: "Ajoutez une seconde étape à la connexion avec n'importe quelle app d'authentification.", de: "Füge der Anmeldung einen zweiten Schritt mit einer Authenticator-App hinzu.", pt: "Adicione uma segunda etapa no login com qualquer app autenticador.", zh: "使用任意验证器应用为登录添加第二步验证。", ja: "任意の認証アプリでサインインに第二の認証を追加。", hi: "किसी भी ऑथेंटिकेटर ऐप से साइन-इन में दूसरा चरण जोड़ें।", ar: "أضف خطوة ثانية عند تسجيل الدخول عبر أي تطبيق مصادقة." },
  "acct.verify": { en: "Verify", es: "Verificar", fr: "Vérifier", de: "Bestätigen", pt: "Verificar", zh: "验证", ja: "確認", hi: "सत्यापित करें", ar: "تحقق" },
  "acct.back": { en: "Back", es: "Volver", fr: "Retour", de: "Zurück", pt: "Voltar", zh: "返回", ja: "戻る", hi: "वापस", ar: "رجوع" },
  "acct.cancel": { en: "Cancel", es: "Cancelar", fr: "Annuler", de: "Abbrechen", pt: "Cancelar", zh: "取消", ja: "キャンセル", hi: "रद्द करें", ar: "إلغاء" },
  "acct.codePrompt": { en: "Enter the 6-digit code from your authenticator app.", es: "Introduce el código de 6 dígitos de tu app de autenticación.", fr: "Saisissez le code à 6 chiffres de votre app d'authentification.", de: "Gib den 6-stelligen Code aus deiner Authenticator-App ein.", pt: "Digite o código de 6 dígitos do seu app autenticador.", zh: "输入验证器应用中的 6 位验证码。", ja: "認証アプリの6桁コードを入力してください。", hi: "अपने ऑथेंटिकेटर ऐप का 6-अंकीय कोड दर्ज करें।", ar: "أدخل الرمز المكوَّن من 6 أرقام من تطبيق المصادقة." },
  "acct.family": { en: "👨‍👩‍👧‍👦 Family", es: "👨‍👩‍👧‍👦 Familia", fr: "👨‍👩‍👧‍👦 Famille", de: "👨‍👩‍👧‍👦 Familie", pt: "👨‍👩‍👧‍👦 Família", zh: "👨‍👩‍👧‍👦 家庭", ja: "👨‍👩‍👧‍👦 ファミリー", hi: "👨‍👩‍👧‍👦 परिवार", ar: "👨‍👩‍👧‍👦 العائلة" },
  "acct.invite": { en: "Invite", es: "Invitar", fr: "Inviter", de: "Einladen", pt: "Convidar", zh: "邀请", ja: "招待", hi: "आमंत्रित करें", ar: "دعوة" },
  "acct.leave": { en: "Leave family", es: "Salir de la familia", fr: "Quitter la famille", de: "Familie verlassen", pt: "Sair da família", zh: "退出家庭", ja: "ファミリーを退出", hi: "परिवार छोड़ें", ar: "مغادرة العائلة" },
  "acct.remove": { en: "Remove", es: "Quitar", fr: "Retirer", de: "Entfernen", pt: "Remover", zh: "移除", ja: "削除", hi: "हटाएँ", ar: "إزالة" },
  "acct.revoke": { en: "Revoke", es: "Revocar", fr: "Révoquer", de: "Widerrufen", pt: "Revogar", zh: "撤销", ja: "取り消す", hi: "रद्द करें", ar: "سحب" },
  "acct.owner": { en: "Owner", es: "Titular", fr: "Titulaire", de: "Inhaber", pt: "Titular", zh: "所有者", ja: "オーナー", hi: "मालिक", ar: "المالك" },
  "acct.member": { en: "Member", es: "Miembro", fr: "Membre", de: "Mitglied", pt: "Membro", zh: "成员", ja: "メンバー", hi: "सदस्य", ar: "عضو" },
  "acct.invited": { en: "Invited", es: "Invitado", fr: "Invité", de: "Eingeladen", pt: "Convidado", zh: "已邀请", ja: "招待済み", hi: "आमंत्रित", ar: "مدعو" },
  "acct.you": { en: " (you)", es: " (tú)", fr: " (vous)", de: " (du)", pt: " (você)", zh: "（你）", ja: "（あなた）", hi: " (आप)", ar: " (أنت)" },
  "acct.notifs": { en: "🔔 Notifications", es: "🔔 Notificaciones", fr: "🔔 Notifications", de: "🔔 Benachrichtigungen", pt: "🔔 Notificações", zh: "🔔 通知", ja: "🔔 通知", hi: "🔔 सूचनाएँ", ar: "🔔 الإشعارات" },
  "acct.markRead": { en: "Mark all read", es: "Marcar todo leído", fr: "Tout marquer lu", de: "Alle als gelesen", pt: "Marcar tudo como lido", zh: "全部标为已读", ja: "すべて既読に", hi: "सभी पढ़ा चिह्नित करें", ar: "تحديد الكل كمقروء" },
  "acct.noNotifs": { en: "No notifications yet.", es: "Aún no hay notificaciones.", fr: "Pas encore de notifications.", de: "Noch keine Benachrichtigungen.", pt: "Nenhuma notificação ainda.", zh: "暂无通知。", ja: "通知はまだありません。", hi: "अभी कोई सूचना नहीं।", ar: "لا إشعارات بعد." },
  "acct.monthly": { en: "Monthly", es: "Mensual", fr: "Mensuel", de: "Monatlich", pt: "Mensal", zh: "按月", ja: "月払い", hi: "मासिक", ar: "شهري" },
  "acct.yearly": { en: "Yearly", es: "Anual", fr: "Annuel", de: "Jährlich", pt: "Anual", zh: "按年", ja: "年払い", hi: "वार्षिक", ar: "سنوي" },
  "acct.save25": { en: "save ~25%", es: "ahorra ~25%", fr: "-25 % env.", de: "~25% sparen", pt: "economize ~25%", zh: "省约 25%", ja: "約25%お得", hi: "~25% बचाएँ", ar: "وفّر ~25%" },
  "acct.subscribe": { en: "Subscribe", es: "Suscribirse", fr: "S'abonner", de: "Abonnieren", pt: "Assinar", zh: "订阅", ja: "購読する", hi: "सदस्यता लें", ar: "اشترك" },
  "acct.current": { en: "Current plan", es: "Plan actual", fr: "Offre actuelle", de: "Aktueller Plan", pt: "Plano atual", zh: "当前方案", ja: "現在のプラン", hi: "वर्तमान प्लान", ar: "الخطة الحالية" },
  "acct.freeInc": { en: "Free — included", es: "Gratis — incluido", fr: "Gratuit — inclus", de: "Kostenlos — enthalten", pt: "Grátis — incluído", zh: "免费 — 已包含", ja: "無料 — 込み", hi: "मुफ़्त — शामिल", ar: "مجاني — مشمول" },
};

const STORE_KEY = "bs_locale";
function initLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && CODES.includes(saved)) return saved as Locale;
  } catch { /* ignore */ }
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return (CODES.includes(nav) ? nav : "en") as Locale;
}

let current: Locale = initLocale();
const subs = new Set<() => void>();
function applyDocument() {
  document.documentElement.lang = current;
  document.documentElement.dir = current === "ar" ? "rtl" : "ltr";
}
applyDocument();

export function getLocale(): Locale { return current; }
export function setLocale(l: Locale) {
  if (l === current || !CODES.includes(l)) return;
  current = l;
  try { localStorage.setItem(STORE_KEY, l); } catch { /* ignore */ }
  applyDocument();
  subs.forEach((fn) => fn());
}

export function translate(key: string, fallback?: string): string {
  const entry = M[key];
  return entry?.[current] ?? entry?.en ?? fallback ?? key;
}

export function useI18n() {
  const locale = useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => current,
  );
  return { locale, setLocale, t: translate };
}

export function LanguagePicker({ onPick }: { onPick?: (l: Locale) => void }) {
  const { locale, setLocale: set } = useI18n();
  return (
    <select
      className="lang-picker"
      value={locale}
      aria-label="Language"
      onChange={(e) => { const l = e.target.value as Locale; set(l); onPick?.(l); }}
    >
      {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
