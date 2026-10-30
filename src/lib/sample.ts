import type { Block, ElementType, Lang, Scene, Script } from './types';
import { uid } from './types';
import { newScene } from './screenplay';

const b = (type: ElementType, text: string): Block => ({ id: uid(), type, text });
const scene = (heading: string, synopsis: string, blocks: Block[]): Scene => ({ ...newScene(heading), synopsis, blocks });

const defaultHeading = (language: Lang): string => {
  switch (language) {
    case 'ta': return 'INT. வீடு - பகல்';
    case 'ml': return 'INT. വീട് - പകൽ';
    case 'te': return 'INT. ఇల్లు - పగలు';
    case 'kn': return 'INT. ಮನೆ - ದಿನ';
    default: return 'INT. HOUSE - DAY';
  }
};

export function emptyScript(title: string, language: Lang): Script {
  const now = Date.now();
  return {
    id: uid(),
    title,
    language,
    titlePage: { title, writtenBy: '', basedOn: '', contact: '', draftDate: new Date().toLocaleDateString('en-IN') },
    scenes: [newScene(defaultHeading(language))],
    characters: [],
    stage: 'screenplay',
    revisionColor: 'white',
    idea: {
      seed: '',
      genre: 'Drama',
      logline: { protagonist: '', incitingIncident: '', goal: '', conflict: '' },
      pinned: true,
    },
    story: {
      prose: '',
      keyMoments: [],
    },
    synopsis: {
      prose: '',
      targetWords: 400,
      beats: [
        { id: uid(), name: 'Act I: Setup & Catalyst', summary: '' },
        { id: uid(), name: 'Act II: Conflict & Midpoint', summary: '' },
        { id: uid(), name: 'Act III: Climax & Resolution', summary: '' },
      ],
    },
    treatment: {
      scenes: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** A rich original sample in Malayalam showing the Writing Ladder and consistency checker. */
export function sampleScript(): Script {
  const s = emptyScript('മഴക്കാലം', 'ml');
  s.titlePage = { title: 'മഴക്കാലം', writtenBy: 'Sample Writer', basedOn: '', contact: 'sample@example.com', draftDate: 'First draft' };
  s.revisionColor = 'white';
  s.characters = [
    { name: 'രാമു', description: 'ചായക്കടക്കാരൻ, 50 വയസ്സ്. Tea-shop owner.' },
    { name: 'ലക്ഷ്മി', description: 'സ്കൂൾ ടീച്ചർ. School teacher, 28.' },
  ];

  // Stage 1: Idea (The Seed)
  s.idea = {
    seed: 'കനത്ത മഴയുള്ള ഒരു രാത്രിയിൽ ഒറ്റപ്പെട്ടുപോകുന്ന ഒരു സ്കൂൾ ടീച്ചറും ചായക്കടക്കാരനും തമ്മിലുള്ള സൗഹൃദം.',
    genre: 'Drama / Realistic',
    logline: {
      protagonist: 'ലക്ഷ്മി, ഗ്രാമത്തിലെ സ്കൂൾ ടീച്ചർ',
      incitingIncident: 'മഴയിൽ അവസാന ബസ് നഷ്ടപ്പെടുന്നു',
      goal: 'ഗ്രാമത്തിലെ വീട്ടിൽ സുരക്ഷിതമായി എത്തുക',
      conflict: 'കനത്ത കൊടുങ്കാറ്റും തകർന്ന റോഡുകളും',
    },
    pinned: true,
  };

  // Stage 2: Story (Kathai)
  s.story = {
    prose: 'പുറത്ത് കനത്ത മഴ പെയ്യുന്ന ഒരു സായാഹ്നം. കടൽത്തീര ഗ്രാമത്തിലെ രാമുവിന്റെ ചായക്കടയിൽ ആരും വരുന്നില്ല. രാമു തനിയെ ചായ അടിച്ചു കൊണ്ടിരിക്കുമ്പോൾ കുട മടക്കി ലക്ഷ്മി ടീച്ചർ കടയിലേക്ക് കയറിവരുന്നു. സ്കൂൾ വിട്ട് വീട്ടിലേക്ക് പോകാനുള്ള ബസ് കാത്തുനിൽക്കുകയാണ് അവർ. സംസാരിക്കുന്നതിനിടയിൽ, അവസാനത്തെ ബസ് സ്റ്റോപ്പിൽ നിർത്താതെ കടന്നുപോകുന്നു. ലക്ഷ്മി ഭയപ്പെടുന്നു. എന്നാൽ രാമു തന്റെ പഴയ സൈക്കിളിൽ ലക്ഷ്മിയെ സഹായിക്കാൻ തയ്യാറാകുന്നു. ആ യാത്രയിലൂടെ അവർ പരസ്പരം മനസ്സിലാക്കുന്നു.',
    keyMoments: [
      { id: uid(), title: 'ചായക്കടയിലെ കൂടിക്കാഴ്ച', note: 'ലക്ഷ്മി മഴ നനഞ്ഞു കടയിൽ കയറുന്നു', timeHint: 'രാവിലെ' },
      { id: uid(), title: 'ബസ് നഷ്ടപ്പെടുന്നു', note: 'അവസാന ബസ് നിർത്താതെ പോകുന്നു', timeHint: 'രാത്രി' },
      { id: uid(), title: 'യാത്രയും വിടവാങ്ങലും', note: 'രാമു ലക്ഷ്മിയെ വീട്ടിലെത്തിക്കുന്നു', timeHint: 'രാത്രി' },
    ],
  };

  // Stage 3: Synopsis
  s.synopsis = {
    prose: 'മഴക്കാലം ഒരു സാധാരണ മനുഷ്യന്റെയും സ്കൂൾ ടീച്ചറുടെയും ജീവിതത്തിലെ ഒരു രാത്രിയുടെ കഥ പറയുന്നു. കനത്ത മഴയിൽ ഒറ്റപ്പെട്ടുപോകുന്ന ലക്ഷ്മിയെ ചായക്കടക്കാരനായ രാമു സഹായിക്കാൻ തീരുമാനിക്കുന്നു. കൊടുങ്കാറ്റിലൂടെയുള്ള ആ രാത്രി യാത്ര അവരിൽ ഒരു പുതിയ സ്നേഹവും കരുണയും പകർന്നു നൽകുന്നു.',
    targetWords: 350,
    beats: [
      { id: uid(), name: 'Act I: Setup', summary: 'ലക്ഷ്മിയും രാമുവും തമ്മിലുള്ള ചായക്കടയിലെ പരിചയം.' },
      { id: uid(), name: 'Act II: Complication', summary: 'അവസാന ബസ് നഷ്ടപ്പെടുന്നു; കൊടുങ്കാറ്റിൽ വഴി തടസ്സപ്പെടുന്നു.' },
      { id: uid(), name: 'Act III: Resolution', summary: 'രാമു അവളെ ലക്ഷ്യത്തിലെത്തിക്കുന്നു; നന്ദി അറിയിക്കുന്നു.' },
    ],
  };

  // Stage 4: Treatment
  s.treatment = {
    scenes: [
      {
        id: uid(),
        slug: 'INT. ചായക്കട - രാവിലെ',
        description: 'പുറത്ത് കനത്ത മഴ. രാമു ചായ അടിക്കുന്നു. ലക്ഷ്മി നനഞ്ഞു കയറിവരുന്നു.',
        location: 'ചായക്കട',
        time: 'രാവിലെ',
        characters: ['രാമു', 'ലക്ഷ്മി'],
      },
      {
        id: uid(),
        slug: 'EXT. ബസ് സ്റ്റോപ്പ് - രാത്രി',
        description: 'ലക്ഷ്മി ബസ് കാത്തുനിൽക്കുന്നു. അവസാനത്തെ ബസ് നിർത്താതെ പോകുന്നു. രാമു സഹായിക്കാൻ എത്തുന്നു.',
        location: 'ബസ് സ്റ്റോപ്പ്',
        time: 'രാത്രി',
        characters: ['ലക്ഷ്മി', 'രാമു'],
      },
      {
        id: uid(),
        slug: 'INT. ലക്ഷ്മിയുടെ വീട് - രാത്രി',
        description: 'ലക്ഷ്മി സുരക്ഷിതമായി വീട്ടിലെത്തുന്നു. ജനലിലൂടെ പുറത്തേക്ക് നോക്കുന്നു.',
        location: 'ലക്ഷ്മിയുടെ വീട്',
        time: 'രാത്രി',
        characters: ['ലക്ഷ്മി'],
      },
    ],
  };

  // Stage 5: Screenplay
  s.scenes = [
    scene('INT. ചായക്കട - രാവിലെ', 'Ramu opens the shop in the rain; Lakshmi is his only customer.', [
      b('action', 'പുറത്ത് കനത്ത മഴ. രാമു ചായ അടിക്കുന്നു. കടയിൽ ആരുമില്ല.'),
      b('character', 'രാമു'),
      b('parenthetical', 'തനിയെ'),
      b('dialogue', 'ഇന്ന് ആരും വരില്ല.'),
      b('action', 'വാതിൽ തുറക്കുന്നു. കുട മടക്കിക്കൊണ്ട് ലക്ഷ്മി അകത്തേക്ക് കയറുന്നു.'),
      b('character', 'ലക്ഷ്മി'),
      b('parenthetical', 'ചിരിച്ചുകൊണ്ട്'),
      b('dialogue', 'ഞാൻ വന്നല്ലോ. ഒരു ചായ, please.'),
    ]),
    scene('EXT. ബസ് സ്റ്റോപ്പ് - രാത്രി', 'Lakshmi misses the last bus.', [
      b('action', 'ലക്ഷ്മി ബസ് കാത്തുനിൽക്കുന്നു. അവസാനത്തെ ബസ് നിർത്താതെ പോകുന്നു.'),
      b('character', 'രാമൂ (O.S.)'),
      b('dialogue', 'ടീച്ചറേ, ഞാൻ കൊണ്ടുവിടാം.'),
      b('transition', 'CUT TO:'),
    ]),
    scene('INT. ലക്ഷ്മിയുടെ വീട് - രാത്രി', '', [
      b('action', 'ലക്ഷ്മി ജനലിലൂടെ മഴ നോക്കി നിൽക്കുന്നു.'),
    ]),
  ];
  return s;
}
