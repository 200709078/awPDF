import { showAbout } from '../ui/about'
import type { Tool } from './tool'

/**
 * Hakkında: the family's small window (name, version, mADEMatik Solutions, downloads, licence,
 * privacy, contact). It always sits at the end of the ☰ menu (the user's choice, 2026-11-10).
 */
export const aboutTool: Tool = {
  id: 'about',
  label: 'Hakkında',
  icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/>',
  inMenu: true,
  run: ({ platform }) => showAbout(platform),
}
