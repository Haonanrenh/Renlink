// Audio Manager - 音频管理器
class AudioManager {
    constructor() {
        this.audioContext = null;
        this.ringtoneOscillator = null;
        this.ringtoneGain = null;
        this.isPlaying = false;
    }

    /**
     * 播放来电铃声（循环播放）- 柔和版本
     */
    playRingtone() {
        if (this.isPlaying) return;
        
        try {
            // 创建音频上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 创建两个振荡器（和声效果更柔和）
            const osc1 = this.audioContext.createOscillator();
            const osc2 = this.audioContext.createOscillator();
            this.ringtoneGain = this.audioContext.createGain();
            
            // 连接节点
            osc1.connect(this.ringtoneGain);
            osc2.connect(this.ringtoneGain);
            this.ringtoneGain.connect(this.audioContext.destination);
            
            // 设置柔和的铃声参数
            osc1.type = 'sine';  // 正弦波最柔和
            osc2.type = 'sine';
            osc1.frequency.value = 523;  // C5 音符（更柔和的频率）
            osc2.frequency.value = 659;  // E5 音符（和声）
            
            // 初始音量设为 0
            this.ringtoneGain.gain.value = 0;
            
            // 启动振荡器
            osc1.start();
            osc2.start();
            this.ringtoneOscillator = osc1;  // 保存引用用于停止
            this.ringtoneOscillator2 = osc2;
            this.isPlaying = true;
            
            // 创建柔和的铃声模式（渐入渐出）
            this.playRingtonePattern();
            
            // 每 2 秒重复铃声模式
            this.ringtoneInterval = setInterval(() => {
                if (!this.isPlaying) return;
                this.playRingtonePattern();
            }, 2000);
            
            console.log('[Audio] 柔和铃声播放中...');
        } catch (error) {
            console.error('[Audio] 播放铃声失败:', error);
        }
    }
    
    /**
     * 播放铃声模式（渐入渐出效果）
     */
    playRingtonePattern() {
        if (!this.audioContext || !this.ringtoneGain) return;
        
        const now = this.audioContext.currentTime;
        const gain = this.ringtoneGain.gain;
        
        // 第一次响铃：渐入渐出
        gain.setValueAtTime(0, now);
        gain.linearRampToValueAtTime(0.15, now + 0.1);  // 渐入 0.1 秒
        gain.linearRampToValueAtTime(0.15, now + 0.4);  // 保持 0.3 秒
        gain.linearRampToValueAtTime(0, now + 0.5);     // 渐出 0.1 秒
        
        // 短暂停顿
        gain.setValueAtTime(0, now + 0.5);
        gain.setValueAtTime(0, now + 0.7);
        
        // 第二次响铃：渐入渐出
        gain.linearRampToValueAtTime(0.15, now + 0.8);
        gain.linearRampToValueAtTime(0.15, now + 1.1);
        gain.linearRampToValueAtTime(0, now + 1.2);
        
        // 长停顿
        gain.setValueAtTime(0, now + 1.2);
    }

    /**
     * 停止铃声
     */
    stopRingtone() {
        if (!this.isPlaying) return;
        
        try {
            if (this.ringtoneInterval) {
                clearInterval(this.ringtoneInterval);
                this.ringtoneInterval = null;
            }
            
            if (this.ringtoneOscillator) {
                this.ringtoneOscillator.stop();
                this.ringtoneOscillator.disconnect();
                this.ringtoneOscillator = null;
            }
            
            if (this.ringtoneOscillator2) {
                this.ringtoneOscillator2.stop();
                this.ringtoneOscillator2.disconnect();
                this.ringtoneOscillator2 = null;
            }
            
            if (this.ringtoneGain) {
                this.ringtoneGain.disconnect();
                this.ringtoneGain = null;
            }
            
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            
            this.isPlaying = false;
            console.log('[Audio] 铃声已停止');
        } catch (error) {
            console.error('[Audio] 停止铃声失败:', error);
        }
    }

    /**
     * 播放通知音（短促的提示音）
     */
    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // 设置参数
            oscillator.type = 'sine';
            oscillator.frequency.value = 1000;
            gainNode.gain.value = 0.2;
            
            // 播放 0.1 秒
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
            
            // 清理
            setTimeout(() => {
                audioContext.close();
            }, 200);
            
            console.log('[Audio] 通知音已播放');
        } catch (error) {
            console.error('[Audio] 播放通知音失败:', error);
        }
    }

    /**
     * 播放拒绝音（低沉的提示音）
     */
    playRejectSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // 设置参数（低频）
            oscillator.type = 'sine';
            oscillator.frequency.value = 400;
            gainNode.gain.value = 0.3;
            
            // 播放 0.3 秒
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3);
            
            // 清理
            setTimeout(() => {
                audioContext.close();
            }, 400);
            
            console.log('[Audio] 拒绝音已播放');
        } catch (error) {
            console.error('[Audio] 播放拒绝音失败:', error);
        }
    }

    /**
     * 播放接听音（愉快的提示音）
     */
    playAcceptSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // 设置参数（高频）
            oscillator.type = 'sine';
            oscillator.frequency.value = 1200;
            gainNode.gain.value = 0.2;
            
            // 播放 0.15 秒
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.15);
            
            // 清理
            setTimeout(() => {
                audioContext.close();
            }, 200);
            
            console.log('[Audio] 接听音已播放');
        } catch (error) {
            console.error('[Audio] 播放接听音失败:', error);
        }
    }
}

// 创建全局实例
const audioManager = new AudioManager();

