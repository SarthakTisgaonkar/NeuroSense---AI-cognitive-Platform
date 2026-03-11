import React, { useState, useEffect, useRef } from 'react';
import {
    Brain, Activity, CheckCircle,
    UserPlus, Users, History, X, Loader,
    TrendingUp, TrendingDown, Minus,
    ChevronRight, Trash2, FileBarChart, ArrowLeft,
    ShieldAlert, Zap, PlayCircle,
    Lock, LogOut, RotateCcw,
    Settings, Moon, Sun
} from 'lucide-react';
import * as DB from './services/db';
import TremorTest from './components/TremorTest';

/**
 * COGNITIVE ASSESSMENT PLATFORM v7.8 (Secure)
 */

// --- Types (Imported from DB) ---
type GameState = 'IDLE' | 'WAITING' | 'STIMULUS' | 'FINISHED';
type MemoryState = 'IDLE' | 'SHOWING' | 'USER_TURN' | 'SUCCESS' | 'FAILURE' | 'COMPLETE';
type Screen = 'HOME' | 'PATIENT_INTAKE' | 'PATIENT_SELECT' | 'PATIENT_HISTORY' | 'DISCLAIMER' | 'GAME_INTRO' | 'GAME' | 'MEMORY_INTRO' | 'MEMORY' | 'QA_INTRO' | 'QA_LOADING' | 'QA' | 'RESULTS' | 'DETAILED_REPORT' | 'TREMOR_TEST' | 'TREMOR_REPORT' | 'SPIRAL_TEST' | 'SPIRAL_REPORT';

interface ReactionData {
    timestamp: number;
    reactionTime: number;
    isFalseStart: boolean;
    isLapse: boolean;
}

interface MemoryRoundData {
    level: number;
    success: boolean;
    sequenceLength: number;
    avgClickLatency: number;
}

import TremorReport from './components/TremorReport';
import SpiralTest from './components/SpiralTest';
import SpiralReport from './components/SpiralReport';

// --- Math Utils ---
const calcMean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const calcSD = (arr: number[], mean: number) => {
    if (arr.length <= 1) return 0;
    return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (arr.length - 1));
};

const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-500';
    return 'text-rose-500';
};

const analyzeTrend = (history: DB.AssessmentRecord[] | DB.TremorRecord[], type: 'COGNITIVE' | 'MOTOR') => {
    if (history.length < 2) return { status: 'Baseline Established', color: 'text-slate-500', icon: Minus, bg: 'bg-slate-100' };

    if (type === 'COGNITIVE') {
        const h = history as DB.AssessmentRecord[];
        const current = h[0].gcs || 0;
        const previous = h[1].gcs || 0;
        const diff = current - previous;
        if (diff > 5) return { status: 'Showing Improvement', color: 'text-emerald-600', icon: TrendingUp, bg: 'bg-emerald-50' };
        if (diff < -5) return { status: 'Decline Detected', color: 'text-rose-600', icon: TrendingDown, bg: 'bg-rose-50' };
        return { status: 'Cognitively Stable', color: 'text-blue-600', icon: Minus, bg: 'bg-blue-50' };
    } else {
        // MOTOR TREND (Lower RMS is better)
        const h = history as DB.TremorRecord[];
        const current = Math.max(h[0].left_hand.avg_rms, h[0].right_hand.avg_rms);
        const previous = Math.max(h[1].left_hand.avg_rms, h[1].right_hand.avg_rms);
        const diff = current - previous;
        if (diff < -0.5) return { status: 'Tremor Reduction', color: 'text-emerald-600', icon: TrendingDown, bg: 'bg-emerald-50' }; // Down is good
        if (diff > 0.5) return { status: 'Tremor Increase', color: 'text-rose-600', icon: TrendingUp, bg: 'bg-rose-50' }; // Up is bad
        return { status: 'Motor Stability', color: 'text-blue-600', icon: Minus, bg: 'bg-blue-50' };
    }
};

const MetricRow = ({ label, value, warning = false, isDark }: { label: string, value: string | number, warning?: boolean, isDark: boolean }) => (
    <div className={`flex justify-between items-center py-3 border-b last:border-0 ${isDark ? "border-slate-700/50" : "border-slate-50"}`}>
        <span className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{label}</span>
        <span className={`font-mono font-bold ${warning ? (isDark ? "text-rose-400" : "text-rose-500") : (isDark ? "text-slate-300" : "text-slate-700")}`}>{value}</span>
    </div>
);

