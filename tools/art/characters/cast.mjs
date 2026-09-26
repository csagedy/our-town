// The starter cast (P1.15, docs/design.md 2.4): 12 characters of varied ages,
// skin tones, hair and body types. `name` is data for Zoe's optional text
// layer only (name tags, read aloud on tap): nothing needs reading to play.
// colors override the worn pieces' default colours (slot vars, docs/rig.md).
// The first four ids are the P1.12 cast (the kitchen seeds them).
import { P, SKINS, HAIRS } from '../palette.mjs';

export const CAST = [
  {
    id: 'girl9', name: 'Maya', label: 'girl, about 9', body: 'kid9', skin: SKINS.s4, hair: { style: 'puff', color: HAIRS.black },
    lashes: true, blush: false, sock: P.white,
    wear: { top: 'tee-stripe', bottom: 'leggings', over: 'apron', shoes: 'sneakers', hat: 'headband' },
    colors: { shoe: P.cream, 'shoe-sh': P.roseDeep },
    expr: 'happy',
  },
  {
    id: 'boy5', name: 'Leo', label: 'boy, about 5', body: 'kid5', skin: SKINS.s1, hair: { style: 'tufts', color: HAIRS.copper },
    lashes: false, blush: true, freckles: true, sock: P.rose,
    wear: { top: 'tee-star', bottom: 'shorts', back: 'towel-cape', shoes: 'sneakers' },
    colors: { 'shoe-sh': P.teal },
    expr: 'cheeky',
  },
  {
    id: 'grownup', name: 'Amara', label: 'mom', body: 'adult', skin: SKINS.s5, hair: { style: 'bun', color: HAIRS.black },
    lashes: true, blush: false, sock: P.cream, brows: 'soft',
    wear: { top: 'tee-stripe', bottom: 'pants', over: 'apron', shoes: 'boots' },
    colors: { top: P.teal, 'top-sh': P.tealDeep, 'top-2': P.cream, over: P.butter, 'over-sh': P.mustard, 'over-2': P.white, shoe: P.charDeep, 'shoe-sh': P.char },
    expr: 'happy',
  },
  {
    id: 'grandpa', name: 'Grandpa Joe', label: 'grandpa', body: 'elder', skin: SKINS.s2, hair: { style: 'bald', color: HAIRS.grey }, facialHair: 'mustache',
    lashes: false, blush: true, sock: P.cream, brows: 'bold',
    wear: { top: 'cardigan', bottom: 'pants', shoes: 'sneakers', face: 'glasses' },
    colors: { top: P.sage, 'top-sh': P.sageDeep, 'top-2': P.cream, bot: P.brown, 'bot-sh': P.brownDeep, shoe: P.cream, 'shoe-sh': P.terra },
    expr: 'laughing',
  },
  {
    id: 'girl5', name: 'Priya', label: 'girl, about 5', body: 'kid5', skin: SKINS.s8, hair: { style: 'braids', color: HAIRS.black },
    lashes: true, blush: true, sock: P.white, eyes: 'big',
    wear: { top: 'tee-dots', bottom: 'skirt', shoes: 'sandals', hat: 'bow' },
    colors: { top: P.butter, 'top-sh': P.mustard, 'top-2': P.berry, bot: P.teal, 'bot-sh': P.tealDeep, hat: P.berry, 'hat-sh': '#B9575B' },
    expr: 'happy',
  },
  {
    id: 'boy9', name: 'Kenji', label: 'boy, about 9', body: 'kid9', skin: SKINS.s7, hair: { style: 'short', color: HAIRS.black },
    lashes: false, blush: false, sock: P.white, eyes: 'almond',
    wear: { top: 'hoodie', bottom: 'pants', shoes: 'sneakers', face: 'square-glasses' },
    colors: { top: P.mustard, 'top-sh': P.mustardDeep, bot: P.charHi, 'bot-sh': P.char, 'shoe-sh': P.berry },
    expr: 'neutral',
  },
  {
    id: 'performer', name: 'Luna', label: 'teen performer', body: 'teen', skin: SKINS.s6, hair: { style: 'ponytail', color: HAIRS.lav },
    lashes: true, blush: true, sock: P.white, freckles: true,
    wear: { top: 'sparkle-top', bottom: 'tutu', shoes: 'boots', back: 'wings' },
    colors: { shoe: P.plum, 'shoe-sh': P.plumDeep },
    expr: 'singing',
  },
  {
    id: 'dad', name: 'Omar', label: 'dad', body: 'adult', skin: SKINS.s9, hair: { style: 'short', color: HAIRS.black }, facialHair: 'beard',
    lashes: false, blush: false, sock: P.cream, brows: 'bold',
    wear: { top: 'tee-star', bottom: 'pants', shoes: 'sneakers' },
    colors: { top: P.terra, 'top-sh': P.terraDeep, 'top-2': P.butter, 'shoe-sh': P.teal },
    expr: 'happy',
  },
  {
    id: 'grandma', name: 'Nana Rose', label: 'grandma', body: 'elder', skin: SKINS.s10, hair: { style: 'bun', color: HAIRS.white },
    lashes: true, blush: true, sock: P.cream, brows: 'thin',
    wear: { top: 'cardigan', bottom: 'skirt', shoes: 'boots', face: 'glasses' },
    colors: { top: P.rose, 'top-sh': P.roseDeep, 'top-2': P.cream, bot: P.plum, 'bot-sh': P.plumDeep, shoe: P.woodDark },
    expr: 'love',
  },
  {
    id: 'teacher', name: 'Ms. Noor', label: 'teacher', body: 'adult', skin: SKINS.s3, hair: { style: 'long', color: HAIRS.brown },
    lashes: true, blush: false, sock: P.cream, brows: 'soft',
    wear: { top: 'cardigan', bottom: 'pants', shoes: 'boots', hat: 'hijab' },
    colors: { top: P.mustard, 'top-sh': P.mustardDeep, 'top-2': P.cream, bot: P.brown, 'bot-sh': P.brownDeep, hat: P.lav, 'hat-sh': P.plum },
    expr: 'happy',
  },
  {
    id: 'chef', name: 'Chef Marco', label: 'chef', body: 'adult', skin: SKINS.s2, hair: { style: 'curly', color: HAIRS.brown }, facialHair: 'mustache',
    lashes: false, blush: true, sock: P.white, brows: 'bold',
    wear: { top: 'chef-coat', bottom: 'pants', shoes: 'boots', hat: 'chef-hat' },
    colors: { bot: P.charHi, 'bot-sh': P.char, shoe: P.charDeep, 'shoe-sh': P.char },
    expr: 'yum',
  },
  {
    id: 'builder', name: 'Rosa', label: 'construction worker', body: 'adult', skin: SKINS.s4, hair: { style: 'ponytail', color: HAIRS.auburn },
    lashes: true, blush: false, sock: P.cream, brows: 'soft',
    wear: { top: 'tee-stripe', bottom: 'pants', shoes: 'boots', hat: 'hard-hat', over: 'safety-vest' },
    colors: { top: P.blue, 'top-sh': P.blueDeep, 'top-2': P.cream },
    expr: 'happy',
  },
];
