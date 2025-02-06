import { Sword, Shield, FlaskConical, Package } from 'lucide-react';

export const ITEM_CONFIG = {
  basicSword: {
    id: 'basicSword',
    name: 'Iron Sword',
    icon: Sword,
    color: 'orange',
    type: 'crafted weapon',
    price: 100
  },
  reinforcedArmor: {
    id: 'reinforcedArmor',
    name: 'Reinforced Chain Mail',
    icon: Shield,
    color: 'blue',
    type: 'crafted armor',
    price: 150
  },
  healingPotion: {
    id: 'healingPotion',
    name: 'Healing Potion',
    icon: FlaskConical,
    color: 'purple',
    type: 'consumable',
    price: 25
  },
  goblinHide: {
    id: 'goblinHide',
    name: 'Goblin Hide',
    icon: Package,
    color: 'green',
    type: 'material',
    price: 50
  },
  trollBone: {
    id: 'trollBone',
    name: 'Troll Bone',
    icon: Package,
    color: 'gray',
    type: 'material',
    price: 75
  }
};