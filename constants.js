/**
 * EcoSprout — Shared Constants
 * Loaded by the content scripts, the popup, and the background service
 * worker. Centralizing this here means tuning the game economy or copy
 * never requires touching any logic files.
 *
 * Works in three different global contexts:
 *  - content script (window)
 *  - popup page (window)
 *  - service worker (self, via importScripts)
 */

const ECOSPROUT_STAGES = [
  { id: 'seed', label: 'Seed', minKarma: 0, emoji: '🌰', color: '#A47551' },
  { id: 'sprout', label: 'Sprout', minKarma: 25, emoji: '🌱', color: '#6EE7A8' },
  { id: 'sapling', label: 'Sapling', minKarma: 75, emoji: '🌿', color: '#2FAE71' },
  { id: 'tree', label: 'Young Tree', minKarma: 175, emoji: '🌳', color: '#1F6B45' },
  { id: 'oak', label: 'Mighty Oak', minKarma: 350, emoji: '🌳', color: '#F2A93B' }
];

const ECOSPROUT_ACHIEVEMENTS = [
  { id: 'first_step', name: 'First Step', emoji: '👣', desc: 'Earned your very first Carbon Karma points.' },
  { id: 'green_pick', name: 'Green Pick', emoji: '🛍️', desc: 'Chose a lower-carbon shipping option.' },
  { id: 'direct_flyer', name: 'Direct Flyer', emoji: '✈️', desc: 'Considered a direct flight 3 times.' },
  { id: 'veggie_voyager', name: 'Veggie Voyager', emoji: '🥗', desc: 'Added a plant-based item to a food order 3 times.' },
  { id: 'week_warrior', name: 'Week Warrior', emoji: '🔥', desc: 'Kept a 7-day streak alive.' },
  { id: 'century_club', name: 'Century Club', emoji: '💯', desc: 'Crossed 100 lifetime Carbon Karma.' },
  { id: 'mighty_oak', name: 'Mighty Oak', emoji: '🌳', desc: 'Grew your Sprout all the way into a Mighty Oak.' }
];

const ECOSPROUT_TIPS = [
  "Choosing standard shipping over same-day can cut a package's footprint by up to 60% — the truck's already going that way. 🚚",
  "A direct flight skips an extra takeoff & landing — the most fuel-hungry part of any trip. ✈️",
  "Swapping one beef dish for a plant-based one can save roughly the same CO2 as a 20km car ride. 🥗",
  "Refurbished electronics skip most of the manufacturing footprint — same gadget, lighter footprint. 📱",
  "Bundling two orders into one delivery means one truck trip instead of two. 📦",
  "Economy class has a much smaller per-passenger footprint than business — more people, same plane. 💺",
  "A single cotton t-shirt can take ~2,700 litres of water to grow. Second-hand fashion sidesteps that entirely. 👕",
  "Letting a parcel travel by sea instead of air can cut its shipping emissions by over 90% — it's just slower. 🚢",
  "Cloud storage still runs on real power plants somewhere — deleting old backups isn't just tidy, it's lighter. ☁️",
  "Local & seasonal produce usually skips the refrigerated long-haul flight your out-of-season fruit took. 🍓"
];


const ECOSPROUT_REFERENCE = {
  KG_PER_MILE_DRIVEN: 0.404, // ~average passenger car, EPA-style figure
  KG_PER_PHONE_CHARGE: 0.0084, // ~one full smartphone charge
  KG_PER_TREE_DAY: 0.0575 // a mature tree absorbs ~21kg CO2/year
};

if (typeof window !== 'undefined') {
  window.ECOSPROUT_STAGES = ECOSPROUT_STAGES;
  window.ECOSPROUT_ACHIEVEMENTS = ECOSPROUT_ACHIEVEMENTS;
  window.ECOSPROUT_TIPS = ECOSPROUT_TIPS;
  window.ECOSPROUT_REFERENCE = ECOSPROUT_REFERENCE;
}
if (typeof self !== 'undefined') {
  self.ECOSPROUT_STAGES = ECOSPROUT_STAGES;
  self.ECOSPROUT_ACHIEVEMENTS = ECOSPROUT_ACHIEVEMENTS;
  self.ECOSPROUT_TIPS = ECOSPROUT_TIPS;
  self.ECOSPROUT_REFERENCE = ECOSPROUT_REFERENCE;
}
