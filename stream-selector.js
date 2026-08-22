/*
  Lume Live — Stream Selector quiz.

  Shared by stream-selector.html (English) and stream-selector-hi.html
  (Hindi). The page sets window.LUME_STREAM_LANG before loading this file;
  everything else — questions, scoring, result copy — lives here once, in
  both languages, so the two pages can never drift apart.

  Scoring model
  -------------
  Ten interest questions score five axes (maths, tech/physical science,
  life science, commerce, humanities). Each axis is normalised against the
  highest score actually reachable for it, so "78% maths" means something.

  Those axes are then blended into seven real subject combinations. This
  matters: "Science" is not the decision a Class 10 student makes — PCM vs
  PCB vs PCM-with-Biology is, and so is Commerce with or without Maths.

  Three further questions collect marks and competitive-exam appetite.
  These never touch the interest score — steering someone away from what
  they like because of one bad exam would be exactly the wrong advice.
  They instead attach an honest confidence badge to each combination
  (strong / needs a plan / a stretch) and generate the reality-check copy.
*/
(function(){
"use strict";

var LANG = (window.LUME_STREAM_LANG === "hi") ? "hi" : "en";
var WA = "917015671280";
var STORE = "lume.streamselector.v2";
/* Long enough to survive the hop out to WhatsApp and back, short enough that
   the next student on a shared phone gets the quiz rather than someone else's
   result. */
var STORE_TTL = 6 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Interface copy                                                      */
/* ------------------------------------------------------------------ */
var T = {
en:{
  question:"Question", of:"of",
  stageInterest:"What you enjoy", stageReality:"An honest reality check", stageHonesty:"One last question",
  back:"← Back", skip:"Prefer not to say",
  resBadge:"Your result",
  bestFit:"Your strongest fit", twoWay:"Two combinations fit you almost equally",
  fitHead:"How each combination fits you", axesHead:"What your answers actually measured",
  careersHead:"Careers this opens", looksHead:"What the next two years actually look like",
  badHead:"Signs six months in that it is not working", askHead:"Ask your school this week",
  runnerUp:"Keep this one open", relative:"fit",
  badgeStrong:"Strong fit", badgePlan:"Good fit — with a plan", badgeStretch:"A stretch right now",
  honestLabel:"One honest reminder",
  honest:"A stream is a doorway, not a destiny — most careers are reachable from more than one, and every board allows a change of course later than students think. Use this as a conversation-starter, then decide with someone who knows you.",
  realityLabel:"Your reality check",
  pressureLabel:"A gentle check",
  pressure:"You said outside pressure is part of your thinking. That is completely normal — but the students who switch streams or struggle in Class 11 are usually the ones who chose to satisfy someone else. Ask yourself: what would I still choose if nobody was watching?",
  leadTitle:"Want this turned into a real plan?",
  leadSub:"A Lume Live counsellor (M.Sc Clinical Psychology) will go through your result, your marks and your school's actual subject options with you. Leave your details and we will continue on WhatsApp — first session ₹249.",
  fName:"Your name", fClass:"Current class", fPhone:"WhatsApp number", fEmail:"Email (optional)",
  fNamePh:"First name is enough", fPhonePh:"10-digit mobile number", fEmailPh:"you@example.com",
  classPick:"Select", class9:"Class 9", class10:"Class 10", class11:"Class 11", class12:"Class 12", classOther:"Parent / other",
  leadCta:"Send my result and continue on WhatsApp",
  errName:"Please enter your name.", errClass:"Please pick your class.",
  errPhone:"Please enter a valid 10-digit Indian mobile number.", errEmail:"That email address does not look right.",
  leadOk:"Got it — your result is with us. If WhatsApp did not open, message us on +91 70156 71280 and we will pick it up from here.",
  leadOkPdf:"While you wait, here is the checklist we give parents →",
  privacy:"We never sell your data. Your details are used only to help with this stream decision.",
  shareHead:"Show this to a parent",
  printCta:"Save or print this result", copyCta:"Copy result link", copied:"Link copied",
  snapCta:"Take the deeper 60-second Career Snapshot", readCta:"Read: PCM vs PCB vs Commerce", retakeCta:"Retake quiz",
  waMsg:"Hello Lume Live! I took the Stream Selector quiz.\nName: {name}\nClass: {class}\nResult: {res}\nRunner-up: {alt}\nEmail: {email}\nI would like a personalised discussion about my stream choice.",
  notGiven:"(not given)"
},
hi:{
  question:"सवाल", of:"/",
  stageInterest:"आपको क्या पसंद है", stageReality:"एक ईमानदार reality check", stageHonesty:"आखिरी सवाल",
  back:"← पीछे", skip:"बताना नहीं चाहते",
  resBadge:"आपका परिणाम",
  bestFit:"आपके लिए सबसे सही", twoWay:"दो combinations लगभग बराबर सही बैठते हैं",
  fitHead:"हर combination आप पर कितना सही बैठता है", axesHead:"आपके जवाबों ने असल में क्या मापा",
  careersHead:"ये careers खुलते हैं", looksHead:"अगले दो साल असल में कैसे होंगे",
  badHead:"छह महीने बाद इन संकेतों का मतलब है यह चल नहीं रहा", askHead:"इस हफ़्ते अपने स्कूल से यह पूछें",
  runnerUp:"इसे भी खुला रखें", relative:"fit",
  badgeStrong:"मज़बूत fit", badgePlan:"अच्छा fit — पर plan चाहिए", badgeStretch:"अभी मुश्किल होगा",
  honestLabel:"एक ईमानदार बात",
  honest:"Stream एक दरवाज़ा है, किस्मत नहीं — ज़्यादातर careers एक से ज़्यादा stream से संभव हैं। इसे बातचीत की शुरुआत मानें, फिर किसी जानकार के साथ तय करें।",
  realityLabel:"आपका reality check",
  pressureLabel:"एक सोचने वाली बात",
  pressure:"आपने बताया कि बाहरी दबाव भी आपकी सोच का हिस्सा है। यह बिलकुल आम है — पर जो students क्लास 11 में stream बदलते या संघर्ष करते हैं, वे अक्सर वही होते हैं जिन्होंने दूसरों को खुश करने के लिए चुना। खुद से पूछें: अगर कोई नहीं देख रहा होता, तब भी मैं क्या चुनता?",
  leadTitle:"इसे एक सही plan में बदलना चाहते हैं?",
  leadSub:"Lume Live के counsellor (M.Sc Clinical Psychology) आपके result, आपके मार्क्स और आपके स्कूल में उपलब्ध subjects पर आपके साथ बात करेंगे। अपनी जानकारी छोड़ें, हम WhatsApp पर आगे बात करेंगे — पहला session सिर्फ ₹249।",
  fName:"आपका नाम", fClass:"अभी किस class में", fPhone:"WhatsApp नंबर", fEmail:"Email (वैकल्पिक)",
  fNamePh:"पहला नाम काफ़ी है", fPhonePh:"10 अंकों का मोबाइल नंबर", fEmailPh:"you@example.com",
  classPick:"चुनें", class9:"क्लास 9", class10:"क्लास 10", class11:"क्लास 11", class12:"क्लास 12", classOther:"अभिभावक / अन्य",
  leadCta:"मेरा result भेजें और WhatsApp पर बात करें",
  errName:"कृपया अपना नाम लिखें।", errClass:"कृपया अपनी class चुनें।",
  errPhone:"कृपया सही 10 अंकों का मोबाइल नंबर लिखें।", errEmail:"यह email सही नहीं लग रहा।",
  leadOk:"मिल गया — आपका result हमारे पास है। अगर WhatsApp नहीं खुला, तो +91 70156 71280 पर मैसेज करें।",
  leadOkPdf:"तब तक यह checklist देखें जो हम माता-पिता को देते हैं →",
  privacy:"हम आपका data कभी नहीं बेचते। आपकी जानकारी सिर्फ इस stream के फैसले में मदद के लिए है।",
  shareHead:"यह अपने माता-पिता को दिखाएं",
  printCta:"यह result save / print करें", copyCta:"Result लिंक copy करें", copied:"लिंक copy हो गया",
  snapCta:"गहरा 60-सेकंड Career Snapshot लें", readCta:"पढ़ें: PCM vs PCB vs Commerce", retakeCta:"क्विज़ दोबारा लें",
  waMsg:"Hello Lume Live! मैंने Stream Selector क्विज़ ली।\nनाम: {name}\nClass: {class}\nResult: {res}\nदूसरा option: {alt}\nEmail: {email}\nमैं अपने stream choice पर personalised बातचीत चाहता/चाहती हूँ।",
  notGiven:"(नहीं दिया)"
}};
function t(k){ return T[LANG][k]; }

/* ------------------------------------------------------------------ */
/* Axes                                                                */
/* ------------------------------------------------------------------ */
var AXES = ["m","t","b","c","h"];
var AXIS_LABEL = {
  m:{en:"Maths & logic",hi:"Maths और logic"},
  t:{en:"Tech & physical science",hi:"Tech और भौतिक विज्ञान"},
  b:{en:"Life science & health",hi:"जीव विज्ञान और स्वास्थ्य"},
  c:{en:"Business & money",hi:"Business और पैसा"},
  h:{en:"People, words & ideas",hi:"लोग, शब्द और विचार"}
};

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */
/* stage: interest = scored on the axes; reality = stored as a modifier;
   honesty = scores nothing, only raises the pressure flag.            */
var Q = [
{stage:"interest",
 q:{en:"When you lose track of time, what are you usually doing?",
    hi:"जब आपको समय का पता ही नहीं चलता, तब आप आमतौर पर क्या कर रहे होते हैं?"},
 o:[
  {en:"Taking something apart, building it, or coding",hi:"कुछ खोलना, बनाना, या coding करना",v:{t:2,m:1}},
  {en:"Reading about the body, animals, diseases, how life works",hi:"शरीर, जानवरों, बीमारियों, जीवन कैसे चलता है — इस बारे में पढ़ना",v:{b:2}},
  {en:"Following money, numbers, deals or a small business idea",hi:"पैसा, नंबर, deals या कोई छोटा business idea देखना",v:{c:2,m:1}},
  {en:"Reading, writing, debating, drawing, or understanding people",hi:"पढ़ना, लिखना, debate, drawing, या लोगों को समझना",v:{h:2}}]},

{stage:"interest",
 q:{en:"Which subjects genuinely interest you — forget the marks for a second.",
    hi:"कौन-से विषय आपको सचमुच पसंद हैं — एक पल के लिए मार्क्स भूल जाइए।"},
 o:[
  {en:"Physics and Maths",hi:"Physics और Maths",v:{t:2,m:2}},
  {en:"Biology and Chemistry",hi:"Biology और Chemistry",v:{b:2,t:1}},
  {en:"Accounts, Economics, Business Studies",hi:"Accounts, Economics, Business Studies",v:{c:2}},
  {en:"History, Political Science, Literature, Psychology, Fine Arts",hi:"History, Political Science, Literature, Psychology, Fine Arts",v:{h:2}}]},

{stage:"interest",
 q:{en:"A problem feels most satisfying to solve when…",
    hi:"कोई समस्या हल करना तब सबसे अच्छा लगता है जब…"},
 o:[
  {en:"It has a logical, provable, single right answer",hi:"उसका एक logical, साबित होने वाला सही जवाब हो",v:{m:2,t:1}},
  {en:"It is about a living system — a body, a plant, an ecosystem",hi:"वह किसी जीवित चीज़ से जुड़ा हो — शरीर, पौधा, कोई ecosystem",v:{b:2}},
  {en:"It involves money, growth or a smart strategy",hi:"उसमें पैसा, growth या कोई smart strategy हो",v:{c:2}},
  {en:"It is about people, ideas, meaning or expression",hi:"वह लोगों, विचारों, मायने या अभिव्यक्ति से जुड़ा हो",v:{h:2}}]},

{stage:"interest",
 q:{en:"Your ideal future work looks most like…",
    hi:"आपका आदर्श भविष्य का काम कैसा दिखता है?"},
 o:[
  {en:"Engineering, technology, coding, machines, space",hi:"Engineering, technology, coding, machines, space",v:{t:2,m:1}},
  {en:"Medicine, healthcare, biotech, research on living things",hi:"Medicine, healthcare, biotech, जीव विज्ञान पर research",v:{b:2}},
  {en:"Business, finance, markets, entrepreneurship, management",hi:"Business, finance, markets, entrepreneurship, management",v:{c:2}},
  {en:"Law, media, design, teaching, civil services, psychology",hi:"Law, media, design, teaching, civil services, psychology",v:{h:2}}]},

{stage:"interest",
 q:{en:"Pick the project you would actually enjoy — not the impressive one.",
    hi:"वह project चुनें जो आपको सचमुच पसंद आए — प्रभावशाली वाला नहीं।"},
 o:[
  {en:"Build a robot, or code an app that works",hi:"एक robot बनाना, या कोई चलने वाला app code करना",v:{t:2,m:1}},
  {en:"Run a lab experiment on plants, microbes or the human body",hi:"पौधों, microbes या मानव शरीर पर lab experiment करना",v:{b:2}},
  {en:"Run a mock stock portfolio, or plan a small startup",hi:"Mock stock portfolio चलाना, या छोटा startup plan करना",v:{c:2,m:1}},
  {en:"Produce a play, write an article, or design a campaign",hi:"नाटक करना, article लिखना, या campaign design करना",v:{h:2}}]},

{stage:"interest",
 q:{en:"Which compliment fits you best?",hi:"कौन-सी तारीफ़ आप पर सबसे सही बैठती है?"},
 o:[
  {en:"“You are so logical and precise.”",hi:"“तुम बहुत logical और सटीक हो।”",v:{m:2}},
  {en:"“You have a real feel for living things and for people who are unwell.”",hi:"“तुम्हें जीव-जंतुओं और बीमार लोगों की सच में समझ है।”",v:{b:2}},
  {en:"“You are sharp with money and opportunities.”",hi:"“तुम पैसे और मौकों को लेकर तेज़ हो।”",v:{c:2}},
  {en:"“You express yourself, and read people, so well.”",hi:"“तुम खुद को बहुत अच्छे से व्यक्त करते हो, और लोगों को समझते हो।”",v:{h:2}}]},

{stage:"interest",
 q:{en:"When you see something you do not understand, your first instinct is to ask…",
    hi:"जब आपको कुछ समझ नहीं आता, तो आपका पहला सवाल होता है…"},
 o:[
  {en:"How does the mechanism work? Can I take it apart?",hi:"यह चलता कैसे है? क्या मैं इसे खोल सकता/सकती हूँ?",v:{t:2}},
  {en:"What is it made of, and how does it live or react?",hi:"यह बना किस चीज़ से है, और यह जीता या react कैसे करता है?",v:{b:2}},
  {en:"Who makes money from this, and how does it scale?",hi:"इससे पैसा कौन कमाता है, और यह बड़ा कैसे होता है?",v:{c:2}},
  {en:"What does it mean, and who does it affect?",hi:"इसका मतलब क्या है, और यह किसे प्रभावित करता है?",v:{h:2}}]},

{stage:"interest",
 q:{en:"Which of these would feel least draining on a free Sunday?",
    hi:"एक खाली रविवार को इनमें से क्या करना सबसे कम थकाऊ लगेगा?"},
 help:{en:"Be honest — this one is about stamina, not ambition.",
       hi:"ईमानदारी से — यह सवाल दमखम का है, महत्वाकांक्षा का नहीं।"},
 o:[
  {en:"Working through 30 maths problems",hi:"30 maths के सवाल हल करना",v:{m:2}},
  {en:"Learning and diagramming 30 pages of Biology",hi:"Biology के 30 पन्ने पढ़ना और diagram बनाना",v:{b:2}},
  {en:"Building a spreadsheet of a business's numbers",hi:"किसी business के नंबरों की spreadsheet बनाना",v:{c:2,m:1}},
  {en:"Writing a 1,500-word piece you actually care about",hi:"1,500 शब्दों का ऐसा लेख लिखना जिसकी आपको सच में परवाह हो",v:{h:2}}]},

{stage:"interest",
 q:{en:"How do you feel about two more years of serious Mathematics?",
    hi:"अगले दो साल गंभीर Mathematics को लेकर आपको कैसा लगता है?"},
 help:{en:"Class 11 Maths is a real step up from Class 10 — this is the jump students underestimate most.",
       hi:"क्लास 11 की Maths क्लास 10 से काफ़ी ऊपर है — students इसी छलांग को सबसे ज़्यादा कम आँकते हैं।"},
 o:[
  {en:"I enjoy it and I am ready for it",hi:"मुझे पसंद है और मैं तैयार हूँ",v:{m:3},appetite:"high"},
  {en:"Applied and business maths is fine — not heavy pure maths",hi:"Applied और business maths ठीक है — भारी pure maths नहीं",v:{m:1,c:1},appetite:"applied"},
  {en:"I can manage it, but I would not choose it",hi:"मैं कर लूँगा/लूँगी, पर खुद से नहीं चुनूँगा/चुनूँगी",v:{},appetite:"neutral"},
  {en:"I would rather keep maths to a minimum",hi:"मैं maths कम से कम रखना चाहूँगा/चाहूँगी",v:{},appetite:"avoid",flagAvoidMaths:true}]},

{stage:"interest",
 q:{en:"Biology means the human body, diagrams, and a lot of names to remember. Two years of that?",
    hi:"Biology यानी मानव शरीर, diagrams, और बहुत सारे नाम याद रखना। दो साल यह?"},
 o:[
  {en:"Fascinating — I would happily spend two years on it",hi:"बहुत दिलचस्प — मैं खुशी से दो साल दूँगा/दूँगी",v:{b:3}},
  {en:"Interesting in parts, heavy in parts",hi:"कुछ हिस्से दिलचस्प, कुछ भारी",v:{b:1}},
  {en:"Honestly, not my thing",hi:"सच कहूँ तो, मेरे बस की बात नहीं",v:{},flagAvoidBio:true}]},

{stage:"reality", key:"maths",
 q:{en:"Roughly what did you score in Maths in your last exam?",
    hi:"पिछली परीक्षा में Maths में लगभग कितने नंबर आए थे?"},
 help:{en:"This never changes what you enjoy. It only changes how much of a plan you need.",
       hi:"इससे आपकी पसंद नहीं बदलती। सिर्फ़ यह तय होता है कि आपको कितनी तैयारी चाहिए।"},
 o:[
  {en:"85% or above",hi:"85% या उससे ऊपर",band:"high"},
  {en:"70–84%",hi:"70–84%",band:"mid"},
  {en:"50–69%",hi:"50–69%",band:"low"},
  {en:"Below 50%",hi:"50% से कम",band:"weak"}],
 skippable:true},

{stage:"reality", key:"science",
 q:{en:"And roughly what did you score in Science?",hi:"और Science में लगभग कितने नंबर आए थे?"},
 o:[
  {en:"85% or above",hi:"85% या उससे ऊपर",band:"high"},
  {en:"70–84%",hi:"70–84%",band:"mid"},
  {en:"50–69%",hi:"50–69%",band:"low"},
  {en:"Below 50%",hi:"50% से कम",band:"weak"}],
 skippable:true},

{stage:"reality", key:"effort",
 q:{en:"Are you ready for two years of NEET/JEE-level coaching on top of school?",
    hi:"क्या आप स्कूल के साथ-साथ दो साल NEET/JEE स्तर की coaching के लिए तैयार हैं?"},
 help:{en:"There is no wrong answer. Plenty of excellent Science careers do not run through a coaching centre.",
       hi:"कोई जवाब गलत नहीं है। कई बेहतरीन Science careers coaching centre से होकर नहीं जाते।"},
 o:[
  {en:"Yes — I know what it takes and I want it",hi:"हाँ — मुझे पता है क्या लगेगा और मुझे यही चाहिए",level:"high"},
  {en:"Some coaching, but I want a life outside it too",hi:"थोड़ी coaching, पर मुझे उसके बाहर भी ज़िंदगी चाहिए",level:"mid"},
  {en:"No — I would rather build boards, skills and a portfolio",hi:"नहीं — मैं boards, skills और portfolio पर काम करना चाहूँगा/चाहूँगी",level:"low"},
  {en:"I genuinely do not know yet",hi:"मुझे सच में अभी नहीं पता",level:"unsure"}]},

{stage:"honesty",
 q:{en:"Be honest — what is mainly driving your stream thinking right now?",
    hi:"ईमानदारी से — अभी आपके stream के खयाल के पीछे मुख्य वजह क्या है?"},
 o:[
  {en:"My own genuine interest",hi:"मेरी अपनी सच्ची रुचि"},
  {en:"“Science is the safest and most respected choice”",hi:"“Science सबसे सुरक्षित और सबसे सम्मानित option है”",flagPressure:true},
  {en:"My parents or relatives have already decided",hi:"मेरे माता-पिता या रिश्तेदार पहले ही तय कर चुके हैं",flagPressure:true},
  {en:"My friends, or whatever sounds impressive",hi:"मेरे दोस्त, या जो सुनने में प्रभावशाली लगे",flagPressure:true}]}
];

/* ------------------------------------------------------------------ */
/* Subject combinations                                                */
/* ------------------------------------------------------------------ */
/* w: how much each normalised axis contributes. Weights sum to 1, so a
   combination's fit is directly comparable with every other one.      */
var COMBOS = {
pcm:{ w:{t:0.45,m:0.45,b:0.10},
  name:{en:"PCM — Physics, Chemistry, Maths",hi:"PCM — Physics, Chemistry, Maths"},
  sub:{en:"Science stream with Maths, without Biology",hi:"Science stream, Maths के साथ, Biology के बिना"},
  blurb:{en:"You think in systems and you are comfortable with abstraction — PCM is built for exactly that. It leads to engineering, computer science, architecture, defence and the pure sciences, and it still leaves Economics, Commerce and design degrees open to you afterwards.",
         hi:"आप systems में सोचते हैं और abstraction आपको सहज लगता है — PCM ठीक इसी के लिए बना है। इससे engineering, computer science, architecture, defence और pure sciences के रास्ते खुलते हैं, और बाद में Economics, Commerce और design की डिग्री भी खुली रहती है।"},
  careers:[["career-as-software-engineer.html","How to become a Software Engineer","Software Engineer कैसे बनें"],
           ["career-as-data-scientist.html","How to become a Data Scientist","Data Scientist कैसे बनें"],
           ["career-as-architect.html","How to become an Architect","Architect कैसे बनें"],
           ["career-as-commercial-pilot.html","How to become a Commercial Pilot","Commercial Pilot कैसे बनें"],
           ["is-jee-right-for-you.html","Is JEE right for you?","क्या JEE आपके लिए सही है?"]],
  looks:{en:["Maths jumps to a noticeably higher level in Class 11 — calculus, vectors and proof-style questions arrive early.",
             "Physics turns maths-heavy fast, and Chemistry splits into physical (calculation), organic (mechanism) and inorganic (memory).",
             "JEE Main and Advanced, BITSAT, state CETs and CUET are separate races with separate syllabi — you pick one to lead with."],
         hi:["क्लास 11 में Maths का स्तर साफ़ तौर पर ऊपर चला जाता है — calculus, vectors और proof वाले सवाल जल्दी आ जाते हैं।",
             "Physics तेज़ी से maths-भारी हो जाती है, और Chemistry तीन हिस्सों में बँट जाती है — physical (calculation), organic (mechanism), inorganic (याद रखना)।",
             "JEE Main और Advanced, BITSAT, state CET और CUET अलग-अलग दौड़ें हैं — आपको एक को मुख्य बनाना होता है।"]},
  bad:{en:["You can follow the teacher but cannot start a problem on your own.",
           "You are scoring on formula-recall and going blank the moment a question is reworded.",
           "You have stopped asking why the maths works and are only chasing the answer."],
       hi:["आप टीचर को समझ लेते हैं, पर अकेले सवाल शुरू नहीं कर पाते।",
           "आप सिर्फ़ formula याद करके नंबर ला रहे हैं, और सवाल घुमाते ही दिमाग खाली हो जाता है।",
           "आपने यह पूछना बंद कर दिया है कि maths काम कैसे करती है, और सिर्फ़ जवाब के पीछे भाग रहे हैं।"]},
  ask:{en:["Which fifth subject does the school offer with PCM — Computer Science, Physical Education, Economics?",
           "Can I keep an elective outside Science, and does it affect my board aggregate?",
           "What were last year's PCM board averages here, and how many students switched out?"],
       hi:["स्कूल PCM के साथ कौन-सा पाँचवाँ विषय देता है — Computer Science, Physical Education, Economics?",
           "क्या मैं Science के बाहर कोई elective रख सकता/सकती हूँ, और क्या उससे board aggregate पर असर पड़ता है?",
           "पिछले साल यहाँ PCM का board औसत क्या था, और कितने students ने stream बदली?"]}},

pcb:{ w:{b:0.50,t:0.35,m:0.15},
  name:{en:"PCB — Physics, Chemistry, Biology",hi:"PCB — Physics, Chemistry, Biology"},
  sub:{en:"Science stream with Biology, without Maths",hi:"Science stream, Biology के साथ, Maths के बिना"},
  blurb:{en:"You are drawn to living systems and to people who need care — that is the instinct PCB rewards. It is the route to MBBS, dentistry, veterinary science, nursing, physiotherapy, biotech and life-science research. Note that dropping Maths does close engineering and some economics degrees, so choose it deliberately.",
         hi:"आपको जीवित चीज़ें और देखभाल के ज़रूरतमंद लोग खींचते हैं — PCB इसी सोच को इनाम देता है। इससे MBBS, dentistry, veterinary science, nursing, physiotherapy, biotech और life-science research के रास्ते खुलते हैं। ध्यान रखें कि Maths छोड़ने से engineering और कुछ economics डिग्री बंद हो जाती हैं, इसलिए यह सोच-समझकर चुनें।"},
  careers:[["career-as-doctor-mbbs.html","How to become a Doctor (MBBS)","Doctor (MBBS) कैसे बनें"],
           ["is-neet-right-for-you.html","Is NEET right for you?","क्या NEET आपके लिए सही है?"],
           ["career-as-psychologist.html","How to become a Psychologist","Psychologist कैसे बनें"],
           ["career-explorer.html","Explore every career","सभी careers देखें"]],
  looks:{en:["Biology becomes volume work — NCERT line by line, and diagrams you must be able to reproduce from memory.",
             "Physics does not get easier just because you dropped Maths; it stays the subject most PCB students struggle with.",
             "NEET is one exam, once a year, for a very small number of government seats — plan the backup courses from Class 11, not Class 12."],
         hi:["Biology में मात्रा का काम आ जाता है — NCERT की एक-एक लाइन, और ऐसे diagram जो याद से बनाने आने चाहिए।",
             "Maths छोड़ने से Physics आसान नहीं होती; PCB students को सबसे ज़्यादा दिक्कत इसी में आती है।",
             "NEET साल में एक बार होने वाली एक परीक्षा है, और सरकारी सीटें बहुत कम हैं — backup courses की योजना क्लास 11 से बनाएं, क्लास 12 से नहीं।"]},
  bad:{en:["You are re-reading Biology for hours and still cannot recall it a week later.",
           "You picked it for the word 'doctor' rather than for the biology itself.",
           "Physics has quietly become the subject you skip, and nobody has noticed yet."],
       hi:["आप घंटों Biology दोहराते हैं और हफ़्ते भर बाद भी याद नहीं रहती।",
           "आपने इसे 'doctor' शब्द के लिए चुना, biology के लिए नहीं।",
           "Physics चुपचाप वह विषय बन गई है जिसे आप छोड़ देते हैं, और किसी ने अभी ध्यान नहीं दिया।"]},
  ask:{en:["Does the school allow Maths as an additional subject alongside PCB, and at what cost to my timetable?",
           "Which allied-health and B.Sc pathways do seniors from this school actually take?",
           "Is the school's Biology practical work real lab work, or only record-file writing?"],
       hi:["क्या स्कूल PCB के साथ Maths अतिरिक्त विषय के रूप में लेने देता है, और इससे timetable पर क्या असर पड़ेगा?",
           "इस स्कूल के seniors असल में कौन-से allied-health और B.Sc रास्ते चुनते हैं?",
           "क्या स्कूल का Biology practical असली lab work है, या सिर्फ़ record file लिखना?"]}},

pcmb:{ w:{b:0.35,t:0.25,m:0.40},
  name:{en:"PCM + Biology — all four sciences",hi:"PCM + Biology — चारों विज्ञान विषय"},
  sub:{en:"The heaviest combination. Keeps both NEET and JEE open.",hi:"सबसे भारी combination. NEET और JEE दोनों खुले रखता है।"},
  blurb:{en:"Maths and Biology both pull at you, and your answers say you have the appetite for the load. Taking all four keeps engineering and medicine open for one more year — but it is genuinely the hardest timetable in school, and it only works if you use the year to actually decide rather than to postpone deciding.",
         hi:"Maths और Biology दोनों आपको खींचते हैं, और आपके जवाब बताते हैं कि आपमें इतना बोझ उठाने का दम है। चारों विषय लेने से engineering और medicine एक और साल के लिए खुले रहते हैं — पर यह स्कूल का सबसे मुश्किल timetable है, और यह तभी काम करता है जब आप उस साल में सच में फैसला करें, फैसला टालें नहीं।"},
  careers:[["career-as-doctor-mbbs.html","How to become a Doctor (MBBS)","Doctor (MBBS) कैसे बनें"],
           ["career-as-data-scientist.html","How to become a Data Scientist","Data Scientist कैसे बनें"],
           ["career-as-software-engineer.html","How to become a Software Engineer","Software Engineer कैसे बनें"],
           ["doctor-vs-engineer.html","Doctor vs Engineer, compared","Doctor vs Engineer, तुलना"]],
  looks:{en:["Five or six subjects instead of five, with two different competitive syllabi running in parallel.",
             "Most students who take all four drop one by the middle of Class 11 — that is normal and it is not failure.",
             "Set yourself a hard deadline to choose, ideally before the Class 11 finals."],
         hi:["पाँच के बजाय पाँच-छह विषय, और साथ में दो अलग competitive syllabus एक साथ चलते हैं।",
             "चारों लेने वाले ज़्यादातर students क्लास 11 के बीच में एक विषय छोड़ देते हैं — यह सामान्य है, नाकामी नहीं।",
             "खुद को फैसला करने की एक पक्की तारीख दें, बेहतर हो क्लास 11 की final से पहले।"]},
  bad:{en:["You are keeping all four to avoid a decision rather than to inform one.",
           "Sleep, food and everything outside school have quietly disappeared.",
           "You are average in all four instead of strong in three."],
       hi:["आप चारों इसलिए रखे हुए हैं कि फैसला न करना पड़े, न कि फैसला बेहतर करने के लिए।",
           "नींद, खाना और स्कूल के बाहर की हर चीज़ चुपचाप गायब हो गई है।",
           "आप तीन में मज़बूत होने के बजाय चारों में औसत हो गए हैं।"]},
  ask:{en:["Does the school actually permit all four, and does the timetable physically allow it?",
           "What is the last date I can drop one subject without a board penalty?",
           "How many students here took all four last year, and how many finished with all four?"],
       hi:["क्या स्कूल सच में चारों की इजाज़त देता है, और क्या timetable में यह संभव है?",
           "बिना board penalty के मैं किस तारीख तक एक विषय छोड़ सकता/सकती हूँ?",
           "पिछले साल यहाँ कितने students ने चारों लिए, और कितनों ने चारों के साथ पूरा किया?"]}},

com_m:{ w:{c:0.60,m:0.30,t:0.10},
  name:{en:"Commerce with Maths",hi:"Commerce, Maths के साथ"},
  sub:{en:"Accounts, Business Studies, Economics + Maths",hi:"Accounts, Business Studies, Economics + Maths"},
  blurb:{en:"You are drawn to money, markets and how organisations actually work, and you are comfortable enough with numbers to keep the quantitative doors open. Commerce with Maths is the strongest version of this stream: it keeps CA, economics honours, BBA, actuarial science, data and finance roles all in reach.",
         hi:"आपको पैसा, markets और संगठन असल में कैसे चलते हैं — यह खींचता है, और नंबरों के साथ आप इतने सहज हैं कि quantitative दरवाज़े खुले रख सकें। Commerce with Maths इस stream का सबसे मज़बूत रूप है: CA, economics honours, BBA, actuarial science, data और finance — सब पहुँच में रहते हैं।"},
  careers:[["career-as-chartered-accountant.html","How to become a Chartered Accountant","Chartered Accountant कैसे बनें"],
           ["career-as-data-scientist.html","How to become a Data Scientist","Data Scientist कैसे बनें"],
           ["career-as-digital-marketer.html","How to become a Digital Marketer","Digital Marketer कैसे बनें"],
           ["career-options-after-bcom.html","Career options after B.Com","B.Com के बाद career options"]],
  looks:{en:["Accountancy is a skill built by daily practice, not by reading — the students who fall behind fall behind quietly in Class 11.",
             "CA Foundation can begin right after Class 12, so Class 11 is not a free year if that is your target.",
             "Maths here is applied, but top economics and BBA programmes will still ask for it at the CUET level."],
         hi:["Accountancy रोज़ अभ्यास से बनने वाला हुनर है, पढ़ने से नहीं — जो पीछे रह जाते हैं वे क्लास 11 में चुपचाप पीछे रह जाते हैं।",
             "CA Foundation क्लास 12 के तुरंत बाद शुरू हो सकता है, इसलिए अगर वही लक्ष्य है तो क्लास 11 खाली साल नहीं है।",
             "यहाँ Maths applied है, पर अच्छे economics और BBA programmes CUET स्तर पर इसे फिर भी माँगते हैं।"]},
  bad:{en:["Your Accounts backlog has grown past a month and you have stopped opening the book.",
           "You liked the idea of business but not the detail work underneath it.",
           "You chose Commerce because it looked like the lighter option, and it has not been."],
       hi:["आपका Accounts का backlog एक महीने से ज़्यादा हो गया है और आपने किताब खोलना बंद कर दिया है।",
           "आपको business का खयाल पसंद था, पर उसके नीचे का बारीक काम नहीं।",
           "आपने Commerce इसलिए चुना कि यह आसान option लगा, और वह निकला नहीं।"]},
  ask:{en:["Is Maths offered with Commerce here, or only as an outside subject?",
           "Which fifth subject do most Commerce students take, and why?",
           "Does the school support CA Foundation or CUET preparation in any way?"],
       hi:["क्या यहाँ Commerce के साथ Maths मिलती है, या सिर्फ़ बाहरी विषय के रूप में?",
           "ज़्यादातर Commerce students कौन-सा पाँचवाँ विषय लेते हैं, और क्यों?",
           "क्या स्कूल CA Foundation या CUET की तैयारी में किसी तरह मदद करता है?"]}},

com:{ w:{c:0.70,h:0.20,m:0.10},
  name:{en:"Commerce without Maths",hi:"Commerce, Maths के बिना"},
  sub:{en:"Accounts, Business Studies, Economics",hi:"Accounts, Business Studies, Economics"},
  blurb:{en:"Business, money and enterprise genuinely interest you, and heavy Maths does not. That combination is entirely workable — CA, company secretaryship, B.Com, hotel management, marketing and entrepreneurship are all reachable without Class 11 Maths. Just go in knowing that a few economics-honours and analytics routes will ask for it later.",
         hi:"Business, पैसा और उद्यम आपको सच में पसंद हैं, और भारी Maths नहीं। यह combination बिलकुल चल सकता है — CA, company secretaryship, B.Com, hotel management, marketing और entrepreneurship सब बिना क्लास 11 Maths के पहुँच में हैं। बस यह जानकर जाएं कि कुछ economics-honours और analytics रास्ते बाद में Maths माँगेंगे।"},
  careers:[["career-as-chartered-accountant.html","How to become a Chartered Accountant","Chartered Accountant कैसे बनें"],
           ["career-as-digital-marketer.html","How to become a Digital Marketer","Digital Marketer कैसे बनें"],
           ["career-options-after-bcom.html","Career options after B.Com","B.Com के बाद career options"],
           ["career-explorer.html","Explore every career","सभी careers देखें"]],
  looks:{en:["Accountancy still uses arithmetic every day — dropping Maths is not the same as dropping numbers.",
             "Economics at Class 11 is more reasoning and interpretation than calculation, and many students enjoy it more than they expected.",
             "Build something real alongside — a small resale page, an event, a freelance client. In Commerce, evidence beats marks surprisingly early."],
         hi:["Accountancy में रोज़ अंकगणित लगता है — Maths छोड़ना नंबर छोड़ना नहीं है।",
             "क्लास 11 की Economics में calculation से ज़्यादा तर्क और व्याख्या है, और कई students को यह उम्मीद से ज़्यादा पसंद आती है।",
             "साथ-साथ कुछ असली बनाएं — छोटा resale page, कोई event, कोई freelance client। Commerce में सबूत मार्क्स से जल्दी काम आ जाता है।"]},
  bad:{en:["You picked Commerce to escape Maths, and now nothing in it interests you either.",
           "You are treating Class 11 as a rest year because the pressure feels lower.",
           "You are drifting toward a generic B.Com with no idea what comes after it."],
       hi:["आपने Maths से बचने के लिए Commerce चुना, और अब इसमें भी कुछ दिलचस्प नहीं लगता।",
           "दबाव कम लगने के कारण आप क्लास 11 को आराम का साल बना रहे हैं।",
           "आप एक साधारण B.Com की ओर बह रहे हैं, बिना यह जाने कि उसके बाद क्या।"]},
  ask:{en:["If I skip Maths now, can I add it back in Class 12, and what does that cost me?",
           "Which universities that interest me require Class 12 Maths for their Commerce courses?",
           "Does the school offer Entrepreneurship or Informatics Practices as a fifth subject?"],
       hi:["अगर मैं अभी Maths नहीं लूँ, तो क्या क्लास 12 में वापस ले सकता/सकती हूँ, और उसका क्या नुकसान है?",
           "मुझे जो universities पसंद हैं, उनके Commerce courses के लिए क्या क्लास 12 Maths ज़रूरी है?",
           "क्या स्कूल पाँचवें विषय के रूप में Entrepreneurship या Informatics Practices देता है?"]}},

hum:{ w:{h:0.75,c:0.10,b:0.15},
  name:{en:"Humanities / Arts",hi:"Humanities / Arts (कला)"},
  sub:{en:"History, Political Science, Psychology, Literature, Sociology",hi:"History, Political Science, Psychology, Literature, Sociology"},
  blurb:{en:"People, language, ideas and meaning are where your attention actually goes. Humanities is the stream most misjudged in India and the one that has changed most: it leads to law, psychology, design, media, civil services, policy, education and the social sciences, and its graduates are not short of work.",
         hi:"लोग, भाषा, विचार और मायने — आपका ध्यान असल में यहीं जाता है। भारत में Humanities सबसे ज़्यादा गलत समझी जाने वाली stream है और सबसे ज़्यादा बदली भी है: इससे law, psychology, design, media, civil services, policy, education और social sciences के रास्ते खुलते हैं, और इनके graduates को काम की कमी नहीं है।"},
  careers:[["career-as-lawyer.html","How to become a Lawyer","Lawyer कैसे बनें"],
           ["career-as-psychologist.html","How to become a Psychologist","Psychologist कैसे बनें"],
           ["career-as-civil-services-ias.html","How to join the Civil Services (IAS)","Civil Services (IAS) कैसे join करें"],
           ["career-as-product-designer.html","How to become a Product Designer","Product Designer कैसे बनें"],
           ["is-clat-right-for-you.html","Is CLAT right for you?","क्या CLAT आपके लिए सही है?"]],
  looks:{en:["The work is writing — long answers, arguments, sources. Reading speed and clear expression become your real marks.",
             "CLAT, CUET, NID/NIFT and design portfolios are the entrance routes, and they start in Class 11, not Class 12.",
             "Psychology and Economics both appear here and both are more demanding than their reputation suggests."],
         hi:["यहाँ काम लिखने का है — लंबे जवाब, तर्क, स्रोत। पढ़ने की रफ़्तार और साफ़ अभिव्यक्ति ही आपके असली नंबर बनते हैं।",
             "CLAT, CUET, NID/NIFT और design portfolio ही प्रवेश के रास्ते हैं, और ये क्लास 11 से शुरू होते हैं, क्लास 12 से नहीं।",
             "Psychology और Economics दोनों यहाँ मिलती हैं और दोनों अपनी छवि से ज़्यादा मेहनत माँगती हैं।"]},
  bad:{en:["You chose it as the low-effort option and are now doing very little.",
           "You are memorising answers instead of building arguments — that ceiling arrives fast.",
           "A year has passed with no entrance exam, portfolio or internship started."],
       hi:["आपने इसे कम मेहनत वाला option समझकर चुना और अब बहुत कम कर रहे हैं।",
           "आप तर्क बनाने के बजाय जवाब रट रहे हैं — इसकी सीमा जल्दी आ जाती है।",
           "एक साल बीत गया और कोई entrance exam, portfolio या internship शुरू नहीं हुआ।"]},
  ask:{en:["Which Humanities electives does the school actually run — and which ones only exist on paper?",
           "Is Psychology or Legal Studies available, and who teaches it?",
           "Can I take Maths or Economics alongside if I want the CUET and civil-services routes open?"],
       hi:["स्कूल असल में कौन-से Humanities electives चलाता है — और कौन-से सिर्फ़ कागज़ पर हैं?",
           "क्या Psychology या Legal Studies उपलब्ध है, और उसे कौन पढ़ाता है?",
           "अगर मुझे CUET और civil-services के रास्ते खुले रखने हैं तो क्या मैं साथ में Maths या Economics ले सकता/सकती हूँ?"]}},

hum_m:{ w:{h:0.55,m:0.30,c:0.15},
  name:{en:"Humanities with Maths or Economics",hi:"Humanities, Maths या Economics के साथ"},
  sub:{en:"The analytical version of Arts",hi:"Arts का विश्लेषणात्मक रूप"},
  blurb:{en:"You think like a humanities student but you have not lost your appetite for numbers, and that is a genuinely strong combination. Keeping Maths or Economics here opens economics honours, data-driven policy, the quantitative side of the civil services exam, and law-plus-economics degrees — while you still spend your days on people and ideas.",
         hi:"आप सोचते humanities वाले छात्र की तरह हैं, पर नंबरों में आपकी रुचि बची हुई है — और यह सचमुच मज़बूत combination है। यहाँ Maths या Economics रखने से economics honours, data-driven policy, civil-services परीक्षा का quantitative हिस्सा, और law-plus-economics डिग्री खुलती हैं — और आपका दिन फिर भी लोगों और विचारों के साथ बीतता है।"},
  careers:[["career-as-civil-services-ias.html","How to join the Civil Services (IAS)","Civil Services (IAS) कैसे join करें"],
           ["career-as-lawyer.html","How to become a Lawyer","Lawyer कैसे बनें"],
           ["career-as-data-scientist.html","How to become a Data Scientist","Data Scientist कैसे बनें"],
           ["career-as-psychologist.html","How to become a Psychologist","Psychologist कैसे बनें"],
           ["lawyer-vs-civil-services.html","Lawyer vs Civil Services","Lawyer vs Civil Services"]],
  looks:{en:["You carry a full Humanities writing load and a Maths or Economics paper on top — protect the timetable early.",
             "Economics honours at the better universities is far more mathematical than Class 12 Economics suggests.",
             "This is the quietest strong route to policy, research and the analytical civil-services papers."],
         hi:["आप पूरा Humanities लेखन-भार और ऊपर से Maths या Economics का पेपर उठाते हैं — timetable की रक्षा शुरू से करें।",
             "अच्छी universities में Economics honours क्लास 12 की Economics से कहीं ज़्यादा गणितीय है।",
             "Policy, research और civil-services के विश्लेषणात्मक पेपरों तक यह सबसे चुपचाप मज़बूत रास्ता है।"]},
  bad:{en:["The Maths paper has become the one you are always about to catch up on.",
           "You added it for the option value and never actually use it.",
           "Your writing subjects are slipping because the numbers are eating the week."],
       hi:["Maths का पेपर वही बन गया है जिसे आप हमेशा 'बाद में' पूरा करने वाले हैं।",
           "आपने इसे सिर्फ़ option खुला रखने के लिए लिया और असल में कभी इस्तेमाल नहीं किया।",
           "आपके लेखन वाले विषय पिछड़ रहे हैं क्योंकि नंबर पूरा हफ़्ता खा रहे हैं।"]},
  ask:{en:["Can Maths be combined with Humanities in this school's timetable at all?",
           "Is Applied Maths an option, and do the universities I want accept it?",
           "Which teacher handles Economics for Humanities students here?"],
       hi:["क्या इस स्कूल के timetable में Humanities के साथ Maths ली जा सकती है?",
           "क्या Applied Maths एक विकल्प है, और क्या मुझे जो universities चाहिए वे उसे मानती हैं?",
           "यहाँ Humanities students की Economics कौन पढ़ाता है?"]}}
};
var COMBO_ORDER = ["pcb","hum","com_m","pcm","hum_m","com","pcmb"];

/* Tie-break order, used only when two combinations score identically.
   Deliberately not Science-first: the old quiz resolved every tie to
   Science, which quietly pushed students toward the stream they are
   already over-pushed into. */

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */
var AXIS_MAX = (function(){
  var max = {m:0,t:0,b:0,c:0,h:0};
  Q.forEach(function(q){
    if(q.stage !== "interest") return;
    AXES.forEach(function(a){
      var best = 0;
      q.o.forEach(function(o){ if(o.v && o.v[a] > best) best = o.v[a]; });
      max[a] += best;
    });
  });
  return max;
})();

function compute(answers){
  var raw = {m:0,t:0,b:0,c:0,h:0};
  var reality = {}, avoidMaths = false, avoidBio = false, pressure = false, appetite = null;

  Q.forEach(function(q, i){
    var pick = answers[i];
    if(pick === null || pick === undefined || pick < 0) return;
    var o = q.o[pick];
    if(!o) return;
    if(o.v) for(var a in o.v) raw[a] += o.v[a];
    if(o.appetite) appetite = o.appetite;
    if(o.flagAvoidMaths) avoidMaths = true;
    if(o.flagAvoidBio) avoidBio = true;
    if(o.flagPressure) pressure = true;
    if(q.stage === "reality") reality[q.key] = o.band || o.level || null;
  });

  var axes = {};
  AXES.forEach(function(a){ axes[a] = AXIS_MAX[a] ? raw[a] / AXIS_MAX[a] : 0; });

  /* A stated wish to avoid Maths or Biology outranks every inferred
     signal — it is the one thing the student said in plain words. */
  var damp = {pcm:1,pcb:1,pcmb:1,com_m:1,com:1,hum:1,hum_m:1};
  if(avoidMaths){ damp.pcm*=0.45; damp.pcmb*=0.35; damp.com_m*=0.70; damp.hum_m*=0.55; }
  if(avoidBio){ damp.pcb*=0.35; damp.pcmb*=0.30; }
  if(appetite === "high" || appetite === "applied"){
    /* They asked to keep Maths. Dropping it is now the wrong recommendation
       however commerce-heavy the rest of the answers look, and a Humanities
       student who likes Maths belongs in the analytical version of it. */
    damp.com *= 0.65; damp.hum *= 0.88;
  }
  /* All four sciences is the heaviest timetable in school. Only surface
     it when the appetite for both sides is real. */
  if(!(axes.m >= 0.55 && axes.b >= 0.55 && reality.effort === "high")) damp.pcmb *= 0.40;

  var ranked = Object.keys(COMBOS).map(function(k){
    var w = COMBOS[k].w, fit = 0;
    for(var a in w) fit += w[a] * axes[a];
    return { key:k, fit: fit * damp[k] };
  });
  ranked.sort(function(x, y){
    if(y.fit !== x.fit) return y.fit - x.fit;
    return COMBO_ORDER.indexOf(x.key) - COMBO_ORDER.indexOf(y.key);
  });

  /* Relative to the leader, so the bars read as "how close is this to
     your best fit" rather than as an absolute score out of nothing. */
  var lead = ranked[0].fit || 1;
  ranked.forEach(function(r){ r.rel = Math.round(r.fit / lead * 100); });

  return {
    axes: axes, ranked: ranked, reality: reality,
    pressure: pressure, avoidMaths: avoidMaths, avoidBio: avoidBio,
    /* Two combinations within 8 points of each other is a genuine
       two-way result, and saying so is more useful than a false winner. */
    twoWay: ranked[1] && ranked[1].rel >= 92
  };
}

function badgeFor(key, r){
  var m = r.reality.maths, s = r.reality.science, e = r.reality.effort;
  var level = "strong";
  function atMost(l){ if(l === "stretch") level = "stretch";
    else if(l === "plan" && level !== "stretch") level = "plan"; }
  if(key === "pcm" || key === "pcmb"){
    if(m === "weak") atMost("stretch"); else if(m === "low") atMost("plan");
  }
  if(key === "pcb" || key === "pcmb"){
    if(s === "weak") atMost("stretch"); else if(s === "low") atMost("plan");
  }
  if(key === "pcmb" && e !== "high") atMost("plan");
  if(key === "com_m" && m === "weak") atMost("plan");
  return level;
}

/* ------------------------------------------------------------------ */
/* Reality-check copy                                                  */
/* ------------------------------------------------------------------ */
function realityNotes(r){
  var top = r.ranked[0].key, m = r.reality.maths, s = r.reality.science, e = r.reality.effort;
  var sci = (top === "pcm" || top === "pcb" || top === "pcmb");
  var needsMaths = (top === "pcm" || top === "pcmb" || top === "com_m");
  var needsSci = (top === "pcb" || top === "pcmb");
  var out = [];
  function add(en, hi){ out.push(LANG === "hi" ? hi : en); }

  if(!m && !s){
    add("You skipped the marks questions, so this reflects your interests only. Bring your last report card to any counselling conversation — marks change the plan, not the direction.",
        "आपने मार्क्स वाले सवाल छोड़ दिए, इसलिए यह सिर्फ़ आपकी रुचि दिखाता है। किसी भी counselling बातचीत में अपनी पिछली report card लाएं — मार्क्स से plan बदलता है, दिशा नहीं।");
  }

  if(needsMaths && m === "weak"){
    add("Your interests point here, but Maths below 50% means Class 11 will move faster than you can currently follow. That is fixable and it is not a verdict — but it needs a plan starting now, not in June. Spend the break rebuilding Class 9–10 algebra, trigonometry and coordinate geometry. If it starts clicking, this is yours. If it does not, that is useful information too.",
        "आपकी रुचि यहीं इशारा करती है, पर Maths में 50% से कम का मतलब है कि क्लास 11 आपकी मौजूदा रफ़्तार से तेज़ चलेगी। यह ठीक हो सकता है और यह कोई फैसला नहीं है — पर plan अभी चाहिए, जून में नहीं। छुट्टियों में क्लास 9–10 की algebra, trigonometry और coordinate geometry दोबारा बनाएं। अगर समझ आने लगे, तो यह रास्ता आपका है। और अगर नहीं, तो यह भी काम की जानकारी है।");
  }else if(needsMaths && m === "low"){
    add("50–69% in Maths usually means the fundamentals are patchy rather than missing. Close those gaps over the break and this combination works — most students who struggle in Class 11 Maths were carrying Class 9 gaps, not a lack of ability.",
        "Maths में 50–69% का आमतौर पर मतलब है कि बुनियाद अधूरी है, गायब नहीं। छुट्टियों में वे कमियाँ भर लें और यह combination चल जाएगा — क्लास 11 की Maths में अटकने वाले ज़्यादातर students क्लास 9 की कमियाँ ढो रहे होते हैं, काबिलियत की कमी नहीं।");
  }else if(needsMaths && m === "high"){
    add("Your interest and your Maths marks point the same way. That agreement is the strongest single signal in this whole quiz — trust it.",
        "आपकी रुचि और आपके Maths के मार्क्स एक ही दिशा में इशारा करते हैं। पूरी क्विज़ में यही सबसे मज़बूत संकेत है — इस पर भरोसा करें।");
  }

  if(needsSci && s === "weak"){
    add("Science below 50% alongside a Biology-heavy choice is worth taking seriously. PCB is a volume subject — it rewards steady daily work more than brilliance, so the question is not whether you are capable but whether you are ready to work like that for two years.",
        "Biology वाले विकल्प के साथ Science में 50% से कम को गंभीरता से लेना चाहिए। PCB मात्रा वाला विषय है — यह प्रतिभा से ज़्यादा रोज़ की लगातार मेहनत को इनाम देता है, इसलिए सवाल काबिलियत का नहीं, बल्कि यह है कि क्या आप दो साल ऐसे काम करने को तैयार हैं।");
  }else if(needsSci && s === "high"){
    add("Strong Science marks and a genuine pull toward living systems is exactly the combination PCB is designed for.",
        "अच्छे Science के मार्क्स और जीव-जगत की ओर सच्चा झुकाव — PCB ठीक इसी combination के लिए बना है।");
  }

  if(sci && e === "low"){
    add("You said you do not want a coaching grind, and you do not have to have one. Science without NEET or JEE is a real path: B.Sc and research, allied health, biotech, design, agriculture, defence and the CUET-based degrees. Choose the stream for the subjects first, then choose the exam separately.",
        "आपने कहा कि आपको coaching की पिसाई नहीं चाहिए, और यह ज़रूरी भी नहीं है। NEET या JEE के बिना Science एक असली रास्ता है: B.Sc और research, allied health, biotech, design, agriculture, defence और CUET वाली डिग्रियाँ। पहले विषयों के आधार पर stream चुनें, परीक्षा अलग से चुनें।");
  }else if(sci && e === "unsure"){
    add("You are not sure about the coaching load yet, and that is honest at this stage. Decide it before Class 11 begins though — it changes the school you want, the timetable you ask for, and how much of your week is already spoken for.",
        "Coaching के बोझ को लेकर आप अभी तय नहीं कर पाए हैं, और इस समय यह ईमानदारी है। पर इसे क्लास 11 शुरू होने से पहले तय कर लें — इससे तय होता है कि आपको कौन-सा स्कूल चाहिए, कैसा timetable माँगना है, और आपका कितना हफ़्ता पहले से बुक है।");
  }

  if(top === "com_m" && m === "weak"){
    add("Commerce with Maths is your lean, but with Maths below 50% the safer opening move is to start Commerce without it and add Applied Maths only if the first term goes well. You lose almost nothing by waiting one term to decide.",
        "आपका झुकाव Commerce with Maths की ओर है, पर Maths 50% से कम होने पर सुरक्षित शुरुआत यह है कि पहले बिना Maths के Commerce लें और पहला term अच्छा जाने पर ही Applied Maths जोड़ें। एक term रुककर फैसला करने में आपका लगभग कुछ नहीं जाता।");
  }

  if((top === "hum" || top === "hum_m") && (m === "high" || s === "high")){
    add("Your marks would let you pick any stream in the school, which means nobody can tell you that Humanities is what was left over. You are choosing it — that is a completely different thing, and it is worth saying out loud at home.",
        "आपके मार्क्स आपको स्कूल की कोई भी stream लेने देते हैं, यानी कोई यह नहीं कह सकता कि Humanities वही है जो बच गई थी। आप इसे चुन रहे हैं — यह बिलकुल अलग बात है, और इसे घर पर साफ़ शब्दों में कहना ज़रूरी है।");
  }

  if(r.avoidMaths && (top === "pcm" || top === "pcmb")){
    add("One contradiction worth noticing: your interests lean strongly technical, but you also said you would rather keep Maths to a minimum. Those two cannot both hold in PCM. It is worth working out which one is the real you before June.",
        "एक विरोधाभास ध्यान देने लायक है: आपकी रुचि साफ़ तौर पर तकनीकी है, पर आपने यह भी कहा कि Maths कम से कम रखना चाहेंगे। PCM में ये दोनों बातें एक साथ नहीं चल सकतीं। जून से पहले यह तय करना ज़रूरी है कि इनमें से असली आप कौन हैं।");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
var answers = [], cur = 0, started = false, result = null;
/* Guards the beat between tapping an option and the next question arriving,
   so a fast tapper (or a held key) cannot answer two questions with one
   intent. */
var advancing = false;
var CONFIRM_MS = 120;

function reduceMotion(){
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
function track(name, params){ if(window.gtag) window.gtag("event", name, params || {}); }

/* Answers encode to one character each, so a result is a short link a
   student can paste to a parent and a parent can open unchanged. */
function encodeAnswers(){
  return Q.map(function(_, i){
    var a = answers[i];
    return (a === null || a === undefined || a < 0) ? "x" : String(a);
  }).join("");
}
function decodeAnswers(code){
  if(typeof code !== "string" || code.length !== Q.length) return null;
  var out = [];
  for(var i = 0; i < Q.length; i++){
    var ch = code.charAt(i);
    if(ch === "x"){ out.push(-1); continue; }
    var n = parseInt(ch, 10);
    if(isNaN(n) || n < 0 || n >= Q[i].o.length) return null;
    out.push(n);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Quiz rendering                                                      */
/* ------------------------------------------------------------------ */
function renderQ(dir){
  var q = Q[cur];
  var pct = cur / Q.length * 100;
  var bar = $("bar");
  /* A floor on the visible fill only — an empty track on question one reads
     as a broken bar. aria-valuenow stays truthful. */
  bar.style.width = Math.max(pct, 2.5) + "%";
  bar.parentNode.setAttribute("aria-valuenow", String(Math.round(pct)));

  $("pcount").textContent = t("question") + " " + (cur + 1) + " " + t("of") + " " + Q.length;
  $("stagetag").textContent =
    q.stage === "reality" ? t("stageReality") :
    q.stage === "honesty" ? t("stageHonesty") : t("stageInterest");
  $("qtext").textContent = q.q[LANG];

  var help = $("qhelp");
  if(q.help){ help.textContent = q.help[LANG]; help.classList.remove("hide"); }
  else help.classList.add("hide");

  var box = $("opts");
  box.innerHTML = "";
  box.setAttribute("aria-label", q.q[LANG]);
  q.o.forEach(function(opt, i){
    var b = document.createElement("button");
    b.className = "opt";
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", answers[cur] === i ? "true" : "false");
    b.innerHTML = '<span class="key" aria-hidden="true">' + (i + 1) + "</span><span>" + esc(opt[LANG]) + "</span>";
    b.style.setProperty("--i", i);
    b.onclick = function(){ choose(i); };
    box.appendChild(b);
  });

  /* Restarting the animation needs the class gone, a reflow, then the class
     back — the question text and stage tag are the same elements every time,
     so nothing replays on its own. */
  var zone = $("qzone");
  zone.classList.remove("q-in", "q-rev");
  void zone.offsetWidth;
  zone.classList.add("q-in");
  if(dir < 0) zone.classList.add("q-rev");

  var skip = $("skipBtn");
  if(q.skippable){ skip.classList.remove("hide"); skip.textContent = t("skip"); }
  else skip.classList.add("hide");

  $("backBtn").disabled = cur === 0;
  $("backBtn").textContent = t("back");

  if(!started){ started = true; track("stream_quiz_started", {event_category:"lead_tools"}); }
}

function advance(){
  if(cur < Q.length - 1){
    cur++;
    renderQ(1);
    /* On a phone the next question's text lands above the fold after a
       tap near the bottom of the list. Pull the card back into view. */
    $("quiz").scrollIntoView({ block:"start", behavior:"smooth" });
  }else finish();
}

function choose(i){
  if(advancing) return;
  answers[cur] = i;
  /* Per-question events: without them there is no way to see which
     question people quit on, which is the only number that tells you
     what to fix next. */
  track("stream_quiz_progress", {
    event_category:"lead_tools",
    event_label:"q" + (cur + 1) + "_" + Q[cur].stage,
    value: cur + 1
  });

  /* Show the choice landing before replacing it. Without this the option you
     picked is gone before you have seen it register, which reads as a
     misfire on a phone. */
  var opts = $("opts").children;
  for(var k = 0; k < opts.length; k++) opts[k].setAttribute("aria-checked", k === i ? "true" : "false");
  if(opts[i]) opts[i].classList.add("confirm");

  if(reduceMotion()) return advance();
  advancing = true;
  setTimeout(function(){ advancing = false; advance(); }, CONFIRM_MS);
}
function skipQ(){ if(advancing) return; answers[cur] = -1; advance(); }
function goBack(){ if(advancing) return; if(cur > 0){ cur--; renderQ(-1); } }

/* 1–4 select an option, so a student on a laptop never has to reach for
   the mouse. Ignored while a form field has focus. */
document.addEventListener("keydown", function(e){
  if($("quiz").classList.contains("hide")) return;
  var tag = (e.target.tagName || "").toLowerCase();
  if(tag === "input" || tag === "select" || tag === "textarea") return;
  var n = parseInt(e.key, 10);
  if(!isNaN(n) && n >= 1 && n <= Q[cur].o.length) choose(n - 1);
});

/* ------------------------------------------------------------------ */
/* Result rendering                                                    */
/* ------------------------------------------------------------------ */
function finish(){
  result = compute(answers);
  $("quiz").classList.add("hide");
  $("result").classList.remove("hide");
  track("stream_quiz_completed", {
    event_category:"lead_tools",
    event_label: result.ranked[0].key,
    value: 1
  });
  try{ localStorage.setItem(STORE, JSON.stringify({ r: encodeAnswers(), ts: Date.now() })); }catch(err){}
  renderResult();
  $("result").focus({ preventScroll:true });
  window.scrollTo({ top:0, behavior:"smooth" });
}

function renderResult(){
  var r = result, top = r.ranked[0], combo = COMBOS[top.key];

  $("resTitle").textContent = (r.twoWay ? t("twoWay") : t("bestFit")) + ": " + combo.name[LANG];
  $("resBlurb").textContent = combo.blurb[LANG];

  /* Every combination, ranked, with an honest confidence badge. Showing
     the runner-up matters: for most students the second choice is the
     one they will actually argue about at home. */
  var html = "";
  r.ranked.forEach(function(row, idx){
    var c = COMBOS[row.key], badge = badgeFor(row.key, r);
    var label = badge === "stretch" ? t("badgeStretch") : badge === "plan" ? t("badgePlan") : t("badgeStrong");
    html += '<div class="fit' + (idx === 0 ? " top" : "") + '">' +
      '<div class="fhead"><span class="fname">' + esc(c.name[LANG]) + "</span>" +
      (idx < 3 && row.rel >= 55 ? '<span class="badge ' + badge + '">' + esc(label) + "</span>" : "") +
      "</div>" +
      '<div class="fsub">' + esc(c.sub[LANG]) + ' · <span class="pctn" data-to="' + row.rel + '">0</span>% ' + esc(t("relative")) + "</div>" +
      '<div class="track"><div class="fill" style="--w:' + row.rel + '%"></div></div></div>';
  });
  $("fitlist").innerHTML = html;

  var ax = "";
  AXES.forEach(function(a){
    var pct = Math.round(r.axes[a] * 100);
    ax += '<div class="axis"><div class="lab"><span>' + esc(AXIS_LABEL[a][LANG]) + '</span><span><span class="pctn" data-to="' + pct + '">0</span>%</span></div>' +
      '<div class="track"><div class="fill" style="--w:' + pct + '%"></div></div></div>';
  });
  $("axes").innerHTML = ax;

  var chips = $("chips");
  chips.innerHTML = "";
  combo.careers.forEach(function(c){
    var a = document.createElement("a");
    a.className = "chip";
    a.href = c[0];
    a.textContent = LANG === "hi" ? c[2] : c[1];
    chips.appendChild(a);
  });

  function list(id, items){
    $(id).innerHTML = items.map(function(x){ return "<li>" + esc(x) + "</li>"; }).join("");
  }
  list("looks", combo.looks[LANG]);
  list("bad", combo.bad[LANG]);
  list("ask", combo.ask[LANG]);

  var notes = realityNotes(r), rn = $("realityNote");
  if(notes.length){
    rn.classList.remove("hide");
    rn.innerHTML = "<b>" + esc(t("realityLabel")) + "</b>" +
      notes.map(function(n){ return "<p>" + esc(n) + "</p>"; }).join("");
  }else rn.classList.add("hide");

  var pn = $("pressureNote");
  if(r.pressure){
    pn.classList.remove("hide");
    pn.innerHTML = "<b>" + esc(t("pressureLabel")) + "</b>" + esc(t("pressure"));
  }else pn.classList.add("hide");

  playResult();
}

/* ------------------------------------------------------------------ */
/* Result reveal                                                       */
/* ------------------------------------------------------------------ */
function countUp(el){
  var to = parseInt(el.getAttribute("data-to"), 10) || 0;
  if(reduceMotion()){ el.textContent = to; return; }
  var start = null, dur = 950;
  requestAnimationFrame(function step(ts){
    if(start === null) start = ts;
    var t = Math.min(1, (ts - start) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if(t < 1) requestAnimationFrame(step);
  });
}

function playResult(){
  var res = $("result");

  /* The result is a lot of information at once. Cascading it gives the eye a
     reading order instead of one wall arriving whole. */
  var kids = res.children, shown = 0;
  for(var i = 0; i < kids.length; i++){
    if(kids[i].classList.contains("hide")) continue;
    /* Capped: the result is taller than a screen, and an uncapped stagger
       leaves the lower half invisible to anyone who scrolls straight down. */
    kids[i].style.animationDelay = (Math.min(shown, 7) * 0.05).toFixed(2) + "s";
    shown++;
  }
  res.classList.remove("reveal");
  void res.offsetWidth;
  res.classList.add("reveal");

  var top = res.querySelector(".fit.top");
  if(top) top.classList.add("pulse");

  var fills = res.querySelectorAll("#fitlist .fill, #axes .fill");
  var nums  = res.querySelectorAll(".pctn");
  function fill(){
    for(var i = 0; i < fills.length; i++) fills[i].style.width = fills[i].style.getPropertyValue("--w");
    for(var j = 0; j < nums.length; j++) countUp(nums[j]);
  }
  if(reduceMotion()) return fill();
  /* Two frames: the first commits width:0, the second gives the transition
     something to animate from. One frame and the bars snap. */
  requestAnimationFrame(function(){ requestAnimationFrame(fill); });
}

/* ------------------------------------------------------------------ */
/* Lead capture                                                        */
/* ------------------------------------------------------------------ */
function classLabel(){
  var sel = $("leadClass");
  return sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
}

function waMessage(fields){
  var top = COMBOS[result.ranked[0].key].name[LANG];
  var alt = COMBOS[result.ranked[1].key].name[LANG];
  return t("waMsg")
    .replace("{name}", fields.name)
    .replace("{class}", fields.klass)
    .replace("{res}", top)
    .replace("{alt}", alt)
    .replace("{email}", fields.email || t("notGiven"));
}

function submitLead(){
  var name = ($("leadName").value || "").trim();
  var klass = ($("leadClass").value || "").trim();
  var phone = ($("leadPhone").value || "").replace(/\D/g, "");
  var email = ($("leadEmail").value || "").trim();
  var err = $("leadErr");

  if(phone.length === 12 && phone.indexOf("91") === 0) phone = phone.slice(2);

  function fail(msg, focusId){
    err.textContent = msg;
    err.classList.remove("hide");
    $(focusId).focus();
  }
  if(name.length < 2) return fail(t("errName"), "leadName");
  if(!klass) return fail(t("errClass"), "leadClass");
  if(!/^[6-9]\d{9}$/.test(phone)) return fail(t("errPhone"), "leadPhone");
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(t("errEmail"), "leadEmail");
  err.classList.add("hide");

  var fields = { name:name, klass:classLabel(), email:email };
  var top = result.ranked[0], second = result.ranked[1];

  /* Send the record before handing off to WhatsApp. The old page only
     captured a lead when the WhatsApp button was tapped and WhatsApp
     actually opened — everyone on a shared or desktop browser was lost. */
  try{
    if(window.lumeCapture) window.lumeCapture({
      type: "stream-selector",
      name: name,
      phone: "+91" + phone,
      email: email,
      summary: "Stream Selector: " + COMBOS[top.key].name.en + " (runner-up " + COMBOS[second.key].name.en + ")",
      details: {
        language: LANG,
        klass: classLabel(),
        best: top.key,
        runnerUp: second.key,
        confidence: badgeFor(top.key, result),
        axes: result.axes,
        mathsBand: result.reality.maths || null,
        scienceBand: result.reality.science || null,
        effort: result.reality.effort || null,
        outsidePressure: result.pressure,
        resultLink: resultUrl()
      }
    });
  }catch(e){}

  track("stream_quiz_lead", {
    event_category:"lead_tools",
    event_label: top.key,
    value: 1
  });

  $("leadForm").classList.add("hide");
  $("leadOk").classList.remove("hide");
  window.open("https://wa.me/" + WA + "?text=" + encodeURIComponent(waMessage(fields)), "_blank", "noopener");
}

/* ------------------------------------------------------------------ */
/* Sharing                                                             */
/* ------------------------------------------------------------------ */
function resultUrl(){
  return location.origin + location.pathname + "?r=" + encodeAnswers();
}

function copyLink(){
  var url = resultUrl(), btn = $("copyBtn"), old = btn.textContent;
  function done(){
    btn.textContent = t("copied");
    setTimeout(function(){ btn.textContent = old; }, 2000);
    track("stream_quiz_share", { event_category:"lead_tools", event_label: result.ranked[0].key });
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done, function(){ window.prompt(t("copyCta"), url); });
  }else window.prompt(t("copyCta"), url);
}

function restart(){
  answers = []; cur = 0; result = null;
  try{ localStorage.removeItem(STORE); }catch(e){}
  if(location.search) history.replaceState(null, "", location.pathname);
  $("result").classList.remove("reveal");
  $("result").classList.add("hide");
  $("quiz").classList.remove("hide");
  $("leadForm").classList.remove("hide");
  $("leadOk").classList.add("hide");
  renderQ(1);
  window.scrollTo({ top:0, behavior:"smooth" });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function boot(){
  /* The static markup carries a plain-text copy of the questions so the
     page is not empty for crawlers or for anyone without JavaScript.
     Once we are running, the live quiz replaces it. */
  var stat = $("staticQuiz");
  if(stat) stat.parentNode.removeChild(stat);
  $("quizLive").classList.remove("hide");

  $("backBtn").addEventListener("click", goBack);
  $("skipBtn").addEventListener("click", skipQ);
  $("leadBtn").addEventListener("click", submitLead);
  $("copyBtn").addEventListener("click", copyLink);
  $("printBtn").addEventListener("click", function(){
    track("stream_quiz_print", { event_category:"lead_tools" });
    window.print();
  });
  $("retakeBtn").addEventListener("click", restart);

  var restored = null;
  if(/[?&]r=/.test(location.search)){
    /* A shared or bookmarked link reopens exactly as it was scored. Once a
       result link is present at all, a malformed one falls back to the quiz
       — never to whatever this browser happened to score last. */
    var m = /[?&]r=([0-9x]+)(&|$)/.exec(location.search);
    restored = m ? decodeAnswers(m[1]) : null;
  }else{
    /* Coming back from the WhatsApp hand-off should not land on a blank
       quiz. The Retake button is right there if they want to start over. */
    try{
      var saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if(saved && Date.now() - saved.ts < STORE_TTL) restored = decodeAnswers(saved.r);
      else if(saved) localStorage.removeItem(STORE);
    }catch(e){}
  }
  if(restored){
    answers = restored;
    started = true;
    result = compute(answers);
    $("quiz").classList.add("hide");
    $("result").classList.remove("hide");
    renderResult();
    track("stream_quiz_result_opened", { event_category:"lead_tools", event_label: result.ranked[0].key });
    return;
  }
  renderQ(1);
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

})();
