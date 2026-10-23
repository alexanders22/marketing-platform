// Plain-words text of the Dashboard, the "?" explanations next to numbers
// and the profile checklist, in English, Georgian and Russian. Metric names
// (Views, Leads …) stay in English everywhere; what they mean is explained
// in the chosen language, for someone who has never run an ad.

import type { AppLang } from './app-lang'

export type MetricKey = 'views' | 'clicks' | 'visits' | 'leads' | 'sales' | 'spend'
export type GoalState = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NO_DATA'
type StepText = { label: string; hint: string; cta: string }

export type DashCopy = {
  sub: string
  days: (n: number) => string
  details: string
  whatIs: string
  compare: string
  status: { good: string; steady: string; attention: string; setup: string }
  setupText: string
  connect: string
  // The banner's sentence, about the main number of the period.
  noun: { leads: string; visits: string; views: string }
  more: (what: string, n: string, pct: number, days: number) => string
  less: (what: string, n: string, pct: number, days: number) => string
  same: (what: string, n: string, days: number) => string
  first: (what: string, n: string, days: number) => string
  goalsBehind: (k: number) => string
  metric: Record<MetricKey, { line: string; tip: string }>
  salesLine: (money: string) => string
  spendLine: (cpl: string) => string
  missing: string
  connectMeta: string
  connectAds: string
  installTag: string
  goals: string
  goalsTip: string
  onTrack: (a: number, b: number) => string
  noGoals: string
  setGoal: string
  allGoals: string
  goalStatus: Record<GoalState, string>
  next: string
  alerts: (n: number) => string
  fromReview: string
  nothingNext: string
  openReview: string
  aiStrategist: string
  want: string
  placeholder: string
  makePlan: string
  ideas: string[]
  pilot: {
    start: { title: string; sub: string; cta: string }
    continue: { title: string; sub: (pct: number) => string; cta: string }
    done: { title: string; sub: string; cta: string }
  }
  readiness: {
    title: string
    stages: [string, string, string]
    stepsDone: (a: number, b: number) => string
    groups: Record<'Brand' | 'Channels' | 'Website' | 'Growth', string>
    doNext: string
    allSteps: (n: number) => string
    moreKnows: string
    done: string
    todo: string
    steps: Record<string, StepText>
  }
  analytics: {
    costPerLead: string
    costPerCustomer: string
    roas: string
  }
}

