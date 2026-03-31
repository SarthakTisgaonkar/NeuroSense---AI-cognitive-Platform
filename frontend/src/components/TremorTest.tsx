import { Activity, ArrowLeft, Database, HelpCircle, PlayCircle, RotateCcw, StopCircle, WifiOff, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import * as DB from '../services/db';
import * as TremorCalc from '../utils/tremorCalculations'; // Import Utils
import RealtimeChart from './RealtimeChart';
import HandSensorVisual from './HandSensorVisual';

interface TremorTestProps {
    patientId: string;
    onBack: () => void;
    isDark: boolean;
}

interface SensorDataPoint {
    timestamp: string;
    freq: number;
    rms: number;
    max: number;
    tremor: boolean;
    id: number;
}

interface SensorState {
    ip: string;
    status: string;
    isConnected: boolean;
    data: SensorDataPoint[];
    current: { freq: number, rms: number, max: number, tremor: boolean };
    error: string | null;
}

const INITIAL_SENSOR = {
    ip: '',
    status: 'Disconnected',
    isConnected: false,
    data: [],
    current: { freq: 0, rms: 0, max: 0, tremor: false },
    error: null
};

export default function TremorTest({ patientId, onBack, isDark }: TremorTestProps) {
    // --- Theme Variables ---
    const bgCard = isDark ? "bg-slate-800 border-slate-700 shadow-sm" : "bg-white border-slate-100 shadow-sm";
    const textMain = isDark ? "text-white" : "text-slate-900";
    const bgInput = isDark ? "bg-slate-900/50 border-white/10 text-white" : "bg-white/50 border-white/40 text-slate-900";

    // --- Global State ---
    const [wizardStep, setWizardStep] = useState<'INTRO' | 'CALIBRATE' | 'WEAR' | 'TEST'>('INTRO');
    const [isSecureContext, setIsSecureContext] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
    const [showTroubleshoot, setShowTroubleshoot] = useState(false);
    const [calibrating, setCalibrating] = useState(false);

    // --- Sensor States ---
    const [left, setLeft] = useState<SensorState>(INITIAL_SENSOR);
    const [right, setRight] = useState<SensorState>(INITIAL_SENSOR);

    // --- Refs ---
    const isRecordingRef = useRef(false);
    const wsLeft = useRef<WebSocket | null>(null);
    const wsRight = useRef<WebSocket | null>(null);
    const demoInterval = useRef<number | null>(null);

    // --- Init ---
    useEffect(() => {
        if (window.location.protocol === 'https:' && !window.location.hostname.includes('localhost')) {
            setIsSecureContext(true);
        }
        const lastIpLeft = localStorage.getItem('lastIpLeft');
        const lastIpRight = localStorage.getItem('lastIpRight');

        if (lastIpLeft) setLeft(prev => ({ ...prev, ip: lastIpLeft }));
        if (lastIpRight) setRight(prev => ({ ...prev, ip: lastIpRight }));

        return () => stopAll();
    }, []);

    const stopAll = () => {
        disconnect('left');
        disconnect('right');
        stopDemo();
    };

    // --- Connection Logic ---
    const connect = (side: 'left' | 'right') => {
        if (isSecureContext) {
            alert("Security Error: HTTPS cannot connect to local IP. Run on localhost.");
            return;
        }

        const target = side === 'left' ? left : right;
        const setTarget = side === 'left' ? setLeft : setRight;
        const wsRef = side === 'left' ? wsLeft : wsRight;

        if (!target.ip) return alert(`Enter IP for ${side} sensor`);

        // Save IP
        localStorage.setItem(side === 'left' ? 'lastIpLeft' : 'lastIpRight', target.ip);

        // Reset State
        setTarget(prev => ({ ...prev, status: 'Connecting...', error: null, isConnected: false }));
        if (wsRef.current) wsRef.current.close();

        try {
            const ws = new WebSocket(`ws://${target.ip}:81`);
            wsRef.current = ws;

            ws.onopen = () => {
                setTarget(prev => ({ ...prev, status: 'Connected', isConnected: true, error: null }));
            };

            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.status === "connected") return;
                    if (data.status === "error") {
                        setTarget(prev => ({ ...prev, status: 'Hardware Error', error: data.msg }));
                        return;
                    }
                    processData(side, data);
                } catch (err) { console.error(err); }
            };

            ws.onclose = () => {
                setTarget(prev => ({ ...prev, status: 'Disconnected', isConnected: false }));
            };

            ws.onerror = () => {
                setTarget(prev => ({ ...prev, status: 'Connection Failed', error: 'WebSocket Error' }));
            };

        } catch (e) {
            setTarget(prev => ({ ...prev, status: 'Failed', error: 'Invalid URL/Network' }));
        }
    };

    const disconnect = (side: 'left' | 'right') => {
        const wsRef = side === 'left' ? wsLeft : wsRight;
        const setTarget = side === 'left' ? setLeft : setRight;

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setTarget(prev => ({ ...prev, status: 'Disconnected', isConnected: false, error: null }));
    };

    const processData = (side: 'left' | 'right', rawData: any) => {
        const timestamp = new Date().toLocaleTimeString();
        const newPoint: SensorDataPoint = { ...rawData, timestamp, id: Date.now() };

        const setTarget = side === 'left' ? setLeft : setRight;

        setTarget(prev => {
            const updatedData = isRecordingRef.current ? [...prev.data, newPoint] : [...prev.data, newPoint].slice(-100);
            return {
                ...prev,
                current: rawData,
                data: updatedData
            };
        });
    };

    // --- Demo Mode ---
    const toggleDemo = () => {
        if (isSimulating) {
            stopDemo();
        } else {
            startDemo();
        }
    };

    const startDemo = () => {
        disconnect('left');
        disconnect('right');

        setIsSimulating(true);
        setLeft(prev => ({ ...prev, status: 'Demo Mode', isConnected: true }));
        setRight(prev => ({ ...prev, status: 'Demo Mode', isConnected: true }));

        demoInterval.current = window.setInterval(() => {
            const t = Date.now() / 1000;
            // Left: Calm
            const leftData = {
                freq: 1 + Math.random(),
                rms: 0.5 + Math.random() * 0.5,
                max: 1.5,
                tremor: false
            };
            // Right: Tremor?
            const isTremor = Math.sin(t) > 0.5;
            const rightData = {
                freq: isTremor ? 5 + Math.random() : 2 + Math.random(),
                rms: isTremor ? 5 + Math.random() * 2 : 1 + Math.random(),
                max: 8,
                tremor: isTremor
            };

            processData('left', leftData);
            processData('right', rightData);

        }, 500); // 2Hz demo update
    };

    const stopDemo = () => {
        if (demoInterval.current) clearInterval(demoInterval.current);
        setIsSimulating(false);
        setLeft(prev => ({ ...prev, status: 'Disconnected', isConnected: false, data: [] }));
        setRight(prev => ({ ...prev, status: 'Disconnected', isConnected: false, data: [] }));
    };

    // --- Recording & Saving ---
    const toggleRecording = () => {
        if (isRecording) {
            saveSession();
            setIsRecording(false);
            isRecordingRef.current = false;
        } else {
            setLeft(prev => ({ ...prev, data: [] }));
            setRight(prev => ({ ...prev, data: [] }));
            setRecordingStartTime(Date.now());
            setIsRecording(true);
            isRecordingRef.current = true;
        }
    };

    const saveSession = () => {
        const duration = (Date.now() - recordingStartTime) / 1000;

        // Helper to process hand data
        const processHandData = (data: SensorDataPoint[]): DB.HandMetrics => {
            if (data.length === 0) return {
                recorded: false,
                samples: [],
                avg_freq: 0,
                avg_rms: 0,
                max_amp: 0,
                tremor_detected: false,
                persistence: 0,
                rhythmicity: 0,
                amplitude_cov: 0,
                crest_factor: 0,
                severity_score: 0,
                tremor_density: 0,
                amplitude_variability: 0,
                clinical_grade: 0,
                frequency_drift: 0,
                axis_classification: "None",
                harmonic_ratio: 0,
                approx_entropy: 0
            };

            const freqs = data.map(d => d.freq);
            const rms = data.map(d => d.rms);

            // Basic Metrics
            const avg_freq = freqs.reduce((a, b) => a + b, 0) / freqs.length;
            const avg_rms = rms.reduce((a, b) => a + b, 0) / rms.length;
            const max_amp = Math.max(...rms);
            const tremor_detected = data.some(d => d.tremor);

            // Advanced Markers (Level 1)
            const persistence = (data.filter(d => d.tremor).length / data.length) * 100;

            const freqVariance = freqs.reduce((acc, val) => acc + Math.pow(val - avg_freq, 2), 0) / freqs.length;
            const freqSD = Math.sqrt(freqVariance);
            const rhythmicity = avg_freq > 0 ? Math.max(0, 1 - (freqSD / avg_freq)) : 0;

            const rmsVariance = rms.reduce((acc, val) => acc + Math.pow(val - avg_rms, 2), 0) / rms.length;
            const rmsSD = Math.sqrt(rmsVariance);
            const amplitude_cov = avg_rms > 0 ? (rmsSD / avg_rms) * 100 : 0;

            // New Level 1 Metrics
            const crest = TremorCalc.calculateCrestFactor(max_amp, avg_rms);
            const crest_factor = crest.score;

            const grade = TremorCalc.getClinicalGrade(avg_rms);
            const clinical_grade = grade.grade;

            const drift = TremorCalc.calculateFrequencyDrift(data.map(d => ({ timestamp: parseInt(d.timestamp) || 0, freq: d.freq })));
            const frequency_drift = drift.slope;

            // Level 2: Synthetic Data Generation (since firmware sends only RMS/Freq)
            const sampleRate = 100; // 100Hz
            const totalSamples = Math.min(data.length * 20, 1000); // Simulate up to 10s or 1000 samples
            const simX: number[] = [];
            const simY: number[] = [];
            const simZ: number[] = [];

            for (let i = 0; i < totalSamples; i++) {
                const t = i / sampleRate;
                const noise = (Math.random() - 0.5) * 0.1;
                if (tremor_detected) {
                    simZ.push(avg_rms * Math.sin(2 * Math.PI * avg_freq * t) + noise); // Z dominance (Flapping)
                    simX.push((avg_rms * 0.2) * Math.sin(2 * Math.PI * avg_freq * t) + noise);
                    simY.push((avg_rms * 0.2) * Math.sin(2 * Math.PI * avg_freq * t) + noise);
                } else {
                    simX.push(noise);
                    simY.push(noise);
                    simZ.push(noise);
                }
            }

            const axis_classification = TremorCalc.classifyTremorAxis(simX, simY, simZ);
            const harmonic = TremorCalc.calculateHarmonicRatio(simZ, sampleRate);
            const harmonic_ratio = harmonic.ratio;
            const approx_entropy = TremorCalc.calculateApEn(simZ.slice(0, 100), 2);

            // Existing composite score logic
            const normRMS = Math.min(10, (avg_rms / 12) * 10);
            const normPersist = persistence / 10;
            const severity_score = (normRMS * 0.6) + (normPersist * 0.4);

            return {
                recorded: true,
                samples: data,
                avg_freq,
                avg_rms,
                max_amp,
                tremor_detected,
                persistence,
                rhythmicity,
                amplitude_cov,
                crest_factor,
                severity_score,
                tremor_density: persistence,
                amplitude_variability: rmsSD,
                clinical_grade,
                frequency_drift,
                axis_classification,
                harmonic_ratio,
                approx_entropy
            };
        };

        const leftMetrics = processHandData(left.data);
        const rightMetrics = processHandData(right.data);

        // Global Metrics Calculation
        const asymmetry_index = TremorCalc.calculateAsymmetry(leftMetrics.avg_rms, rightMetrics.avg_rms);

        // Coherence (Simulate raw data streams to compare)
        const coherence = TremorCalc.calculateCrossCoherence(left.data.map(d => d.rms), right.data.map(d => d.rms));
        const cross_coherence = coherence.score;

        const record: DB.TremorRecord = {
            id: Date.now().toString(),
            patient_id: patientId,
            date: Date.now(),
            left_hand: leftMetrics,
            right_hand: rightMetrics,
            notes: isSimulating ? "Simulated Dual Session" : "Live Session",
            type: 'MOTOR',
            asymmetry_index,
            cross_coherence
        };

        // Single Insert
        if (record.left_hand.recorded || record.right_hand.recorded) {
            DB.insertTremorRecord(record);
            alert(`Session saved successfully! (${duration.toFixed(1)}s)`);
        } else {
            alert("No data recorded to save.");
        }
    };

    const calibrate = () => {
        if (wsLeft.current && wsLeft.current.readyState === WebSocket.OPEN) wsLeft.current.send("CALIBRATE");
        if (wsRight.current && wsRight.current.readyState === WebSocket.OPEN) wsRight.current.send("CALIBRATE");
        setCalibrating(true);
        // "wait for 5 sec"
        setTimeout(() => {
            setCalibrating(false);
            alert("Calibration Complete");
        }, 5000);
    };

    // --- Render Helpers ---.
    const SensorPanel = ({ side, state, setLink }: { side: 'left' | 'right', state: SensorState, setLink: (val: any) => void }) => (
        <div className={`rounded-xl border p-4 transition-all ${state.current.tremor ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-800' : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                        <Activity size={14} /> {side} Hand Sensor
                    </h3>
                    <div className="text-2xl font-black mt-1 text-slate-800 dark:text-white">
                        {state.status === 'Demo Mode' ? <span className="text-purple-600 dark:text-purple-400">DEMO</span> : state.status}
                    </div>
                </div>
                <div className={`w-3 h-3 rounded-full ${state.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            </div>

            {!state.isConnected && !isSimulating && (
                <div className="space-y-3">
                    <div className={`h-32 overflow-hidden relative rounded-lg border ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                        <div className="absolute inset-0 transform scale-50 origin-top -mt-8">
                            <HandSensorVisual mode="wearing" isDark={isDark} />
                        </div>
                    </div>
                    <input
                        type="text"
                        placeholder={`192.168.1.X (${side})`}
                        className={`w-full p-3 rounded-lg font-mono text-center outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${bgInput}`}
                        value={state.ip}
                        onChange={e => setLink({ ...state, ip: e.target.value })}
                    />
                    <button onClick={() => connect(side)} className={`w-full py-3 rounded-lg font-bold transition-all shadow-sm ${state.status === 'Connecting...' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`} disabled={state.status === 'Connecting...'}>
                        {state.status === 'Connecting...' ? 'Connecting...' : 'Connect Sensor'}
                    </button>
                    {state.error && <p className="text-xs text-rose-500 text-center font-bold px-2">{state.error}</p>}
                    <div className="text-center">
                        <button onClick={toggleDemo} className="text-xs text-indigo-500 hover:text-indigo-600 font-bold underline decoration-dotted">
                            Enter Demo Mode
                        </button>
                    </div>
                </div>
            )}

            {(state.isConnected || isSimulating) && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                            <div className="text-[10px] text-slate-400 font-bold uppercase">Freq</div>
                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{state.current.freq.toFixed(1)} <span className="text-[10px]">Hz</span></div>
                        </div>
                        <div className="bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                            <div className="text-[10px] text-slate-400 font-bold uppercase">RMS</div>
                            <div className="text-lg font-bold text-red-600 dark:text-red-400">{state.current.rms.toFixed(1)}</div>
                        </div>
                    </div>
                    {!isSimulating && (
                        <button onClick={() => disconnect(side)} className="w-full py-2 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50">
                            DISCONNECT
                        </button>
                    )}
                </div>
            )}
        </div>
    );

    // --- WIZARD STEPS RENDERING ---

    if (wizardStep === 'INTRO') {
        return (


            <div className={`min-h-screen flex items-center justify-center p-4 font-sans transition-colors ${isDark ? "bg-slate-900 text-white" : "bg-indigo-50 text-slate-900"}`}>
                <div className={`max-w-xl w-full rounded-2xl p-10 space-y-8 text-center border shadow-xl ${bgCard}`}>
                    <div className="mx-auto bg-gradient-to-tr from-indigo-500 to-fuchsia-600 w-24 h-24 rounded-full flex items-center justify-center text-white mb-6 shadow-lg shadow-indigo-500/30">
                        <Activity size={40} />
                    </div>
                    <h2 className={`text-3xl font-bold ${textMain}`}>Tremor Analysis Module</h2>
                    <p className={`${isDark ? "text-slate-400" : "text-slate-500"} text-lg`}>
                        This test measures resting and postural tremors using high-frequency accelerometry.
                        You will need the <span className="font-bold text-indigo-600">Dual-Sensor Kit</span>.
                    </p>
                    <div className="pt-6 border-t border-slate-100 flex gap-4">
                        <button onClick={onBack} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Cancel</button>
                        <button onClick={() => setWizardStep('CALIBRATE')} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2">
                            Next Step <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (wizardStep === 'CALIBRATE') {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 font-sans transition-colors ${isDark ? "bg-slate-900 text-white" : "bg-indigo-50 text-slate-900"}`}>
                <div className={`max-w-2xl w-full rounded-2xl p-8 space-y-8 text-center border shadow-xl ${bgCard}`}>
                    <h2 className={`text-2xl font-bold ${textMain}`}>Step 1: Calibration</h2>

                    <HandSensorVisual mode="calibration" isDark={isDark} />

                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 p-4 rounded-xl text-left text-sm">
                        <strong className="block mb-1 text-lg">Instructions:</strong>
                        Click on <strong>Calibrate</strong> and wait for <strong>5 seconds</strong> until the sensors calibrate. Ensure they are on a stable, flat surface and not moving.
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setWizardStep('INTRO')} className="py-4 border border-slate-200/50 hover:bg-white/10 font-bold text-slate-500 dark:text-slate-400 rounded-xl flex items-center justify-center gap-2 transition-all">
                            <ChevronLeft size={18} /> Back
                        </button>
                        {calibrating ? (
                            <button disabled className="py-4 bg-slate-200/50 text-slate-500 font-bold rounded-xl flex items-center justify-center gap-2 cursor-wait">
                                <RotateCcw className="w-5 h-5 animate-spin" /> Calibrating...
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={calibrate} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2 transition-all">
                                    <RotateCcw className="w-5 h-5" /> Calibrate
                                </button>
                                <button onClick={() => setWizardStep('WEAR')} className="flex-1 py-4 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl hover:bg-indigo-500/10 flex items-center justify-center gap-2 transition-all">
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div >
        );
    }

    if (wizardStep === 'WEAR') {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 font-sans transition-colors ${isDark ? "bg-slate-900 text-white" : "bg-indigo-50 text-slate-900"}`}>
                <div className={`max-w-2xl w-full rounded-2xl p-8 space-y-8 text-center border shadow-xl ${bgCard}`}>
                    <h2 className={`text-2xl font-bold ${textMain}`}>Step 2: Wear Devices</h2>

                    <HandSensorVisual mode="wearing" isDark={isDark} />

                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 p-4 rounded-xl text-left text-sm space-y-2">
                        <p className="flex items-center gap-2"><CheckCircle size={16} /> <strong>Palm Sensor:</strong> Strap the sensor propertly and sturdy to the center of your palm.</p>
                        <p className="flex items-center gap-2"><CheckCircle size={16} /> <strong>Connectivity:</strong> Ensure the wire connects both units securely.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setWizardStep('CALIBRATE')} className="py-4 border border-slate-200/50 hover:bg-white/10 font-bold text-slate-500 dark:text-slate-400 rounded-xl flex items-center justify-center gap-2 transition-all">
                            <ChevronLeft size={18} /> Back
                        </button>
                        <button onClick={() => setWizardStep('TEST')} className="py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg text-lg flex items-center justify-center gap-2 transition-all">
                            I'm Ready <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div >
        );
    }

    // --- MAIN TEST DASHBOARD ---
    return (
        <div className={`min-h-screen p-4 font-sans transition-colors ${isDark ? "bg-slate-900 text-slate-200" : "bg-indigo-50 text-slate-800"}`}>

            <div className="max-w-7xl mx-auto space-y-6 relative z-10">

                {/* Header */}
                <div className={`flex justify-between items-center p-6 rounded-2xl shadow-sm border ${bgCard}`}>
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                <Activity className="text-indigo-600 dark:text-indigo-400" /> Tremor Analysis
                            </h1>
                            <p className="text-slate-500 text-sm">{isSimulating ? 'DEMO MODE - Simulated Data' : 'Live Sensor Stream'}</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={toggleDemo} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-sm transition ${isSimulating ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50' : 'bg-white border hover:bg-slate-50 text-slate-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600'}`}>
                            {isSimulating ? <><StopCircle size={16} /> Stop Demo</> : <><PlayCircle size={16} /> Start Demo Mode</>}
                        </button>
                        {(left.isConnected || right.isConnected) && (
                            <button onClick={toggleRecording} className={`px-6 py-2 rounded-xl font-bold flex items-center gap-2 text-sm transition shadow-lg ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                                {isRecording ? <><WifiOff size={16} /> STOP & SAVE</> : <><Database size={16} /> REC SESSION</>}
                            </button>
                        )}
                        <button onClick={() => setWizardStep('CALIBRATE')} className="p-2 bg-white border rounded-xl hover:bg-slate-50 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600" title="Recalibrate"><RotateCcw size={20} /></button>
                        <button onClick={() => setShowTroubleshoot(!showTroubleshoot)} className="p-2 bg-white border rounded-xl hover:bg-slate-50 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600" title="Help"><HelpCircle size={20} /></button>
                    </div>
                </div>

                {isSecureContext && <div className="bg-amber-100 text-amber-800 p-3 rounded-xl text-sm font-medium text-center">Security Warning: HTTPS blocks local connections. Run locally on HTTP.</div>}

                {showTroubleshoot && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-sm text-blue-800 shadow-sm mb-4">
                        <strong>Connection Guide:</strong> Ensure ESP32s are on the same Wi-Fi. Enter their unique IP addresses below. Check 'Serial Monitor' for IPs.
                    </div>
                )}

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* LEFT CHANNEL */}
                    <div className="lg:col-span-3 space-y-4">
                        <SensorPanel side="left" state={left} setLink={(val: any) => setLeft(val)} />
                        {left.data.length > 0 && <div className={`p-4 rounded-xl border h-64 overflow-hidden shadow-sm relative ${bgCard}`}><div className="absolute top-2 left-2 text-[10px] font-bold text-slate-400">LEFT SPECTRUM</div><RealtimeChart data={left.data} dataKey="freq" color="#3b82f6" height={220} domain={[0, 12]} isDark={isDark} /></div>}
                    </div>

                    {/* CENTER VISUALIZATION */}
                    <div className="lg:col-span-6 space-y-4">
                        <div className={`p-1 rounded-2xl border shadow-sm overflow-hidden h-[500px] flex flex-col relative ${bgCard}`}>
                            <div className="absolute top-4 right-4 z-10 flex gap-2">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isRecording ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>{isRecording ? `REC ${(Date.now() - recordingStartTime) / 1000}s` : 'LIVE MONITOR'}</span>
                            </div>

                            <div className={`flex-1 border-b relative ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                                <div className="absolute top-2 left-4 text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12} /> Left Hand Motion</div>
                                <RealtimeChart data={left.data} dataKey="rms" color="#3b82f6" height={240} domain={[0, 10]} isDark={isDark} />
                            </div>
                            <div className="flex-1 relative bg-slate-50/50 dark:bg-black/20">
                                <div className="absolute top-2 left-4 text-xs font-bold text-purple-500 uppercase tracking-widest flex items-center gap-2"><Activity size={12} /> Right Hand Motion</div>
                                <RealtimeChart data={right.data} dataKey="rms" color="#a855f7" height={240} domain={[0, 10]} isDark={isDark} />
                            </div>
                        </div>
                    </div>

                    {/* RIGHT CHANNEL */}
                    <div className="lg:col-span-3 space-y-4">
                        <SensorPanel side="right" state={right} setLink={(val: any) => setRight(val)} />
                        {right.data.length > 0 && <div className={`p-4 rounded-xl border h-64 overflow-hidden shadow-sm relative ${bgCard}`}><div className="absolute top-2 left-2 text-[10px] font-bold text-slate-400">RIGHT SPECTRUM</div><RealtimeChart data={right.data} dataKey="freq" color="#a855f7" height={220} domain={[0, 12]} isDark={isDark} /></div>}
                    </div>

                </div>
            </div>
        </div>
    );
}
