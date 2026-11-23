import { Alert, Platform } from 'react-native';

type Choice = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };

/**
 * Alert.alert with a browser fallback (react-native-web has no native dialogs, used in the web preview).
 * On the web the first non-cancel choice is offered via window.confirm.
 */
export function ask(title: string, message: string | undefined, choices: Choice[]) {
  if (Platform.OS !== 'web') return Alert.alert(title, message, choices);
  const options = choices.filter(c => c.style !== 'cancel');
  if (options.length <= 1) { if (window.confirm([title, message].filter(Boolean).join('\n\n'))) options[0]?.onPress?.(); return; }
  // several options (e.g. "nur diesen" / "alle"): OK = first, Abbrechen = ask for the second
  if (window.confirm(`${title}\n\nOK = ${options[0].text}\nAbbrechen = andere Auswahl`)) return options[0].onPress?.();
  if (window.confirm(`${title}\n\n${options[1].text}?`)) options[1].onPress?.();
}
