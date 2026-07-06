import { CardModel } from '../../common/models/CardModel';

const GAME_ART_BASE = '/card-art/gamecard_assets';
const HERO_ART_BASE = '/card-art/herocard_assets';
const LOCKER_ART_BASE = '/card-art/lockercard_assets';

const HERO_ART_MANIFEST: Record<string, string> = {
    'anita bandage': 'anita.jpg',
    schadenfreude: 'phil.jpg',
    'phil t rags': 'phil.jpg',
    'barry cade': 'barry.jpg',
    'von trap': 'elsa.jpg',
    bloodthirster: 'brock.jpg',
    spotter: 'cia.jpg',
    bungler: 'al.jpg',
    'archy tect': 'archy.jpg',
    'loan wolf': 'lola.jpg',
    richard: 'richard.jpg',
    'card shark': 'dorothy.jpg',
    'gym coach': 'mike.jpg',
    'brock slaytor': 'brock.jpg',
    'cia lader': 'cia.jpg',
    'al b tross': 'al.jpg',
    'lola ladra': 'lola.jpg',
    'richard kim': 'richard.jpg',
    'dorothy deckard': 'dorothy.jpg',
    'mike u strong': 'mike.jpg',
    'elsa von trap': 'elsa.jpg',
};

const LOCKER_ART_MANIFEST: Record<string, string> = {
    'ouija board': 'ouija_board.jpg',
    shoes: 'shoes.jpg',
    'leather jacket': 'leather_jacket.jpg',
    'roller backpack': 'roller_backpack.jpg',
    'long sleeves': 'long_sleeves.jpg',
    'pyramid scheme': 'pyramid_scheme.jpg',
    'fresh wound dressing': 'fresh_wound_dressing.jpg',
    'dog tags': 'dog_tags.jpg',
    'wall-in-a-box': 'wall_in_a_box.jpg',
    'charity fund': 'charity_fund.jpg',
    "child's tool set": 'child_tool_set.jpg',
    'grappling hook': 'grappling_hook.jpg',
    vitamins: 'vitamins.jpg',
    'permanent record': 'permanent_record.jpg',
    'free hugs t-shirt': 'free_hugs_tshirt.jpg',
    'dirty gym socks': 'dirty_gym_socks.jpg',
    'part time job': 'part_time_job.jpg',
    'scout training': 'scout_training.jpg',
    'nice for sale': 'nice_for_sale.jpg',
    'cool for sale': 'cool_for_sale.jpg',
    'quality over quantity': 'quality_over_quantity.jpg',
    'sharpened stick': 'sharpened_stick.jpg',
    'gas leak': 'gas_leak.jpg',
};

// Explicit aliases for game-card names that do not map 1:1 to file names.
const GAME_ART_ALIAS_MANIFEST: Record<string, string> = {
    'a+ student': 'aplus_student.jpg',
    '3d printed walls': 'printed_walls.jpg',
    'a random ten dollar bill': 'ten_dollar.jpg',
    'abandoned locker': 'abandoned_notebook.jpg',
    'dark room developments': 'photo_lab.jpg',
    'crusty band-aid': 'crusty_bandaid.jpg',
    'loudspeaker announcement': 'pa_announcement.jpg',
    "nurse's station": 'nurses_station.jpg',
    'oops!': 'oops.jpg',
    "principal's secret": 'principals_secret.jpg',
    "shop teacher's pet": 'shop_teachers_pet.jpg',
    'shut that door!': 'shut_that_door.jpg',
    'they just keep coming!': 'they_just_keep_coming.jpg',
    'well-worn book': 'well_worn_book.jpg',
    "lunchlady's helper": 'lunchladys_helper.jpg',
    'wall it off!': 'wall_it_off.jpg',
};

function normalizeManifestMap(input: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input)) out[normalizeKey(k)] = v;
    return out;
}

const HERO_ART_BY_KEY = normalizeManifestMap(HERO_ART_MANIFEST);
const LOCKER_ART_BY_KEY = normalizeManifestMap(LOCKER_ART_MANIFEST);
const GAME_ART_ALIAS_BY_KEY = normalizeManifestMap(GAME_ART_ALIAS_MANIFEST);

function normalizeKey(input: string): string {
    return String(input || '')
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]*starting action[^)]*\)/gi, ' ')
        .replace(/\bpassive\b/gi, ' ')
        .replace(/\s+--\s+.*/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function toSnakeCase(input: string): string {
    return String(input || '')
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]*starting action[^)]*\)/gi, ' ')
        .replace(/\bpassive\b/gi, ' ')
        .replace(/\s+--\s+.*/g, ' ')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}

function resolveHeroArt(normalized: string): string | undefined {
    return HERO_ART_BY_KEY[normalized];
}

function resolveLockerArt(normalized: string): string | undefined {
    return LOCKER_ART_BY_KEY[normalized];
}

export function resolveHeroArtUrlByName(name: string): string | undefined {
    const heroFile = resolveHeroArt(normalizeKey(name));
    return heroFile ? `${HERO_ART_BASE}/${heroFile}` : undefined;
}

export function resolveLockerArtUrlByName(name: string): string | undefined {
    const lockerFile = resolveLockerArt(normalizeKey(name));
    return lockerFile ? `${LOCKER_ART_BASE}/${lockerFile}` : undefined;
}

export type CardArtKind = 'hero' | 'locker' | 'game';

export type CardArtInfo = {
    url: string;
    kind: CardArtKind;
};

export function resolveCardArtInfo(card: CardModel): CardArtInfo {
    const raw = String(card.name || '');
    const normalized = normalizeKey(raw);

    const heroFile = resolveHeroArt(normalized);
    if (heroFile) return { url: `${HERO_ART_BASE}/${heroFile}`, kind: 'hero' };

    const lockerFile = resolveLockerArt(normalized);
    if (lockerFile) return { url: `${LOCKER_ART_BASE}/${lockerFile}`, kind: 'locker' };

    const aliasFile = GAME_ART_ALIAS_BY_KEY[normalized];
    if (aliasFile) return { url: `${GAME_ART_BASE}/${aliasFile}`, kind: 'game' };

    return { url: `${GAME_ART_BASE}/${toSnakeCase(raw)}.jpg`, kind: 'game' };
}

export function resolveCardArtUrl(card: CardModel): string {
    return resolveCardArtInfo(card).url;
}
