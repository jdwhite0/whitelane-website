/* ═══════════════════════════════════════════════════════
   WHITE LANE — CINEMATIC INTRO ENGINE
   Night highway descent → vehicle arrival → brand reveal
   Canvas 2D | Procedural cinematic environment
═══════════════════════════════════════════════════════ */

class WhiteLaneIntro {

    constructor() {
        this.canvas  = document.getElementById('intro-canvas');
        this.ctx     = this.canvas.getContext('2d');
        this.done    = false;
        this.elapsed = 0;
        this.last    = null;

        // Total intro duration
        this.TOTAL   = 8500; // 8.5 seconds

        // Phase windows (normalized 0–1)
        this.PHASES = {
            aerial:     [0,     0.20],   // 0–1.7s  : high aerial view
            descent:    [0.20,  0.48],   // 1.7–4.1s: camera descends
            arrival:    [0.48,  0.72],   // 4.1–6.1s: vehicle approaches
            hold:       [0.72,  0.84],   // 6.1–7.1s: vehicle stopped
            transition: [0.84,  1.0 ]    // 7.1–8.5s: bloom + brand fade
        };

        // City lights (pre-generated, stable across frames)
        this.cityLights = this._genCityLights(120);

        // Vehicle image
        this.vehicle = new Image();
        this.vehicle.src = 'assets/rover_gold.png';

        // Light particles
        this.particles = [];
        this._particleTimer = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.W = this.canvas.width  = window.innerWidth;
        this.H = this.canvas.height = window.innerHeight;
    }

    start() {
        requestAnimationFrame(ts => this._frame(ts));
    }

    skip() {
        if (this.done) return;
        this._finish(true);
    }

    // ─── Internal ──────────────────────────────────────────────

    _frame(ts) {
        if (this.done) return;

        if (this.last === null) this.last = ts;
        const dt = Math.min(ts - this.last, 50); // cap at 50ms
        this.last = ts;
        this.elapsed = Math.min(this.elapsed + dt, this.TOTAL);

        const p = this.elapsed / this.TOTAL;
        this._render(p);

        if (p >= 1.0) { this._finish(false); return; }
        requestAnimationFrame(ts => this._frame(ts));
    }

    _phase(name, p) {
        const [a, b] = this.PHASES[name];
        return Math.max(0, Math.min(1, (p - a) / (b - a)));
    }

    // Easing
    _eio(t)  { return t < 0.5 ? 2*t*t : -1 + (4-2*t)*t; }
    _eout(t, n=3) { return 1 - Math.pow(1-t, n); }
    _ein(t, n=2)  { return Math.pow(t, n); }
    _lerp(a, b, t){ return a + (b - a) * t; }
    _clamp(v, lo=0, hi=1) { return Math.max(lo, Math.min(hi, v)); }

    // ─── Main Render ───────────────────────────────────────────