const en: DashCopy = {
  sub: 'How your business is doing',
  days: (n) => `${n} days`,
  details: 'Detailed analytics',
  whatIs: 'What is this?',
  compare: 'Compared with the previous period',
  status: { good: 'Things are going well', steady: 'Steady', attention: 'Needs attention', setup: 'Let’s start measuring' },
  setupText: 'Connect Facebook and Instagram and install the Loudpilot Tag on your website — then you will see here how your business is doing.',
  connect: 'Connect',
  noun: { leads: 'Leads', visits: 'Website visits', views: 'Views' },
  more: (w, n, p, d) => `${w}: ${n} — ${p}% more than the ${d} days before.`,
  less: (w, n, p, d) => `${w}: ${n} — ${p}% less than the ${d} days before.`,
  same: (w, n, d) => `${w}: ${n} — about the same as the ${d} days before.`,
  first: (w, n, d) => `${w}: ${n} in the last ${d} days.`,
  goalsBehind: (k) => `Goals behind: ${k}.`,
  metric: {
    views: { line: 'times people saw your ads and posts', tip: 'How many times your ads and posts appeared on people’s screens. One person can see them a few times.' },
    clicks: { line: 'clicks on your ads', tip: 'How many times people tapped your ad to learn more: went to the website, opened a form or a chat.' },
    visits: { line: 'visits to your website', tip: 'How many times people opened your website. Counted by the Loudpilot Tag, or by Google Analytics.' },
    leads: { line: 'people left contacts or wrote to you', tip: 'A lead is a person who may buy: they filled in a form, called or wrote to you.' },
    sales: { line: 'purchases on your website', tip: 'Purchases the Loudpilot Tag saw on your website, and the money they brought.' },
    spend: { line: 'spent on ads', tip: 'Money spent on ads in this period. “One lead cost” is the ad money divided by the leads — the lower, the better.' },
  },
  salesLine: (m) => `purchases · ${m}`,
  spendLine: (c) => `one lead cost ${c}`,
  missing: 'Not measured yet',
  connectMeta: 'Connect Facebook & Instagram',
  connectAds: 'Connect Meta Ads',
  installTag: 'Install the Loudpilot Tag',
  goals: 'Goals',
  goalsTip: 'Targets you set, like “a lead for less than ₾20”. Loudpilot checks them every hour and tells you when one slips.',
  onTrack: (a, b) => `${a} of ${b} on track`,
  noGoals: 'No goals yet. Set one — Loudpilot checks it every hour and tells you when it slips.',
  setGoal: 'Set a goal',
  allGoals: 'All goals',
  goalStatus: { ON_TRACK: 'On track', AT_RISK: 'At risk', OFF_TRACK: 'Behind', NO_DATA: 'Waiting for data' },
  next: 'What to do next',
  alerts: (n) => `Alerts that need you: ${n}`,
  fromReview: 'From the weekly review',
  nothingNext: 'Nothing urgent. Loudpilot reviews your week every Monday and suggests what to do.',
  openReview: 'Open the weekly review',
  aiStrategist: 'AI strategist',
  want: 'What do you want to achieve?',
  placeholder: 'e.g. 50 enquiries for the new building this month',
  makePlan: 'Make me a plan',
  ideas: ['50 enquiries for the new building this month', 'Fill the weekend workshop', 'More orders for the holiday menu'],
  pilot: {
    start: { title: 'Not sure where to start? Let Pilot interview you', sub: '3 minutes · ends with goals and a ready plan', cta: 'Start' },
    continue: { title: 'Finish your strategy interview', sub: (p) => `${p}% done · goals and plan next`, cta: 'Continue' },
    done: { title: 'Numbers changed? Update them with Pilot', sub: 'Your plans stay within what a customer may cost', cta: 'Update' },
  },
  readiness: {
    title: 'Profile readiness',
    stages: ['Getting started', 'Taking shape', 'Almost ready'],
    stepsDone: (a, b) => `${a} of ${b} steps done`,
    groups: { Brand: 'Brand', Channels: 'Channels', Website: 'Website', Growth: 'Growth' },
    doNext: 'Do next',
    allSteps: (n) => `All ${n} steps`,
    moreKnows: 'The more Loudpilot knows, the better its posts, ads and plans fit your business.',
    done: '(done)',
    todo: '(to do)',
    steps: {},
  },
  analytics: {
    costPerLead: 'Ad money divided by the number of leads. The lower, the better.',
    costPerCustomer: 'Ad money divided by the number of purchases.',
    roas: 'How much came back for every 1 spent on ads. 2× means ₾2 of sales for every ₾1 of ads.',
  },
}

