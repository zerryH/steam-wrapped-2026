const OPENERS = [
  'The pattern is hard to miss.',
  'You have a regular seat.',
  'That was one more match.',
  'The lobby knows the routine.',
  'You came back. Again.',
  'This one clearly stuck.',
  'No one can call this casual.',
  'The queue has a regular.',
  'You know the way back.',
  'A familiar name on the menu.',
  'You have a type.',
  'That is a committed choice.',
  'The hours have a story.',
  'The backlog can wait.',
  'One title keeps calling.',
  'A long-running arrangement.',
  'No surprise appearances here.',
  'The habit has settled in.',
  'You made yourself at home.',
  'That save file has history.',
  'The loading screen feels local.',
  'You know this map.',
  'The routine writes itself.',
  'Some things never change.',
  'The favourite is obvious.',
  'You stayed for another round.',
  'The library has a centre of gravity.',
  'A very familiar route.',
  'The clock kept quiet.',
  'You were not just browsing.',
  'The game has your number.',
  'A proper long-term project.',
  'That is a lot of return visits.',
  'You have unfinished business.',
  'The menu knows your habits.',
  'The next match was inevitable.',
  'You found your corner.',
  'The save is practically vintage.',
  'That pick aged well.',
  'The pattern survived another year.',
  'You know where the good hours go.',
  'The queue remembers.',
  'You did not just drop by.',
  'One more round became a routine.',
  'The favourite kept its place.',
  'You have put in the shifts.',
  'No need for a sales pitch.',
  'The hours speak first.',
  'The lobby feels familiar.',
  'You made this one a regular thing.'
];

const ENDINGS = [
  'The save file has seniority.',
  'No further explanation needed.',
  'The queue knows your number.',
  'That is a long-term arrangement.',
  'The loading screen is basically home.',
  'The hours have already testified.',
  'The backlog is getting nervous.',
  'Someone knows every corner.',
  'The next match is already queued.',
  'That was not a short visit.',
  'The controller knows the route.',
  'The map probably feels smaller now.',
  'The menu could greet you by name.',
  'The clock has stopped asking.',
  'There is history in that lobby.',
  'The routine has its own routine.',
  'That save has seen a few things.',
  'You know the shortcuts by heart.',
  'The next session is never far away.',
  'That is commitment, not coincidence.',
  'The tutorial is a distant memory.',
  'The muscle memory is doing the talking.',
  'The tab has earned its place.',
  'The familiar route wins again.',
  'The hours are not making this up.',
  'The welcome screen feels personal.',
  'You know what you came for.',
  'The queue has seen this before.',
  'The menu is part of the furniture.',
  'That is a well-worn path.',
  'The save file could tell stories.',
  'The next round is a formality.',
  'The library has receipts.',
  'Someone has clearly put the time in.',
  'The map knows you too.',
  'It has become a proper fixture.',
  'The next session is on the calendar.',
  'That is a lot of nights well spent.',
  'The hours have a very clear favourite.',
  'The rest of the shelf can wait.',
  'The game has earned regular status.',
  'The queue is already warming up.',
  'You have seen this screen before.',
  'That is not a passing interest.',
  'The save file is in good company.',
  'The routine is pretty well established.',
  'You know exactly where to click.',
  'That favourite is not going anywhere.',
  'The hours make the introduction.',
  'One more match still sounds reasonable.'
];

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const BANter_VARIANTS_PER_SLIDE = OPENERS.length * ENDINGS.length;

export function makeBanter(profileId: string, slideId: string, facts: string): string {
  const poolSize = BANter_VARIANTS_PER_SLIDE;
  const selected = hashText(profileId + '|' + slideId + '|' + facts) % poolSize;
  const opener = OPENERS[selected % OPENERS.length];
  const ending = ENDINGS[Math.floor(selected / OPENERS.length) % ENDINGS.length];
  return opener + ' ' + ending;
}