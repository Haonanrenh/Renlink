// SVG Icons Library - SVG 图标库
const SVGIcons = {
    /**
     * 来电图标（动画）
     */
    incomingCall: `
        <svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="phoneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            <circle cx="40" cy="40" r="35" fill="url(#phoneGradient)" opacity="0.2">
                <animate attributeName="r" values="35;38;35" dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.2;0.1;0.2" dur="1.5s" repeatCount="indefinite"/>
            </circle>
            <path d="M25 30 Q20 25 25 20 L30 25 Q28 27 30 29 L35 34 Q37 36 39 34 L44 29 Q46 27 44 25 L49 20 Q54 25 49 30 L47 32 Q42 37 37 42 L32 47 Q27 52 22 47 L20 45 Q15 40 20 35 Z" 
                  fill="url(#phoneGradient)" 
                  filter="url(#glow)"
                  transform="translate(15, 15)">
                <animateTransform attributeName="transform" 
                                  type="rotate" 
                                  values="0 40 40;-10 40 40;10 40 40;0 40 40" 
                                  dur="0.5s" 
                                  repeatCount="indefinite"/>
            </path>
        </svg>
    `,

    /**
     * 拒绝图标
     */
    reject: `
        <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="rejectGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ef4444;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#dc2626;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="30" cy="30" r="28" fill="url(#rejectGradient)"/>
            <path d="M20 20 L40 40 M40 20 L20 40" 
                  stroke="white" 
                  stroke-width="4" 
                  stroke-linecap="round"/>
        </svg>
    `,

    /**
     * 接听图标
     */
    accept: `
        <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="acceptGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="30" cy="30" r="28" fill="url(#acceptGradient)"/>
            <path d="M15 30 L25 40 L45 20" 
                  stroke="white" 
                  stroke-width="4" 
                  stroke-linecap="round" 
                  stroke-linejoin="round" 
                  fill="none"/>
        </svg>
    `,

    /**
     * 视频通话图标
     */
    videoCall: `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="videoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#2563eb;stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect x="2" y="5" width="14" height="14" rx="2" fill="url(#videoGradient)"/>
            <path d="M16 10 L22 7 V17 L16 14 Z" fill="url(#videoGradient)"/>
        </svg>
    `,

    /**
     * 语音通话图标
     */
    audioCall: `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="audioGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#8b5cf6;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:1" />
                </linearGradient>
            </defs>
            <path d="M12 2 C10.3 2 9 3.3 9 5 V12 C9 13.7 10.3 15 12 15 C13.7 15 15 13.7 15 12 V5 C15 3.3 13.7 2 12 2 Z" 
                  fill="url(#audioGradient)"/>
            <path d="M6 12 C6 15.3 8.7 18 12 18 C15.3 18 18 15.3 18 12" 
                  stroke="url(#audioGradient)" 
                  stroke-width="2" 
                  fill="none" 
                  stroke-linecap="round"/>
            <line x1="12" y1="18" x2="12" y2="22" 
                  stroke="url(#audioGradient)" 
                  stroke-width="2" 
                  stroke-linecap="round"/>
            <line x1="8" y1="22" x2="16" y2="22" 
                  stroke="url(#audioGradient)" 
                  stroke-width="2" 
                  stroke-linecap="round"/>
        </svg>
    `,

    /**
     * 未接来电图标
     */
    missedCall: `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="missedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ef4444;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#dc2626;stop-opacity:1" />
                </linearGradient>
            </defs>
            <path d="M6 18 C6 18 8 16 12 16 C16 16 18 18 18 18" 
                  stroke="url(#missedGradient)" 
                  stroke-width="2" 
                  fill="none" 
                  stroke-linecap="round"/>
            <path d="M12 16 L12 10 M12 10 L9 13 M12 10 L15 13" 
                  stroke="url(#missedGradient)" 
                  stroke-width="2" 
                  fill="none" 
                  stroke-linecap="round" 
                  stroke-linejoin="round"/>
            <circle cx="12" cy="6" r="2" fill="url(#missedGradient)"/>
        </svg>
    `,

    /**
     * 通知徽章
     */
    badge: (count) => `
        <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="10" fill="#ef4444"/>
            <text x="10" y="14" 
                  font-family="Arial, sans-serif" 
                  font-size="12" 
                  font-weight="bold" 
                  fill="white" 
                  text-anchor="middle">
                ${count > 99 ? '99+' : count}
            </text>
        </svg>
    `,

    /**
     * 搜索图标
     */
    search: `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="11" cy="11" r="7" 
                    stroke="#6b7280" 
                    stroke-width="2" 
                    fill="none"/>
            <line x1="16" y1="16" x2="21" y2="21" 
                  stroke="#6b7280" 
                  stroke-width="2" 
                  stroke-linecap="round"/>
        </svg>
    `
};

