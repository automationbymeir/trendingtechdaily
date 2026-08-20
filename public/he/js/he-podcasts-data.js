/**
 * he-podcasts-data.js
 * ---------------------------------------------------------------------------
 * קטלוג הפודקאסטים המובילים בהייטק, בינה מלאכותית, פיתוח ויזמות בישראל
 * עבור TrendingTech Daily הגרסה העברית.
 */

const TECH_PODCASTS_HE = [
  {
    id: 'hightech-bafkakim',
    title: 'הייטק בפקקים',
    host: 'אורי טוביאס וצוות הייטק בפקקים',
    category: 'business',
    categoryLabel: 'הייטק ויזמות',
    badgeClass: 'badge-biz',
    desc: 'פודקאסט ההייטק המרכזי של ישראל: שיחות על סטארטאפים, גיוסי הון, בינה מלאכותית, שוק העבודה וניהול חברות טכנולוגיה.',
    coverUrl: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/0zQn0c0lO1EwA9qV5Q4y0K',
    youtubeUrl: 'https://www.youtube.com/@hightechbafkakim'
  },
  {
    id: 'cultureless-devs',
    title: 'מפתחים חסרי תרבות',
    host: 'אלכסיי גובמן, דניאל רחימי ועמית ברקוביץ\'',
    category: 'developer',
    categoryLabel: 'הנדסת תוכנה וקוד',
    badgeClass: 'badge-dev',
    desc: 'פודקאסט פיתוח תוכנה ישיר, עמוק ומלא בהומור על ארכיטקטורת מערכות, פייתון, ג\'אווהסקריפט, באגים מטורפים וחיי מתכנתים.',
    coverUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/1k2j3h4g5f6d7s8a9q0w1e',
    youtubeUrl: 'https://www.youtube.com/@CulturelessDevelopers'
  },
  {
    id: 'osim-tochna',
    title: 'עושים תוכנה (רשת פודקאסטים)',
    host: 'רן לוי ורשת פודבריין',
    category: 'developer',
    categoryLabel: 'ארכיטקטורת תוכנה',
    badgeClass: 'badge-dev',
    desc: 'הפודקאסט המוביל בישראל על ארכיטקטורת תוכנה, בסיסי נתונים, שפות תכנות, פיתוח תשתיות ענן וראיונות עם מתכנתים בכירים.',
    coverUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/3u4v5w6x7y8z9a0b1c2d3e',
    youtubeUrl: 'https://www.youtube.com/@osimhistoria'
  },
  {
    id: 'osim-technologia',
    title: 'עושים טכנולוגיה',
    host: 'ד"ר יובל דרור',
    category: 'ai-tech',
    categoryLabel: 'עתידנות ו-AI',
    badgeClass: 'badge-ai',
    desc: 'ניתוח מעמיק ומרתק על ההשפעה של בינה מלאכותית, ענקיות הטק, ביג דאטה, רשתות חברתיות והעתיד הדיגיטלי על האנושות.',
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/5p6q7r8s9t0u1v2w3x4y5z',
    youtubeUrl: 'https://www.youtube.com/@osimhistoria'
  },
  {
    id: 'reversim',
    title: 'רברסים (Reversim)',
    host: 'רן טבנקין ואורי להב',
    category: 'developer',
    categoryLabel: 'פיתוח והנדסה',
    badgeClass: 'badge-dev',
    desc: 'פודקאסט הפיתוח הוותיק והמוערך של קהילת המפתחים בישראל. שיחות מקצועיות לעומק עם טובי המהנדסים בארץ.',
    coverUrl: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/6v8yX7M012y4uI5eH9P3vP',
    youtubeUrl: 'https://www.youtube.com/@reversim'
  },
  {
    id: 'geektime-podcast',
    title: 'עוד פודקאסט לסטארטאפים (Geektime)',
    host: 'תום בר-אב, גיא קצוביץ\' ויניב פלדמן',
    category: 'business',
    categoryLabel: 'סטארטאפים והון סיכון',
    badgeClass: 'badge-biz',
    desc: 'הפודקאסט הרשמי של גיקטיים: שיחות עם יזמי יוניקורן, משקיעי הון סיכון מובילים וסיפורי הקמה מרתקים.',
    coverUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/7BqLzGfXz3r2v1u0p9o8n7',
    youtubeUrl: 'https://www.youtube.com/@geektimeisrael'
  },
  {
    id: 'shuk-hightech',
    title: 'שוק הייטק',
    host: 'יזהר שי וצוות שוק הייטק',
    category: 'business',
    categoryLabel: 'כלכלה והייטק',
    badgeClass: 'badge-biz',
    desc: 'ניתוח המגמות הכלכליות, הנפקות טכנולוגיה בוול סטריט, מיזוגים ורכישות ואקוסיסטם החדשנות הישראלי.',
    coverUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/4qIS0g0dUc4U6w5y4t3r2e',
    youtubeUrl: 'https://www.youtube.com/@shukhightech'
  },
  {
    id: 'ai-eye-level',
    title: 'בינה מלאכותית בגובה העיניים',
    host: 'איציק יונה ומומחי AI',
    category: 'ai-tech',
    categoryLabel: 'בינה מלאכותית יישומית',
    badgeClass: 'badge-ai',
    desc: 'כיצד מודלי שפה (LLMs), סוכנים אוטונומיים ומחוללי תמונות ווידאו משנים את עולם העבודה, השיווק והפיתוח בישראל.',
    coverUrl: 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/0w9e8r7t6y5u4i3o2p1a0s',
    youtubeUrl: 'https://www.youtube.com/@aieyelevel'
  },
  {
    id: 'cyber-il',
    title: 'פודקאסט הסייבר הישראלי',
    host: 'קהילת חוקרי הסייבר בישראל',
    category: 'security',
    categoryLabel: 'אבטחת מידע וסייבר',
    badgeClass: 'badge-security',
    desc: 'ראיונות עם חוקרי חולשות אבטחה, מובילי Red Team, לוחמי סייבר ומנהלי אבטחת מידע (CISO) בחברות מובילות.',
    coverUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5',
    youtubeUrl: 'https://www.youtube.com/@cyberisrael'
  },
  {
    id: 'barvaz-gozal',
    title: 'ברווזגוזל — פודקאסט DevOps וענן',
    host: 'איתי שקולניק ומומחי ענן',
    category: 'developer',
    categoryLabel: 'DevOps ותשתיות',
    badgeClass: 'badge-dev',
    desc: 'שיחות על קוברנטיס, Terraform, CI/CD, תשתיות ענן מודרניות (AWS, GCP, Azure) וניהול ארכיטקטורות ענק.',
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/1k2j3h4g5f6d7s8a9q0w1e',
    youtubeUrl: 'https://www.youtube.com/@barvazgozal'
  },
  {
    id: 'product-pod-il',
    title: 'פודקאסט המוצר (Product Pod)',
    host: 'מנהלי מוצר בכירים בישראל',
    category: 'design',
    categoryLabel: 'ניהול מוצר ו-UX',
    badgeClass: 'badge-dev',
    desc: 'הסודות של מנהלי מוצר (Product Managers) בישראל: בניית Design Systems, מתודולוגיות Growth ומציאת Product-Market Fit.',
    coverUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/3u4v5w6x7y8z9a0b1c2d3e',
    youtubeUrl: 'https://www.youtube.com/@productpod'
  },
  {
    id: 'startup-for-shaa',
    title: 'סטארטאפ פור שעה',
    host: 'יזמים ומשקיעים',
    category: 'business',
    categoryLabel: 'יזמות וצמיחה',
    badgeClass: 'badge-biz',
    desc: 'שיחות בגובה העיניים עם יזמים ישראלים על האתגרים, המשברים וההצלחות בדרך להקמת חברה טכנולוגית.',
    coverUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/5p6q7r8s9t0u1v2w3x4y5z',
    youtubeUrl: 'https://www.youtube.com/@startupforshaa'
  },
  {
    id: 'ml-datascience-il',
    title: 'Machine Learning & Data Science Israel',
    host: 'קהילת MDLI',
    category: 'ai-tech',
    categoryLabel: 'מחקר ואלגוריתמיקה',
    badgeClass: 'badge-ai',
    desc: 'פודקאסט הקהילה המדעית של חוקרי למידת מכונה, עיבוד שפה טבעית (NLP), ראייה ממוחשבת ו-Data Science.',
    coverUrl: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/6v8yX7M012y4uI5eH9P3vP',
    youtubeUrl: 'https://www.youtube.com/@mdlisrael'
  },
  {
    id: '30-minutes-or-less',
    title: '30 דקות או פחות — יזמות והייטק',
    host: 'נבות וולק ואבישי אברהמי',
    category: 'business',
    categoryLabel: 'ראיונות יזמים',
    badgeClass: 'badge-biz',
    desc: 'ראיונות קצרים, חדים וממוקדים בני חצי שעה עם מנכ"לים, יזמים ומובילי חדשנות בטכנולוגיה הישראלית.',
    coverUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/7BqLzGfXz3r2v1u0p9o8n7',
    youtubeUrl: 'https://www.youtube.com/@30minorless'
  },
  {
    id: 'ciso-israel',
    title: 'הפודקאסט של CISO ישראל',
    host: 'פורום מנהלי אבטחת מידע',
    category: 'security',
    categoryLabel: 'ניהול אבטחת מידע',
    badgeClass: 'badge-security',
    desc: 'התמודדות עם מתקפות כופר, רגולציית סייבר עולמית, אבטחת בינה מלאכותית ארגונית והגנה על שרשראות אספקה.',
    coverUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/4qIS0g0dUc4U6w5y4t3r2e',
    youtubeUrl: 'https://www.youtube.com/@cisoisrael'
  },
  {
    id: 'open-source-il',
    title: 'קוד פתוח ישראל',
    host: 'מפתחי קהילת Open Source',
    category: 'developer',
    categoryLabel: 'קוד פתוח וספריות',
    badgeClass: 'badge-dev',
    desc: 'מאחורי הקלעים של ספריות הקוד הפתוח המצליחות שנכתבו בישראל ומשמשות מיליוני מפתחים בעולם.',
    coverUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/0w9e8r7t6y5u4i3o2p1a0s',
    youtubeUrl: 'https://www.youtube.com/@opensourceil'
  },
  {
    id: 'software-architecture-il',
    title: 'ארכיטקטורת תוכנה ומערכות',
    host: 'ארכיטקטי תוכנה מובילים',
    category: 'developer',
    categoryLabel: 'מערכות מבוזרות',
    badgeClass: 'badge-dev',
    desc: 'מיקרו-שירותים (Microservices), מודלים אסינכרוניים, Event-Driven Architecture ועמידות במערכות ענק בזמן אמת.',
    coverUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/1k2j3h4g5f6d7s8a9q0w1e',
    youtubeUrl: 'https://www.youtube.com/@softwarearchitectureil'
  },
  {
    id: 'cloud-conversations-il',
    title: 'שיחות ענן ישראל',
    host: 'מהנדסי ענן ופתרונות',
    category: 'developer',
    categoryLabel: 'ארכיטקטורת ענן',
    badgeClass: 'badge-dev',
    desc: 'התמודדות עם עלויות ענן (FinOps), הגירה לענן מודרני, שרתי Serverless ופתרונות Multi-Cloud.',
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/3u4v5w6x7y8z9a0b1c2d3e',
    youtubeUrl: 'https://www.youtube.com/@cloudconversations'
  },
  {
    id: 'half-hour-inspiration',
    title: 'חצי שעה של השראה עם ערן גפן',
    host: 'ערן גפן',
    category: 'business',
    categoryLabel: 'חדשנות ומנהיגות',
    badgeClass: 'badge-biz',
    desc: 'שיחות עומק עם מנכ"לים, יזמים ואנשי חזון על יצירתיות, קבלת החלטות תחת אי-ודאות וצמיחה עסקית.',
    coverUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/5p6q7r8s9t0u1v2w3x4y5z',
    youtubeUrl: 'https://www.youtube.com/@erangeffen'
  },
  {
    id: 'design-systems-il',
    title: 'דיזיין סיסטמס ופרודקט ישראל',
    host: 'מובילי UX ו-Design',
    category: 'design',
    categoryLabel: 'מערכות עיצוב ו-UI',
    badgeClass: 'badge-dev',
    desc: 'כיצד צוותי עיצוב ופיתוח בונים יחד מערכות עיצוב (Design Systems) סקיילביליות, רכיבי Figma וטוקנים.',
    coverUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/6v8yX7M012y4uI5eH9P3vP',
    youtubeUrl: 'https://www.youtube.com/@designsystemsil'
  },
  {
    id: 'fintech-il',
    title: 'פינטק ובלוקצ\'יין ישראל',
    host: 'מובילי תעשיית הפינטק',
    category: 'business',
    categoryLabel: 'פינטק וכלכלה דיגיטלית',
    badgeClass: 'badge-biz',
    desc: 'עתיד הכסף: בנקאות פתוחה, תשלומים דיגיטליים, ארנקים חכמים וטכנולוגיות פיננסיות מהמתקדמות בעולם.',
    coverUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/7BqLzGfXz3r2v1u0p9o8n7',
    youtubeUrl: 'https://www.youtube.com/@fintechisrael'
  },
  {
    id: 'frontier-tech-il',
    title: 'חזית הטכנולוגיה והבינה המלאכותית',
    host: 'כתבי טכנולוגיה ומהנדסים',
    category: 'ai-tech',
    categoryLabel: 'שבבים ו-AI מתקדם',
    badgeClass: 'badge-ai',
    desc: 'מפגש בין מאיצי חומרה, מעבדי קוואנטום, מודלי היסק אוטונומיים ופיתוחים ישראליים פורצי דרך.',
    coverUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/4qIS0g0dUc4U6w5y4t3r2e',
    youtubeUrl: 'https://www.youtube.com/@frontiertechil'
  },
  {
    id: 'hightech-desk',
    title: 'הדסק של ההייטק',
    host: 'עיתונאי הייטק מובילים',
    category: 'business',
    categoryLabel: 'חדשות ופרשנות טק',
    badgeClass: 'badge-biz',
    desc: 'מבזקים שבועיים על גיוסי הון בולטים, מינויים בכירים, רכישות וניתוח מעמיק של התעשייה בישראל.',
    coverUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/0w9e8r7t6y5u4i3o2p1a0s',
    youtubeUrl: 'https://www.youtube.com/@hightechdesk'
  },
  {
    id: 'programmers-talking',
    title: 'מתכנתים מדברים',
    host: 'מפתחים מנוסים מקהילת הקוד',
    category: 'developer',
    categoryLabel: 'שפות תכנות ופרקטיקה',
    badgeClass: 'badge-dev',
    desc: 'דיונים טכניים על שפות תכנות (Rust, TypeScript, Go), כלי AI לכתיבת קוד (Cursor, Copilot) וניהול פרויקטים.',
    coverUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/1k2j3h4g5f6d7s8a9q0w1e',
    youtubeUrl: 'https://www.youtube.com/@programmerstalking'
  },
  {
    id: 'pitching-podcast',
    title: 'פיצ\'ינג — פודקאסט היזמות',
    host: 'יזמים ומשקיעי אנג\'ל',
    category: 'business',
    categoryLabel: 'גיוס הון והצגת רעיונות',
    badgeClass: 'badge-biz',
    desc: 'כיצד לבנות Pitch Deck מנצח, כיצד לגייס Seed ראשון ואיך לספר את הסיפור של החברה למשקיעים גלובליים.',
    coverUrl: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/3u4v5w6x7y8z9a0b1c2d3e',
    youtubeUrl: 'https://www.youtube.com/@pitchingil'
  },
  {
    id: 'israeli-tech-innovation',
    title: 'חדשנות טכנולוגית ישראלית',
    host: 'רשות החדשנות ומנהיגי תעשייה',
    category: 'ai-tech',
    categoryLabel: 'מחקר ופיתוח לאומי',
    badgeClass: 'badge-ai',
    desc: 'המיזמים הטכנולוגיים המתקדמים ביותר: אגריטק, פודטק, מחשוב קוונטי, קלינטק וביוטכנולוגיה כחול-לבן.',
    coverUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=80',
    spotifyUrl: 'https://open.spotify.com/show/5p6q7r8s9t0u1v2w3x4y5z',
    youtubeUrl: 'https://www.youtube.com/@innovationil'
  }
];

if (typeof window !== 'undefined') {
  window.TECH_PODCASTS_HE = TECH_PODCASTS_HE;
}
