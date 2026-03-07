export interface BackgroundOption {
  id: string;
  label: string;
  image: string;
}

export const BACKGROUNDS: BackgroundOption[] = [
  {
    id: 'forge',
    label: 'Arcane Forge',
    image:
      'linear-gradient(125deg, rgba(255,153,102,0.8), rgba(113,65,43,0.85)), radial-gradient(circle at 20% 20%, rgba(255,225,183,0.7), transparent 40%)'
  },
  {
    id: 'library',
    label: 'Silent Archive',
    image:
      'linear-gradient(135deg, rgba(10,53,74,0.85), rgba(6,96,86,0.85)), radial-gradient(circle at 75% 30%, rgba(132,221,206,0.4), transparent 35%)'
  },
  {
    id: 'citadel',
    label: 'Storm Citadel',
    image:
      'linear-gradient(145deg, rgba(27,35,56,0.92), rgba(58,95,143,0.82)), radial-gradient(circle at 80% 10%, rgba(210,236,255,0.5), transparent 33%)'
  },
  {
    id: 'tavern',
    label: 'Copper Tavern',
    image:
      'linear-gradient(140deg, rgba(75,36,22,0.95), rgba(140,75,34,0.88)), radial-gradient(circle at 15% 80%, rgba(255,191,120,0.45), transparent 38%)'
  }
];
