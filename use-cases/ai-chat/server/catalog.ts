import rawData from 'emojibase-data/en/data.json' with { type: 'json' };
import metadata from 'emojibase-data/meta/groups.json' with { type: 'json' };
import type { EmojiItem } from '../shared/types.js';

type RawEmoji = {
  hexcode: string; emoji: string; label: string; group?: number; subgroup?: number;
  order?: number; tags?: string[]; tone?: number | number[]; skins?: RawEmoji[];
};
const groups = metadata.groups as Record<string, string>;
const subgroups = metadata.subgroups as Record<string, string>;
const data = rawData as RawEmoji[];
const collected: EmojiItem[] = [];
for (const item of data) {
  // Unicode components (individual regional indicators / modifiers) are not standalone keyboard emoji.
  if (item.group === undefined || item.group === 2 || item.subgroup === undefined) continue;
  for (const variant of [item, ...(item.skins ?? [])]) {
    collected.push({
      id: variant.hexcode,
      emoji: variant.emoji,
      label: variant.label,
      group: (groups[String(item.group)] ?? 'other').replaceAll('-', ' '),
      subgroup: subgroups[String(item.subgroup)] ?? 'other',
      family: item.hexcode,
      tags: [...(item.tags ?? []), ...(variant.tags ?? [])],
      tone: variant.tone ?? null,
    });
  }
}
export const catalog = [...new Map(collected.map(e => [e.id, e])).values()];
export const emojiById = new Map(catalog.map(e => [e.id, e]));
export const baseCount = new Set(catalog.map(e => e.family)).size;

export interface Bucket { id: string; description: string; emojis: EmojiItem[] }
const bySubgroup = new Map<string, EmojiItem[]>();
for (const emoji of catalog) {
  const list = bySubgroup.get(emoji.subgroup) ?? [];
  list.push(emoji);
  bySubgroup.set(emoji.subgroup, list);
}
export const buckets: Bucket[] = [];
// Jev Choice accepts at most 255 options. Every catalog entry appears in one bucket.
for (const [subgroup, emojis] of bySubgroup) {
  for (let offset = 0; offset < emojis.length; offset += 240) {
    const slice = emojis.slice(offset, offset + 240);
    const families = [...new Set(slice.map(e => emojiById.get(e.family)?.label ?? e.label))];
    buckets.push({
      id: `bucket_${buckets.length}`,
      description: `${slice[0].group}: ${subgroup.replaceAll('-', ' ')}. Includes: ${families.join(', ')}. Skin-tone variants where available.`,
      emojis: slice,
    });
  }
}
if (buckets.length > 255) throw new Error('Emoji catalog needs another routing level.');

const stopWords = new Set('a an and are as at be been but by for from had has have i im in is it its just me my of on or our so that the their them there they this to was we were will with you your'.split(' '));
export function keywordSuggestions(text: string): EmojiItem[] {
  const words = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter(word => word.length > 1 && !stopWords.has(word));
  return catalog.filter(e => e.tone === null).map(emoji => {
    const tokens = `${emoji.label} ${emoji.tags.join(' ')}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    const score = words.reduce((sum, word) => sum + (tokens.includes(word) ? 4 : tokens.some(token => token.startsWith(word) && word.length >= 3) ? 1 : 0), 0);
    return { emoji, score };
  }).filter(e => e.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(e => e.emoji);
}
