

interface HandSensorProps {
    mode: 'calibration' | 'wearing';
    isDark?: boolean;
}

export default function HandSensorVisual({ mode, isDark }: HandSensorProps) {
    // Colors
    const SKIN = "#e4c6b2";  // More natural skin tone
    const SKIN_OUTLINE = "#d0b098";
    const SENSOR = "#3b82f6"; // Blue
    const CONTROLLER = "currentColor";//"#475569"; // Slate - now using currentColor to adapt
    const WIRE = "currentColor";//"#1e293b"; // Dark Slate
    const TABLE = "currentColor";//"#cbd5e1";

    if (mode === 'calibration') {
        return (
            <div className={`flex flex-col items-center justify-center p-8 rounded-xl h-64 w-full border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50/50 border-slate-100"}`}>
                <svg viewBox="0 0 300 150" className="w-full h-full max-w-sm drop-shadow-md">
                    {/* Table Surface */}
                    <path d="M 20 120 L 280 120 L 260 140 L 40 140 Z" className={isDark ? "text-slate-600" : "text-slate-300"} fill={TABLE} opacity="0.5" />
                    <rect x="20" y="115" width="260" height="5" rx="2" className={isDark ? "text-slate-600" : "text-slate-300"} fill={TABLE} />

                    {/* Sensor 1 (Palm) */}
                    <g className="animate-bounce" style={{ animationDuration: '3s' }}>
                        <rect x="90" y="100" width="40" height="15" rx="2" fill={SENSOR} stroke="white" strokeWidth="1" />
                        <text x="110" y="111" fontSize="8" textAnchor="middle" fill="white" fontWeight="bold">PALM</text>
                        {/* Shadow */}
                        <ellipse cx="110" cy="125" rx="20" ry="3" fill="black" opacity="0.1" />
                    </g>

                    {/* Sensor 2 (Wrist/Controller) */}
                    <g className="animate-bounce" style={{ animationDuration: '3s', animationDelay: '0.2s' }}>
                        <rect x="170" y="90" width="50" height="25" rx="3" className={isDark ? "text-slate-400" : "text-slate-600"} fill={CONTROLLER} stroke="white" strokeWidth="1" />
                        <circle cx="210" cy="102" r="6" fill="#ef4444" className="animate-pulse" /> {/* LED */}
                        <text x="190" y="105" fontSize="7" textAnchor="middle" fill="white">ESP32</text>
                        {/* Shadow */}
                        <ellipse cx="195" cy="125" rx="25" ry="3" fill="black" opacity="0.1" />
                    </g>

                    {/* Wire connecting them slightly coiled on table */}
                    <path d="M 130 107 C 140 107, 145 115, 150 115 C 155 115, 160 102, 170 102" fill="none" className={isDark ? "stroke-slate-300" : "stroke-slate-800"} stroke={WIRE} strokeWidth="2" strokeLinecap="round" />
                </svg>
            </div>
        );
    }

    return (
        <div className={`flex flex-col items-center justify-center p-8 rounded-xl h-64 w-full border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50/50 border-slate-100"}`}>
            <svg viewBox="0 0 300 200" className="w-full h-full max-w-sm drop-shadow-lg">
                <defs>
                    <linearGradient id="armGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={SKIN} />
                        <stop offset="100%" stopColor={SKIN_OUTLINE} />
                    </linearGradient>
                </defs>

                {/* Symmetric Arm & Hand (Palm Facing Up) */}
                <g transform="translate(150, 100) scale(1.3)">
                    {/* Forearm - slightly tapered */}
                    <path d="M -22 90 L -18 -10 L 18 -10 L 22 90 Z" fill="url(#armGradient)" />

                    {/* Hand Base / Palm */}
                    <path d="
                        M -18 -10 
                        C -22 -20, -28 -30, -26 -45 
                        C -25 -55, -15 -60, 0 -60
                        C 15 -60, 25 -55, 26 -45
                        C 28 -30, 22 -20, 18 -10
                        Z
                    " fill={SKIN} />

                    {/* FINGERS - More distinct and separated */}

                    {/* Pinky */}
                    <path d="M -20 -40 L -24 -70 C -25 -74, -19 -74, -18 -70 L -15 -40" fill={SKIN} stroke={SKIN_OUTLINE} strokeWidth="0.5" />
                    <path d="M -24 -70 C -25 -74, -19 -74, -18 -70" fill={SKIN} stroke={SKIN_OUTLINE} strokeWidth="0.5" opacity="0.5" /> {/* Nail hint */}

                    {/* Ring */}
                    <path d="M -10 -50 L -11 -82 C -11 -86, -4 -86, -4 -82 L -3 -50" fill={SKIN} stroke={SKIN_OUTLINE} strokeWidth="0.5" />

                    {/* Middle */}
                    <path d="M 2 -50 L 2 -88 C 2 -92, 10 -92, 10 -88 L 10 -50" fill={SKIN} stroke={SKIN_OUTLINE} strokeWidth="0.5" />

                    {/* Index */}
                    <path d="M 14 -45 L 15 -75 C 15 -79, 22 -79, 22 -75 L 21 -45" fill={SKIN} stroke={SKIN_OUTLINE} strokeWidth="0.5" />

                    {/* Thumb - distinct angle */}
                    <path d="M 24 -30 L 38 -40 C 42 -37, 39 -30, 34 -25 L 24 -20" fill={SKIN} stroke={SKIN_OUTLINE} strokeWidth="0.5" />

                    {/* Knuckle/Palm Lines (Life line, Head line) */}
                    <path d="M -15 -30 Q 0 -40 15 -35" fill="none" stroke={SKIN_OUTLINE} strokeWidth="0.5" opacity="0.4" />
                    <path d="M -10 -20 Q 5 -25 10 -15" fill="none" stroke={SKIN_OUTLINE} strokeWidth="0.5" opacity="0.4" />


                    {/* Wrist Controller - Adjusted position */}
                    <g transform="translate(0, 15)">
                        <rect x="-26" y="-12" width="52" height="24" rx="4" className={isDark ? "text-slate-400" : "text-slate-600"} fill={CONTROLLER} stroke="white" strokeWidth="1" />
                        <rect x="-18" y="0" width="36" height="2" rx="1" fill="#334155" />
                        {/* Strap wraparound */}
                        <path d="M -26 0 L -30 0 M 26 0 L 30 0" stroke="#334155" strokeWidth="3" />
                    </g>

                    {/* Palm Sensor - Centered */}
                    <g transform="translate(0, -30)">
                        <rect x="-10" y="-8" width="20" height="16" rx="2" fill={SENSOR} stroke="white" strokeWidth="1" />
                        <circle cx="0" cy="0" r="2" fill="white" opacity="0.5" />
                    </g>

                    {/* Wire connecting */}
                    <path d="M 0 -14 C 8 -10, 8 0, 0 3" fill="none" className={isDark ? "stroke-slate-300" : "stroke-slate-800"} stroke={WIRE} strokeWidth="1.5" strokeDasharray="2 2" />
                </g>

                {/* Labels with lines */}
                <g>
                    <text x="50" y="80" fontSize="10" fontWeight="bold" className={isDark ? "fill-slate-300" : "fill-slate-500"} textAnchor="end">Controller on Wrist</text>
                    <line x1="55" y1="80" x2="115" y2="100" className={isDark ? "stroke-slate-600" : "stroke-slate-300"} strokeWidth="1" />

                    <text x="250" y="50" fontSize="10" fontWeight="bold" fill="#3b82f6" textAnchor="start">Sensor on Palm</text>
                    <line x1="245" y1="50" x2="165" y2="50" className={isDark ? "stroke-slate-600" : "stroke-slate-300"} strokeWidth="1" />
                </g>

            </svg>
        </div>
    );
}