    _render(p) {
        const { ctx, W, H } = this;

        const aerialP  = this._phase('aerial',     p);
        const descentP = this._phase('descent',    p);
        const arrivalP = this._phase('arrival',    p);
        const holdP    = this._phase('hold',       p);
        const transP   = this._phase('transition', p);

        // Speed: 1.0 = aerial max, 0 = stopped
        const speed = p < 0.20 ? 1.0
                    : p < 0.48 ? this._lerp(1.0, 0.08, this._eio(descentP))
                    : p < 0.72 ? this._lerp(0.08, 0.0, this._eio(arrivalP))
                    : 0;

        // Vanishing point — high when aerial, drops to road level
        const VX = W * 0.5;
        const VY = H * (0.14 + 0.30 * this._eio(descentP));

        // ── Motion blur: partial clear ─────────────────────────
        // Fast = short trails (higher alpha clear), slow = long luminous trails
        const clearAlpha = 0.06 + 0.16 * speed;
        ctx.fillStyle = `rgba(2, 2, 5, ${clearAlpha})`;
        ctx.fillRect(0, 0, W, H);

        // ── Sky ───────────────────────────────────────────────
        this._renderSky(ctx, VX, VY, W, H);

        // ── City lights ───────────────────────────────────────
        const cityAlpha = this._clamp(aerialP * 1.5) * (1 - this._ein(descentP) * 0.8);
        if (cityAlpha > 0.01) this._renderCityLights(ctx, VX, VY, W, H, cityAlpha);

        // ── Road ─────────────────────────────────────────────
        this._renderRoad(ctx, VX, VY, W, H);

        // ── Lane lines ───────────────────────────────────────
        this._renderLaneLines(ctx, VX, VY, W, H, p, speed);

        // ── Light particles ───────────────────────────────────
        this._spawnParticles(VX, VY, W, H, speed, dt => {});
        this._renderParticles(ctx, speed);

        // ── Atmospheric haze ──────────────────────────────────
        this._renderHaze(ctx, VX, VY, W, H);

        // ── Depth gradient (near camera blur sim) ────────────
        if (p < 0.5) {
            const d = ctx.createLinearGradient(0, H*0.75, 0, H);
            d.addColorStop(0, 'rgba(0,0,0,0)');
            d.addColorStop(1, `rgba(2,2,5,${0.4 * (1 - descentP)})`);
            ctx.fillStyle = d;
            ctx.fillRect(0, H*0.75, W, H*0.25);
        }

        // ── Vehicle ──────────────────────────────────────────
        if (arrivalP > 0 && this.vehicle.complete) {
            this._renderVehicle(ctx, VX, VY, W, H, arrivalP, holdP);
        }

        // ── Vignette ─────────────────────────────────────────
        this._renderVignette(ctx, W, H);

        // ── Speed peripheral blur ─────────────────────────────
        if (speed > 0.25) this._renderSpeedPeriphery(ctx, W, H, speed);

        // ── Transition: white bloom + brand mark ─────────────
        if (transP > 0) {
            const bloom = this._eio(transP);

            // Bloom center — expands outward like a headlight
            const bloomR = W * 0.1 + W * 0.9 * bloom;
            const bg = ctx.createRadialGradient(W/2, H*0.5, 0, W/2, H*0.5, bloomR);
            bg.addColorStop(0,   `rgba(255,252,240, ${bloom})`);
            bg.addColorStop(0.4, `rgba(255,252,240, ${bloom * 0.6})`);
            bg.addColorStop(1,   `rgba(255,252,240, 0)`);
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // Full white fill at end
            if (bloom > 0.7) {
                ctx.fillStyle = `rgba(255,255,255,${(bloom - 0.7) / 0.3})`;
                ctx.fillRect(0, 0, W, H);
            }

            // Wordmark
            const wmIn  = this._clamp((transP - 0.05) / 0.35);
            const wmOut = this._clamp((transP - 0.60) / 0.40);
            const wmA   = this._eout(wmIn) * (1 - this._eio(wmOut));
            if (wmA > 0.01) {
                const el = document.getElementById('intro-wordmark');
                if (el) el.style.opacity = wmA;
            }
        }
    }

    // ─── Sky ───────────────────────────────────────────────────

