/** Presentation-only catalog. Keys do not replace backend species identifiers. */
export type SpiritSpecies =
  | 'cat'
  | 'otter'
  | 'dog'
  | 'rabbit'
  | 'penguin'
  | 'bird'
  | 'deer'
  | 'fennec'
export type SpiritDefinition = {
  /**
   * The spirit's name, e.g. '貓精靈' -- the animal drawn.
   *
   * Not `guardian.name`, which is the egg's ('暖陽之蛋'): you buy an egg
   * and raise a spirit, and both names are rendered, in their own places.
   * None of the eight egg names mentions an animal, which is the whole
   * difference between them.
   *
   * It stays here rather than moving to the database because it is bound
   * to the files, and files only ship by deploy. 2026-11-16 is the proof:
   * the rights spirit changed from a dolphin to a penguin, so this name
   * changed and ten .webp files shipped, while insert_guardian.sql was
   * not touched at all -- the egg stayed 共鳴之蛋. In the database the
   * same change would be a deploy plus a SQL run that must be kept in
   * step, and forgetting the SQL would print '海豚精靈' over a picture of
   * a penguin with nothing failing. Here a wrong name can only arrive
   * through a reviewable code change. `stages` and `tone` are the same
   * kind of data for the same reason.
   */
  name: string
  /** Absent until the five files ship, which `artworkFor` checks. */
  artwork?: string
  /** Scene background. 'forest' is the base `.sp-scene`; only 'sky' overrides it. */
  tone: 'forest' | 'sky'
  /** One label per level, indexed by it, so exactly five. */
  stages: readonly string[]
}

// There is no `category` field. It named the cause a species supported,
// which is the database's to say (`guardian.category_id`) and was a
// fourth copy of charity_category.name in the frontend -- and
// SpiritStatusCard rendered that copy, so renaming a category in the
// database made the card lie. Dropped 2026-11-21: the card takes the
// label its caller already has from the API. The only other reader was a
// localStorage donation demo, which took a copy of its own that day and
// was itself deleted hours later.
export const spiritCatalog: Record<SpiritSpecies, SpiritDefinition> = {
  cat: {
    name: '貓精靈',
    artwork: '/illustrations/guardians/cat',
    tone: 'forest',
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],
  },
  otter: {
    name: '水獺精靈',
    artwork: '/illustrations/guardians/otter',
    tone: 'sky',
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],
  },
  dog: {
    name: '狗精靈',
    artwork: '/illustrations/guardians/dog',
    tone: 'forest',
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],
  },
  rabbit: {
    name: '兔子精靈',
    artwork: '/illustrations/guardians/rabbit',
    tone: 'forest',
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],
  },
  penguin: {
    name: '企鵝精靈',
    artwork: '/illustrations/guardians/penguin',
    tone: 'sky',
    stages: ['初生', '萌芽', '探索', '壯大', '綻放'],
  },
  bird: {
    name: '彩羽鳥靈',
    artwork: '/illustrations/guardians/bird',
    tone: 'sky',
    stages: ['初生', '萌芽', '探索', '展翼', '綻放'],
  },
  deer: {
    name: '森林鹿靈',
    artwork: '/illustrations/guardians/deer',
    tone: 'forest',
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],
  },
  fennec: {
    name: '星冠狐靈',
    artwork: '/illustrations/guardians/fennec',
    tone: 'forest',
    stages: ['初生', '萌芽', '探索', '壯大', '綻放'],
  },
}

/**
 * The drawn spirit a `guardian.code` depicts, or undefined when none is
 * drawn -- a normal state, and every caller falls back to the locked egg.
 *
 * A function rather than the `artworkByCode` table that stood here until
 * 2026-11-21. The codes were named after the category then
 * (`children`, `forest`, ...) so a table was needed to reach the species;
 * they now name the species itself, which makes the table the identity
 * map. Deleting it removes the copy that could disagree with
 * `spiritCatalog` -- a code present in one and absent from the other
 * showed the locked egg on one screen and the spirit on another.
 *
 * It checks `artwork`, not just membership, so a catalog entry added
 * before its files ship cannot claim artwork that `spiritImage` would
 * then return undefined for. GUARDIAN.md warned about exactly that; it is
 * now unrepresentable.
 */
export function artworkFor(code: string): SpiritSpecies | undefined {
  const species = code as SpiritSpecies
  return spiritCatalog[species]?.artwork !== undefined ? species : undefined
}

export function spiritImage(species: SpiritSpecies, level: number) {
  const root = spiritCatalog[species].artwork
  return root
    ? `${root}/lv${Math.max(1, Math.min(5, Math.trunc(level)))}.webp`
    : undefined
}
