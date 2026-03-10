import { HEROES_DATA } from '../src/server/data/heroesData';
import { LOCKER_DATA } from '../src/server/data/lockerData';
import { CARDS_DATA } from '../src/server/data/cardsData';

const heroes = HEROES_DATA;
const lockers = LOCKER_DATA;
const cards = CARDS_DATA;

console.log(`Heroes: ${heroes.length}`);
heroes.forEach(h => console.log(`  ${h.id} | "${h.name}" | gold=${h.startGold} hp=${h.initHealth} sp=${h.startSP} gp=${h.startGP} melee=${h.meleeSuccess} startAction=${h.startingAction ?? '-'} abilities=${h.abilities?.length ?? 0}`));

console.log(`\nLocker Items: ${lockers.length}`);
lockers.forEach(r => console.log(`  ${r.id} | "${r.name}" | gold=${r.bonusGold} bonus=${r.nonGoldBonus ?? '-'} startAction=${r.startingAction ?? '-'} abilities=${r.abilities?.length ?? 0}`));

console.log(`\nCards: ${cards.length}`);
cards.slice(0, 5).forEach(c => console.log(`  "${c.name}" | cost=${c.playCost} | effect=${c.effect.slice(0, 60)}`));
const bad = cards.filter(c => !c.name);
if (bad.length) console.log(`!! ${bad.length} cards with empty name`);

// Spot-check specific items for known bug fixes
console.log('\n--- Spot checks ---');
const shoes = lockers.find(r => r.name === 'Shoes');
console.log(`Shoes bonusGold (expect 0): ${shoes?.bonusGold}`);
const dogs = lockers.find(r => r.name === 'Dog Tags');
console.log(`Dog Tags gold (expect 10): ${dogs?.bonusGold} | bonus: ${dogs?.nonGoldBonus ?? '-'} | startAction: ${dogs?.startingAction ?? 'MISSING'}`);
const fw = lockers.find(r => r.name === 'Fresh Wound Dressing');
console.log(`Fresh Wound Dressing bonus (expect 3 SP;-1 HP): ${fw?.nonGoldBonus}`);
const niceForSale = lockers.find(r => r.name === 'Nice for Sale');
console.log(`Nice for Sale gold (expect 0): ${niceForSale?.bonusGold} | bonus: ${niceForSale?.nonGoldBonus ?? '-'}`);
const notCoolBro = cards.find(c => c.name === 'Not Cool Bro');
console.log(`"Not Cool Bro" name (expect no quotes): "${notCoolBro?.name ?? 'NOT FOUND'}"`);
console.log(`Card Shark startAction: ${heroes.find(h => h.name === 'Card Shark')?.startingAction}`);
