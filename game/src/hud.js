// HUD for FROSTLINE: every update goes through textContent or
// createElement — no innerHTML anywhere, so no injection surface.
// The DOM itself lives in index.html; this module owns its state.
import { WEAPONS, GRENADE, ARMOR_PRICE, BUY_ORDER } from './weapons.js';

export class Hud {
  constructor(doc) {
    this.doc = doc;
    this.el = {};
    const ids = ['crosshair', 'hitmarker', 'ammo-mag', 'ammo-reserve', 'weapon-name',
      'grenade-count', 'health-fill', 'health-num', 'armor-num', 'money', 'timer',
      'score-north', 'score-storm', 'round-num', 'objective-text', 'killfeed', 'banner',
      'banner-title', 'banner-sub', 'buy-menu', 'buy-rows', 'buy-money', 'deploy',
      'scoreboard', 'score-rows', 'progress', 'progress-fill', 'progress-label',
      'damage-flash', 'toast', 'match-end', 'match-title', 'match-sub', 'spectate',
      'phase-label', 'beacon-hint'];
    for (const id of ids) this.el[id] = doc.getElementById(id);
    this._buildBuyRows();
    this._bannerTimer = null;
    this._toastTimer = null;
    this._hitTimer = null;
  }

  _buildBuyRows() {
    const rows = this.el['buy-rows'];
    while (rows.firstChild) rows.removeChild(rows.firstChild);
    const defs = [
      { id: 'pistol', name: WEAPONS.pistol.name, price: 0, desc: '12-round sidearm · reliable' },
      { id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, desc: 'Fast close-range spray' },
      { id: 'rifle', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, desc: 'Accurate all-rounder' },
      { id: 'sniper', name: WEAPONS.sniper.name, price: WEAPONS.sniper.price, desc: 'One shot, long sightlines' },
      { id: 'grenade', name: GRENADE.name, price: GRENADE.price, desc: 'Thrown cryo charge · radius damage' },
      { id: 'armor', name: 'Plated Vest', price: ARMOR_PRICE, desc: '+100 armor · absorbs half of hits' },
    ];
    this.buyRowEls = {};
    defs.forEach((def, i) => {
      const row = this.doc.createElement('div');
      row.className = 'buy-row';
      const key = this.doc.createElement('span');
      key.className = 'buy-key';
      key.textContent = String(i + 1);
      const name = this.doc.createElement('span');
      name.className = 'buy-name';
      name.textContent = def.name;
      const desc = this.doc.createElement('span');
      desc.className = 'buy-desc';
      desc.textContent = def.desc;
      const price = this.doc.createElement('span');
      price.className = 'buy-price';
      price.textContent = def.price === 0 ? 'OWNED' : `$${def.price.toLocaleString('en-US')}`;
      const state = this.doc.createElement('span');
      state.className = 'buy-state';
      row.appendChild(key);
      row.appendChild(name);
      row.appendChild(desc);
      row.appendChild(price);
      row.appendChild(state);
      rows.appendChild(row);
      this.buyRowEls[def.id] = { row, price, state, def };
    });
  }

  updateBuy(player) {
    this.el['buy-money'].textContent = `$${player.money.toLocaleString('en-US')}`;
    for (const id of BUY_ORDER) {
      const entry = this.buyRowEls[id];
      if (!entry) continue;
      const { def, state, row } = entry;
      let label = '';
      let owned = false;
      if (id === 'armor') {
        owned = player.loadout.armor >= 100;
        label = owned ? 'EQUIPPED' : player.money < ARMOR_PRICE ? 'NO CASH' : '';
      } else if (id === 'grenade') {
        owned = player.loadout.grenades >= 2;
        label = player.loadout.grenades > 0 ? `x${player.loadout.grenades}` : '';
        if (player.money < GRENADE.price && !owned) label = 'NO CASH';
      } else {
        const slot = player.loadout[id];
        owned = slot.mag > 0 || slot.reserve > 0;
        const current = player.loadout.current === id;
        label = current ? 'IN HAND' : owned ? 'OWNED' : player.money < def.price ? 'NO CASH' : '';
      }
      state.textContent = label;
      row.classList.toggle('owned', owned);
      row.classList.toggle('current', player.loadout.current === id);
    }
  }

  showBuy(show) {
    this.el['buy-menu'].hidden = !show;
  }

