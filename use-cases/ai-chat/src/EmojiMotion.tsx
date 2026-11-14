import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { EmojiItem } from '../shared/types';

type Point = { x: number; y: number; size: number; angle: number };
type Flight = {
  id: string;
  source: HTMLElement | null;
  target: HTMLElement | null;
  sprite: HTMLElement | null;
  animation: Animation | null;
  home: Point;
  destination: Point;
  emoji: string;
};
const center = (element: HTMLElement, angle?: number): Point => {
  const bounds = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2,
    size: parseFloat(style.fontSize) * Math.hypot(matrix.a, matrix.b), angle: angle ?? Math.atan2(matrix.b, matrix.a) * 180 / Math.PI };
};
const transform = (point: Point) => `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) rotate(${point.angle}deg) scale(${point.size / 40})`;
const hash = (id: string) => Array.from(id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);

/** One flight per emoji. A direction change starts from its current painted position. */
export class EmojiMotion {
  private flights = new Map<string, Flight>();
  constructor(private layer: RefObject<HTMLDivElement | null>) {}

  private getHome(id: string): { source: HTMLElement | null; home: Point } {
    const source = Array.from(document.querySelectorAll<HTMLElement>('.fallen-emoji')).find(node => node.dataset.emojiId === id) ?? null;
    if (source) return { source, home: center(source, parseFloat(source.style.getPropertyValue('--angle')) || 0) };
    const floor = document.querySelector('.emoji-floor')?.getBoundingClientRect();
    const seed = hash(id);
    return { source: null, home: { x: 32 + (seed % 900) / 900 * (window.innerWidth - 64), y: (floor?.bottom ?? window.innerHeight - 43) - 28 - seed % 50, size: 43, angle: seed % 60 - 30 } };
  }

  private stop(flight: Flight): Point | null {
    const position = flight.sprite?.isConnected ? center(flight.sprite) : flight.target?.isConnected ? center(flight.target) : null;
    flight.animation?.cancel();
    flight.sprite?.remove();
    flight.sprite = null; flight.animation = null;
    return position;
  }

  private sprite(flight: Flight, direction: 'rising' | 'dropping') {
    const sprite = document.createElement('span');
    sprite.className = `emoji-flight emoji-${direction}`;
    sprite.dataset.emojiId = flight.id;
    sprite.dataset.motion = direction;
    sprite.textContent = flight.emoji;
    sprite.setAttribute('aria-hidden', 'true');
    this.layer.current!.append(sprite);
    flight.sprite = sprite;
    return sprite;
  }

  rise(emoji: EmojiItem, target: HTMLElement, order: number, origin?: Point) {
    const previous = this.flights.get(emoji.id);
    const from = previous ? this.stop(previous) : null;
    const { source, home } = this.getHome(emoji.id);
    if (previous?.source && previous.source !== source) previous.source.style.visibility = '';
    const finish = center(target);
    const flight: Flight = { id: emoji.id, source, target, home, destination: finish, emoji: emoji.emoji, sprite: null, animation: null };
    this.flights.set(emoji.id, flight);
    if (source) source.style.visibility = 'hidden';
    if (!this.layer.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      target.style.visibility = ''; return;
    }
    const start = origin ?? from ?? home;
    target.style.visibility = 'hidden';
    const sprite = this.sprite(flight, 'rising');
    const horizontal = finish.x - start.x;
    const frames = [
      { transform: transform(start), offset: 0 },
      { transform: transform({ x: finish.x - horizontal * .15, y: finish.y - 22, size: finish.size * 1.08, angle: horizontal > 0 ? 9 : -9 }), offset: .76 },
      { transform: transform(finish), offset: 1 },
    ];
    const duration = Math.hypot(finish.x - start.x, finish.y - start.y) < 110 ? 280 : 840;
    flight.animation = sprite.animate(frames, { duration, delay: order * 34, easing: 'cubic-bezier(.22,.68,.2,1)', fill: 'both' });
    flight.animation.onfinish = () => {
      if (this.flights.get(emoji.id) !== flight) return;
      target.style.visibility = '';
      sprite.remove(); flight.sprite = null; flight.animation = null;
    };
  }

  drop(id: string, target: HTMLElement) {
    const flight = this.flights.get(id);
    if (!flight || flight.target !== target) return;
    const start = this.stop(flight) ?? flight.home;
    flight.target = null;
    const nextHome = this.getHome(id);
    if (flight.source && flight.source !== nextHome.source) flight.source.style.visibility = '';
    flight.source = nextHome.source; flight.home = nextHome.home;
    const restore = () => {
      if (this.flights.get(id) !== flight) return;
      if (flight.source) flight.source.style.visibility = '';
      flight.sprite?.remove();
      this.flights.delete(id);
    };
    if (!this.layer.current?.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { restore(); return; }
    if (flight.source) flight.source.style.visibility = 'hidden';
    const end = flight.home;
    const sprite = this.sprite(flight, 'dropping');
    const lean = end.x < start.x ? -1 : 1;
    const frames = [
      { transform: transform(start), offset: 0, easing: 'cubic-bezier(.4,0,.9,.55)' },
      { transform: transform({ ...end, angle: end.angle + lean * 25, size: end.size * 1.08 }), offset: .72, easing: 'cubic-bezier(.2,.6,.3,1)' },
      { transform: transform({ ...end, y: end.y - 19, angle: end.angle - lean * 7 }), offset: .86, easing: 'ease-in' },
      { transform: transform(end), offset: 1 },
    ];
    flight.animation = sprite.animate(frames, { duration: 760 + hash(id) % 100, fill: 'both' });
    flight.animation.onfinish = restore;
  }

  finish = () => {
    for (const flight of this.flights.values()) {
      flight.animation?.finish();
      if (flight.target?.isConnected) flight.destination = center(flight.target);
    }
  };

  reposition(emoji: EmojiItem, target: HTMLElement) {
    const flight = this.flights.get(emoji.id);
    if (!flight || flight.target !== target) return;
    const next = center(target);
    if (Math.hypot(next.x - flight.destination.x, next.y - flight.destination.y) < 1) return;
    this.rise(emoji, target, 0, flight.sprite ? undefined : flight.destination);
  }

  syncSources() {
    for (const flight of this.flights.values()) if (flight.source) flight.source.style.visibility = '';
    for (const flight of this.flights.values()) {
      const { source, home } = this.getHome(flight.id);
      flight.source = source; flight.home = home;
      if (source) source.style.visibility = 'hidden';
    }
  }

  dispose() {
    for (const flight of this.flights.values()) {
      this.stop(flight);
      if (flight.source) flight.source.style.visibility = '';
      if (flight.target) flight.target.style.visibility = '';
    }
    this.flights.clear();
  }
}

export function MovingEmoji({ emoji, order, count, motion, onPick }: { emoji: EmojiItem; order: number; count: number; motion: EmojiMotion; onPick: (emoji: EmojiItem) => void }) {
  const glyph = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const target = glyph.current!;
    motion.rise(emoji, target, order);
    return () => motion.drop(emoji.id, target);
    // An emoji that remains relevant keeps its place instead of repeating its entrance.
  }, [emoji.id, motion]);
  useLayoutEffect(() => { if (glyph.current) motion.reposition(emoji, glyph.current); }, [order, count, motion]);
  return <button className="match" aria-label={`Insert ${emoji.label}`} title={emoji.label}
    onMouseDown={event => event.preventDefault()} onClick={() => onPick(emoji)}><span ref={glyph}>{emoji.emoji}</span></button>;
}
