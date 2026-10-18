import type { CategoryDef } from '../types';

const PATHS: Record<CategoryDef['shape'], string> = {
  circle: 'M12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14z',
  diamond: 'M12 3l7.5 9L12 21l-7.5-9z',
  square: 'M5.5 5.5h13v13h-13z',
  triangle: 'M12 3.5l8.5 15h-17z',
  hex: 'M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z',
  star: 'M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z',
};

export function CategoryIcon({ category, size = 16, muted = false }: { category?: CategoryDef; size?: number; muted?: boolean }) {
  const shape = category?.shape ?? 'circle';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="cat-icon">
      <path
        d={PATHS[shape]}
        fill={muted ? '#4a4740' : (category?.color ?? '#bbb')}
        stroke={muted ? '#8b8476' : 'rgba(10,8,6,.9)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