    _renderSky(ctx, VX, VY, W, H) {
        const g = ctx.createLinearGradient(0, 0, 0, VY * 1.1);
        g.addColorStop(0,   '#010109');
        g.addColorStop(0.5, '#02020a');
        g.addColorStop(0.9, '#06060e');
        g.addColorStop(1,   '#0a080e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, VY * 1.1);

        // Warm horizon glow — city far away
        const hg = ctx.createRadialGradient(VX, VY, 0, VX, VY, W * 0.55);
        hg.addColorStop(0,   'rgba(45, 28, 8, 0.38)');
        hg.addColorStop(0.35,'rgba(20, 10, 3, 0.12)');
        hg.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(0, 0, W, VY * 1.4);
    }

    // ─── City Lights ───────────────────────────────────────────

    _genCityLights(n) {
        const lights = [];
        for (let i = 0; i < n; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const warm = Math.random() < 0.65;
            lights.push({
                xFrac: 0.5 + side * (0.08 + Math.random() * 0.48),
                yFrac: 0.05 + Math.random() * 0.85,
                r: warm ? 255 : 180 + Math.floor(Math.random() * 75),
                g: warm ? 160 + Math.floor(Math.random() * 80) : 190 + Math.floor(Math.random() * 65),
                b: warm ? 40  + Math.floor(Math.random() * 60) : 255,
                size: 0.6 + Math.random() * 2.2,
                brightness: 0.08 + Math.random() * 0.55,
            });
        }
        return lights;
    }

    _renderCityLights(ctx, VX, VY, W, H, alpha) {
        this.cityLights.forEach(l => {
            const x = l.xFrac * W;
            const y = l.yFrac * VY * 0.9;
            const s = l.size;
            const a = l.brightness * alpha;
            const g = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
            g.addColorStop(0, `rgba(${l.r},${l.g},${l.b},${a})`);
            g.addColorStop(1, `rgba(${l.r},${l.g},${l.b},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x - s*4, y - s*4, s*8, s*8);
        });
    }

    // ─── Road ──────────────────────────────────────────────────

    _renderRoad(ctx, VX, VY, W, H) {
        // Road polygon
        ctx.beginPath();
        ctx.moveTo(VX, VY);
        ctx.lineTo(W * 0.02, H);
        ctx.lineTo(W * 0.98, H);
        ctx.closePath();

        const rg = ctx.createLinearGradient(VX, VY, VX, H);
        rg.addColorStop(0,    '#050508');
        rg.addColorStop(0.15, '#08080c');
        rg.addColorStop(0.6,  '#0c0c10');
        rg.addColorStop(1,    '#101014');
        ctx.fillStyle = rg;
        ctx.fill();

        // Wet reflection — two specular strips flanking center
        [0.43, 0.57].forEach(xFrac => {
            ctx.beginPath();
            ctx.moveTo(VX, VY);
            ctx.lineTo(W * (xFrac - 0.04), H);
            ctx.lineTo(W * (xFrac + 0.04), H);
            ctx.closePath();
            const sg = ctx.createLinearGradient(VX, VY, VX, H);
            sg.addColorStop(0,   'rgba(255,255,255,0)');
            sg.addColorStop(0.4, 'rgba(255,255,255,0.008)');
            sg.addColorStop(1,   'rgba(255,255,255,0.022)');
            ctx.fillStyle = sg;
            ctx.fill();
        });
    }

    // ─── Lane Lines ────────────────────────────────────────────

    _renderLaneLines(ctx, VX, VY, W, H, p, speed) {
        const scroll = p * 7.5; // dash scroll speed

        // Outer solid white lines
        this._solidLine(ctx, VX, VY, W * 0.06, H, 'rgba(230,230,230,', 1.8);
        this._solidLine(ctx, VX, VY, W * 0.94, H, 'rgba(230,230,230,', 1.8);

        // Inner dashed white
        this._dashedLine(ctx, VX, VY, W * 0.32, H, 'rgba(190,190,200,', 1.2, scroll);
        this._dashedLine(ctx, VX, VY, W * 0.68, H, 'rgba(190,190,200,', 1.2, scroll);

        // Center gold lane — THE signature line, with glow
        this._goldCenterLine(ctx, VX, VY, W * 0.50, H, scroll);
    }

    _solidLine(ctx, VX, VY, botX, botY, colorBase, w) {
        const g = ctx.createLinearGradient(VX, VY, botX, botY);
        g.addColorStop(0,    colorBase + '0)');
        g.addColorStop(0.15, colorBase + '0.35)');
        g.addColorStop(0.6,  colorBase + '0.55)');
        g.addColorStop(1,    colorBase + '0.65)');
        ctx.beginPath();
        ctx.moveTo(VX, VY);
        ctx.lineTo(botX, botY);
        ctx.strokeStyle = g;
        ctx.lineWidth = w;
        ctx.stroke();
    }

    _dashedLine(ctx, VX, VY, botX, botY, colorBase, w, offset) {
        const N = 13;
        for (let i = 0; i < N; i++) {
            const t0 = this._clamp((i + offset % 1) / N);
            const t1 = this._clamp((i + offset % 1 + 0.42) / N);
            if (t0 < 0.03 || t0 > 0.98) continue;

            const p0 = Math.pow(t0, 0.52);
            const p1 = Math.pow(t1, 0.52);

            const x0 = VX + (botX - VX) * p0;
            const y0 = VY + (botY - VY) * p0;
            const x1 = VX + (botX - VX) * p1;
            const y1 = VY + (botY - VY) * p1;

            const alpha = this._clamp(p0 * 2.2, 0, 0.55);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = colorBase + alpha + ')';
            ctx.lineWidth = w * (0.25 + p0);
            ctx.stroke();
        }
    }

    _goldCenterLine(ctx, VX, VY, botX, botY, offset) {
        const N = 13;
        for (let i = 0; i < N; i++) {
            const t0 = this._clamp((i + offset % 1) / N);
            const t1 = this._clamp((i + offset % 1 + 0.42) / N);
            if (t0 < 0.03 || t0 > 0.98) continue;

            const p0 = Math.pow(t0, 0.52);
            const p1 = Math.pow(t1, 0.52);

            const x0 = VX + (botX - VX) * p0;
            const y0 = VY + (botY - VY) * p0;
            const x1 = VX + (botX - VX) * p1;
            const y1 = VY + (botY - VY) * p1;

            const alpha = this._clamp(p0 * 2.5, 0, 0.9);

            // Outer glow (additive-style by drawing at increasing width + low alpha)
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            ctx.strokeStyle = `rgba(201,168,76,${alpha * 0.06})`;
            ctx.lineWidth = (0.25 + p0) * 12; ctx.stroke();

            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            ctx.strokeStyle = `rgba(201,168,76,${alpha * 0.12})`;
            ctx.lineWidth = (0.25 + p0) * 6; ctx.stroke();

            // Core line
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            ctx.strokeStyle = `rgba(221,188,96,${alpha})`;
            ctx.lineWidth = (0.25 + p0) * 2.5; ctx.stroke();

            ctx.globalCompositeOperation = 'source-over';
        }
    }

    // ─── Particles (headlights + taillights) ───────────────────

    _spawnParticles(VX, VY, W, H, speed) {
        if (speed < 0.02) return;
        const rate = Math.ceil(speed * 5);
        for (let i = 0; i < rate; i++) {
            if (Math.random() > 0.7) continue;
            const side = Math.random() < 0.5 ? -1 : 1;
            const isTail = Math.random() < 0.18;
            this.particles.push({
                laneOff: (0.06 + Math.random() * 0.38) * side,
                t: Math.random() * 0.08,
                speed: 0.006 + Math.random() * 0.014,
                bright: 0.35 + Math.random() * 0.65,
                isTail,
                VX, VY, W, H
            });
        }
        // Cull dead
        this.particles = this.particles.filter(p => p.t < 0.98);
    }

    _renderParticles(ctx, speed) {
        this.particles.forEach(part => {
            part.t += part.speed * (0.3 + speed * 0.7);
            if (part.t >= 1) return;

            const { laneOff, t, bright, isTail, VX, VY, W, H } = part;
            const destX = VX + laneOff * W;

            const t0 = Math.max(0, t - 0.11 * (1 + speed));
            const p  = Math.pow(t,  0.54);
            const p0 = Math.pow(t0, 0.54);

            const x1 = VX + (destX - VX) * p;
            const y1 = VY + (H - VY) * p;
            const x0 = VX + (destX - VX) * p0;
            const y0 = VY + (H - VY) * p0;

            const alpha = this._clamp(t * 6, 0, 1) * (1 - t * 0.85) * bright * 0.85;

            const r = isTail ? 215 : 255;
            const g = isTail ? 35  : 242;
            const b = isTail ? 25  : 205;

            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.5})`;
            ctx.lineWidth = (0.5 + p * 2.5) * 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.lineWidth = 0.6 + p * 2;
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        });
    }

    // ─── Haze ──────────────────────────────────────────────────

    _renderHaze(ctx, VX, VY, W, H) {
        const g = ctx.createRadialGradient(VX, VY, 0, VX, VY, H * 0.48);
        g.addColorStop(0,   'rgba(18, 12, 4, 0.5)');
        g.addColorStop(0.18,'rgba(8,  5,  2, 0.18)');
        g.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // ─── Vehicle ───────────────────────────────────────────────

    _renderVehicle(ctx, VX, VY, W, H, arrivalP, holdP) {
        const e = this._eout(arrivalP, 4);
        const maxW = Math.min(W * 0.72, 820);
        const vW = maxW * (0.015 + 0.985 * e);
        const vH = vW * (this.vehicle.naturalHeight / this.vehicle.naturalWidth);

        // Subtle swerve as vehicle slows (lateral drift into lane)
        const swerveT = this._clamp((arrivalP - 0.55) / 0.45);
        const swerve  = Math.sin(this._eout(swerveT) * Math.PI) * W * 0.028;

        const vX = VX + swerve - vW / 2;
        const vY = H - vH * 0.88;

        // Headlight bloom
        if (arrivalP > 0.15) {
            const bloomA = this._eout((arrivalP - 0.15) / 0.85) * 0.45;
            const bx = vX + vW * 0.06;
            const by = vY + vH * 0.40;
            ctx.globalCompositeOperation = 'lighter';
            const bg = ctx.createRadialGradient(bx, by, 0, bx, by, vW * 0.30);
            bg.addColorStop(0,   `rgba(255,250,225,${bloomA * 0.9})`);
            bg.addColorStop(0.3, `rgba(255,240,190,${bloomA * 0.35})`);
            bg.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
        }

        // Vehicle image
        ctx.globalAlpha = Math.min(arrivalP * 3.5, 1);
        ctx.drawImage(this.vehicle, vX, vY, vW, vH);
        ctx.globalAlpha = 1;

        // Gold accent glow (the door stripe)
        if (arrivalP > 0.45) {
            const goldA = (arrivalP - 0.45) / 0.55 * 0.16;
            const gx = vX + vW * 0.30;
            const gy = vY + vH * 0.48;
            ctx.globalCompositeOperation = 'lighter';
            const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, vH * 0.28);
            gg.addColorStop(0, `rgba(201,168,76,${goldA})`);
            gg.addColorStop(1, 'rgba(201,168,76,0)');
            ctx.fillStyle = gg;
            ctx.fillRect(vX, vY, vW, vH);
            ctx.globalCompositeOperation = 'source-over';
        }

        // Ground shadow / reflection
        const shA = Math.min(arrivalP * 3, 0.45);
        const sg = ctx.createLinearGradient(VX, vY + vH * 0.88, VX, vY + vH * 1.12);
        sg.addColorStop(0, `rgba(0,0,0,${shA})`);
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(vX - vW * 0.05, vY + vH * 0.86, vW * 1.1, vH * 0.26);
    }

    // ─── Vignette ──────────────────────────────────────────────

    _renderVignette(ctx, W, H) {
        const g = ctx.createRadialGradient(W/2, H/2, H*0.08, W/2, H/2, H*0.92);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.88)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // ─── Speed Peripheral ──────────────────────────────────────

    _renderSpeedPeriphery(ctx, W, H, speed) {
        const a = (speed - 0.25) / 0.75 * 0.13;
        const Lg = ctx.createLinearGradient(0, 0, W * 0.22, 0);
        Lg.addColorStop(0, `rgba(255,255,255,${a})`);
        Lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = Lg;
        ctx.fillRect(0, 0, W * 0.22, H);

        const Rg = ctx.createLinearGradient(W, 0, W * 0.78, 0);
        Rg.addColorStop(0, `rgba(255,255,255,${a})`);
        Rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = Rg;
        ctx.fillRect(W * 0.78, 0, W * 0.22, H);
    }

    // ─── Finish ────────────────────────────────────────────────

    _finish(fast) {
        if (this.done) return;
        this.done = true;

        // Ensure wordmark hidden
        const wm = document.getElementById('intro-wordmark');
        if (wm) wm.style.opacity = 0;

        const overlay = document.getElementById('intro-overlay');
        const dur = fast ? '400ms' : '900ms';
        overlay.style.transition = `opacity ${dur} ease`;
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            document.body.classList.add('intro-complete');
        }, fast ? 420 : 920);
    }
}
