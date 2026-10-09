import { setUpPageLanguage } from '../i18n/page-language';
import { browserLocalStorage, createGameStorage } from '../storage';
import { connectLanguageMenu } from '../ui/language-menu';

const storage = createGameStorage(browserLocalStorage());
const { language } = setUpPageLanguage(
  document,
  storage.loadSettings().language,
  navigator.languages,
);
connectLanguageMenu(storage, language);
