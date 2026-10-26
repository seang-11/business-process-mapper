/** A heat scale: five steps from fewest to most hours, each with text that reads on it. */
export interface HeatPalette {
  id: string;
  label: string;
  steps: { bg: string; fg: string }[];
}

const scale = (stops: string[], dark: string, darkest: string): HeatPalette['steps'] =>
  stops.map((bg, i) => ({ bg, fg: i < 3 ? (i < 2 ? dark : darkest) : '#FFFFFF' }));

export const HEAT_PALETTES: HeatPalette[] = [
  { id: 'coral', label: 'Coral', steps: scale(['#FAECE7', '#F5C4B3', '#F0997B', '#D85A30', '#993C1D'], '#712B13', '#4A1B0C') },
  { id: 'red', label: 'Red', steps: scale(['#FCEBEB', '#F7C1C1', '#F09595', '#E24B4A', '#A32D2D'], '#791F1F', '#501313') },
  { id: 'amber', label: 'Amber', steps: scale(['#FAEEDA', '#FAC775', '#EF9F27', '#BA7517', '#854F0B'], '#633806', '#412402') },
  { id: 'green', label: 'Green', steps: scale(['#EAF3DE', '#C0DD97', '#97C459', '#639922', '#3B6D11'], '#27500A', '#173404') },
  { id: 'teal', label: 'Teal', steps: scale(['#E1F5EE', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56'], '#085041', '#04342C') },
  { id: 'blue', label: 'Blue', steps: scale(['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#185FA5'], '#0C447C', '#042C53') },
  { id: 'purple', label: 'Purple', steps: scale(['#EEEDFE', '#CECBF6', '#AFA9EC', '#7F77DD', '#534AB7'], '#3C3489', '#26215C') },
  { id: 'pink', label: 'Pink', steps: scale(['#FBEAF0', '#F4C0D1', '#ED93B1', '#D4537E', '#993556'], '#72243E', '#4B1528') },
];

export const heatPalette = (id?: string | null) => HEAT_PALETTES.find((p) => p.id === id) ?? HEAT_PALETTES[0];
