export type IcebreakerPhraseKey = 'ack' | 'newWord' | 'means' | 'tryIt' | 'allDone';

/**
 * Fixed phrases for the deterministic forced-advance icebreaker message (see
 * shouldForceAdvanceVocab in app/api/chat/stream/route.ts), which bypasses the model entirely and so
 * can't rely on it to localize anything. Unlike the English example strings
 * used elsewhere in this file as LLM prompt scaffolding, this text is sent to
 * the learner directly, so it must already be in the right language. Best-
 * effort translations — the less common languages here would benefit from a
 * native-speaker review. Falls back to English for any code not listed.
 */
const ICEBREAKER_PHRASES: Record<string, Record<IcebreakerPhraseKey, string>> = {
  en: { ack: "Good job!", newWord: "New word:", means: "means", tryIt: "Can you say it?", allDone: "That's all our vocabulary for now — let's practice!" },
  ja: { ack: 'よくできました!', newWord: '新しい単語:', means: 'という意味です', tryIt: '言ってみましょう?', allDone: 'これで単語は全部です。練習してみましょう!' },
  fr: { ack: 'Bon travail !', newWord: 'Nouveau mot :', means: 'signifie', tryIt: 'Peux-tu le dire ?', allDone: "C'est tout notre vocabulaire pour l'instant — pratiquons !" },
  de: { ack: 'Gut gemacht!', newWord: 'Neues Wort:', means: 'bedeutet', tryIt: 'Kannst du es sagen?', allDone: 'Das war unser gesamter Wortschatz — üben wir jetzt!' },
  es: { ack: '¡Buen trabajo!', newWord: 'Nueva palabra:', means: 'significa', tryIt: '¿Puedes decirlo?', allDone: 'Eso es todo nuestro vocabulario por ahora — ¡practiquemos!' },
  ru: { ack: 'Отлично!', newWord: 'Новое слово:', means: 'значит', tryIt: 'Можешь сказать это?', allDone: 'Это все наши слова на сегодня — давай попрактикуемся!' },
  ar: { ack: 'أحسنت!', newWord: 'كلمة جديدة:', means: 'تعني', tryIt: 'هل يمكنك أن تقولها؟', allDone: 'هذه كل مفرداتنا الآن — لنتدرب!' },
  sw: { ack: 'Vizuri sana!', newWord: 'Neno jipya:', means: 'maana yake ni', tryIt: 'Unaweza kulisema?', allDone: 'Hayo ndiyo msamiati wetu wote kwa sasa — tufanye mazoezi!' },
  lg: { ack: 'Weebale!', newWord: 'Ekigambo ekiggya:', means: 'kitegeeza', tryIt: 'Osobola okukyogera?', allDone: 'Ago ge magezi gonna ge tulina kaakati — tutandike okwenyigira!' },
  pt: { ack: 'Muito bem!', newWord: 'Palavra nova:', means: 'significa', tryIt: 'Consegues dizê-la?', allDone: 'Isso é todo o nosso vocabulário por agora — vamos praticar!' },
  it: { ack: 'Ottimo lavoro!', newWord: 'Nuova parola:', means: 'significa', tryIt: 'Riesci a dirla?', allDone: 'Questo è tutto il nostro vocabolario per ora — mettiamolo in pratica!' },
  nl: { ack: 'Goed gedaan!', newWord: 'Nieuw woord:', means: 'betekent', tryIt: 'Kun je het zeggen?', allDone: 'Dat is al onze woordenschat voor nu — laten we oefenen!' },
  tr: { ack: 'Aferin!', newWord: 'Yeni kelime:', means: 'anlamına gelir', tryIt: 'Söyleyebilir misin?', allDone: 'Şimdilik kelime dağarcığımız bu kadar — hadi pratik yapalım!' },
  pl: { ack: 'Dobra robota!', newWord: 'Nowe słowo:', means: 'znaczy', tryIt: 'Potrafisz to powiedzieć?', allDone: 'To już całe nasze słownictwo na teraz — poćwiczmy!' },
  uk: { ack: 'Молодець!', newWord: 'Нове слово:', means: 'означає', tryIt: 'Можеш це сказати?', allDone: 'Це всі наші слова на зараз — давай практикуватися!' },
  el: { ack: 'Μπράβο!', newWord: 'Νέα λέξη:', means: 'σημαίνει', tryIt: 'Μπορείς να το πεις;', allDone: 'Αυτό είναι όλο το λεξιλόγιό μας προς το παρόν — ας εξασκηθούμε!' },
  he: { ack: 'כל הכבוד!', newWord: 'מילה חדשה:', means: 'פירושה', tryIt: 'אתה יכול להגיד את זה?', allDone: 'זה כל אוצר המילים שלנו לעת עתה — בואו נתרגל!' },
  fa: { ack: 'آفرین!', newWord: 'کلمه جدید:', means: 'به معنی', tryIt: 'می‌توانی آن را بگویی؟', allDone: 'این تمام واژگان ما برای الان است — بیایید تمرین کنیم!' },
  hi: { ack: 'शाबाश!', newWord: 'नया शब्द:', means: 'का अर्थ है', tryIt: 'क्या तुम इसे बोल सकते हो?', allDone: 'फ़िलहाल हमारी सारी शब्दावली यही है — चलो अभ्यास करते हैं!' },
  bn: { ack: 'চমৎকার!', newWord: 'নতুন শব্দ:', means: 'মানে', tryIt: 'তুমি কি এটা বলতে পারো?', allDone: 'আপাতত এটাই আমাদের সব শব্দভাণ্ডার — চলো অনুশীলন করি!' },
  ne: { ack: 'राम्रो काम!', newWord: 'नयाँ शब्द:', means: 'को अर्थ हो', tryIt: 'के तपाईं यो भन्न सक्नुहुन्छ?', allDone: 'अहिलेलाई हाम्रो सबै शब्दावली यही हो — अभ्यास गरौं!' },
  ur: { ack: 'شاباش!', newWord: 'نیا لفظ:', means: 'کا مطلب ہے', tryIt: 'کیا آپ یہ کہہ سکتے ہیں؟', allDone: 'فی الحال ہماری تمام الفاظ کی فہرست یہی ہے — آئیے مشق کریں!' },
  zh: { ack: '做得好!', newWord: '新单词:', means: '意思是', tryIt: '你能说说看吗?', allDone: '这就是我们目前的全部词汇——我们来练习吧!' },
  ko: { ack: '잘했어요!', newWord: '새 단어:', means: '라는 뜻이에요', tryIt: '말해볼 수 있어요?', allDone: '지금까지 배운 단어는 여기까지예요 — 연습해봐요!' },
  th: { ack: 'เก่งมาก!', newWord: 'คำศัพท์ใหม่:', means: 'แปลว่า', tryIt: 'พูดได้ไหม?', allDone: 'นี่คือคำศัพท์ทั้งหมดของเราตอนนี้ — มาฝึกกันเถอะ!' },
  vi: { ack: 'Làm tốt lắm!', newWord: 'Từ mới:', means: 'có nghĩa là', tryIt: 'Bạn có thể nói được không?', allDone: 'Đó là tất cả từ vựng của chúng ta lúc này — hãy cùng luyện tập!' },
  tl: { ack: 'Mahusay!', newWord: 'Bagong salita:', means: 'ibig sabihin ay', tryIt: 'Kaya mo bang sabihin ito?', allDone: 'Iyan na ang lahat ng ating bokabularyo sa ngayon — mag-ensayo tayo!' },
  ms: { ack: 'Bagus!', newWord: 'Perkataan baharu:', means: 'bermaksud', tryIt: 'Bolehkah anda sebutkannya?', allDone: 'Itu sahaja kosa kata kita buat masa ini — mari kita berlatih!' },
  id: { ack: 'Bagus sekali!', newWord: 'Kata baru:', means: 'artinya', tryIt: 'Bisakah kamu mengucapkannya?', allDone: 'Itu semua kosakata kita untuk saat ini — ayo kita berlatih!' },
  km: { ack: 'ល្អណាស់!', newWord: 'ពាក្យថ្មី:', means: 'មានន័យថា', tryIt: 'តើអ្នកអាចនិយាយវាបានទេ?', allDone: 'នេះជាវាក្យសព្ទទាំងអស់របស់យើងសម្រាប់ពេលនេះ — តោះអនុវត្ត!' },
  my: { ack: 'ကောင်းပါတယ်!', newWord: 'စကားလုံးအသစ်:', means: 'ဆိုလိုသည်မှာ', tryIt: 'ပြောပြနိုင်မလား?', allDone: 'အခုအတွက်တော့ ဒါဟာ ကျွန်တော်တို့ရဲ့ ဝေါဟာရအားလုံးပဲ — လေ့ကျင့်ကြရအောင်!' },
  lo: { ack: 'ດີຫຼາຍ!', newWord: 'ຄໍາໃໝ່:', means: 'ໝາຍຄວາມວ່າ', tryIt: 'ເຈົ້າເວົ້າໄດ້ບໍ?', allDone: 'ນັ້ນແມ່ນຄໍາສັບທັງໝົດຂອງພວກເຮົາໃນຕອນນີ້ — ມາຝຶກກັນເທາະ!' },
};

export function icebreakerPhrase(langCode: string, key: IcebreakerPhraseKey): string {
  return (ICEBREAKER_PHRASES[langCode] ?? ICEBREAKER_PHRASES.en)[key];
}

