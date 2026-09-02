import * as i18nextModule from 'i18next';
import type { i18n } from 'i18next';

/** Global i18next singleton (NodeNext-safe default import). */
const i18n: i18n = (i18nextModule as unknown as { default: i18n }).default;

export default i18n;
