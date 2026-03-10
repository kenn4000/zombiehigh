import { LockerData } from '../DraftData';
import { LockerId } from '../../common/LockerId';

export const LOCKER_DATA: LockerData[] = [
    {
        id: LockerId.OUJI_BOARD,
        name: 'Ouji Board',
        bonusGold: 5,
        nonGoldBonus: '2 SP',
        abilities: [
            { type: 'Action', effect: 'Pay 1 gold to turn 1 SP into 2 NP' },
            { type: 'Action', effect: 'Pay 1 gold to turn 1 SP into 2 CP' },
        ],
    },
    {
        id: LockerId.SHOES,
        name: 'Shoes',
        bonusGold: 7,
        abilities: [
            { type: 'Action', effect: 'Pay 1 Gold to take two steps' },
        ],
    },
    {
        id: LockerId.LEATHER_JACKET,
        name: 'Leather Jacket',
        bonusGold: 9,
        nonGoldBonus: '2 CP',
        abilities: [
            { type: 'Passive', effect: 'When you gain CP, gain 2 gold' },
        ],
    },
    {
        id: LockerId.ROLLER_BACKPACK,
        name: 'Roller Backpack',
        bonusGold: 9,
        nonGoldBonus: '2 NP',
        abilities: [
            { type: 'Passive', effect: 'When you gain NP, gain 2 gold' },
        ],
    },
    {
        id: LockerId.LONG_SLEEVES,
        name: 'Long Sleeves',
        bonusGold: 10,
        abilities: [
            { type: 'Action', effect: 'Pay 2 gold to draw two cards and keep one' },
        ],
    },
    {
        id: LockerId.PYRAMID_SCHEME,
        name: 'Pyramid Scheme',
        bonusGold: 0,
        abilities: [
            { type: 'Action', effect: 'Pay 3 gold to discard 1 card from your hand, gain 1 gold production' },
        ],
    },
    {
        id: LockerId.FRESH_WOUND_DRESSING,
        name: 'Fresh Wound Dressing',
        bonusGold: 0,
        nonGoldBonus: '-1 HP;3 SP',
    },
    {
        id: LockerId.DOG_TAGS,
        name: 'Dog Tags',
        bonusGold: 6,
        nonGoldBonus: '1 CP',
        startingAction: 'Place one Zombie',
        abilities: [
            { type: 'Passive', effect: 'Gain 2 gold whenever any zombie is killed' },
        ],
    },
    {
        id: LockerId.WALL_IN_A_BOX,
        name: 'Wall-in-a-Box',
        bonusGold: 13,
        startingAction: 'Place one barricade for free',
    },
    {
        id: LockerId.CHARITY_FUND,
        name: 'Charity Fund',
        bonusGold: 27,
    },
    {
        id: LockerId.CHILDS_TOOL_SET,
        name: "Child's Tool Set",
        bonusGold: 8,
        abilities: [
            { type: 'Passive', effect: 'your barricades have -1 effectiveness. When any of your barricades are destroyed, draw 1 card.' },
        ],
    },
    {
        id: LockerId.GRAPPLING_HOOK,
        name: 'Grappling Hook',
        bonusGold: 0,
        abilities: [
            { type: 'Action', effect: 'Pay 1 Gold to teleport to any tile within 2 steps' },
        ],
    },
    {
        id: LockerId.VITAMINS,
        name: 'Vitamins',
        bonusGold: 9,
        nonGoldBonus: '1 HP',
    },
    {
        id: LockerId.PERMANENT_RECORD,
        name: 'Permanent Record',
        bonusGold: 6,
    },
    {
        id: LockerId.FREE_HUGS_T_SHIRT,
        name: 'Free Hugs T-Shirt',
        bonusGold: 0,
        nonGoldBonus: '1 CP',
        abilities: [
            { type: 'Action', effect: 'gain 2 NP per adjacent opponent' },
            { type: 'Action', effect: 'gain 1 CP per adjacent zombie' },
        ],
    },
    {
        id: LockerId.DIRTY_GYM_SOCKS,
        name: 'Dirty Gym Socks',
        bonusGold: 11,
        abilities: [
            { type: 'Passive', effect: 'Bait affects all zombies within 5 hexes. Bait costs +1 Gold to place.' },
        ],
    },
    {
        id: LockerId.PART_TIME_JOB,
        name: 'Part Time Job',
        bonusGold: 6,
        nonGoldBonus: '3 GP;-1 SP',
    },
    {
        id: LockerId.SCOUT_TRAINING,
        name: 'Scout Training',
        bonusGold: 0,
        nonGoldBonus: '1 GP;-1 SP',
        startingAction: 'Place one free trap',
        abilities: [
            { type: 'Passive', effect: 'Personal Trap limit -1 and trap effectiveness +1' },
        ],
    },
    {
        id: LockerId.NICE_FOR_SALE,
        name: 'Nice for Sale',
        bonusGold: 0,
        nonGoldBonus: '2 NP',
        abilities: [
            { type: 'Action', effect: 'Pay 2 gold to turn 1 NP into 1 SP' },
            { type: 'Action', effect: 'Pay 2 gold to turn 1 NP into 7 gold' },
        ],
    },
    {
        id: LockerId.COOL_FOR_SALE,
        name: 'Cool for Sale',
        bonusGold: 0,
        nonGoldBonus: '2 CP',
        abilities: [
            { type: 'Action', effect: 'Pay 2 gold to turn 1 CP into 1 SP' },
            { type: 'Action', effect: 'Pay 2 gold to turn 1 CP into 7 gold' },
        ],
    },
    {
        id: LockerId.QUALITY_OVER_QUANTITY,
        name: 'Quality over Quantity',
        bonusGold: 7,
        startingAction: 'Place one barricade for free',
        abilities: [
            { type: 'Passive', effect: 'Personal barricade effectiveness +1, number of barricades allowed -1' },
        ],
    },
    {
        id: LockerId.SHARPENED_STICK,
        name: 'Sharpened Stick',
        bonusGold: 8,
        nonGoldBonus: '1 SP',
        abilities: [
            { type: 'Passive', effect: 'Melee attack effectiveness +1' },
        ],
    },
    {
        id: LockerId.GAS_LEAK,
        name: 'Gas Leak',
        bonusGold: 0,
        nonGoldBonus: '-1 HP;1 SP;2 GP',
        abilities: [
            { type: 'Passive', effect: 'Melee attack effectiveness -1 for all players' },
        ],
    },
];
