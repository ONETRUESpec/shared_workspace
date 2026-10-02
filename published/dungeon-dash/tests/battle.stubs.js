/* Dungeon Dash — test stubs for the battle simulation.
 * Minimal DD.data and DD.state that follow the CONTRACT.md shapes. tests/battle.sim.mjs loads this
 * only when the real src/js/data.js / src/js/state.js are missing or fail to load; each half is
 * installed only if the corresponding module is absent. Node-only, no DOM. */
(function (DD) {
  'use strict';

  // ------------------------------------------------------------------ DD.data stub
  if (!DD.data) {
    const BIOMES = [
      { id: 'crypt', name: 'The Crypt', enemies: ['skeleton', 'bat', 'slime'], boss: 'lich' },
      { id: 'fungal', name: 'Fungal Hollows', enemies: ['mushroom', 'spider', 'sporeling'], boss: 'myconid_king' },
      { id: 'forge', name: 'Magma Forge', enemies: ['imp', 'magma_golem', 'fire_hound'], boss: 'infernal' },
      { id: 'clockwork', name: 'Clockwork Depths', enemies: ['cog_knight', 'steam_bot', 'gear_rat'], boss: 'brass_colossus' },
      { id: 'neon', name: 'Neon Grid', enemies: ['drone', 'cyber_ninja', 'mech'], boss: 'ai_core' },
      { id: 'void', name: 'Void Rift', enemies: ['alien', 'void_eye', 'tentacle'], boss: 'void_titan' },
    ];
    const e = (name, o) =>
      Object.assign(
        { name, hpMult: 1, atkMult: 1, speed: 40, range: 18, atkSpeed: 0.8, flying: false, ranged: false,
          projectile: null, w: 18, h: 20, boss: false },
        o,
      );
    const boss = (name, o) => e(name, Object.assign({ boss: true, w: 44, h: 48, speed: 26, atkSpeed: 0.6 }, o));
    const ENEMIES = {
      skeleton: e('Skeleton', {}),
      bat: e('Bat', { flying: true, speed: 60, w: 16, h: 14, hpMult: 0.7 }),
      slime: e('Slime', { speed: 26, hpMult: 1.6, atkMult: 0.8, w: 20, h: 16 }),
      mushroom: e('Mushroom', {}),
      spider: e('Spider', { speed: 58, hpMult: 0.8 }),
      sporeling: e('Sporeling', { ranged: true, projectile: 'spit', range: 110 }),
      imp: e('Imp', { ranged: true, projectile: 'fireball', range: 120 }),
      magma_golem: e('Magma Golem', { speed: 24, hpMult: 1.7, w: 22, h: 24 }),
      fire_hound: e('Fire Hound', { speed: 62, hpMult: 0.8 }),
      cog_knight: e('Cog Knight', {}),
      steam_bot: e('Steam Bot', { ranged: true, projectile: 'bolt', range: 116 }),
      gear_rat: e('Gear Rat', { speed: 62, hpMult: 0.75, w: 16, h: 12 }),
      drone: e('Drone', { ranged: true, flying: true, projectile: 'laser', range: 126, h: 14 }),
      cyber_ninja: e('Cyber Ninja', { speed: 64, hpMult: 0.85 }),
      mech: e('Mech', { speed: 24, hpMult: 1.7, w: 22, h: 24 }),
      alien: e('Alien', {}),
      void_eye: e('Void Eye', { ranged: true, flying: true, projectile: 'orb', range: 120, h: 16 }),
      tentacle: e('Tentacle', { speed: 24, hpMult: 1.7, w: 20, h: 24 }),
      lich: boss('Lich', { ranged: true, projectile: 'orb', range: 120 }),
      myconid_king: boss('Myconid King', {}),
      infernal: boss('Infernal', {}),
      brass_colossus: boss('Brass Colossus', { w: 50, h: 52 }),
      ai_core: boss('AI Core', { ranged: true, projectile: 'laser', range: 130 }),
      void_titan: boss('Void Titan', { w: 52, h: 56 }),
      dragon: boss('Dragon', { w: 60, h: 58, speed: 24 }),
      zombie: e('Zombie', { speed: 34 }),
      stone_golem: boss('Stone Golem', { w: 48, h: 52, speed: 20, atkSpeed: 0.5 }),
      overlord: boss('Overlord', { w: 56, h: 60, flying: true }),
    };
    const SKILLS = {
      bomb: { id: 'bomb', name: 'Fire Bomb', cd: 8, unlock: 0 },
      blades: { id: 'blades', name: 'Spinning Blades', cd: 12, unlock: 10 },
      warcry: { id: 'warcry', name: 'Battle Cry', cd: 15, unlock: 10 },
      heal: { id: 'heal', name: 'Healing Light', cd: 14, unlock: 15 },
      lightning: { id: 'lightning', name: 'Chain Lightning', cd: 7, unlock: 20 },
      shield: { id: 'shield', name: 'Arcane Shield', cd: 18, unlock: 20 },
      frost: { id: 'frost', name: 'Frost Nova', cd: 16, unlock: 30 },
      meteor: { id: 'meteor', name: 'Meteor Strike', cd: 20, unlock: 40 },
    };
    const ALLIES = {
      wolf: { id: 'wolf', name: 'Dire Wolf', cost: 100 },
      fairy: { id: 'fairy', name: 'Pixie', cost: 200 },
      drone_ally: { id: 'drone_ally', name: 'Battle Drone', cost: 400 },
      golem_ally: { id: 'golem_ally', name: 'Ember Golem', cost: 600 },
    };
    // An array on purpose, to exercise battle's array lookup path.
    const DUNGEONS = [
      { id: 'dragon', name: "Dragon's Lair", unlockFloor: 3, boss: 'dragon' },
      { id: 'horde', name: 'Zombie Horde', unlockFloor: 6, enemy: 'zombie', count: 25 },
      { id: 'vault', name: 'Golem Vault', unlockFloor: 10, boss: 'stone_golem' },
      { id: 'mothership', name: 'Mothership', unlockFloor: 20, boss: 'overlord' },
    ];
    const biomeForFloor = (f) => BIOMES[Math.floor((Math.max(1, f) - 1) / 10) % 6];

    DD.data = {
      BIOMES, ENEMIES, SKILLS, ALLIES, DUNGEONS,
      WAVES_PER_FLOOR: 5, BOSS_TIME: 30, DUNGEON_TIME: 45, MAX_KEYS: 5,
      biomeForFloor,
      enemyStats(floor, typeId, opts) {
        const def = ENEMIES[typeId] || ENEMIES.skeleton;
        const isBoss = !!(opts && opts.isBoss);
        const g = Math.pow(1.16, floor - 1);
        return {
          hp: 22 * g * def.hpMult * (isBoss ? 14 : 1),
          atk: 3 * g * def.atkMult * (isBoss ? 2.4 : 1),
          atkSpeed: def.atkSpeed,
          gold: 2 * g * (isBoss ? 12 : 1),
          xp: 3 * Math.pow(1.1, floor - 1) * (isBoss ? 10 : 1),
        };
      },
      waveComposition(floor, wave) {
        const b = biomeForFloor(floor);
        if (wave >= 5) {
          const out = [b.boss];
          for (let i = 0; i < Math.min(2, Math.floor(floor / 3)); i++) out.push(b.enemies[i]);
          return out;
        }
        const n = Math.min(6, 3 + Math.floor((wave + (floor % 4)) / 2));
        const out = [];
        for (let i = 0; i < n; i++) out.push(DD.pick(b.enemies));
        return out;
      },
      heroBaseStats(level) {
        return { atk: 10 * Math.pow(1.09, level - 1), hp: 100 * Math.pow(1.09, level - 1) };
      },
      xpToNext(level) {
        return Math.floor(20 * Math.pow(1.25, level - 1));
      },
      skillParams(id, L) {
        const k = L - 1;
        switch (id) {
          case 'bomb': return { dmg: 3 + 0.3 * k };
          case 'blades': return { dmg: 0.6 + 0.06 * k, duration: 5, tick: 0.5, radius: 70 };
          case 'warcry': return { buffAtk: 0.3 + 0.03 * k, buffSpd: 0.2, duration: 6 };
          case 'heal': return { heal: 0.25 + 0.015 * k };
          case 'lightning': return { dmg: 2.2 + 0.22 * k, targets: 3 + Math.floor(L / 5) };
          case 'shield': return { shield: 0.3 + 0.02 * k, duration: 8 };
          case 'frost': return { dmg: 1.5 + 0.15 * k, freeze: 2.5 + 0.05 * k };
          case 'meteor': return { dmg: 6 + 0.6 * k, stun: 1.5 };
          default: return {};
        }
      },
      allyParams(id, L) {
        const k = L - 1;
        switch (id) {
          case 'wolf': return { interval: 1.2, dmg: 0.4 + 0.05 * k };
          case 'fairy': return { interval: 2, heal: 0.03 + 0.003 * k };
          case 'drone_ally': return { interval: 0.6, dmg: 0.25 + 0.03 * k };
          case 'golem_ally': return { interval: 3, dmg: 0.8 + 0.08 * k, radius: 90 };
          default: return { interval: 1.5 };
        }
      },
      dungeonRewards(id, level) {
        switch (id) {
          case 'dragon': return { scrolls: 4 + level * 2 };
          case 'horde': return { gems: 20 + level * 10 };
          case 'vault': return { premiumChests: 1 + Math.floor(level / 2) };
          default: return { gold: 5000 * level, scrolls: 3 };
        }
      },
    };
  }

  // ------------------------------------------------------------------ DD.state stub
  if (!DD.state) {
    const fresh = () => ({
      version: 1, createdAt: 0, lastSeen: 0,
      hero: { level: 1, xp: 0 },
      gold: 0, gems: 0, keys: 3, scrolls: 0, chests: 10, premiumChests: 0, chestLevel: 1,
      equipped: { weapon: null, helmet: null, armor: null, gloves: null, boots: null, belt: null, ring: null, amulet: null },
      pendingItem: null,
      campaign: { floor: 1, wave: 1, highestFloor: 1, farming: false },
      skills: { owned: { bomb: 1 }, equipped: ['bomb', null, null, null] },
      allies: { owned: {}, equipped: [null, null] },
      mastery: { might: 0, vitality: 0, greed: 0, fortune: 0, precision: 0, patience: 0 },
      dungeons: { dragon: { level: 1 }, horde: { level: 1 }, vault: { level: 1 }, mothership: { level: 1 } },
      keyRegenAt: 0,
      quest: { index: 0, claimedIds: [] },
      stats: { kills: 0, bossKills: 0, chestsOpened: 0, itemsSold: 0, itemsEquipped: 0, flyingChests: 0,
               dungeonsWon: 0, deaths: 0, playTime: 0, goldEarned: 0, bestItemRarity: -1 },
      settings: { sound: true, speed: 1, autoSkill: true, autoBoss: true,
                  autoLoot: { sell: [true, true, false, false, false, false, false], autoEquip: true, stopRarity: 4 } },
      autoOpen: false,
    });
    const changed = () => DD.bus.emit('state:changed', {});
    let memo = null;

    const st = (DD.state = {
      s: fresh(),
      load() {
        st.s = fresh();
        memo = null;
        changed();
      },
      reset() {
        st.load();
      },
      tick() {},
      getHeroStats() {
        if (memo) return memo;
        const base = DD.data.heroBaseStats(st.s.hero.level);
        memo = {
          atk: base.atk, hp: base.hp, atkSpeed: 1, critChance: 0.05, critDmg: 1.5, combo: 0, counter: 0,
          dodge: 0, stun: 0, lifesteal: 0, regen: 0, skillDmg: 0, bossDmg: 0, goldBonus: 0, chestChance: 0.3,
        };
        return memo;
      },
      addXp(n) {
        const h = st.s.hero;
        h.xp += n;
        let up = false;
        while (h.xp >= DD.data.xpToNext(h.level)) {
          h.xp -= DD.data.xpToNext(h.level);
          h.level++;
          up = true;
          DD.bus.emit('levelup', { level: h.level });
        }
        if (up) {
          memo = null;
          DD.bus.emit('stats:changed', {});
        }
        changed();
      },
      addKeys(n) {
        st.s.keys = Math.min(5, st.s.keys + n);
        changed();
      },
      grantKill(info) {
        const stats = st.getHeroStats();
        const gold = Math.floor(info.gold * (1 + stats.goldBonus));
        st.s.gold += gold;
        st.s.stats.kills++;
        if (info.isBoss) st.s.stats.bossKills++;
        const chest = Math.random() < stats.chestChance;
        if (chest) st.s.chests++;
        st.addXp(info.xp);
        return { gold, xp: info.xp, chest };
      },
      onFloorCleared(floor) {
        const c = st.s.campaign;
        c.floor = floor + 1;
        c.highestFloor = Math.max(c.highestFloor, c.floor);
        c.wave = 1;
        const rewards = { chests: 3, gold: Math.floor(50 * Math.pow(1.16, floor)), gems: floor % 5 === 0 ? 10 : 0 };
        st.s.chests += rewards.chests;
        st.s.gold += rewards.gold;
        st.s.gems += rewards.gems;
        changed();
        return rewards;
      },
      setWave(n) {
        st.s.campaign.wave = n;
        changed();
      },
      setFarming(b) {
        st.s.campaign.farming = !!b;
        changed();
      },
      onHeroDied() {
        st.s.stats.deaths++;
        changed();
      },
      grantFlyingChest() {
        st.s.stats.flyingChests++;
        const r = DD.pick([
          { type: 'gems', amount: 5, label: '+5 Gems' },
          { type: 'chests', amount: 2, label: '+2 Chests' },
          { type: 'gold', amount: 100, label: '+100 Gold' },
          { type: 'key', amount: 1, label: '+1 Key' },
          { type: 'scrolls', amount: 2, label: '+2 Scrolls' },
        ]);
        changed();
        return r;
      },
      grantDungeonWin(id) {
        const d = st.s.dungeons[id];
        const rewards = DD.data.dungeonRewards(id, d.level);
        d.level++;
        st.s.stats.dungeonsWon++;
        changed();
        return rewards;
      },
      useKey() {
        if (st.s.keys <= 0) return false;
        st.s.keys--;
        changed();
        return true;
      },
      skillSlotsUnlocked() {
        const h = st.s.campaign.highestFloor;
        return h >= 25 ? 4 : h >= 12 ? 3 : h >= 5 ? 2 : 1;
      },
      allySlotsUnlocked() {
        const h = st.s.campaign.highestFloor;
        return h >= 20 ? 2 : h >= 4 ? 1 : 0;
      },
      serialize() {
        return JSON.stringify(st.s);
      },
    });
  }
})(globalThis.DD);
