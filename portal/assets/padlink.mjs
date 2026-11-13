// The phone pad's connection (the SOUND STUDIO's PHONE button, and the phone's page /studio/pad/): a WebRTC data channel between the
// studio's page on the PC and the phone's page, so a played note takes the wifi and nothing else. The two find each other through the
// site (worker/pad.js: the studio puts an offer under a six digit code, the phone reads it and answers); the notes never touch the site.
//
// Messages are JSON arrays: ['on', note, velocity] ['off', note] ['cc', number, value] (the phone to the studio), ['pads', { mode, pads }]
// and ['ping', t] (the studio to the phone; ['pong', t] comes back and is the round trip time). Either side may stop; the studio, which
// owns the code, makes a new offer when the channel is lost, and the phone, which is polling for one, answers it.
export const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };   // (the wifi is tried first; this is for a network that hides it)
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => (b % 36).toString(36)).join('');
export const newCode = () => String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);

async function call(method, path, body) {
  const r = await fetch(path, { method, cache: 'no-store', headers: { 'X-Pixelite': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(json.error || `HTTP ${r.status}`), { status: r.status });
  return json;
}
// resolves when the browser has found its network addresses (the offer or answer carries them: no trickling), or after `ms`
const gathered = (pc, ms = 2500) => new Promise(done => {
  if (pc.iceGatheringState === 'complete') return done();
  const t = setTimeout(done, ms);
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); done(); } });
});

/** the studio's side: owns the code, makes the offers, receives the notes. state: 'waiting' (for the phone) | 'connecting' | 'open' | 'lost' */
export class PadHost {
  constructor({ code = newCode(), onMessage = () => {}, onState = () => {}, config = RTC_CONFIG } = {}) {
    Object.assign(this, { code, onMessage, onState, config, stopped: false, rtt: null });
  }
  state(s) { this.status = s; this.onState(s, this); }
  async start() { this.stopped = false; await this.offer(); return this; }
  async offer() {
    if (this.stopped) return;
    const pc = this.pc = new RTCPeerConnection(this.config), id = this.id = newId(), ch = this.ch = pc.createDataChannel('pad');
    const lost = () => { if (this.pc !== pc || this.stopped) return; this.pc = null; this.ch = null; clearInterval(this.pinger); pc.close(); this.rtt = null; this.state('lost'); setTimeout(() => this.offer(), 900); };
    ch.onopen = () => {
      clearTimeout(this.giveUp); this.state('open');
      clearInterval(this.pinger); this.pinger = setInterval(() => this.send(['ping', performance.now()]), 2000); this.send(['ping', performance.now()]);
    };
    ch.onclose = lost;
    ch.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m[0] === 'pong') { this.rtt = Math.round(performance.now() - m[1]); this.onState(this.status, this); } else this.onMessage(m);
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) lost(); };
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    if (this.pc !== pc || this.stopped) return;
    await call('PUT', `/api/pad/${this.code}`, { offer: { id, sdp: pc.localDescription.sdp } });
    this.state('waiting');
    this.watch(pc, id, lost);   // (in the background: start() is done once the offer is put)
  }
  // wait for the phone's answer under this offer's id (a new offer is made every four minutes the phone stays away: the link lives ten)
  async watch(pc, id, lost) {
    for (let waited = 0; this.pc === pc && !this.stopped; waited += 1000) {
      await sleep(1000);
      if (this.pc !== pc || this.stopped) return;
      if (waited >= 240_000) { pc.close(); this.pc = null; return this.offer(); }
      let r; try { r = await call('GET', `/api/pad/${this.code}`); } catch { continue; }
      if (r.answer && r.answer.id === id) {
        this.state('connecting');
        await pc.setRemoteDescription({ type: 'answer', sdp: r.answer.sdp });
        this.giveUp = setTimeout(lost, 25_000);   // an answer that never becomes a channel (a network that blocks it): try again
        return;
      }
    }
  }
  send(m) { if (this.ch && this.ch.readyState === 'open') this.ch.send(JSON.stringify(m)); }
  async stop() {
    this.stopped = true; clearInterval(this.pinger); clearTimeout(this.giveUp);
    if (this.pc) this.pc.close();
    this.pc = this.ch = null;
    try { await call('DELETE', `/api/pad/${this.code}`); } catch { }
    this.state('stopped');
  }
}

/** the phone's side: polls for the studio's offer under the code, answers it, and answers again whenever the studio makes a new one.
 *  state: 'looking' (no studio under the code) | 'connecting' | 'open' | 'lost' | 'stopped' */
export class PadGuest {
  constructor({ code, onMessage = () => {}, onState = () => {}, config = RTC_CONFIG } = {}) { Object.assign(this, { code, onMessage, onState, config, stopped: false, lastId: null }); }
  state(s) { this.status = s; this.onState(s, this); }
  send(m) { if (this.ch && this.ch.readyState === 'open') this.ch.send(JSON.stringify(m)); }
  async run() {
    while (!this.stopped) {
      let r;
      try { r = await call('GET', `/api/pad/${this.code}`); } catch (e) { if (this.status !== 'open') this.state(this.status === 'lost' ? 'lost' : 'looking'); await sleep(1500); continue; }
      if (r.offer.id === this.lastId) { await sleep(1500); continue; }   // the one already answered: wait for a new one
      this.lastId = r.offer.id; this.state('connecting');
      try { await this.answer(r.offer); } catch (e) { this.state('lost'); }
    }
  }
  async answer(offer) {
    const pc = this.pc = new RTCPeerConnection(this.config);
    const closed = new Promise(res => { pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) res(); }; });
    const opened = new Promise(res => { pc.ondatachannel = e => {
      const ch = this.ch = e.channel;
      ch.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m[0] === 'ping') this.send(['pong', m[1]]); else this.onMessage(m);
      };
      ch.onclose = () => { this.ch = null; res('closed'); };
      if (ch.readyState === 'open') res('open'); else ch.onopen = () => res('open');
    }; });
    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    await call('PUT', `/api/pad/${this.code}/answer`, { answer: { id: offer.id, sdp: pc.localDescription.sdp } });
    const first = await Promise.race([opened, sleep(25_000).then(() => 'timeout')]);
    if (first === 'open') {
      this.state('open');
      await Promise.race([closed, new Promise(res => { const prev = this.ch.onclose; this.ch.onclose = () => { prev(); res(); }; })]);
    }
    pc.close(); this.pc = this.ch = null;
    if (!this.stopped) this.state('lost');
  }
  stop() { this.stopped = true; if (this.pc) this.pc.close(); this.state('stopped'); }
}
