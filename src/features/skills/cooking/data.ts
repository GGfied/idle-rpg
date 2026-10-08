import { defineItems } from '@core/items';
import type { CookingMessages, CookingRecipe, CookSource } from './types';

export const SKILL = 'cooking';
export const BURNT_FISH_ID = 'burnt_fish';
export const BURNT_MEAT_ID = 'burnt_meat';
export const TICKS_PER_COOK = 4;

/** Success (out of 256) added at both ends of the burn curve when cooking on a range: it burns a bit less. */
export const SOURCE_SUCCESS_BONUS: Readonly<Record<CookSource, number>> = { fire: 0, range: 8 };

export const COOKING_ITEMS = defineItems([
  {
    id: 'shrimps',
    name: 'Cooked shrimp',
    examine: 'Tasty, and good for you.',
    value: 8,
    stackable: false,
    icon: 'shrimps',
  },
  {
    id: 'anchovies',
    name: 'Cooked anchovies',
    examine: 'Salty and sharp.',
    value: 15,
    stackable: false,
    icon: 'anchovies',
  },
  {
    id: 'sardine',
    name: 'Cooked sardine',
    examine: 'A small cooked fish.',
    value: 12,
    stackable: false,
    icon: 'sardine',
  },
  {
    id: 'herring',
    name: 'Cooked herring',
    examine: 'A flaky, smoky fish.',
    value: 20,
    stackable: false,
    icon: 'herring',
  },
  {
    id: 'trout',
    name: 'Cooked trout',
    examine: 'A fine cooked trout.',
    value: 35,
    stackable: false,
    icon: 'trout',
  },
  {
    id: 'mackerel',
    name: 'Cooked mackerel',
    examine: 'Rich, oily and filling.',
    value: 45,
    stackable: false,
    icon: 'mackerel',
  },
  {
    id: 'raw_chicken',
    name: 'Raw chicken',
    examine: 'Raw and fowl.',
    value: 4,
    stackable: false,
    icon: 'raw_chicken',
  },
  {
    id: 'raw_beef',
    name: 'Raw beef',
    examine: 'Raw and bloody. Best cooked.',
    value: 6,
    stackable: false,
    icon: 'raw_beef',
  },
  {
    id: 'cooked_chicken',
    name: 'Cooked chicken',
    examine: 'Nicely roasted.',
    value: 8,
    stackable: false,
    icon: 'cooked_chicken',
  },
  {
    id: 'cooked_beef',
    name: 'Cooked beef',
    examine: 'Hearty and filling.',
    value: 10,
    stackable: false,
    icon: 'cooked_beef',
  },
  {
    id: BURNT_MEAT_ID,
    name: 'Burnt meat',
    examine: 'Cooked a bit too long. Inedible.',
    value: 1,
    stackable: false,
    icon: BURNT_MEAT_ID,
  },
  {
    id: BURNT_FISH_ID,
    name: 'Burnt fish',
    examine: 'Cooked a bit too long. Inedible.',
    value: 1,
    stackable: false,
    icon: BURNT_FISH_ID,
  },
]);

const recipe = (
  rawId: string,
  cookedId: string,
  levelRequired: number,
  xp: number,
  stopBurnLevel: number,
  heals: number,
  successLow = 118,
  burntId = BURNT_FISH_ID,
): CookingRecipe => ({
  rawId,
  cookedId,
  burntId,
  levelRequired,
  xp,
  successLow,
  successHigh: 255,
  stopBurnLevel,
  heals,
  ticksPerCook: TICKS_PER_COOK,
});

export const COOKING_RECIPES: readonly CookingRecipe[] = [
  recipe('raw_shrimp', 'shrimps', 1, 30, 34, 3),
  recipe('raw_anchovies', 'anchovies', 1, 30, 34, 1),
  recipe('raw_sardine', 'sardine', 1, 40, 38, 4),
  recipe('raw_herring', 'herring', 5, 50, 41, 5),
  recipe('raw_mackerel', 'mackerel', 10, 60, 45, 6),
  recipe('raw_trout', 'trout', 15, 70, 50, 7),
  recipe('raw_chicken', 'cooked_chicken', 1, 30, 31, 3, 118, BURNT_MEAT_ID),
  recipe('raw_beef', 'cooked_beef', 1, 30, 31, 3, 118, BURNT_MEAT_ID),
];

export const COOKING_MESSAGES: CookingMessages = {
  cooked: {
    raw_shrimp: 'You cook the shrimps.',
    raw_anchovies: 'You cook the anchovies.',
    raw_sardine: 'You cook the sardine.',
    raw_herring: 'You cook the herring.',
    raw_mackerel: 'You cook the mackerel.',
    raw_trout: 'You cook the trout.',
    raw_chicken: 'You cook the chicken.',
    raw_beef: 'You cook the beef.',
  },
  burnt: {
    raw_shrimp: 'You accidentally burn the shrimps.',
    raw_anchovies: 'You accidentally burn the anchovies.',
    raw_sardine: 'You accidentally burn the sardine.',
    raw_herring: 'You accidentally burn the herring.',
    raw_mackerel: 'You accidentally burn the mackerel.',
    raw_trout: 'You accidentally burn the trout.',
    raw_chicken: 'You accidentally burn the chicken.',
    raw_beef: 'You accidentally burn the beef.',
  },
  stopped: {
    levelTooLow: 'You need a Cooking level of {level} to cook this.',
    noRawFood: 'You have nothing left to cook.',
    unknownRecipe: "You can't cook that.",
    sourceGone: 'The fire has gone out.',
    cancelled: '',
  },
};