const HistoryChart = ({ data, dataKey, color, label }: { data: any[], dataKey: string, color: string, label: string }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (!data || data.length === 0) return (
        <div className="w-full h-40 bg-slate-50/50 dark:bg-slate-700/20 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-700/50">
            <span className="text-slate-400 text-sm font-medium">No Data Available</span>
        </div>
    );

    const values = data.map(d => d[dataKey]);
    const max = Math.max(...values, 100);
    const min = Math.min(...values, 0);
    const range = (max - min) || 1;
    const padding = range * 0.1;
    const viewMax = max + padding;
    const viewMin = Math.max(0, min - padding);
    const viewRange = viewMax - viewMin;

    const points = data.map((d, i) => {
        const x = data.length > 1 ? (i / (data.length - 1)) * 300 : 150;
        const y = 100 - ((d[dataKey] - viewMin) / viewRange) * 100;
        return `${x},${y}`;
    }).join(' ');

    const gradientPath = data.length > 1
        ? `M 0 100 L ${points} L 300 100 Z`
        : `M 150 100 L ${points} L 150 100 Z`;

    return (
        <div className="relative w-full h-40 group">
            <div className="absolute top-2 left-3 z-10 pointer-events-none">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white">{values[values.length - 1].toFixed(1)} <span className="text-sm font-medium text-slate-400 opacity-60">Last</span></div>
            </div>

            <svg viewBox="0 -10 300 120" className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                {[0, 25, 50, 75, 100].map(p => (
                    <line key={p} x1="0" y1={100 - p} x2="300" y2={100 - p} stroke="currentColor" className="text-slate-100 dark:text-slate-700/30" strokeWidth="1" strokeDasharray="4" />
                ))}

                <path d={gradientPath} fill={`url(#gradient-${label})`} />
                <path d={`M ${points}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />

                {data.map((d, i) => {
                    const x = data.length > 1 ? (i / (data.length - 1)) * 300 : 150;
                    const y = 100 - ((d[dataKey] - viewMin) / viewRange) * 100;
                    const isHovered = hoveredIndex === i;

                    return (
                        <g key={i}>
                            {/* Invisible wider circle for easier hovering */}
                            <circle
                                cx={x} cy={y} r="10" fill="transparent"
                                onMouseEnter={() => setHoveredIndex(i)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                className="cursor-pointer"
                            />
                            {/* Visible point */}
                            <circle
                                cx={x} cy={y} r={isHovered || data.length === 1 ? "6" : "4"}
                                fill={color} stroke="white" strokeWidth="2"
                                className={`transition-all duration-200 pointer-events-none ${isHovered || data.length === 1 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                            />

                            {/* SVG Tooltip */}
                            {isHovered && (
                                <g className="pointer-events-none drop-shadow-md">
                                    <rect x={x - 30} y={y - 25} width="60" height="20" rx="4" fill="white" className="dark:fill-slate-800" stroke={color} strokeWidth="1" />
                                    <text x={x} y={y - 12} textAnchor="middle" fontSize="9" fontWeight="bold" fill={color} className="dark:fill-white">
                                        {d[dataKey]?.toFixed(1)}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

const RadarChart = ({ data, size = 300 }: { data: { label: string, value: number, fullMark: number }[], size?: number }) => {
    const radius = size / 2;
    const center = size / 2;
    const angleSlice = (Math.PI * 2) / data.length;

    const getCoordinates = (index: number, value: number, max: number) => {
        const angle = index * angleSlice - Math.PI / 2;
        const r = (value / max) * radius;
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle)
        };
    };

    const points = data.map((d, i) => {
        const { x, y } = getCoordinates(i, d.value, d.fullMark);
        return `${x},${y}`;
    }).join(' ');

    const axisPoints = data.map((d, i) => getCoordinates(i, d.fullMark, d.fullMark));

    return (
        <div className="relative flex justify-center items-center py-4">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
                {[0.2, 0.4, 0.6, 0.8, 1].map((scale, i) => (
                    <polygon key={i} points={data.map((d, j) => {
                        const { x, y } = getCoordinates(j, d.fullMark * scale, d.fullMark);
                        return `${x},${y}`;
                    }).join(' ')} className={i === 4 ? "fill-slate-50/50 dark:fill-slate-800/50 stroke-slate-200 dark:stroke-slate-700" : "fill-none stroke-slate-200 dark:stroke-slate-700"} strokeWidth="1" />
                ))}
                {axisPoints.map((p, i) => (
                    <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="1" strokeDasharray="4" />
                ))}
                <polygon points={points} className="fill-indigo-500/20 dark:fill-indigo-400/20 stroke-indigo-500 dark:stroke-indigo-400 drop-shadow-lg" strokeWidth="3" />
                {data.map((d, i) => {
                    const { x, y } = getCoordinates(i, d.value, d.fullMark);
                    return <circle key={i} cx={x} cy={y} r="6" className="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-slate-800 stroke-[3px]" />;
                })}
                {data.map((d, i) => {
                    const { x, y } = getCoordinates(i, d.fullMark * 1.2, d.fullMark);
                    return (
                        <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="text-[10px] font-bold fill-slate-500 dark:fill-slate-400 uppercase tracking-widest">
                            {d.label}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

const LockScreen = ({ onUnlock }: { onUnlock: () => void }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);

    const handleInput = (num: string) => {
        if (pin.length < 4) {
            setPin(prev => prev + num);
            setError(false);
        }
    };

    const handleClear = () => {
        setPin('');
        setError(false);
    };

    const handleSubmit = async () => {
        if (pin.length !== 4) return;
        const isValid = await DB.unlockDB(pin);
        if (isValid) {
            onUnlock();
        } else {
            setError(true);
            setPin('');
        }
    };

    // Auto-submit when pin is 4 digits
    useEffect(() => {
        if (pin.length === 4) {
            const timer = setTimeout(handleSubmit, 200);
            return () => clearTimeout(timer);
        }
    }, [pin]);

    return (
        <div className="fixed inset-0 bg-slate-900 z-[100] flex items-center justify-center p-4">
            <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 w-full max-w-sm text-center">
                <div>
                    <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Clinical Access</h2>
                    <p className="text-slate-400 text-sm mb-8">Enter secure PIN to continue</p>

                    <div className="flex justify-center gap-4 mb-8 h-4">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className={`w-3 h-3 rounded-full transition-all ${i < pin.length ? 'bg-indigo-500 scale-125' : 'bg-slate-600'}`} />
                        ))}
                    </div>

                    {error && <p className="text-rose-500 text-sm font-bold mb-4 animate-pulse">Incorrect PIN. Try again.</p>}

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button key={num} onClick={() => handleInput(num.toString())} className="h-16 rounded-2xl bg-slate-700/50 hover:bg-slate-700 text-2xl font-bold text-white transition-all active:scale-95">{num}</button>
                        ))}
                        <div className="ml-auto" />
                        <button onClick={() => handleInput('0')} className="h-16 rounded-2xl bg-slate-700/50 hover:bg-slate-700 text-2xl font-bold text-white transition-all active:scale-95">0</button>
                        <button onClick={handleClear} className="h-16 rounded-2xl text-slate-400 hover:text-white transition-all flex items-center justify-center"><X /></button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SettingsModal = ({ onClose, theme, toggleTheme }: { onClose: () => void, theme: 'light' | 'dark', toggleTheme: () => void }) => {
    const [activeTab, setActiveTab] = useState<'GENERAL' | 'SECURITY'>('GENERAL');
    const [oldPin, setOldPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [status, setStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [msg, setMsg] = useState('');

    const handleChangePin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPin.match(/^\d+$/)) {
            setStatus('ERROR');
            setMsg('PIN must be digits only');
            return;
        }

        const success = await DB.changePin(oldPin, newPin);

        if (success) {
            setStatus('SUCCESS');
            setMsg('PIN Updated Successfully');
            setTimeout(onClose, 1500);
        } else {
            setStatus('ERROR');
            setMsg('Incorrect Old PIN');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 ${theme === 'dark' ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700/50 rounded-full transition"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex gap-4 mb-6 border-b border-slate-100 dark:border-slate-700">
                    <button onClick={() => setActiveTab('GENERAL')} className={`pb-2 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'GENERAL' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>General</button>
                    <button onClick={() => setActiveTab('SECURITY')} className={`pb-2 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'SECURITY' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Security</button>
                </div>

                {activeTab === 'GENERAL' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                            <div className="flex items-center gap-3">
                                {theme === 'light' ? <Sun className="text-amber-500" /> : <Moon className="text-indigo-400" />}
                                <div>
                                    <div className="font-bold text-slate-900 dark:text-white">Theme</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</div>
                                </div>
                            </div>
                            <button
                                onClick={toggleTheme}
                                className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                aria-label="Toggle Theme"
                                role="switch"
                                aria-checked={theme === 'dark'}
                            >
                                <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'SECURITY' && (
                    <>
                        {status === 'SUCCESS' ? (
                            <div className="text-center py-8 text-emerald-600 font-bold animate-fade-in"><CheckCircle className="w-12 h-12 mx-auto mb-2" /> PIN Updated Successfully</div>
                        ) : (
                            <form onSubmit={handleChangePin} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Current PIN</label>
                                    <input type="password" value={oldPin} onChange={e => setOldPin(e.target.value)} maxLength={4} className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-center text-lg tracking-widest text-slate-900 dark:text-white" placeholder="••••" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">New PIN (4 digits)</label>
                                    <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} maxLength={4} className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-center text-lg tracking-widest text-slate-900 dark:text-white" placeholder="••••" required />
                                </div>
                                {status === 'ERROR' && <p className="text-rose-500 text-sm font-bold text-center">{msg}</p>}
                                <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200">Update PIN</button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default function AssessmentPlatform() {
    const [currentScreen, setCurrentScreen] = useState<Screen>('HOME');
    const [dbReady, setDbReady] = useState(false);
    const [graphMetric, setGraphMetric] = useState<'GCS' | 'RMS' | 'SPIRAL'>('GCS');

    // --- THEME STATE ---
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) {
            return localStorage.getItem('theme') as 'light' | 'dark';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    useEffect(() => {
        // We still toggle 'dark' class on HTML for global defaults (like scrollbars),
        // but component styling will now rely on derived variables.
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    // --- DERIVED THEME VARIABLES ---
    const isDark = theme === 'dark';

    // Palettes
    const bgMain = isDark ? "bg-slate-900" : "bg-slate-50";
    const textMain = isDark ? "text-white" : "text-slate-900";
    const textSecondary = isDark ? "text-slate-400" : "text-slate-500";

    // --- Theme Variables ---
    const bgCard = isDark ? "bg-slate-800 border-slate-700 shadow-sm" : "bg-white border-slate-100 shadow-sm";
    const bgInput = isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900";
    const accentColor = isDark ? "text-indigo-400" : "text-indigo-600";
    const bgAccent = isDark ? "bg-indigo-500/20" : "bg-indigo-500/10";

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

    // --- SECURITY STATE ---
    const [isLocked, setIsLocked] = useState(true); // Locked by default
    const [showSettings, setShowSettings] = useState(false);
    const activityTimerRef = useRef<number | null>(null);

    // --- Data State ---
    const [patients, setPatients] = useState<DB.Patient[]>([]);
    const [activePatient, setActivePatient] = useState<DB.Patient | null>(null);
    const [patientHistory, setPatientHistory] = useState<DB.AnyRecord[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<DB.AnyRecord | null>(null);
    const [historyFilter, setHistoryFilter] = useState<'ALL' | 'COGNITIVE' | 'MOTOR' | 'SPIRAL'>('ALL');

    // --- EWSS Computation ---
    const computeEWSS = (history: DB.AnyRecord[]) => {
        if (!history || history.length === 0) return null;

        const latestSpiral = history.find(r => r.type === 'SPIRAL') as DB.SpiralRecord | undefined;
        const latestTremor = history.find(r => r.type === 'MOTOR') as DB.TremorRecord | undefined;
        const latestCognitive = history.find(r => r.type === 'COGNITIVE') as DB.AssessmentRecord | undefined;

        if (!latestSpiral && !latestTremor && !latestCognitive) return null;

        // Normalization to [0, 1]
        const spiralScore = latestSpiral ? latestSpiral.score / 100 : 0; // Already 0-100 probability

        let tremorScore = 0;
        if (latestTremor) {
            const maxRms = Math.max(latestTremor.left_hand.avg_rms, latestTremor.right_hand.avg_rms);
            // Cap RMS at a reasonable physiological max for scaling, e.g., 5.0
            tremorScore = Math.min(maxRms / 5.0, 1.0);
        }

        let cognitiveScore = 0;
        if (latestCognitive) {
            // Inverse scale: low gcs (e.g., 20) = high impairment (0.8 score).
            // Assuming 80+ is healthy, < 40 is severe impairment.
            cognitiveScore = Math.max(0, Math.min(1.0, (80 - latestCognitive.gcs) / 60));
        }

        // Active weights based on available tests
        let totalWeight = 0;
        let weightedSum = 0;

        if (latestSpiral) { totalWeight += 0.4; weightedSum += spiralScore * 0.4; }
        if (latestTremor) { totalWeight += 0.3; weightedSum += tremorScore * 0.3; }
        if (latestCognitive) { totalWeight += 0.3; weightedSum += cognitiveScore * 0.3; }

        if (totalWeight === 0) return null;

        const ewssScore = (weightedSum / totalWeight) * 100; // Return as 0-100%

        let riskLabel = 'Low Risk';
        let alertText = 'Routine check-in';
        let colorTheme = isDark ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
        let badgeColor = isDark ? 'bg-emerald-500' : 'bg-emerald-500';

        if (ewssScore >= 75) {
            riskLabel = 'High Risk';
            alertText = 'Consult Neurologist';
            colorTheme = isDark ? 'bg-rose-900/40 text-rose-400 border-rose-800' : 'bg-rose-50 text-rose-700 border-rose-200';
            badgeColor = isDark ? 'bg-rose-500' : 'bg-rose-500';
        } else if (ewssScore >= 40) {
            riskLabel = 'Medium Risk';
            alertText = 'Re-test Recommended';
            colorTheme = isDark ? 'bg-orange-900/40 text-orange-400 border-orange-800' : 'bg-orange-50 text-orange-700 border-orange-200';
            badgeColor = isDark ? 'bg-orange-500' : 'bg-orange-500';
        }

        return {
            score: ewssScore,
            riskLabel,
            alertText,
            colorTheme,
            badgeColor,
            hasFeatures: { spiral: !!latestSpiral, tremor: !!latestTremor, cognitive: !!latestCognitive },
            raw: { spiral: spiralScore * 100, tremor: tremorScore * 100, cognitive: cognitiveScore * 100 }
        };
    };

    const ewssMetrics = computeEWSS(patientHistory);

    // --- Test States ---
    const [gameState, setGameState] = useState<GameState>('IDLE');
    const [reactions, setReactions] = useState<ReactionData[]>([]);
    const [falseStarts, setFalseStarts] = useState(0);


    const [memoryState, setMemoryState] = useState<MemoryState>('IDLE');
    const [memoryLevel, setMemoryLevel] = useState(DB.CONFIG.MEM_START_LEVEL);
    const [sequence, setSequence] = useState<number[]>([]);
    const [userSequence, setUserSequence] = useState<number[]>([]);
    const [showingIdx, setShowingIdx] = useState<number | null>(null);
    const [memoryRounds, setMemoryRounds] = useState<MemoryRoundData[]>([]);



    // --- ADAPTIVE QA STATES ---
    const [activeQuestions, setActiveQuestions] = useState<DB.QAQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<number, number>>({});

    // --- Refs ---
    const timerRef = useRef<number | null>(null);
    const gameIntervalRef = useRef<number | null>(null); // New Ref for game loop/timer
    const stimulusTimerRef = useRef<number | null>(null);
    const roundStartTimeRef = useRef<number>(0);
    const stimulusStartTimeRef = useRef<number>(0);

    // ==========================
    // 0. SECURITY & INIT
    // ==========================

    const resetActivityTimer = () => {
        if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
        // Auto-lock timeout disabled for testing/recording
        // if (!isLocked) {
        //     activityTimerRef.current = window.setTimeout(() => {
        //         setIsLocked(true);
        //     }, 60000); // 60s Auto-Lock
        // }
    };

    useEffect(() => {
        const events = ['mousedown', 'keydown', 'mousemove', 'touchstart'];
        const handler = () => resetActivityTimer();
        events.forEach(e => window.addEventListener(e, handler));
        resetActivityTimer();
        return () => {
            events.forEach(e => window.removeEventListener(e, handler));
            if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
        };
    }, [isLocked]);

    useEffect(() => {
        const init = async () => {
            // Check for existing PIN to determine lock state
            const hasPin = localStorage.getItem('sys_data_02') || localStorage.getItem('neuro_pin_hash');
            setIsLocked(!!hasPin);

            const success = await DB.initDB();
            if (success) {
                setDbReady(true);
                // Only load if NOT locked (e.g. no PIN set yet)
                if (!hasPin) {
                    refreshPatients();
                }
            }
        };
        init();
    }, []);

    // Load data when unlocked
    useEffect(() => {
        if (!isLocked && dbReady) {
            refreshPatients();
        } else if (isLocked) {
            // Clear sensitive data from memory when locked
            setPatients([]);
            setActivePatient(null);
            setPatientHistory([]);
        }
    }, [isLocked, dbReady]);

    const refreshPatients = async () => {
        const res = await DB.getPatients();
        setPatients(res);
    };

    const refreshHistory = async (patientId: string) => {
        const res = await DB.getAllHistory(patientId);
        setPatientHistory(res);
    };

    const handleRegisterPatient = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newPatient: DB.Patient = {
            id: DB.generateClinicalID(),
            name: formData.get('name') as string,
            age: parseInt(formData.get('age') as string),
            gender: formData.get('gender') as string,
            notes: formData.get('notes') as string,
            created_at: Date.now()
        };

        await DB.insertPatient(newPatient);
        setActivePatient(newPatient);
        setPatientHistory([]);
        refreshPatients();
        setCurrentScreen('HOME');
    };

    const handleSelectPatient = (patient: DB.Patient) => {
        setActivePatient(patient);
        refreshHistory(patient.id);
        setCurrentScreen('HOME');
    };

    const handleDeletePatient = async (e: React.MouseEvent, patientId: string) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this patient and all their records?")) {
            await DB.deletePatient(patientId);
            refreshPatients();
            if (activePatient?.id === patientId) {
                setActivePatient(null);
                setPatientHistory([]);
            }
        }
    };

    const handleDeleteAssessment = async (e: React.MouseEvent, recordId: string, type: 'COGNITIVE' | 'MOTOR' | 'SPIRAL') => {
        e.stopPropagation();
        if (window.confirm("Delete this assessment record?")) {
            await DB.deleteRecord(recordId, type);
            if (activePatient) refreshHistory(activePatient.id);
        }
    };

    // Go directly to Detailed Report
    const handleViewRecord = (record: DB.AnyRecord) => {
        setSelectedRecord(record);
        if (record.type === 'MOTOR') {
            setCurrentScreen('TREMOR_REPORT');
        } else if (record.type === 'SPIRAL') {
            setCurrentScreen('SPIRAL_REPORT');
        } else {
            setCurrentScreen('DETAILED_REPORT');
        }
    };

    // ==========================
    // 2. GAME LOGIC
    // ==========================

    const abortAssessment = () => {
        if (stimulusTimerRef.current) window.clearTimeout(stimulusTimerRef.current);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        // Clear interval for countdown if we use one
        if (activityTimerRef.current) clearTimeout(activityTimerRef.current); // Reusing activity timer ref for countdown just in case or create a new one. Better create a new ref for game timer.
        if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        setGameState('IDLE');
        setMemoryState('IDLE');
        setReactions([]);
        setMemoryRounds([]);
        setAnswers({});
        setFalseStarts(0);
        setMemoryLevel(DB.CONFIG.MEM_START_LEVEL);
        setActiveQuestions([]);
        roundStartTimeRef.current = 0;
        setCurrentScreen('HOME');
    };

    const [timeLeft, setTimeLeft] = useState(0);

    const startPVT = () => {
        setFalseStarts(0);
        setCurrentScreen('GAME');
        setGameState('WAITING');

        // End test after duration
        if (timerRef.current) window.clearTimeout(timerRef.current);

        // Start Countdown
        const durationSec = DB.CONFIG.PVT_DURATION_MS / 1000;
        setTimeLeft(durationSec);

        if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        gameIntervalRef.current = window.setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        timerRef.current = window.setTimeout(() => {
            endPVT();
        }, DB.CONFIG.PVT_DURATION_MS);

        scheduleStimulus();
    };

    const scheduleStimulus = () => {
        const delay = Math.random() * (3000 - 1000) + 1000;
        stimulusTimerRef.current = window.setTimeout(() => {
            setGameState('STIMULUS');
            stimulusStartTimeRef.current = performance.now();
        }, delay);
    };

    const handlePVTClick = () => {
        if (gameState === 'WAITING') {
            setFalseStarts(prev => prev + 1);
            if (stimulusTimerRef.current) clearTimeout(stimulusTimerRef.current);
            scheduleStimulus();
        } else if (gameState === 'STIMULUS') {
            const endTime = performance.now();
            const reactionTime = endTime - stimulusStartTimeRef.current;
            if (reactionTime < 100) {
                setFalseStarts(prev => prev + 1);
            } else {
                setReactions(prev => [...prev, { timestamp: Date.now(), reactionTime, isFalseStart: false, isLapse: reactionTime > DB.CONFIG.PVT_LAPSE_THRESHOLD }]);
            }
            setGameState('WAITING');
            scheduleStimulus();
        }
    };

    const endPVT = () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        if (stimulusTimerRef.current) window.clearTimeout(stimulusTimerRef.current);
        if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        setGameState('FINISHED');
        setTimeout(() => setCurrentScreen('MEMORY_INTRO'), 1500);
    };

    const startMemoryGame = () => { setMemoryLevel(DB.CONFIG.MEM_START_LEVEL); setMemoryRounds([]); roundStartTimeRef.current = 0; setCurrentScreen('MEMORY'); startMemoryRound(DB.CONFIG.MEM_START_LEVEL); };
    const startMemoryRound = (level: number) => { setMemoryState('SHOWING'); setUserSequence([]); setShowingIdx(null); const newSeq = Array.from({ length: level }, () => Math.floor(Math.random() * DB.CONFIG.MEM_GRID_SIZE)); setSequence(newSeq); let i = 0; const interval = setInterval(() => { setShowingIdx(newSeq[i]); setTimeout(() => setShowingIdx(null), DB.CONFIG.MEM_SHOW_TIME - 200); i++; if (i >= newSeq.length) { clearInterval(interval); setTimeout(() => { setMemoryState('USER_TURN'); roundStartTimeRef.current = Date.now(); }, DB.CONFIG.MEM_INTER_STIM_TIME); } }, DB.CONFIG.MEM_SHOW_TIME); };
    const handleMemoryClick = (index: number) => { if (memoryState !== 'USER_TURN') return; const now = Date.now(); const newUserSeq = [...userSequence, index]; setUserSequence(newUserSeq); const checkIdx = newUserSeq.length - 1; if (newUserSeq[checkIdx] !== sequence[checkIdx]) { const totalTime = now - roundStartTimeRef.current; const avgClickLatency = newUserSeq.length > 0 ? totalTime / newUserSeq.length : 0; setMemoryRounds(prev => [...prev, { level: memoryLevel, success: false, sequenceLength: sequence.length, avgClickLatency: avgClickLatency }]); setMemoryState('FAILURE'); setTimeout(() => setCurrentScreen('QA_INTRO'), 1500); } else { if (newUserSeq.length === sequence.length) { const totalTime = now - roundStartTimeRef.current; const avgClickLatency = sequence.length > 0 ? totalTime / sequence.length : 0; setMemoryRounds(prev => [...prev, { level: memoryLevel, success: true, sequenceLength: sequence.length, avgClickLatency: avgClickLatency }]); setMemoryState('SUCCESS'); const nextLevel = memoryLevel + 1; if (nextLevel > 7) { setTimeout(() => setCurrentScreen('QA_INTRO'), 1500); } else { setMemoryLevel(nextLevel); setTimeout(() => startMemoryRound(nextLevel), 1500); } } } };

    const startQA = () => {
        if (!activePatient) return;
        setAnswers({});
        setCurrentScreen('QA_LOADING');
        setTimeout(async () => {
            const questions = await DB.generateAdaptiveQuestions(activePatient.id);
            setActiveQuestions(questions);
            setCurrentScreen('QA');
        }, 1500);
    };

    const handleAnswer = (qId: number, optionIndex: number) => { setAnswers(prev => ({ ...prev, [qId]: optionIndex })); };

    const submitQA = async () => {
        if (activePatient) {
            for (const q of activeQuestions) {
                const selectedIdx = answers[q.id];
                if (selectedIdx !== undefined) {
                    const score = (q.options.length - 1 - selectedIdx) / (q.options.length - 1);
                    await DB.logQuestionAnswer(activePatient.id, q.id, q.category, score);
                }
            }
        }
        processResults();
    };

    const processResults = async () => {
        const validReactions = reactions.filter(r => !r.isFalseStart);
        let meanRT = 0, sdRT = 0, lapses = 0, fatigueIndex = 0, cov = 0, speedScore = 0;

        if (validReactions.length > 0) {
            const rtValues = validReactions.map(r => r.reactionTime);
            meanRT = calcMean(rtValues);
            sdRT = calcSD(rtValues, meanRT);
            lapses = reactions.filter(r => r.isLapse).length;
            cov = meanRT > 0 ? (sdRT / meanRT) * 100 : 0;
            speedScore = meanRT > 0 ? (1000 / meanRT) * 25 : 0;
            const midpoint = Math.floor(validReactions.length / 2);
            if (midpoint > 0) {
                const firstHalf = validReactions.slice(0, midpoint).map(r => r.reactionTime);
                const secondHalf = validReactions.slice(midpoint).map(r => r.reactionTime);
                fatigueIndex = calcMean(secondHalf) - calcMean(firstHalf);
            } else {
                fatigueIndex = 0;
            }
        }

        let maxSpan = memoryRounds.filter(r => r.success).reduce((max, r) => Math.max(max, r.sequenceLength), 0);
        let avgRecallLatency = calcMean(memoryRounds.filter(r => r.success).map(r => r.avgClickLatency));
        let throughput = 0;
        if (maxSpan > 0 && avgRecallLatency > 0) {
            throughput = maxSpan / (avgRecallLatency / 1000);
        }

        let totalQScore = 0;
        let maxQScore = 0;
        activeQuestions.forEach(q => {
            const score = (q.options.length - 1 - (answers[q.id] || 0)) / (q.options.length - 1);
            totalQScore += score * q.weight;
            maxQScore += q.weight;
        });
        const functionalIndex = maxQScore > 0 ? (totalQScore / maxQScore) * 100 : 0;

        // Models
        let api = 0, wmc = 0;
        if (validReactions.length > 0) { // Calculate API if data exists
            const sScore = Math.min(100, speedScore);
            const stabilityScore = Math.min(100, Math.max(0, 100 - ((cov - 15) * 6)));
            const vigilanceScore = Math.max(0, 100 - (lapses * 15) - (falseStarts * 5));
            api = (sScore * 0.4) + (stabilityScore * 0.3) + (vigilanceScore * 0.3);
        }
        if (maxSpan > 0) {
            const spanScore = Math.min(100, (maxSpan / 9) * 100);
            const effScore = Math.min(100, throughput * 40);
            wmc = (spanScore * 0.6) + (effScore * 0.4);
        }
        const gcs = (api * 0.3) + (wmc * 0.3) + (functionalIndex * 0.4);

        let insights: string[] = [];
        if (falseStarts > 2) insights.push("High impulsivity.");
        if (cov > 20) insights.push("Significant cognitive instability.");
        if (throughput < 1.0 && maxSpan > 4) insights.push("Accurate but slow processing.");

        const record: DB.AssessmentRecord = {
            id: Date.now().toString(),
            patient_id: activePatient!.id,
            date: Date.now(),
            gcs, api, wmc,
            risk_level: gcs < 50 ? "High" : gcs < 70 ? "Moderate" : "Low Risk",
            rt_mean: meanRT, rt_sd: sdRT, cov, fatigue: fatigueIndex,
            latency: avgRecallLatency, throughput, lapses,
            insight_text: insights.join(" ") || "Cognitive functions within normal limits.",
            type: 'COGNITIVE'
        };

        await DB.insertAssessment(record);

        setSelectedRecord(record as DB.AssessmentRecord & { type: 'COGNITIVE' });
        refreshHistory(activePatient!.id);
        setCurrentScreen('DETAILED_REPORT'); // SKIP RESULTS, GO DIRECT TO DETAILED
    };

    const renderExitButton = (dark = false) => (
        <button
            onMouseDown={(e) => { e.stopPropagation(); abortAssessment(); }}
            onTouchStart={(e) => { e.stopPropagation(); abortAssessment(); }}
            onClick={(e) => { e.stopPropagation(); abortAssessment(); }}
            className={`absolute top-6 right-6 p-2 rounded-full transition-all z-50 ${dark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
            title="Abort Assessment"
        >
            <X className="w-5 h-5" />
        </button>
    );

    // ==========================
    // 3. RENDERING
    // ==========================

    if (isLocked) {
        return <LockScreen onUnlock={() => setIsLocked(false)} />;
    }

    if (!dbReady) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><Loader className="animate-spin mr-2" /> Initializing Secure DB...</div>;

    if (currentScreen === 'HOME') {
        return (
            <div className={`min-h-screen flex flex-col font-sans transition-colors ${bgMain} ${textMain}`}>
                {showSettings && <SettingsModal onClose={() => setShowSettings(false)} theme={theme} toggleTheme={toggleTheme} />}

                <div className={`flex-grow flex flex-col md:flex-row max-w-7xl mx-auto w-full rounded-2xl overflow-hidden my-8 border ${bgCard}`}>
                    <div className="md:w-5/12 p-12 flex flex-col justify-between relative overflow-hidden bg-slate-900 text-white">
                        <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                        <div className="absolute top-1/2 -right-24 w-96 h-96 bg-fuchsia-500 rounded-full blur-3xl opacity-10"></div>
                        <div className="relative z-10 space-y-6">
                            <div className="flex items-center gap-3 opacity-80"><Activity className="w-6 h-6 text-indigo-200" /><span className="text-sm font-bold tracking-widest uppercase">NeuroSense</span></div>
                            <h1 className="text-5xl font-black leading-tight">Precision <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-fuchsia-200">Neurology</span></h1>
                            <p className="text-indigo-100 text-lg max-w-sm">Advanced cognitive and psychomotor profiling for clinical decision support.</p>
                        </div>
                        <div className="relative z-10 mt-12 space-y-4">
                            <div className="p-6 rounded-2xl border bg-slate-800 border-slate-700">
                                {/* Note: Sidebar is always dark theme based OR colorful in light mode */}
                                <div className="text-xs font-bold uppercase mb-4 text-slate-500">Current Session</div>
                                {activePatient ? (
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 flex items-center justify-center text-xl font-bold text-white">{activePatient.name[0]}</div>
                                        <div><div className="font-bold text-lg text-white">{activePatient.name}</div><div className="text-sm text-slate-400">{activePatient.id} • {activePatient.age} years • {activePatient.gender}</div></div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-4 italic text-slate-500"><UserPlus className="w-8 h-8 opacity-50" /><span>No active patient selected</span></div>
                                )}
                            </div>

                            <div className="flex gap-4">
                                <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-bold border bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700">
                                    <Settings className="w-4 h-4" /> Settings
                                </button>
                                <button onClick={() => setIsLocked(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-bold border ml-auto bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700">
                                    <LogOut className="w-4 h-4" /> Lock Terminal
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className={`p-12 flex flex-col justify-center relative md:w-7/12 ${isDark ? "bg-slate-800" : "bg-white"}`}>
                        <div className="space-y-5 relative z-10">
                            <div className="grid md:grid-cols-1 gap-4">
                                {!activePatient ? (
                                    <button onClick={() => setCurrentScreen('PATIENT_INTAKE')} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-8 rounded-2xl font-bold text-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-between px-8 group">
                                        <div className="flex items-center gap-6">
                                            <div className="p-4 bg-white/20 rounded-xl"><UserPlus className="w-8 h-8" /></div>
                                            <div className="text-left">
                                                <div className="text-lg opacity-90">Start Here</div>
                                                <div className="text-2xl font-black">New Patient Intake</div>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                                    </button>
                                ) : (
                                    <div className="space-y-4">
                                        <button onClick={() => setCurrentScreen('DISCLAIMER')} className="w-full bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-800 py-6 rounded-xl font-bold text-lg transition-all shadow-sm flex items-center justify-between px-8 group">
                                            <div className="flex items-center gap-4">
                                                <div className="p-3 bg-indigo-100 rounded-lg"><Brain className="w-8 h-8 text-indigo-600" /></div>
                                                <div className="text-left">
                                                    <div className="text-lg font-bold text-slate-800">Cognitive Assessment</div>
                                                    <div className="text-sm text-slate-500">Attention, Memory, Executive Function</div>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                                        </button>
                                        <button onClick={() => setCurrentScreen('TREMOR_TEST')} className="w-full bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-800 py-6 rounded-xl font-bold text-lg transition-all shadow-sm flex items-center justify-between px-8 group">
                                            <div className="flex items-center gap-4">
                                                <div className="p-3 bg-amber-100 rounded-lg"><Zap className="w-8 h-8 text-amber-600" /></div>
                                                <div className="text-left">
                                                    <div className="text-lg font-bold text-slate-800">Psychometric Assessment</div>
                                                    <div className="text-sm text-slate-500">Motor Control & Tremor Analysis</div>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                                        </button>

                                        <button onClick={() => setCurrentScreen('SPIRAL_TEST')} className="w-full bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-800 py-6 rounded-xl font-bold text-lg transition-all shadow-sm flex items-center justify-between px-8 group">
                                            <div className="flex items-center gap-4">
                                                <div className="p-3 bg-fuchsia-100 rounded-lg"><Activity className="w-8 h-8 text-fuchsia-600" /></div>
                                                <div className="text-left">
                                                    <div className="text-lg font-bold text-slate-800">Spiral Pattern Analysis</div>
                                                    <div className="text-sm text-slate-500">HOG + Random Forest Parkinson's Detection</div>
                                                </div>
                                            </div>
                                        </button>

                                        <div className={`h-px ${isDark ? "bg-slate-700" : "bg-slate-100"} my-4`}></div>
                                        <button onClick={() => setCurrentScreen('PATIENT_INTAKE')} className={`w-full py-3 hover:text-indigo-600 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${isDark ? "text-slate-500 hover:text-indigo-400" : "text-slate-500"}`}>
                                            <UserPlus className="w-4 h-4" /> Register Another Patient
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className={`grid gap-4 pt-4 border-t mt-6 ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                                <button onClick={() => setCurrentScreen('PATIENT_SELECT')} className={`p-4 rounded-xl transition-all text-left flex items-center gap-4 group ${isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}`}>
                                    <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-indigo-100 transition-colors"><Users className="w-5 h-5 text-slate-500 group-hover:text-indigo-600" /></div>
                                    <div className="flex-grow"><div className={`font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}>Patient Directory</div><div className="text-xs text-slate-400">View and manage all patient records</div></div>
                                    <ChevronRight className={`w-4 h-4 text-slate-300 group-hover:text-indigo-500 ${isDark ? "text-slate-500 group-hover:text-indigo-400" : ""}`} />
                                </button>
                                <button onClick={() => setCurrentScreen('PATIENT_HISTORY')} disabled={!activePatient} className={`p-4 rounded-xl transition-all text-left flex items-center gap-4 group ${activePatient ? (isDark ? 'hover:bg-slate-700/50 cursor-pointer' : 'hover:bg-slate-50 cursor-pointer') : 'opacity-50 cursor-not-allowed'}`}>
                                    <div className={`p-2 rounded-lg transition-colors ${activePatient ? 'bg-slate-100 group-hover:bg-indigo-100' : 'bg-slate-50'}`}><History className={`w-5 h-5 ${activePatient ? 'text-slate-500 group-hover:text-indigo-600' : 'text-slate-300'}`} /></div>
                                    <div className="flex-grow"><div className={`font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}>Clinical History</div><div className="text-xs text-slate-400">Longitudinal data analysis</div></div>
                                    <ChevronRight className={`w-4 h-4 text-slate-300 group-hover:text-indigo-500 ${isDark ? "text-slate-500 group-hover:text-indigo-400" : ""}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (currentScreen === 'PATIENT_INTAKE') {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 font-sans transition-colors ${bgMain}`}>
                <div className={`rounded-2xl w-full max-w-lg shadow-xl overflow-hidden border ${bgCard}`}>
                    {/* PURPLE HEADER IMPLEMENTATION */}
                    <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><UserPlus className="w-32 h-32" /></div>
                        <button onClick={() => setCurrentScreen('HOME')} className="flex items-center gap-2 mb-6 text-white/70 hover:text-white font-bold text-sm transition-colors"><ArrowLeft className="w-4 h-4" /> Cancel Intake</button>
                        <h2 className="text-3xl font-black mb-1">New Patient</h2>
                        <p className="text-indigo-200">Create clinical record</p>
                    </div>

                    <div className="p-8">
                        <form onSubmit={handleRegisterPatient} className="space-y-6">
                            <div className="space-y-4">
                                <div><label className={`block text-sm font-bold mb-1 ml-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Full Name</label><input name="name" required className={`w-full p-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium ${bgInput}`} placeholder="Eg: Sarthak Tisgaonkar" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className={`block text-sm font-bold mb-1 ml-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Age</label><input name="age" type="number" required className={`w-full p-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium ${bgInput}`} placeholder="Eg: 21" /></div>
                                    <div><label className={`block text-sm font-bold mb-1 ml-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Gender</label><select name="gender" className={`w-full p-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium appearance-none ${bgInput}`}><option>Male</option><option>Female</option><option>Other</option></select></div>
                                </div>
                                <div><label className={`block text-sm font-bold mb-1 ml-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Clinical Notes</label><textarea name="notes" rows={3} className={`w-full p-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium resize-none ${bgInput}`} placeholder="Initial observations..." ></textarea></div>
                            </div>
                            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 text-lg">Create Profile</button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    if (currentScreen === 'PATIENT_SELECT') {
        return (
            <div className={`min-h-screen p-8 font-sans transition-colors ${bgMain}`}>
                <div className="max-w-4xl mx-auto">
                    <button onClick={() => setCurrentScreen('HOME')} className={`mb-8 flex items-center gap-2 transition-colors font-bold ${textSecondary} hover:text-slate-800`}><ArrowLeft className="w-5 h-5" /> Back to Dashboard</button>
                    <h2 className={`text-3xl font-black mb-8 flex items-center gap-3 ${textMain}`}><Users className={`w-8 h-8 ${accentColor}`} /> Patient Directory</h2>
                    <div className="grid gap-4">
                        {patients.map(p => (
                            <div key={p.id} onClick={() => handleSelectPatient(p)} className={`p-6 rounded-2xl shadow-sm border transition-all cursor-pointer flex items-center justify-between group ${bgCard} hover:border-indigo-300 hover:shadow-md`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-colors ${isDark ? "bg-slate-700 text-slate-300 group-hover:bg-indigo-900/30 group-hover:text-indigo-400" : "bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600"}`}>{p.name[0]}</div>
                                    <div><div className={`font-bold text-lg ${textMain}`}>{p.name}</div><div className={`${textSecondary} text-sm`}>{p.id} • {p.age} • {p.gender}</div></div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right text-xs text-slate-400">Created<br />{new Date(p.created_at).toLocaleDateString()}</div>
                                    <button onClick={(e) => handleDeletePatient(e, p.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500" />
                                </div>
                            </div>
                        ))}
                        {patients.length === 0 && <div className="text-center py-20 text-slate-400 italic">No patients found. Create a new profile to begin.</div>}
                    </div>
                </div>
            </div>
        );
    }

    if (currentScreen === 'PATIENT_HISTORY') {
        const filteredHistory = historyFilter === 'ALL' ? patientHistory : patientHistory.filter(r => r.type === historyFilter);

        // Prepare Graph Data based on toggle
        const graphData = patientHistory
            .filter(r => {
                if (graphMetric === 'GCS') return r.type === 'COGNITIVE';
                if (graphMetric === 'RMS') return r.type === 'MOTOR';
                return r.type === 'SPIRAL';
            })
            .sort((a, b) => a.date - b.date)
            .map(r => {
                if (graphMetric === 'GCS') return r;
                if (graphMetric === 'SPIRAL') {
                    const sr = r as DB.SpiralRecord;
                    return { ...sr, spiralScore: sr.score };
                }
                const tr = r as DB.TremorRecord;
                return { ...tr, rms: Math.max(tr.left_hand.avg_rms, tr.right_hand.avg_rms) };
            });

        return (
            <div className={`min-h-screen p-8 font-sans transition-colors ${bgMain}`}>
                <div className="max-w-5xl mx-auto">
                    <div className="flex justify-between items-center mb-8">
                        <button onClick={() => setCurrentScreen('HOME')} className={`flex items-center gap-2 font-bold transition-colors ${textSecondary} hover:text-slate-800 dark:hover:text-white`}><ArrowLeft className="w-5 h-5" /> Back to Dashboard</button>
                        <div className={`flex gap-2 p-1 rounded-xl shadow-sm border ${bgCard}`}>
                            {(['ALL', 'COGNITIVE', 'MOTOR', 'SPIRAL'] as const).map(f => (
                                <button key={f} onClick={() => setHistoryFilter(f)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${historyFilter === f ? (isDark ? 'bg-indigo-900/30 text-indigo-300' : 'bg-indigo-100 text-indigo-700') : (isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-50')}`}>{f}</button>
                            ))}
                        </div>
                    </div>

                    {/* Patient Header & EWSS */}
                    {activePatient && (
                        <div className={`flex flex-col md:flex-row items-start md:items-center justify-between p-6 rounded-3xl shadow-sm border mb-8 gap-6 ${bgCard}`}>
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 flex items-center justify-center text-2xl font-bold text-white shadow-md flex-shrink-0">
                                    {activePatient.name[0]}
                                </div>
                                <div>
                                    <div className={`font-black text-2xl ${textMain}`}>{activePatient.name}</div>
                                    <div className="text-slate-500 font-mono text-sm mt-1">ID: {activePatient.id} • {activePatient.age} yrs</div>
                                </div>
                            </div>

                            {ewssMetrics && (
                                <div className={`px-5 py-4 rounded-2xl border-2 ${ewssMetrics.colorTheme} flex items-center gap-4 md:gap-6 flex-wrap md:flex-nowrap w-full md:w-auto`}>
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-1"><Activity className="w-4 h-4" /> EWSS</div>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <span className="text-3xl font-black font-mono">{ewssMetrics.score.toFixed(0)}</span>
                                            <span className="text-sm font-bold opacity-70">/100</span>
                                        </div>
                                    </div>
                                    <div className="w-px h-10 bg-current opacity-20 hidden md:block"></div>
                                    <div>
                                        <div className="flex items-center gap-2 font-bold text-sm">
                                            <span className={`w-2 h-2 rounded-full ${ewssMetrics.badgeColor} animate-pulse`}></span>
                                            {ewssMetrics.riskLabel}
                                        </div>
                                        <div className="text-xs opacity-80 mt-1">{ewssMetrics.alertText}</div>
                                    </div>

                                    <div className="w-px h-10 bg-current opacity-20 hidden md:block"></div>

                                    <div className="flex gap-4 text-xs font-mono text-center">
                                        <div>
                                            <div className="font-bold opacity-70 uppercase text-[10px]">Spiral</div>
                                            <div className="mt-1">{ewssMetrics.hasFeatures.spiral ? ewssMetrics.raw.spiral.toFixed(0) : '--'}</div>
                                        </div>
                                        <div>
                                            <div className="font-bold opacity-70 uppercase text-[10px]">Tremor</div>
                                            <div className="mt-1">{ewssMetrics.hasFeatures.tremor ? ewssMetrics.raw.tremor.toFixed(0) : '--'}</div>
                                        </div>
                                        <div>
                                            <div className="font-bold opacity-70 uppercase text-[10px]">Cognitive</div>
                                            <div className="mt-1">{ewssMetrics.hasFeatures.cognitive ? ewssMetrics.raw.cognitive.toFixed(0) : '--'}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* UNIFIED LONGITUDINAL GRAPH */}
                    <div className={`p-6 rounded-3xl shadow-sm border mb-8 ${bgCard}`}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className={`text-lg font-bold flex items-center gap-2 ${textMain}`}>
                                    <Activity className="w-5 h-5 text-indigo-500" /> Longitudinal Analysis
                                </h3>
                                <p className="text-sm text-slate-400">Track patient progress over time</p>
                            </div>

                            {/* GRAPH TOGGLE */}
                            <div className={`flex p-1 rounded-lg border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                                <button
                                    onClick={() => setGraphMetric('GCS')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${graphMetric === 'GCS' ? 'bg-white shadow text-indigo-600 dark:bg-slate-700 dark:text-white' : 'text-slate-400'}`}
                                >
                                    Cognitive (GCS)
                                </button>
                                <button
                                    onClick={() => setGraphMetric('RMS')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${graphMetric === 'RMS' ? 'bg-white shadow text-amber-600 dark:bg-slate-700 dark:text-white' : 'text-slate-400'}`}
                                >
                                    Motor (RMS)
                                </button>
                                <button
                                    onClick={() => setGraphMetric('SPIRAL')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${graphMetric === 'SPIRAL' ? 'bg-white shadow text-fuchsia-600 dark:bg-slate-700 dark:text-white' : 'text-slate-400'}`}
                                >
                                    Spiral (PD%)
                                </button>
                            </div>
                        </div>

                        <div className="h-64">
                            <HistoryChart
                                data={graphData}
                                dataKey={graphMetric === 'GCS' ? 'gcs' : graphMetric === 'SPIRAL' ? 'spiralScore' : 'rms'}
                                color={graphMetric === 'GCS' ? (isDark ? "#818cf8" : "#4f46e5") : graphMetric === 'SPIRAL' ? (isDark ? "#e879f9" : "#c026d3") : "#f59e0b"}
                                label={graphMetric === 'GCS' ? "Global Cognitive Score" : graphMetric === 'SPIRAL' ? "PD Probability %" : "Max Tremor RMS"}
                            />
                        </div>
                    </div>

                    <div className={`rounded-3xl shadow-sm border p-8 mb-8 ${bgCard}`}>
                        {/* List view remains similar, but using analyzeTrend correctly for specific items might need adjustment if we want trend icons per item, 
                               but requirement was about general trend logic. The analyzeTrend function is used in DETAILED_REPORT usually.
                               Here in history list we just show scores. */}
                        <div className="flex items-center justify-between mb-6">
                            <div><h2 className={`text-3xl font-black flex items-center gap-3 ${textMain}`}><History className={`w-8 h-8 ${accentColor}`} /> Clinical History</h2><p className="text-slate-400 mt-1">Found {filteredHistory.length} records for {activePatient?.name}</p></div>
                            <button onClick={() => { if (activePatient) refreshHistory(activePatient.id) }} className={`p-2 rounded-lg transition-colors ${isDark ? "bg-slate-700 hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-400" : "bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600"}`}><RotateCcw size={20} /></button>
                        </div>
                        <div className="space-y-3">
                            {filteredHistory.map(r => (
                                <div key={r.id} onClick={() => handleViewRecord(r)} className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${bgCard} ${isDark ? "hover:bg-slate-700/50 hover:border-indigo-500" : "hover:bg-slate-50 hover:border-indigo-200"}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-lg ${r.type === 'MOTOR' ? (isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600') : (isDark ? 'bg-indigo-900/30 text-indigo-400' : 'bg-indigo-100 text-indigo-600')}`}>
                                            {r.type === 'MOTOR' ? <Zap className="w-5 h-5" /> : <Brain className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className={`font-bold ${textMain}`}>{r.type === 'MOTOR' ? 'Psychomotor Assessment' : r.type === 'SPIRAL' ? 'Spiral Drawing Analysis' : 'Cognitive Assessment'}</div>
                                            <div className="text-xs text-slate-400 font-mono">{new Date(r.date).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Score</div>
                                            <div className={`font-bold text-lg ${r.type === 'MOTOR' ? getScoreColor(Math.max((r as DB.TremorRecord).left_hand.severity_score, (r as DB.TremorRecord).right_hand.severity_score) * 10) :
                                                r.type === 'SPIRAL' ? ((r as DB.SpiralRecord).score > 50 ? 'text-rose-500' : 'text-emerald-500') :
                                                    getScoreColor((r as DB.AssessmentRecord).gcs)
                                                }`}>
                                                {r.type === 'MOTOR' ? Math.max((r as DB.TremorRecord).left_hand.severity_score, (r as DB.TremorRecord).right_hand.severity_score).toFixed(1) :
                                                    r.type === 'SPIRAL' ? `${(r as DB.SpiralRecord).score.toFixed(1)}%` :
                                                        (r as DB.AssessmentRecord).gcs.toFixed(1)}
                                            </div>
                                        </div>
                                        <button onClick={(e) => handleDeleteAssessment(e, r.id, r.type)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-transform group-hover:translate-x-1" />
                                    </div>
                                </div>
                            ))}
                            {filteredHistory.length === 0 && <div className="text-center py-12 text-slate-400">No records found for this filter.</div>}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (currentScreen === 'TREMOR_TEST') {
        return <TremorTest patientId={activePatient?.id || 'guest'} onBack={() => {
            if (activePatient) refreshHistory(activePatient.id);
            setCurrentScreen('HOME');
        }} isDark={isDark} />;
    }

    if (currentScreen === 'TREMOR_REPORT') {
        return (
            <div className={`min-h-screen transition-colors ${bgMain}`}>
                <TremorReport record={selectedRecord as DB.TremorRecord} onBack={() => setCurrentScreen('PATIENT_HISTORY')} onDelete={(id) => handleDeleteAssessment({ stopPropagation: () => { } } as any, id, 'MOTOR')} isDark={isDark} />
            </div>
        );
    }

    if (currentScreen === 'SPIRAL_REPORT') {
        return (
            <div className={`min-h-screen transition-colors ${bgMain}`}>
                <SpiralReport record={selectedRecord as DB.SpiralRecord} onBack={() => setCurrentScreen('PATIENT_HISTORY')} onDelete={(id) => handleDeleteAssessment({ stopPropagation: () => { } } as any, id, 'SPIRAL')} isDark={isDark} />
            </div>
        );
    }

    if (currentScreen === 'SPIRAL_TEST') {
        return (
            <div className={`min-h-screen transition-colors ${bgMain}`}>
                <SpiralTest patientId={activePatient?.id || 'guest'} onBack={() => {
                    if (activePatient) refreshHistory(activePatient.id);
                    setCurrentScreen('HOME');
                }} isDark={isDark} />
            </div>
        );
    }

    if (currentScreen === 'DISCLAIMER') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                <div className="bg-slate-800 p-10 rounded-3xl max-w-2xl text-center shadow-2xl border border-slate-700">
                    <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold text-white mb-4">Clinical Assessment Protocol</h2>
                    <p className="text-slate-400 mb-8 leading-relaxed">This module initiates a standard cognitive evaluation sequence consisting of Psychomotor Vigilance Task (PVT), N-Back Memory Verification, and Adaptive Questioning. Ensure the patient is seated comfortably in a distraction-free environment.</p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={() => setCurrentScreen('HOME')} className="px-8 py-3 rounded-xl hover:bg-slate-700 text-slate-400 transition-colors font-bold">Cancel</button>
                        <button onClick={() => setCurrentScreen('GAME_INTRO')} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center gap-2">Initiate Protocol <ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        );
    }

    if (currentScreen === 'GAME_INTRO') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
                <div className="mb-8 w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mx-auto text-indigo-600 animate-pulse"><Zap className="w-10 h-10" /></div>
                <h2 className="text-4xl font-black text-slate-900 mb-4">Psychomotor Vigilance</h2>
                <p className="text-xl text-slate-500 max-w-xl mx-auto mb-12">Measures reaction time and sustained attention. Tap immediately when the visual stimulus appears.</p>
                <div className="grid grid-cols-2 gap-8 max-w-lg mx-auto mb-12 text-left">
                    <div className="flex gap-4 bg-white p-4 rounded-xl shadow-sm"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold shrink-0">1</div><p className="text-sm text-slate-600">Wait for the circle to change color.</p></div>
                    <div className="flex gap-4 bg-white p-4 rounded-xl shadow-sm"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold shrink-0">2</div><p className="text-sm text-slate-600">Respond as quickly as possible.</p></div>
                </div>
                <button onClick={startPVT} className="bg-slate-900 text-white px-12 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl flex items-center gap-3"><PlayCircle className="w-6 h-6" /> Start Task</button>
            </div>
        );
    }

    if (currentScreen === 'GAME') {
        const isWaiting = gameState === 'WAITING';
        return (
            <div onMouseDown={handlePVTClick} onTouchStart={handlePVTClick} className={`min-h-screen cursor-pointer transition-colors duration-100 flex flex-col items-center justify-center relative touch-none select-none ${isWaiting ? 'bg-rose-600' : 'bg-emerald-500'}`}>
                {renderExitButton(true)}

                {/* HUD */}
                <div className="absolute top-6 left-6 flex gap-6 text-white/90">
                    <div className="flex flex-col items-center">
                        <span className="text-xs font-bold uppercase tracking-wider opacity-70">Hits</span>
                        <span className="text-2xl font-mono font-bold text-emerald-100">{reactions.length}</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-xs font-bold uppercase tracking-wider opacity-70 text-rose-200">Invalid</span>
                        <span className="text-2xl font-mono font-bold text-rose-200">{falseStarts}</span>
                    </div>
                </div>

                {/* TIMER - BOTTOM CENTER */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center z-20 pointer-events-none">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-70 text-white mb-1">Time Remaining</span>
                    <span className="text-4xl font-black font-mono text-white drop-shadow-md">{timeLeft}s</span>
                </div>

                {isWaiting ? <div className="text-white/80 text-3xl font-black tracking-widest animate-pulse flex flex-col items-center gap-4"><Loader className="w-12 h-12 animate-spin" /><span className="uppercase">Wait for Green</span></div> : <div className="text-white text-5xl font-black tracking-widest scale-125 uppercase drop-shadow-xl">TAP NOW!</div>}

                <div className="absolute bottom-24 text-white/50 font-mono text-sm uppercase tracking-widest">
                    {isWaiting ? "Do not tap on red" : "Tap anywhere on screen"}
                </div>
            </div>
        );
    }

    if (currentScreen === 'MEMORY_INTRO') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
                <div className="mb-8 w-24 h-24 bg-fuchsia-100 rounded-full flex items-center justify-center mx-auto text-fuchsia-600"><Brain className="w-10 h-10" /></div>
                <h2 className="text-4xl font-black text-slate-900 mb-4">Spatial Memory</h2>
                <p className="text-xl text-slate-500 max-w-xl mx-auto mb-12">Memorize the sequence of highlighted tiles and repeat the pattern correctly.</p>
                <button onClick={startMemoryGame} className="bg-slate-900 text-white px-12 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl flex items-center gap-3"><PlayCircle className="w-6 h-6" /> Start Task</button>
            </div>
        );
    }

    if (currentScreen === 'MEMORY') {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative">
                {renderExitButton(true)}
                <div className="mb-8 text-center text-white">
                    <div className="text-sm font-bold text-indigo-400 tracking-widest mb-2">MEMORY SEQUENCE</div>
                    <div className="text-3xl font-black">Level {memoryLevel}</div>
                    <div className="h-1 w-24 bg-slate-800 rounded-full mx-auto mt-4 overflow-hidden"><div className={`h-full bg-indigo-500 transition-all duration-300`} style={{ width: `${(userSequence.length / sequence.length) * 100}%` }}></div></div>
                </div>
                <div className="grid grid-cols-3 gap-3 md:gap-4 p-4 bg-slate-800 rounded-2xl md:rounded-3xl shadow-2xl border border-slate-700">
                    {Array.from({ length: DB.CONFIG.MEM_GRID_SIZE }).map((_, i) => {
                        const isActive = memoryState === 'SHOWING' && showingIdx === i;
                        return (
                            <button
                                key={i}
                                onMouseDown={() => handleMemoryClick(i)}
                                disabled={memoryState !== 'USER_TURN'}
                                className={`w-20 h-20 md:w-24 md:h-24 rounded-xl md:rounded-2xl transition-all duration-150 transform hover:scale-[1.02] active:scale-95 border-2 ${isActive ? 'bg-fuchsia-500 border-fuchsia-400 shadow-[0_0_30px_rgba(232,121,249,0.5)] z-10 scale-105' : 'bg-slate-700 border-slate-600 hover:border-slate-500'}`}
                            ></button>
                        );
                    })}
                </div>
                <div className="mt-8 h-8 text-white font-bold text-center">{memoryState === 'SHOWING' ? <span className="text-fuchsia-400 animate-pulse">Watch Pattern...</span> : memoryState === 'USER_TURN' ? <span className="text-emerald-400">Repeat Pattern</span> : memoryState === 'FAILURE' ? <span className="text-rose-500">Incorrect</span> : <span className="text-emerald-500">Correct!</span>}</div>
            </div>
        );
    }

    if (currentScreen === 'QA_INTRO') {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center p-8 text-center transition-colors ${bgMain}`}>
                <div className={`mb-8 w-24 h-24 rounded-full flex items-center justify-center mx-auto ${bgAccent} ${accentColor}`}><CheckCircle className="w-10 h-10" /></div>
                <h2 className={`text-4xl font-black mb-4 ${textMain}`}>Detailed Assessment</h2>
                <p className={`text-xl max-w-xl mx-auto mb-12 ${textSecondary}`}>Please answer a few questions to help contextualize the clinical data.</p>
                <button onClick={startQA} className={`px-12 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl flex items-center gap-3 ${isDark ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"}`}><PlayCircle className="w-6 h-6" /> Start Questions</button>
            </div>
        );
    }

    if (currentScreen === 'QA_LOADING') {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center transition-colors ${bgMain}`}>
                <Loader className={`w-10 h-10 animate-spin mb-4 ${accentColor}`} />
                <p className={`font-bold ${textSecondary}`}>Generating Adaptive Questions...</p>
            </div>
        );
    }

    if (currentScreen === 'QA') {
        return (
            <div className={`min-h-screen flex flex-col p-6 transition-colors ${bgMain}`}>
                {renderExitButton(false)}
                <div className="max-w-2xl mx-auto w-full flex-grow flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="h-10 w-10 bg-indigo-600 dark:bg-indigo-500 rounded-xl flex items-center justify-center text-white font-bold"><CheckCircle /></div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white">Clinical Questions</h2>
                    </div>
                    <div className="space-y-8 mb-12">
                        {activeQuestions.map((q, idx) => (
                            <div key={q.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                <p className="font-bold text-lg text-slate-800 dark:text-white mb-4">{idx + 1}. {q.text}</p>
                                <div className="grid gap-2">
                                    {q.options.map((opt, optIdx) => (
                                        <label key={optIdx} className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${answers[q.id] === optIdx ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-100 dark:hover:border-indigo-900'}`}>
                                            <input type="radio" name={`q-${q.id}`} className="hidden" onChange={() => handleAnswer(q.id, optIdx)} checked={answers[q.id] === optIdx} />
                                            <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${answers[q.id] === optIdx ? 'border-indigo-600 dark:border-indigo-400' : 'border-slate-300 dark:border-slate-600'}`}>{answers[q.id] === optIdx && <div className="w-2.5 h-2.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />}</div>
                                            <span className={`font-medium ${answers[q.id] === optIdx ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}>{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={submitQA} disabled={Object.keys(answers).length !== activeQuestions.length} className="w-full bg-indigo-600 disabled:bg-slate-300 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95">Complete Assessment</button>
                </div>
            </div>
        );
    }

    if (currentScreen === 'RESULTS' || currentScreen === 'DETAILED_REPORT') {
        if (!selectedRecord) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center transition-colors"><Loader className="animate-spin text-indigo-600 dark:text-indigo-400" /></div>;

        const rec = selectedRecord as DB.AssessmentRecord;
        const trend = analyzeTrend(patientHistory.filter(h => h.type === 'COGNITIVE') as DB.AssessmentRecord[], 'COGNITIVE');
        const radarData = [
            { label: 'Attention', value: rec.api, fullMark: 100 },
            { label: 'Memory', value: rec.wmc, fullMark: 100 },
            { label: 'Speed', value: rec.gcs, fullMark: 100 }, // Simplified mapping for visual
            { label: 'Stability', value: 100 - rec.cov, fullMark: 100 },
            { label: 'Precision', value: 100 - (rec.lapses * 10), fullMark: 100 }
        ];

        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6 md:p-8 font-sans transition-colors">
                <div className="max-w-6xl mx-auto bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl overflow-hidden print-area border border-slate-100 dark:border-slate-700">
                    {/* Header */}
                    <div className="bg-slate-900 dark:bg-black text-white p-8 md:p-12 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Brain className="w-64 h-64" /></div>
                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <div className="flex items-center gap-3 text-indigo-400 font-bold tracking-widest uppercase text-sm mb-2"><FileBarChart className="w-4 h-4" /> Clinical Assessment Report</div>
                                <h1 className="text-4xl font-black mb-2">{activePatient?.name}</h1>
                                <p className="text-slate-400 font-mono text-sm">ID: {activePatient?.id} • {new Date(rec.date).toLocaleString()} • Post-Test</p>
                            </div>
                            <div className="bg-slate-700/50 p-4 rounded-2xl border border-slate-600">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Global Cognitive Score</div>
                                <div className={`text-5xl font-black ${getScoreColor(rec.gcs)}`}>{rec.gcs.toFixed(0)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Dashboard */}
                    <div className="p-8 md:p-12">
                        <div className="grid md:grid-cols-12 gap-12">
                            {/* Left Column: Metrics */}
                            <div className="md:col-span-7 space-y-10">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={`p-6 rounded-2xl border-l-4 ${rec.risk_level === 'High' ? 'bg-rose-50 border-rose-500 text-rose-800 dark:bg-rose-900/20 dark:text-rose-400' : 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
                                        <div className="font-bold text-xs uppercase opacity-70 mb-1">Risk Assessment</div>
                                        <div className="font-black text-2xl">{rec.risk_level} Risk</div>
                                    </div>
                                    <div className={`p-6 rounded-2xl border-l-4 ${trend.bg.replace('bg-', 'bg-').replace('50', '50 dark:bg-opacity-20')} ${trend.color.replace('text', 'border')} ${trend.color} dark:bg-opacity-10`}>
                                        <div className="font-bold text-xs uppercase opacity-70 mb-1">Longitudinal Trend</div>
                                        <div className="font-black text-2xl flex items-center gap-2"><trend.icon className="w-5 h-5" /> {trend.status}</div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-8">
                                    <h3 className="font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Performance Metrics</h3>
                                    <MetricRow label="Reaction Time (Mean)" value={`${rec.rt_mean.toFixed(0)} ms`} isDark={isDark} />
                                    <MetricRow label="Reaction Time (SD)" value={`${rec.rt_sd.toFixed(0)} ms`} isDark={isDark} />
                                    <MetricRow label="Coeff. of Variation" value={`${rec.cov.toFixed(1)}%`} warning={rec.cov > 20} isDark={isDark} />
                                    <MetricRow label="Attentional Lapses" value={rec.lapses} warning={rec.lapses > 4} isDark={isDark} />
                                    <MetricRow label="Memory Throughput" value={`${rec.throughput.toFixed(2)} bits/s`} isDark={isDark} />
                                    <MetricRow label="Working Memory Capacity" value={rec.wmc.toFixed(1)} isDark={isDark} />
                                </div>

                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Clinical Insight</h3>
                                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-indigo-50/50 dark:bg-indigo-900/20 p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/50 italic">"{rec.insight_text}"</p>
                                </div>
                            </div>

                            {/* Right Column: Visuals */}
                            <div className="md:col-span-5 flex flex-col items-center">
                                <h3 className="font-bold text-slate-900 dark:text-white mb-8 self-start flex items-center gap-2"><ArrowLeft className="w-5 h-5 text-indigo-600 dark:text-indigo-400 rotate-180" /> Cognitive Profile</h3>
                                <RadarChart data={radarData} />

                                <div className="mt-12 w-full space-y-4">
                                    <button onClick={() => setCurrentScreen('HOME')} className="w-full py-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl transition-all shadow-xl flex items-center justify-center gap-2"><ArrowLeft className="w-5 h-5" /> Return to Dashboard</button>
                                    <button onClick={() => window.print()} className="w-full py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all flex items-center justify-center gap-2 print:hidden"><FileBarChart className="w-5 h-5" /> Export Report</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null; // Fallback
}

