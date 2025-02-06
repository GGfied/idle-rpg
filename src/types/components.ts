// src/types/components.ts
import { LucideIcon } from 'lucide-react';
import { Upgrades } from './skills';

export interface ActivityButtonProps {
  activity: string;
  icon: LucideIcon;
  skillType: string;
}

export interface UpgradeButtonProps {
  upgrade: keyof Upgrades;
  icon: LucideIcon;
}