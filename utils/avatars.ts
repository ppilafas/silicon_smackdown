// DiceBear avatar mappings for Silicon Smackdown characters
// Using different styles to match character personalities

export interface AvatarConfig {
  style: string;
  seed: string;
  backgroundColor?: string[];
  gender?: 'male' | 'female';
}

const AVATAR_MAPPINGS: Record<string, AvatarConfig> = {
  // Logic vs Hype
  'Dr. Orion': { style: 'bottts-neutral', seed: 'orion-philosopher-ai', backgroundColor: ['#6366f1', '#8b5cf6'], gender: 'male' },
  'Luna Nova': { style: 'bottts-neutral', seed: 'luna-futurist-ai', backgroundColor: ['#f43f5e', '#ec4899'], gender: 'female' },
  
  // Detective & Mastermind
  'Sherlock': { style: 'personas', seed: 'sherlock-holmes-detective', backgroundColor: ['#64748b', '#475569'], gender: 'male' },
  'Moriarty': { style: 'personas', seed: 'moriarty-villain-genius', backgroundColor: ['#059669', '#047857'], gender: 'male' },
  
  // Hacker vs The Suit
  'Glitch': { style: 'bottts-neutral', seed: 'glitch-cyberpunk-hacker', backgroundColor: ['#06b6d4', '#0891b2'], gender: 'male' },
  'Mr. Sterling': { style: 'personas', seed: 'sterling-corporate-ceo', backgroundColor: ['#d97706', '#b45309'], gender: 'male' },
  
  // The Chief & The Telekinetic
  'El': { style: 'personas', seed: 'eleven-telekinetic-girl', backgroundColor: ['#ec4899', '#db2777'], gender: 'female' },
  'Chief Hopper': { style: 'personas', seed: 'hopper-police-chief', backgroundColor: ['#6b7280', '#4b5563'], gender: 'male' },
  
  // Jedi Master & Apprentice
  'Master Yoda': { style: 'bottts-neutral', seed: 'yoda-jedi-master-green', backgroundColor: ['#16a34a', '#15803d'], gender: 'male' },
  'Luke Skywalker': { style: 'personas', seed: 'luke-skywalker-jedi-hero', backgroundColor: ['#3b82f6', '#2563eb'], gender: 'male' },
  
  // The Relativist & The Quantum
  'Albert Einstein': { style: 'personas', seed: 'einstein-physicist-genius', backgroundColor: ['#6366f1', '#4f46e5'], gender: 'male' },
  'Niels Bohr': { style: 'personas', seed: 'bohr-quantum-physicist', backgroundColor: ['#0284c7', '#0369a1'], gender: 'male' },
  
  // The Mighty Pirate & The Ghost Pirate
  'Guybrush Threepwood': { style: 'pixel-art', seed: 'guybrush-pirate-hero', backgroundColor: ['#0891b2', '#0e7490'], gender: 'male' },
  'Captain LeChuck': { style: 'pixel-art', seed: 'lechuck-ghost-pirate-villain', backgroundColor: ['#991b1b', '#7f1d1d'], gender: 'male' },
  
  // The Genius & The Spider
  'Tony Stark': { style: 'bottts-neutral', seed: 'ironman-stark-genius-tech', backgroundColor: ['#dc2626', '#b91c1c'], gender: 'male' },
  'Peter Parker': { style: 'personas', seed: 'spiderman-parker-hero', backgroundColor: ['#1e40af', '#1d4ed8'], gender: 'male' },
  
  // The Patriarch & The Matriarch
  'Peter Griffin': { style: 'personas', seed: 'peter-griffin-family-guy', backgroundColor: ['#f59e0b', '#d97706'], gender: 'male' },
  'Lois Griffin': { style: 'personas', seed: 'lois-griffin-matriarch', backgroundColor: ['#dc2626', '#b91c1c'], gender: 'female' },
  
  // The Teacher & The Student
  'Walter White': { style: 'personas', seed: 'heisenberg-walter-white', backgroundColor: ['#6b7280', '#4b5563'], gender: 'male' },
  'Jesse Pinkman': { style: 'personas', seed: 'jesse-pinkman-student', backgroundColor: ['#f59e0b', '#d97706'], gender: 'male' },
  
  // The King in the North & The Dragon Queen
  'Jon Snow': { style: 'personas', seed: 'jon-snow-king-north', backgroundColor: ['#6b7280', '#4b5563'], gender: 'male' },
  'Daenerys Targaryen': { style: 'personas', seed: 'daenerys-dragon-queen', backgroundColor: ['#dc2626', '#b91c1c'], gender: 'female' }
};

// Get DiceBear avatar URL for a character
export function getAvatarUrl(characterName: string): string {
  const config = AVATAR_MAPPINGS[characterName];
  
  if (!config) {
    // Fallback to generic adventurer style
    return `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${encodeURIComponent(characterName)}`;
  }
  
  // Build URL with gender parameter if available
  const params = new URLSearchParams({ seed: config.seed });
  if (config.gender) {
    params.append('gender', config.gender);
  }
  
  return `https://api.dicebear.com/7.x/${config.style}/svg?${params.toString()}`;
}

// Alternative: Use Multiavatar as fallback (SVG format)
export function getFallbackAvatarUrl(characterName: string): string {
  // Multiavatar returns SVG
  return `https://api.multiavatar.com/${encodeURIComponent(characterName)}.svg`;
}

// Get avatar configuration for debugging
export function getAvatarConfig(characterName: string): AvatarConfig | undefined {
  return AVATAR_MAPPINGS[characterName];
}

// Check if character has custom avatar
export function hasCustomAvatar(characterName: string): boolean {
  return characterName in AVATAR_MAPPINGS;
}
