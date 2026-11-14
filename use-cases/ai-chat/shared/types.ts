export interface EmojiItem {
  id: string;
  emoji: string;
  label: string;
  group: string;
  subgroup: string;
  family: string;
  tags: string[];
  tone: number | number[] | null;
}

export interface Suggestions {
  text: string;
  emojis: EmojiItem[];
  source: 'typesafe' | 'local';
  model: string | null;
  elapsedMs: number;
  cached?: boolean;
}

export interface AppStatus {
  configured: boolean;
  connectionVerified: boolean;
  model: string;
  emojiCount: number;
  baseCount: number;
  envPath: string;
  provider: 'OpenRouter';
}
