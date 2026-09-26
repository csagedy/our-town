// The starter cast (P1.12): four characters with varied ages, skin and hair.
// P1.15 extends this to the 12-character cast and the Character Maker.
// colors override the worn pieces' default colours (slot vars, docs/rig.md).
import { P, SKINS, HAIRS } from '../palette.mjs';

export const CAST = [
  {
    id: 'girl9', label: 'girl, about 9', body: 'kid9', skin: SKINS.s4, hair: { style: 'puff', color: HAIRS.black },
    lashes: true, blush: false, sock: P.white,
    wear: { top: 'tee-stripe', bottom: 'leggings', over: 'apron', shoes: 'sneakers', hat: 'headband' },
    colors: { shoe: P.cream, 'shoe-sh': P.roseDeep },
    expr: 'happy',
  },
  {
    id: 'boy5', label: 'boy, about 5', body: 'kid5', skin: SKINS.s1, hair: { style: 'tufts', color: HAIRS.copper },
    lashes: false, blush: true, sock: P.rose,
    wear: { top: 'tee-star', bottom: 'shorts', back: 'towel-cape', shoes: 'sneakers' },
    colors: { 'shoe-sh': P.teal },
    expr: 'cheeky',
  },
  {
    id: 'grownup', label: 'grown-up', body: 'adult', skin: SKINS.s5, hair: { style: 'bun', color: HAIRS.black },
    lashes: true, blush: false, sock: P.cream,
    wear: { top: 'tee-stripe', bottom: 'pants', over: 'apron', shoes: 'boots' },
    colors: { top: P.teal, 'top-sh': P.tealDeep, 'top-2': P.cream, over: P.butter, 'over-sh': P.mustard, 'over-2': P.white, shoe: P.charDeep, 'shoe-sh': P.char },
    expr: 'happy',
  },
  {
    id: 'grandpa', label: 'grandpa', body: 'adult', skin: SKINS.s2, hair: { style: 'bald', color: HAIRS.grey }, facialHair: 'mustache',
    lashes: false, blush: true, sock: P.cream,
    wear: { top: 'cardigan', bottom: 'pants', shoes: 'sneakers', face: 'glasses' },
    colors: { top: P.sage, 'top-sh': P.sageDeep, 'top-2': P.cream, bot: P.brown, 'bot-sh': P.brownDeep, shoe: P.cream, 'shoe-sh': P.terra },
    expr: 'laughing',
  },
];
