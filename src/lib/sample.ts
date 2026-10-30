import type { Block, ElementType, Lang, Scene, Script } from './types';
import { uid } from './types';
import { newScene } from './screenplay';

const b = (type: ElementType, text: string): Block => ({ id: uid(), type, text });
const scene = (heading: string, synopsis: string, blocks: Block[]): Scene => ({ ...newScene(heading), synopsis, blocks });

export function emptyScript(title: string, language: Lang): Script {
  const now = Date.now();
  return {
    id: uid(),
    title,
    language,
    titlePage: { title, writtenBy: '', basedOn: '', contact: '', draftDate: new Date().toLocaleDateString('en-IN') },
    scenes: [newScene(language === 'ta' ? 'INT. வீடு - பகல்' : language === 'ml' ? 'INT. വീട് - പകൽ' : 'INT. HOUSE - DAY')],
    characters: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** A short original sample in Malayalam, with one deliberate name variant (രാമൂ) to demo the consistency checker. */
export function sampleScript(): Script {
  const s = emptyScript('മഴക്കാലം', 'ml');
  s.titlePage = { title: 'മഴക്കാലം', writtenBy: 'Sample Writer', basedOn: '', contact: 'sample@example.com', draftDate: 'First draft' };
  s.characters = [
    { name: 'രാമു', description: 'ചായക്കടക്കാരൻ, 50 വയസ്സ്. Tea-shop owner.' },
    { name: 'ലക്ഷ്മി', description: 'സ്കൂൾ ടീച്ചർ. School teacher, 28.' },
  ];
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
