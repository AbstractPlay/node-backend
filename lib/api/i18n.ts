import {
  changeLanguageForPlayer,
  initApbackI18n,
  resolvePlayerLanguage,
} from '../apbackI18n.js';
import { createSendEmailCommand } from '../createSendEmailCommand.js';

export { changeLanguageForPlayer, resolvePlayerLanguage, createSendEmailCommand };

export async function initi18n(language: string): Promise<void> {
  await initApbackI18n(language);
}