  setHealth(hp, armor) {
    this.el['health-num'].textContent = String(Math.max(0, Math.ceil(hp)));
    this.el['health-fill'].style.width = `${Math.max(0, Math.min(100, hp))}%`;
    this.el['armor-num'].textContent = armor > 0 ? `ARMOR ${Math.ceil(armor)}` : '';
  }

  setAmmo(mag, reserve, weaponName, grenades) {
    this.el['ammo-mag'].textContent = String(mag);
    this.el['ammo-reserve'].textContent = `/ ${reserve}`;
    this.el['weapon-name'].textContent = weaponName;
    this.el['grenade-count'].textContent = grenades > 0 ? `◈ x${grenades}` : '';
  }

  setMoney(money) {
    this.el.money.textContent = `$${money.toLocaleString('en-US')}`;
  }

  setTimer(seconds, planted) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    this.el.timer.textContent = `${m}:${String(r).padStart(2, '0')}`;
    this.el.timer.classList.toggle('planted', !!planted);
  }

  setScore(north, storm, round) {
    this.el['score-north'].textContent = String(north);
    this.el['score-storm'].textContent = String(storm);
    this.el['round-num'].textContent = `ROUND ${round}`;
  }

  setObjective(text) {
    this.el['objective-text'].textContent = text;
  }

  setPhase(text) {
    this.el['phase-label'].textContent = text;
  }

  setBeaconHint(text) {
    this.el['beacon-hint'].textContent = text;
  }

  setSpectate(text) {
    this.el.spectate.textContent = text;
  }

  feedKill(killer, victim, killerTeam, headshot) {
    const feed = this.el.killfeed;
    const line = this.doc.createElement('div');
    line.className = 'feed-line';
    const k = this.doc.createElement('span');
    k.className = killerTeam === 'northlight' ? 'feed-north' : 'feed-storm';
    k.textContent = killer;
    const mid = this.doc.createElement('span');
    mid.className = 'feed-mid';
    mid.textContent = headshot ? '  ⌖  ' : '  →  ';
    const v = this.doc.createElement('span');
    v.className = killerTeam === 'northlight' ? 'feed-storm' : 'feed-north';
    v.textContent = victim;
    line.appendChild(k);
    line.appendChild(mid);
    line.appendChild(v);
    feed.appendChild(line);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
    setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 6000);
  }

  showBanner(title, sub, holdMs = 3600) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub;
    this.el.banner.hidden = false;
    if (this._bannerTimer) clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => { this.el.banner.hidden = true; }, holdMs);
  }

  hideBanner() {
    if (this._bannerTimer) clearTimeout(this._bannerTimer);
    this.el.banner.hidden = true;
  }

  toast(text, ms = 2200) {
    this.el.toast.textContent = text;
    this.el.toast.hidden = false;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.el.toast.hidden = true; }, ms);
  }

  hitmarker(on, holdMs = 120) {
    this.el.hitmarker.classList.toggle('on', on);
    if (this._hitTimer) clearTimeout(this._hitTimer);
    if (on) this._hitTimer = setTimeout(() => this.el.hitmarker.classList.remove('on'), holdMs);
  }

  damageFlash() {
    const el = this.el['damage-flash'];
    el.classList.remove('flash');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('flash');
  }

  setProgress(show, fraction, label) {
    this.el.progress.hidden = !show;
    if (show) {
      this.el['progress-fill'].style.width = `${Math.round(fraction * 100)}%`;
      this.el['progress-label'].textContent = label;
    }
  }

  showDeploy(show) {
    this.el.deploy.hidden = !show;
  }

  showScoreboard(show, rows) {
    this.el.scoreboard.hidden = !show;
    if (!show || !rows) return;
    const body = this.el['score-rows'];
    while (body.firstChild) body.removeChild(body.firstChild);
    for (const r of rows) {
      const tr = this.doc.createElement('tr');
      for (const cell of [r.name, r.team, String(r.kills), String(r.deaths)]) {
        const td = this.doc.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  showMatchEnd(title, sub) {
    this.el['match-title'].textContent = title;
    this.el['match-sub'].textContent = sub;
    this.el['match-end'].hidden = false;
  }

  hideMatchEnd() {
    this.el['match-end'].hidden = true;
  }
}
