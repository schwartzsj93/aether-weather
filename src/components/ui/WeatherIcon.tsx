/**
 * Weather glyphs — hand-drawn SVGs so we don't depend on raster sprites or
 * an external icon font. Each renders inside a 48px square viewBox.
 */
import {
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloud,
  CloudDrizzle,
  Moon,
  Sun,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { IconKey } from '@/lib/utils/weatherCodes';
import { cn } from '@/lib/utils/cn';

const MAP: Record<IconKey, LucideIcon> = {
  sun: Sun,
  moon: Moon,
  'partly-cloudy-day': CloudSun,
  'partly-cloudy-night': CloudMoon,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  'heavy-rain': CloudRain,
  snow: CloudSnow,
  sleet: CloudHail,
  thunder: CloudLightning,
  'thunder-hail': CloudHail,
};

interface Props {
  icon: IconKey;
  className?: string;
  strokeWidth?: number;
}

export function WeatherIcon({ icon, className, strokeWidth = 1.4 }: Props) {
  const Cmp = MAP[icon] ?? Cloud;
  return <Cmp className={cn('drop-shadow-[0_8px_20px_rgba(125,211,252,0.35)]', className)} strokeWidth={strokeWidth} />;
}