const ka: DashCopy = {
  sub: 'როგორ მიდის თქვენი ბიზნესი',
  days: (n) => `${n} დღე`,
  details: 'დეტალური ანალიტიკა',
  whatIs: 'რა არის ეს?',
  compare: 'წინა პერიოდთან შედარებით',
  status: { good: 'საქმე კარგად მიდის', steady: 'სტაბილურად', attention: 'საჭიროებს ყურადღებას', setup: 'დავიწყოთ გაზომვა' },
  setupText: 'დააკავშირეთ Facebook და Instagram და დააყენეთ Loudpilot Tag თქვენს საიტზე — შემდეგ აქ დაინახავთ, როგორ მიდის ბიზნესი.',
  connect: 'დაკავშირება',
  noun: { leads: 'ლიდები', visits: 'საიტის ვიზიტები', views: 'ნახვები' },
  more: (w, n, p, d) => `${w}: ${n} — ${p}%-ით მეტი, ვიდრე წინა ${d} დღეში.`,
  less: (w, n, p, d) => `${w}: ${n} — ${p}%-ით ნაკლები, ვიდრე წინა ${d} დღეში.`,
  same: (w, n, d) => `${w}: ${n} — დაახლოებით იგივე, რაც წინა ${d} დღეში.`,
  first: (w, n, d) => `${w}: ${n} ბოლო ${d} დღეში.`,
  goalsBehind: (k) => `ჩამორჩენილი მიზნები: ${k}.`,
  metric: {
    views: { line: 'ჯერ ნახეს თქვენი რეკლამა და პოსტები', tip: 'რამდენჯერ გამოჩნდა თქვენი რეკლამა და პოსტები ადამიანების ეკრანზე. ერთმა ადამიანმა შეიძლება რამდენჯერმე ნახოს.' },
    clicks: { line: 'დაწკაპუნება რეკლამაზე', tip: 'რამდენჯერ დააჭირეს ადამიანებმა თქვენს რეკლამას, რომ მეტი გაეგოთ: გადავიდნენ საიტზე, გახსნეს ფორმა ან ჩატი.' },
    visits: { line: 'ვიზიტი თქვენს საიტზე', tip: 'რამდენჯერ გახსნეს ადამიანებმა თქვენი საიტი. ითვლის Loudpilot Tag ან Google Analytics.' },
    leads: { line: 'ადამიანმა დაგიტოვათ კონტაქტი ან მოგწერათ', tip: 'ლიდი არის ადამიანი, რომელმაც შეიძლება იყიდოს: შეავსო ფორმა, დაგირეკათ ან მოგწერათ.' },
    sales: { line: 'შესყიდვა თქვენს საიტზე', tip: 'შესყიდვები, რომლებიც Loudpilot Tag-მა დაინახა თქვენს საიტზე, და მათგან მიღებული თანხა.' },
    spend: { line: 'დაიხარჯა რეკლამაზე', tip: 'რეკლამაზე დახარჯული თანხა ამ პერიოდში. „ერთი ლიდი დაჯდა“ — რეკლამის თანხა გაყოფილი ლიდების რაოდენობაზე: რაც ნაკლებია, მით უკეთესი.' },
  },
  salesLine: (m) => `შესყიდვა · ${m}`,
  spendLine: (c) => `ერთი ლიდი დაჯდა ${c}`,
  missing: 'ჯერ არ იზომება',
  connectMeta: 'დააკავშირეთ Facebook და Instagram',
  connectAds: 'დააკავშირეთ Meta Ads',
  installTag: 'დააყენეთ Loudpilot Tag',
  goals: 'მიზნები',
  goalsTip: 'თქვენ მიერ დასახული მიზნები, მაგ. „ლიდი ₾20-ზე იაფად“. Loudpilot მათ ყოველ საათში ამოწმებს და გეტყვით, თუ რომელიმე ჩამორჩება.',
  onTrack: (a, b) => `${b}-დან ${a} გეგმის მიხედვით მიდის`,
  noGoals: 'მიზნები ჯერ არ გაქვთ. დაამატეთ — Loudpilot ყოველ საათში ამოწმებს და გეტყვით, თუ ჩამორჩება.',
  setGoal: 'მიზნის დამატება',
  allGoals: 'ყველა მიზანი',
  goalStatus: { ON_TRACK: 'გეგმის მიხედვით', AT_RISK: 'რისკის ქვეშ', OFF_TRACK: 'ჩამორჩება', NO_DATA: 'ველოდებით მონაცემებს' },
  next: 'რა გავაკეთოთ შემდეგ',
  alerts: (n) => `შეტყობინებები, რომლებიც ყურადღებას საჭიროებს: ${n}`,
  fromReview: 'კვირის მიმოხილვიდან',
  nothingNext: 'სასწრაფო არაფერია. Loudpilot ყოველ ორშაბათს მიმოიხილავს თქვენს კვირას და გირჩევთ, რა გააკეთოთ.',
  openReview: 'კვირის მიმოხილვის გახსნა',
  aiStrategist: 'AI სტრატეგი',
  want: 'რისი მიღწევა გსურთ?',
  placeholder: 'მაგ. ამ თვეში 50 მოთხოვნა ახალ კორპუსზე',
  makePlan: 'შემიდგინე გეგმა',
  ideas: ['ამ თვეში 50 მოთხოვნა ახალ კორპუსზე', 'შაბათ-კვირის ვორქშოფის შევსება', 'მეტი შეკვეთა სადღესასწაულო მენიუზე'],
  pilot: {
    start: { title: 'არ იცით, საიდან დაიწყოთ? Pilot-ი გაგესაუბრებათ', sub: '3 წუთი · ბოლოს მიიღებთ მიზნებს და მზა გეგმას', cta: 'დაწყება' },
    continue: { title: 'დაასრულეთ სტრატეგიული ინტერვიუ', sub: (p) => `${p}% შესრულებულია · შემდეგ მიზნები და გეგმა`, cta: 'გაგრძელება' },
    done: { title: 'რიცხვები შეიცვალა? განაახლეთ Pilot-თან', sub: 'გეგმები დარჩება იმ ფარგლებში, რაც კლიენტმა შეიძლება დაგიჯდეთ', cta: 'განახლება' },
  },
  readiness: {
    title: 'პროფილის მზადყოფნა',
    stages: ['დასაწყისი', 'ყალიბდება', 'თითქმის მზადაა'],
    stepsDone: (a, b) => `${b}-დან ${a} ნაბიჯი შესრულებულია`,
    groups: { Brand: 'ბრენდი', Channels: 'არხები', Website: 'საიტი', Growth: 'ზრდა' },
    doNext: 'შემდეგი ნაბიჯები',
    allSteps: (n) => `ყველა ნაბიჯი (${n})`,
    moreKnows: 'რაც მეტი იცის Loudpilot-მა, მით უკეთ მოერგება მისი პოსტები, რეკლამა და გეგმები თქვენს ბიზნესს.',
    done: '(შესრულებულია)',
    todo: '(გასაკეთებელია)',
    steps: {
      website: { label: 'დაამატეთ საიტი', hint: 'Loudpilot წაიკითხავს მას და გაიგებს თქვენს შეთავაზებას, ფასებს და სტილს.', cta: 'საიტის დამატება' },
      kit: { label: 'ლოგო და ბრენდის ფერები', hint: 'ყველა დიზაინი და ვიდეო მათ იყენებს.', cta: 'Brand kit-ის გახსნა' },
      about: { label: 'აღწერეთ ბიზნესი და მყიდველები', hint: 'ვის ყიდით და როგორ საუბრობთ — AI ასე დაწერს.', cta: 'აღწერა' },
      dossier: { label: 'შექმენით კომპანიის დოსიე', hint: 'რა მუშაობს თქვენს პოსტებსა და რეკლამაში ბოლო 12 თვეში.', cta: 'დოსიეს შექმნა' },
      brandbook: { label: 'ატვირთეთ ან შექმენით ბრენდბუქი', hint: 'ბრენდის წესები, რომლებსაც AI მიჰყვება ყველა პოსტსა და რეკლამაში.', cta: 'ბრენდბუქის დამატება' },
      competitors: { label: 'დაამატეთ კონკურენტები', hint: 'ორი-სამი კონკურენტი — ნახეთ, სად ხართ უკეთესი და რა ისწავლოთ.', cta: 'კონკურენტების დამატება' },
      social: { label: 'დააკავშირეთ სოციალური ქსელი', hint: 'Facebook, Instagram, TikTok, LinkedIn… პოსტების გამოსაქვეყნებლად და შესაფასებლად.', cta: 'დაკავშირება' },
      ads: { label: 'დააკავშირეთ Meta Ads', hint: 'ნახეთ ხარჯი, ლიდები და ერთი შედეგის ფასი; გააძლიერეთ პოსტები.', cta: 'დაკავშირება' },
      ga: { label: 'დააკავშირეთ Google Analytics', hint: 'ნახეთ, რას მოაქვს რეკლამასა და პოსტებს საიტზე.', cta: 'დაკავშირება' },
      post: { label: 'გამოაქვეყნეთ პირველი პოსტი', hint: 'დაწერეთ თავად ან AI-ს დააწერინეთ, შემდეგ გამოაქვეყნეთ ან დაგეგმეთ.', cta: 'პოსტის დაწერა' },
      seo: { label: 'გაუშვით SEO შემოწმება', hint: 'რა გამოასწოროთ, რომ Google-მა საიტი მაღლა აწიოს.', cta: 'SEO შემოწმება' },
      geo: { label: 'შეამოწმეთ ხილვადობა AI ძიებაში', hint: 'გახსენებთ თუ არა ChatGPT და სხვა AI პასუხებში.', cta: 'შემოწმება' },
      tracking: { label: 'შეამოწმეთ რეკლამის ტრეკინგი', hint: 'Meta Pixel, Conversions API და Google-ის ტეგები საიტზე.', cta: 'შემოწმება' },
      tag: { label: 'დააყენეთ Loudpilot Tag', hint: 'ერთი ხაზი საიტზე: ნახეთ, რომელ რეკლამასა და პოსტს მოჰყავს ვიზიტორები, ლიდები და გაყიდვები.', cta: 'დაყენება' },
      chat: { label: 'ჩართეთ ჩატი საიტზე', hint: 'ასისტენტი პასუხობს ვიზიტორებს, რთულ კითხვებს კი თქვენს გუნდს გადასცემს.', cta: 'ჩატის მორგება' },
      goal: { label: 'დაისახეთ პირველი მიზანი', hint: 'Loudpilot ყოველ საათში ამოწმებს და გაცნობებთ, თუ ჩამორჩება.', cta: 'მიზნის დამატება' },
      plan: { label: 'შეადგინეთ მარკეტინგული გეგმა', hint: 'აუდიტორია, ბიუჯეტი, რეკლამა და კონტენტი ერთი ბიზნეს მიზნისთვის.', cta: 'გეგმის შედგენა' },
    },
  },
  analytics: {
    costPerLead: 'რეკლამის თანხა გაყოფილი ლიდების რაოდენობაზე. რაც ნაკლებია, მით უკეთესი.',
    costPerCustomer: 'რეკლამის თანხა გაყოფილი შესყიდვების რაოდენობაზე.',
    roas: 'რამდენი დაბრუნდა რეკლამაზე დახარჯულ ყოველ 1-ზე. 2× ნიშნავს ₾2 გაყიდვას ყოველ ₾1 რეკლამაზე.',
  },
}

