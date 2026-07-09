/**
 * Interactive Particle Voice-Wave Background 
 * For Renlink - 寓意：声波化为可视化的数据连接，打破沟通壁垒
 * 
 * 视觉概念 (Visual Concept):
 * - 粒子形成几条平行的巨大“波纹”(Sine Waves)，象征声音频率。
 * - 当鼠标靠近时，波纹振幅剧烈跳动，象征识别到了用户的通讯/语音指令。
 * - 粒子间的网状相连，代表“连接(Link)”和“无障碍数据互通”。
 */
class VoiceWaveBackground {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'techCanvas';
        this.ctx = this.canvas.getContext('2d');
        
        // Ensure it stays at the very back
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100vw';
        this.canvas.style.height = '100vh';
        this.canvas.style.zIndex = '-100'; // Below everything
        this.canvas.style.pointerEvents = 'none'; // Ensure clicks pass through
        
        document.body.style.background = '#f8fafc';
        document.body.prepend(this.canvas);

        this.particles = [];
        this.mouse = { x: -1000, y: -1000, radius: 280 };
        this.time = 0;
        this.introStart = Date.now();
        
        this.init();
        this.animate();
        this.bindEvents();
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Generate particles along 3 wave bands
        const baseNum = Math.floor(window.innerWidth / 5); // Responsive particle count
        this.particles = [];
        
        for (let i = 0; i < baseNum; i++) {
            this.particles.push(new WaveParticle(this.canvas));
        }
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.init();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        window.addEventListener('mouseout', () => {
            this.mouse.x = -1000;
            this.mouse.y = -1000;
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.time += 0.02;

        let now = Date.now();
        let introProgress = Math.min(1, Math.max(0, (now - this.introStart - 500) / 1500));
        let easeIntro = 1 - Math.pow(1 - introProgress, 4); // Quartic ease out

        // Clear with slight trail effect
        this.ctx.fillStyle = 'rgba(248, 250, 252, 0.4)'; // Matches #f8fafc
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw connections first so dots sit on top
        this.connectParticles();

        // Draw dots
        this.particles.forEach(p => {
            p.update(this.time, this.mouse, easeIntro);
            p.draw(this.ctx);
        });
    }

    connectParticles() {
        for (let a = 0; a < this.particles.length; a++) {
            for (let b = a + 1; b < this.particles.length; b++) {
                const p1 = this.particles[a];
                const p2 = this.particles[b];

                // Only connect nearby bands to form continuous waveforms
                if (Math.abs(p1.band - p2.band) > 1) continue;

                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                const maxDist = 140;
                if (distance < maxDist) {
                    const opacity = 1 - (distance / maxDist);
                    let lineOpacity = opacity * 0.4;
                    let lineWidth = 1;

                    // Spike highlight if either particle is spiking
                    if (p1.isSpiking || p2.isSpiking) {
                        lineOpacity = opacity * 0.9;
                        lineWidth = 2.5;
                    }

                    this.ctx.strokeStyle = `rgba(${p1.r}, ${p1.g}, ${p1.b}, ${lineOpacity})`;
                    this.ctx.lineWidth = lineWidth;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
    }
}

class WaveParticle {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = Math.random() * this.canvas.width;
        this.y = this.canvas.height / 2;
        
        // 3 Distinct audio wave bands
        this.band = Math.floor(Math.random() * 3);
        
        this.speedX = 0.8 + Math.random() * 1.5;
        this.size = Math.random() * 2 + 1.5;
        
        // Colors: Cyan, Pink, Blue
        const colorPalette = [
            {r: 0, g: 224, b: 255},
            {r: 255, g: 77, b: 180},
            {r: 59, g: 130, b: 246}
        ];
        const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        this.r = col.r;
        this.g = col.g;
        this.b = col.b;
        
        // Noise offset within the band
        this.offsetY = (Math.random() - 0.5) * 120;
        this.isSpiking = false;
    }

    update(time, mouse, introProgress) {
        // Move horizontally
        this.x += this.speedX;
        if (this.x > this.canvas.width + 50) {
            this.x = -50;
        }

        // Base sine wave parameters per band
        let freq = 0.002;
        let amp = 120;
        let bandOffset = 0;

        if (this.band === 0) { freq = 0.003; amp = 150; bandOffset = -50; }
        if (this.band === 1) { freq = 0.004; amp = 80; bandOffset = 0; }
        if (this.band === 2) { freq = 0.0025; amp = 130; bandOffset = 50; }

        // Apply intro progress effect: bursts from a single flatline
        let currentAmp = amp * introProgress;
        let currentOffsetY = this.offsetY * introProgress;
        let currentBandOffset = bandOffset * introProgress;

        let targetY = (this.canvas.height / 2) + currentBandOffset + 
                      Math.sin(this.x * freq + time) * currentAmp + currentOffsetY;

        // Interactive "Voice Spike" when mouse is near
        this.isSpiking = false;
        let dx = this.x - mouse.x;
        // Check distance to mouse
        if (mouse.x !== -1000) {
            let distToMouseX = Math.abs(dx);
            if (distToMouseX < mouse.radius) {
                // Smoothed out local amplitude, more elegant reaction
                let spikeForce = Math.pow(1 - (distToMouseX / mouse.radius), 2);
                targetY += Math.cos(this.x * 0.02 + time * 3) * (130 * spikeForce);
                this.isSpiking = (spikeForce > 0.4);
            }
        }

        // Smooth physics interpolation to destination
        this.y += (targetY - this.y) * 0.06;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        
        if (this.isSpiking) {
            ctx.shadowBlur = 25;
            ctx.shadowColor = `rgb(${this.r}, ${this.g}, ${this.b})`;
            ctx.fillStyle = '#ffffff'; // Turn white hot when spiking
        } else {
            ctx.shadowBlur = 10;
            ctx.shadowColor = `rgba(${this.r}, ${this.g}, ${this.b}, 0.5)`;
            ctx.fillStyle = `rgb(${this.r}, ${this.g}, ${this.b})`;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0; // reset
    }
}

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.voiceWaveBg = new VoiceWaveBackground();
    });
} else {
    window.voiceWaveBg = new VoiceWaveBackground();
}