const ru: DashCopy = {
  sub: 'Как идут дела у вашего бизнеса',
  days: (n) => `${n} дней`,
  details: 'Подробная аналитика',
  whatIs: 'Что это?',
  compare: 'По сравнению с прошлым периодом',
  status: { good: 'Всё идёт хорошо', steady: 'Стабильно', attention: 'Нужно внимание', setup: 'Начнём измерять' },
  setupText: 'Подключите Facebook и Instagram и установите Loudpilot Tag на сайт — тогда здесь будет видно, как идут дела у бизнеса.',
  connect: 'Подключить',
  noun: { leads: 'Заявки', visits: 'Посещения сайта', views: 'Просмотры' },
  more: (w, n, p, d) => `${w}: ${n} — на ${p}% больше, чем за прошлые ${d} дней.`,
  less: (w, n, p, d) => `${w}: ${n} — на ${p}% меньше, чем за прошлые ${d} дней.`,
  same: (w, n, d) => `${w}: ${n} — примерно как за прошлые ${d} дней.`,
  first: (w, n, d) => `${w}: ${n} за последние ${d} дней.`,
  goalsBehind: (k) => `Отстают цели: ${k}.`,
  metric: {
    views: { line: 'раз люди видели вашу рекламу и посты', tip: 'Сколько раз ваша реклама и посты появились на экранах людей. Один человек может увидеть их несколько раз.' },
    clicks: { line: 'нажатий на рекламу', tip: 'Сколько раз люди нажали на рекламу, чтобы узнать больше: перешли на сайт, открыли форму или чат.' },
    visits: { line: 'посещений сайта', tip: 'Сколько раз люди открыли ваш сайт. Считает Loudpilot Tag или Google Analytics.' },
    leads: { line: 'человек оставили контакты или написали вам', tip: 'Лид (заявка) — это человек, который может купить: заполнил форму, позвонил или написал вам.' },
    sales: { line: 'покупок на сайте', tip: 'Покупки, которые Loudpilot Tag увидел на вашем сайте, и сколько денег они принесли.' },
    spend: { line: 'потрачено на рекламу', tip: 'Деньги, потраченные на рекламу за период. «Одна заявка стоила» — деньги на рекламу, делённые на число заявок: чем меньше, тем лучше.' },
  },
  salesLine: (m) => `покупок · ${m}`,
  spendLine: (c) => `одна заявка стоила ${c}`,
  missing: 'Пока не измеряется',
  connectMeta: 'Подключите Facebook и Instagram',
  connectAds: 'Подключите Meta Ads',
  installTag: 'Установите Loudpilot Tag',
  goals: 'Цели',
  goalsTip: 'Цели, которые вы поставили, например «заявка дешевле ₾20». Loudpilot проверяет их каждый час и скажет, если какая-то отстаёт.',
  onTrack: (a, b) => `${a} из ${b} идут по плану`,
  noGoals: 'Целей пока нет. Добавьте цель — Loudpilot проверяет её каждый час и скажет, если она отстаёт.',
  setGoal: 'Добавить цель',
  allGoals: 'Все цели',
  goalStatus: { ON_TRACK: 'По плану', AT_RISK: 'Под угрозой', OFF_TRACK: 'Отстаёт', NO_DATA: 'Ждём данных' },
  next: 'Что сделать дальше',
  alerts: (n) => `Важные уведомления: ${n}`,
  fromReview: 'Из недельного обзора',
  nothingNext: 'Ничего срочного. Каждый понедельник Loudpilot разбирает вашу неделю и подсказывает, что делать.',
  openReview: 'Открыть недельный обзор',
  aiStrategist: 'AI-стратег',
  want: 'Чего вы хотите добиться?',
  placeholder: 'например, 50 заявок на новый дом в этом месяце',
  makePlan: 'Составить план',
  ideas: ['50 заявок на новый дом в этом месяце', 'Заполнить воркшоп на выходных', 'Больше заказов на праздничное меню'],
  pilot: {
    start: { title: 'Не знаете, с чего начать? Pilot задаст вам вопросы', sub: '3 минуты · в конце — цели и готовый план', cta: 'Начать' },
    continue: { title: 'Завершите интервью о стратегии', sub: (p) => `Готово на ${p}% · дальше цели и план`, cta: 'Продолжить' },
    done: { title: 'Цифры изменились? Обновите их с Pilot', sub: 'Планы останутся в пределах того, сколько может стоить клиент', cta: 'Обновить' },
  },
  readiness: {
    title: 'Готовность профиля',
    stages: ['Начало', 'Складывается', 'Почти готово'],
    stepsDone: (a, b) => `Выполнено шагов: ${a} из ${b}`,
    groups: { Brand: 'Бренд', Channels: 'Каналы', Website: 'Сайт', Growth: 'Рост' },
    doNext: 'Сделайте дальше',
    allSteps: (n) => `Все шаги (${n})`,
    moreKnows: 'Чем больше Loudpilot знает, тем лучше его посты, реклама и планы подходят вашему бизнесу.',
    done: '(сделано)',
    todo: '(нужно сделать)',
    steps: {
      website: { label: 'Добавьте сайт', hint: 'Loudpilot прочитает его и узнает ваше предложение, цены и стиль.', cta: 'Добавить сайт' },
      kit: { label: 'Логотип и цвета бренда', hint: 'Их используют все дизайны и видео.', cta: 'Открыть Brand kit' },
      about: { label: 'Опишите бизнес и покупателей', hint: 'Кому вы продаёте и как говорите — AI будет писать так же.', cta: 'Описать' },
      dossier: { label: 'Соберите досье компании', hint: 'Что работает в ваших постах и рекламе за последние 12 месяцев.', cta: 'Собрать досье' },
      brandbook: { label: 'Загрузите или создайте брендбук', hint: 'Правила бренда, которым AI следует в каждом посте и рекламе.', cta: 'Добавить брендбук' },
      competitors: { label: 'Добавьте конкурентов', hint: 'Двух-трёх конкурентов — увидите, где вы сильнее и что перенять.', cta: 'Добавить конкурентов' },
      social: { label: 'Подключите соцсеть', hint: 'Facebook, Instagram, TikTok, LinkedIn… чтобы публиковать посты и видеть результат.', cta: 'Подключить' },
      ads: { label: 'Подключите Meta Ads', hint: 'Видно расходы, заявки и цену одного результата; можно продвигать посты.', cta: 'Подключить' },
      ga: { label: 'Подключите Google Analytics', hint: 'Видно, что реклама и посты дают сайту.', cta: 'Подключить' },
      post: { label: 'Опубликуйте первый пост', hint: 'Напишите сами или попросите AI, затем опубликуйте или запланируйте.', cta: 'Написать пост' },
      seo: { label: 'Запустите SEO-проверку', hint: 'Что исправить, чтобы Google поднял сайт выше.', cta: 'Проверить SEO' },
      geo: { label: 'Проверьте видимость в AI-поиске', hint: 'Упоминают ли вас ChatGPT и другие AI в ответах.', cta: 'Проверить' },
      tracking: { label: 'Проверьте отслеживание рекламы', hint: 'Meta Pixel, Conversions API и теги Google на сайте.', cta: 'Проверить' },
      tag: { label: 'Установите Loudpilot Tag', hint: 'Одна строка на сайте: видно, какая реклама и посты приводят посетителей, заявки и продажи.', cta: 'Установить' },
      chat: { label: 'Включите чат на сайте', hint: 'Ассистент отвечает посетителям, а сложные вопросы передаёт вашей команде.', cta: 'Настроить чат' },
      goal: { label: 'Поставьте первую цель', hint: 'Loudpilot проверяет её каждый час и скажет, если она отстаёт.', cta: 'Поставить цель' },
      plan: { label: 'Составьте маркетинговый план', hint: 'Аудитории, бюджет, реклама и контент для одной бизнес-цели.', cta: 'Составить план' },
    },
  },
  analytics: {
    costPerLead: 'Деньги на рекламу, делённые на число заявок. Чем меньше, тем лучше.',
    costPerCustomer: 'Деньги на рекламу, делённые на число покупок.',
    roas: 'Сколько вернулось на каждую 1, потраченную на рекламу. 2× — это ₾2 продаж на каждый ₾1 рекламы.',
  },
}

export const DASH: Record<AppLang, DashCopy> = { en, ka, ru }
