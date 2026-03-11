import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Play, Brain, Activity, RotateCcw, CheckCircle,
    MousePointer, Clock, FileText, ChevronRight,
    AlertCircle, ClipboardList, Grid, Zap, ShieldAlert,
    Thermometer, Info, UserPlus, Users, User, History, Save, X, Database, Loader,
    TrendingUp, TrendingDown, Minus, Calendar, BarChart3, Lightbulb, AlertTriangle,
    Network, Sparkles, RefreshCw, XCircle
} from 'lucide-react';

/**
 * COGNITIVE ASSESSMENT PLATFORM v7.3
 * ------------------------------------------------------------
 * THEME: "Dark Purple" Split-Screen UI
 * ENGINE: AlaSQL (Local SQL) + NeuroAdaptive CAT Algorithm
 * FEATURES: 
 * - Adaptive Question Generation
 * - Robust Scoring: Handles missing/invalid tests gracefully
 * - Partial Scoring: Calculates GCS even if one section is skipped
 * - Specific Error Detection: Flags specific invalid tests
 * ------------------------------------------------------------
 */

// --- Configuration ---
const CONFIG = {
    PVT_DURATION_MS: 30000,
    PVT_LAPSE_THRESHOLD: 500,
    MEM_GRID_SIZE: 9,
    MEM_START_LEVEL: 3,
    MEM_SHOW_TIME: 800,
    MEM_INTER_STIM_TIME: 400,
    QA_QUESTIONS_PER_SESSION: 10,
    MIN_PVT_RESPONSES: 3,
};

// --- SQL Database Helper ---
const loadSQL = () => {
    return new Promise((resolve, reject) => {
        if ((window as any).alasql) {
            resolve((window as any).alasql);
            return;
        }
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/alasql@1.7.3/dist/alasql.min.js";
        script.onload = () => resolve((window as any).alasql);
        script.onerror = () => reject(new Error("Failed to load SQL engine"));
        document.head.appendChild(script);
    });
};

// --- Types ---
type GameState = 'IDLE' | 'WAITING' | 'STIMULUS' | 'FINISHED';
type MemoryState = 'IDLE' | 'SHOWING' | 'USER_TURN' | 'SUCCESS' | 'FAILURE' | 'COMPLETE';
type Screen = 'HOME' | 'PATIENT_INTAKE' | 'PATIENT_SELECT' | 'PATIENT_HISTORY' | 'DISCLAIMER' | 'GAME_INTRO' | 'GAME' | 'MEMORY_INTRO' | 'MEMORY' | 'QA_INTRO' | 'QA_LOADING' | 'QA' | 'RESULTS';

interface Patient {
    id: string;
    name: string;
    age: number;
    gender: string;
    notes: string;
    created_at: number;
}

interface AssessmentRecord {
    id: string;
    patient_id: string;
    date: number;
    gcs: number;
    api: number;
    wmc: number;
    risk_level: string;
    rt_mean: number;
    rt_sd: number;
    fatigue: number;
    latency: number;
    lapses: number;
    insight_text: string;
}

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

interface QAQuestion {
    id: number;
    category: 'Safety' | 'Memory' | 'Executive' | 'Mood';
    text: string;
    options: string[];
    correctIndex: number;
    weight: number;
}

// --- QUESTION BANK ---
const QUESTION_BANK: QAQuestion[] = [
    // MEMORY
    { id: 101, category: 'Memory', text: "Frequency of repetitive questions/stories?", options: ["Rarely/Never", "Sometimes", "Frequently", "Constantly"], correctIndex: 0, weight: 1.2 },
    { id: 102, category: 'Memory', text: "Disorientation in familiar places?", options: ["Never", "Rarely", "Sometimes", "Often"], correctIndex: 0, weight: 1.5 },
    { id: 103, category: 'Memory', text: "Forgetting names of close family members?", options: ["Never", "Occasionally", "Frequently", "Always"], correctIndex: 0, weight: 1.8 },
    { id: 104, category: 'Memory', text: "Misplacing items in unusual places (e.g. keys in fridge)?", options: ["Never", "Rarely", "Sometimes", "Often"], correctIndex: 0, weight: 1.4 },
    { id: 105, category: 'Memory', text: "Difficulty recalling recent events (e.g. breakfast)?", options: ["No difficulty", "Mild", "Moderate", "Severe"], correctIndex: 0, weight: 1.5 },
    { id: 106, category: 'Memory', text: "Forgetting appointments or medications?", options: ["Never", "Rarely", "Sometimes", "Frequently"], correctIndex: 0, weight: 1.6 },

    // EXECUTIVE FUNCTION
    { id: 201, category: 'Executive', text: "Calculation: Bill is $15.50, you pay $20. Change?", options: ["$3.50", "$4.50", "$5.50", "$2.50"], correctIndex: 1, weight: 1.0 },
    { id: 202, category: 'Executive', text: "Ability to perform routine tasks (e.g. coffee)?", options: ["Fully Capable", "Hesitant", "Need Help", "Unable"], correctIndex: 0, weight: 1.2 },
    { id: 203, category: 'Executive', text: "Word finding difficulty (Aphasia)?", options: ["None", "Occasional", "Frequent", "Significant"], correctIndex: 0, weight: 1.3 },
    { id: 204, category: 'Executive', text: "Difficulty planning complex tasks (e.g. paying bills)?", options: ["None", "Mild", "Moderate", "Severe"], correctIndex: 0, weight: 1.4 },
    { id: 205, category: 'Executive', text: "Judgment in social situations?", options: ["Normal", "Questionable", "Poor", "Inappropriate"], correctIndex: 0, weight: 1.2 },
    { id: 206, category: 'Executive', text: "Problem Solving: If the sink is overflowing, what do you do?", options: ["Turn off water", "Call plumber", "Wait", "Panic"], correctIndex: 0, weight: 1.1 },
    { id: 207, category: 'Executive', text: "Sequence: What comes next? 2, 4, 6, 8...", options: ["9", "10", "11", "12"], correctIndex: 1, weight: 1.0 },

    // SAFETY
    { id: 301, category: 'Safety', text: "Safety incidents (stove on, unlocked doors)?", options: ["Never", "Rarely", "Occasionally", "Frequently"], correctIndex: 0, weight: 1.5 },
    { id: 302, category: 'Safety', text: "Reaction to smell of smoke?", options: ["Evacuate/Call 911", "Investigate", "Panic/Freeze", "Ignore"], correctIndex: 0, weight: 1.4 },
    { id: 303, category: 'Safety', text: "Wandering or getting lost outside?", options: ["Never", "Once", "Occasionally", "Frequently"], correctIndex: 0, weight: 1.8 },
    { id: 304, category: 'Safety', text: "Driving capability/accidents?", options: ["Safe/No Driving", "Minor Concerns", "Near misses", "Unsafe/Accidents"], correctIndex: 0, weight: 1.6 },
    { id: 305, category: 'Safety', text: "Handling of sharp objects/tools?", options: ["Safe", "Cautious", "Clumsy", "Dangerous"], correctIndex: 0, weight: 1.3 },
    { id: 306, category: 'Safety', text: "Compliance with critical medication?", options: ["Always", "Mostly", "Often forgets", "Refuses/Unable"], correctIndex: 0, weight: 1.7 },

    // MOOD
    { id: 401, category: 'Mood', text: "Recent mood changes (irritability, anxiety)?", options: ["None", "Mild", "Moderate", "Severe"], correctIndex: 0, weight: 0.8 },
    { id: 402, category: 'Mood', text: "Sleep quality pattern?", options: ["Normal", "Occasional waking", "Frequent confusion", "Reversed cycle"], correctIndex: 0, weight: 1.0 },
    { id: 403, category: 'Mood', text: "Withdrawal from social activities?", options: ["Active", "Slight", "Significant", "Isolation"], correctIndex: 0, weight: 1.1 },
    { id: 404, category: 'Mood', text: "Appetite or weight changes?", options: ["Stable", "Mild change", "Moderate", "Significant"], correctIndex: 0, weight: 0.9 },
    { id: 405, category: 'Mood', text: "Signs of suspicion or paranoia?", options: ["None", "Rare", "Frequent", "Delusional"], correctIndex: 0, weight: 1.3 },
    { id: 406, category: 'Mood', text: "Level of energy/motivation?", options: ["Normal", "Low", "Lethargic", "None"], correctIndex: 0, weight: 0.9 },
];

// --- Math Utils ---
const calcMean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const calcSD = (arr: number[], mean: number) => {
    if (arr.length <= 1) return 0;
    return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (arr.length - 1));
};

const generateClinicalID = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'PID-';
    for (let i = 0; i < 3; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    result += '-';
    for (let i = 0; i < 3; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
};

// --- Analysis Helpers ---
const analyzeTrend = (history: AssessmentRecord[]) => {
    if (history.length < 2) return { status: 'Baseline Established', color: 'text-slate-500', icon: Minus, bg: 'bg-slate-100' };
    const current = history[0].gcs;
    const previous = history[1].gcs;
    const diff = current - previous;
    if (diff > 5) return { status: 'Showing Improvement', color: 'text-emerald-600', icon: TrendingUp, bg: 'bg-emerald-50' };
    if (diff < -5) return { status: 'Decline Detected', color: 'text-rose-600', icon: TrendingDown, bg: 'bg-rose-50' };
    return { status: 'Cognitively Stable', color: 'text-blue-600', icon: Minus, bg: 'bg-blue-50' };
};

const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-500';
    return 'text-rose-500';
};

export default function AssessmentPlatform() {
    const [currentScreen, setCurrentScreen] = useState<Screen>('HOME');
    const [dbReady, setDbReady] = useState(false);

    // --- Data State ---
    const [patients, setPatients] = useState<Patient[]>([]);
    const [activePatient, setActivePatient] = useState<Patient | null>(null);
    const [patientHistory, setPatientHistory] = useState<AssessmentRecord[]>([]);

    // --- Test States ---
    const [gameState, setGameState] = useState<GameState>('IDLE');
    const [reactions, setReactions] = useState<ReactionData[]>([]);
    const [falseStarts, setFalseStarts] = useState(0);
    const [stimulusStartTime, setStimulusStartTime] = useState(0);
    const [gameTimeLeft, setGameTimeLeft] = useState(CONFIG.PVT_DURATION_MS);

    const [memoryState, setMemoryState] = useState<MemoryState>('IDLE');
    const [memoryLevel, setMemoryLevel] = useState(CONFIG.MEM_START_LEVEL);
    const [sequence, setSequence] = useState<number[]>([]);
    const [userSequence, setUserSequence] = useState<number[]>([]);
    const [showingIdx, setShowingIdx] = useState<number | null>(null);
    const [memoryRounds, setMemoryRounds] = useState<MemoryRoundData[]>([]);
    const [lastClickTime, setLastClickTime] = useState(0);

    // --- ADAPTIVE QA STATES ---
    const [activeQuestions, setActiveQuestions] = useState<QAQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [qaTimeElapsed, setQaTimeElapsed] = useState(0);

    const timerRef = useRef<number | null>(null);
    const stimulusTimerRef = useRef<number | null>(null);
    const gameLoopRef = useRef<number | null>(null);

    // ==========================
    // 1. SQL INITIALIZATION
    // ==========================
    useEffect(() => {
        const initDB = async () => {
            try {
                const alasql = await loadSQL();

                alasql('CREATE LOCALSTORAGE DATABASE IF NOT EXISTS neuro_local_v5');
                alasql('ATTACH LOCALSTORAGE DATABASE neuro_local_v5');
                alasql('USE neuro_local_v5');

                alasql(`
          CREATE TABLE IF NOT EXISTS patients (
            id STRING PRIMARY KEY, 
            name STRING, 
            age INT, 
            gender STRING, 
            notes STRING, 
            created_at NUMBER
          )
        `);

                alasql(`
          CREATE TABLE IF NOT EXISTS clinical_records (
            id STRING PRIMARY KEY, 
            patient_id STRING, 
            date NUMBER, 
            gcs NUMBER, 
            api NUMBER, 
            wmc NUMBER, 
            risk_level STRING,
            rt_mean NUMBER,
            rt_sd NUMBER,
            fatigue NUMBER,
            latency NUMBER,
            lapses INT,
            insight_text STRING
          )
        `);

                alasql(`
          CREATE TABLE IF NOT EXISTS question_logs (
            patient_id STRING,
            question_id INT,
            category STRING,
            score_normalized NUMBER, -- 0 to 1
            timestamp NUMBER
          )
        `);

                setDbReady(true);
                refreshPatients();
            } catch (err) {
                console.error("SQL Init Error:", err);
            }
        };
        initDB();
    }, []);

    // --- SQL Actions ---

    const refreshPatients = () => {
        if (!(window as any).alasql) return;
        const res = (window as any).alasql('SELECT * FROM patients ORDER BY created_at DESC');
        setPatients(res);
    };

    const refreshHistory = (patientId: string) => {
        if (!(window as any).alasql) return;
        const res = (window as any).alasql('SELECT * FROM clinical_records WHERE patient_id = ? ORDER BY date DESC', [patientId]);
        setPatientHistory(res);
    };

    const sqlInsertPatient = (p: Patient) => {
        (window as any).alasql('INSERT INTO patients VALUES (?,?,?,?,?,?)',
            [p.id, p.name, p.age, p.gender, p.notes, p.created_at]);
        refreshPatients();
    };

    const sqlInsertAssessment = (a: AssessmentRecord) => {
        (window as any).alasql('INSERT INTO clinical_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [a.id, a.patient_id, a.date, a.gcs, a.api, a.wmc, a.risk_level, a.rt_mean, a.rt_sd, a.fatigue, a.latency, a.lapses, a.insight_text]);
        refreshHistory(a.patient_id);
    };

    // ==========================
    // 2. NEURAL ADAPTIVE ENGINE
    // ==========================

    const generateAdaptiveQuestions = (patientId: string): QAQuestion[] => {
        const logs = (window as any).alasql('SELECT * FROM question_logs WHERE patient_id = ? ORDER BY timestamp DESC', [patientId]);
        const weights: Record<string, number> = { Safety: 1, Memory: 1, Executive: 1, Mood: 1 };
        const recentQIds = new Set<number>();
        const recentLogs = logs.slice(0, 50);

        recentLogs.forEach((log: any) => {
            recentQIds.add(log.question_id);
            if (log.score_normalized < 0.5) {
                weights[log.category] += 0.5;
            } else {
                weights[log.category] = Math.max(0.5, weights[log.category] - 0.1);
            }
        });

        const selected: QAQuestion[] = [];
        const available = QUESTION_BANK.filter(q => !recentQIds.has(q.id));
        const pool = available.length < CONFIG.QA_QUESTIONS_PER_SESSION ? QUESTION_BANK : available;
        const byCategory: Record<string, QAQuestion[]> = { Safety: [], Memory: [], Executive: [], Mood: [] };
        pool.forEach(q => byCategory[q.category]?.push(q));

        const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
        const categories = ['Safety', 'Memory', 'Executive', 'Mood'];

        categories.forEach(cat => {
            if (byCategory[cat].length > 0) {
                const randomIndex = Math.floor(Math.random() * byCategory[cat].length);
                selected.push(byCategory[cat].splice(randomIndex, 1)[0]);
            }
        });

        while (selected.length < CONFIG.QA_QUESTIONS_PER_SESSION) {
            let r = Math.random() * totalWeight;
            let selectedCat = categories[categories.length - 1];
            for (const cat of categories) {
                r -= weights[cat];
                if (r <= 0) {
                    selectedCat = cat;
                    break;
                }
            }
            if (byCategory[selectedCat].length > 0) {
                const idx = Math.floor(Math.random() * byCategory[selectedCat].length);
                selected.push(byCategory[selectedCat].splice(idx, 1)[0]);
            } else {
                const remainingCats = categories.filter(c => byCategory[c].length > 0);
                if (remainingCats.length === 0) break;
                const backupCat = remainingCats[Math.floor(Math.random() * remainingCats.length)];
                const idx = Math.floor(Math.random() * byCategory[backupCat].length);
                selected.push(byCategory[backupCat].splice(idx, 1)[0]);
            }
        }
        return selected;
    };

    // ==========================
    // 3. LOGIC & SCORING (ROBUST)
    // ==========================

    const runAnalysis = () => {
        let insights: string[] = [];
        let alerts: string[] = []; // Specific warnings about valid/invalid tests

        // --- 1. PVT ANALYSIS ---
        const validReactions = reactions.filter(r => !r.isFalseStart);
        let pvtValid = true;
        let meanRT = 0, sdRT = 0, lapses = 0, fatigueIndex = 0;

        // Check PVT Validity
        if (validReactions.length < CONFIG.MIN_PVT_RESPONSES) {
            pvtValid = false;
            alerts.push("ATTENTION TEST INVALID (Insufficient Responses)");
            insights.push("Reflexes task data discarded due to lack of participation.");
        } else {
            const rtValues = validReactions.map(r => r.reactionTime);
            meanRT = calcMean(rtValues);
            sdRT = calcSD(rtValues, meanRT);
            lapses = reactions.filter(r => r.isLapse).length;
            const midpoint = Math.floor(validReactions.length / 2);
            const firstHalf = validReactions.slice(0, midpoint).map(r => r.reactionTime);
            const secondHalf = validReactions.slice(midpoint).map(r => r.reactionTime);
            fatigueIndex = secondHalf.length > 0 ? calcMean(secondHalf) - calcMean(firstHalf) : 0;
        }

        // --- 2. MEMORY ANALYSIS ---
        let memValid = memoryRounds.length > 0;
        let maxSpan = 0, avgRecallLatency = 0;
        if (!memValid) {
            alerts.push("MEMORY TEST SKIPPED");
            insights.push("Memory span data unavailable.");
        } else {
            maxSpan = memoryRounds.filter(r => r.success).reduce((max, r) => Math.max(max, r.sequenceLength), 0);
            avgRecallLatency = calcMean(memoryRounds.map(r => r.avgClickLatency));
        }

        // --- 3. QA ANALYSIS ---
        // If no active questions, this part is 0
        let qaValid = activeQuestions.length > 0 && Object.keys(answers).length > 0;
        let functionalIndex = 0;
        const categoryScores: Record<string, number> = { Safety: 0, Memory: 0, Executive: 0, Mood: 0 };

        if (!qaValid) {
            alerts.push("FUNCTIONAL REVIEW INCOMPLETE");
        } else {
            let totalScore = 0;
            let maxPossibleScore = 0;
            activeQuestions.forEach(q => {
                const score = (q.options.length - 1 - (answers[q.id] || 0)) / (q.options.length - 1);
                const weightedScore = score * q.weight;
                totalScore += weightedScore;
                maxPossibleScore += q.weight;
                categoryScores[q.category] = (categoryScores[q.category] || 0) + weightedScore;
            });
            functionalIndex = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
        }

        // --- SCORING MODELS ---

        // API (Attention): Force 0 if invalid
        let api = 0;
        if (pvtValid) {
            const rtScore = Math.max(0, 100 - (meanRT / 8));
            const stabilityScore = Math.max(0, 100 - sdRT);
            const vigilanceScore = Math.max(0, 100 - (lapses * 10) - (falseStarts * 5));
            api = (rtScore * 0.4) + (stabilityScore * 0.3) + (vigilanceScore * 0.3);
        }

        // WMC (Memory): Force 0 if invalid
        let wmc = 0;
        if (memValid) {
            const spanScore = (maxSpan / 9) * 100;
            const speedScore = Math.max(0, 100 - (avgRecallLatency / 20));
            wmc = (spanScore * 0.7) + (speedScore * 0.3);
        }

        // GCS (Global): Weighted average of AVAILABLE scores
        // If a section is invalid, it contributes 0 to the score (Penalized Scoring)
        // This is "majorly affecting the score" as requested by user - a missed test drops the average significantly.
        const gcs = (api * 0.3) + (wmc * 0.3) + (functionalIndex * 0.4);

        // --- GENERATE INSIGHT TEXT ---
        if (pvtValid) {
            if (falseStarts > 2) insights.push("Impulsivity detected.");
            if (sdRT > 150) insights.push("High reaction variability.");
            if (fatigueIndex > 50) insights.push("Performance decrement over time.");
        }
        if (memValid && maxSpan < 4) insights.push("Working memory below average.");

        const insightText = insights.length > 0 ? insights.join(" ") : "Performance within parameters.";

        return {
            raw: { meanRT, sdRT, lapses, fatigueIndex, maxSpan, avgRecallLatency },
            qa: { functionalIndex, categoryScores },
            models: { api, wmc, gcs },
            status: { pvtValid, memValid, qaValid },
            text: insightText,
            alerts: alerts
        };
    };

    const results = runAnalysis();

    // Auto-Save Effect
    useEffect(() => {
        if (currentScreen === 'RESULTS' && activePatient && dbReady) {
            let riskLevel = "Low Risk";
            if (results.models.gcs < 70) riskLevel = "Moderate";
            if (results.models.gcs < 50) riskLevel = "High";

            const lastRecord = patientHistory[0];
            const isRecent = lastRecord && (Date.now() - lastRecord.date < 5000);

            // Save even if partially incomplete, so we have a record
            if (!isRecent) {
                const record: AssessmentRecord = {
                    id: Date.now().toString(),
                    patient_id: activePatient.id,
                    date: Date.now(),
                    gcs: results.models.gcs,
                    api: results.models.api,
                    wmc: results.models.wmc,
                    risk_level: riskLevel,
                    rt_mean: results.raw.meanRT,
                    rt_sd: results.raw.sdRT,
                    fatigue: results.raw.fatigueIndex,
                    latency: results.raw.avgRecallLatency,
                    lapses: results.raw.lapses,
                    insight_text: results.text
                };
                sqlInsertAssessment(record);
            }
        }
    }, [currentScreen]);

    // ==========================
    // 4. UI HANDLERS & COMPONENTS
    // ==========================

    const registerPatient = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newPatient: Patient = {
            id: generateClinicalID(),
            name: formData.get('name') as string,
            age: parseInt(formData.get('age') as string),
            gender: formData.get('gender') as string,
            notes: formData.get('notes') as string,
            created_at: Date.now()
        };

        sqlInsertPatient(newPatient);
        setActivePatient(newPatient);
        setPatientHistory([]);
        setCurrentScreen('DISCLAIMER');
    };

    const selectPatient = (patient: Patient) => {
        setActivePatient(patient);
        refreshHistory(patient.id);
        setCurrentScreen('HOME');
    };

    const abortAssessment = () => {
        if (gameLoopRef.current) clearInterval(gameLoopRef.current);
        if (stimulusTimerRef.current) clearTimeout(stimulusTimerRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState('IDLE');
        setMemoryState('IDLE');
        setReactions([]);
        setMemoryRounds([]);
        setAnswers({});
        setFalseStarts(0);
        setMemoryLevel(CONFIG.MEM_START_LEVEL);
        setActiveQuestions([]);
        setCurrentScreen('HOME');
    };

    const handleStartRequest = () => { activePatient ? setCurrentScreen('DISCLAIMER') : setCurrentScreen('PATIENT_INTAKE'); };

    // Game Logic
    const startPVT = () => { setReactions([]); setFalseStarts(0); setGameTimeLeft(CONFIG.PVT_DURATION_MS); setCurrentScreen('GAME'); setGameState('WAITING'); gameLoopRef.current = window.setInterval(() => { setGameTimeLeft(prev => { if (prev <= 100) { endPVT(); return 0; } return prev - 100; }); }, 100); scheduleStimulus(); };
    const scheduleStimulus = () => { const delay = Math.random() * (3000 - 1000) + 1000; stimulusTimerRef.current = window.setTimeout(() => { setGameState('STIMULUS'); setStimulusStartTime(performance.now()); }, delay); };
    const handlePVTClick = () => { if (gameState === 'WAITING') { setFalseStarts(prev => prev + 1); if (stimulusTimerRef.current) clearTimeout(stimulusTimerRef.current); scheduleStimulus(); } else if (gameState === 'STIMULUS') { const endTime = performance.now(); const reactionTime = endTime - stimulusStartTime; setReactions(prev => [...prev, { timestamp: Date.now(), reactionTime, isFalseStart: false, isLapse: reactionTime > CONFIG.PVT_LAPSE_THRESHOLD }]); setGameState('WAITING'); scheduleStimulus(); } };
    const endPVT = () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); if (stimulusTimerRef.current) clearTimeout(stimulusTimerRef.current); setGameState('FINISHED'); setTimeout(() => setCurrentScreen('MEMORY_INTRO'), 1500); };

    const startMemoryGame = () => { setMemoryLevel(CONFIG.MEM_START_LEVEL); setMemoryRounds([]); setCurrentScreen('MEMORY'); startMemoryRound(CONFIG.MEM_START_LEVEL); };
    const startMemoryRound = (level: number) => { setMemoryState('SHOWING'); setUserSequence([]); setShowingIdx(null); const newSeq = Array.from({ length: level }, () => Math.floor(Math.random() * CONFIG.MEM_GRID_SIZE)); setSequence(newSeq); let i = 0; const interval = setInterval(() => { setShowingIdx(newSeq[i]); setTimeout(() => setShowingIdx(null), CONFIG.MEM_SHOW_TIME - 200); i++; if (i >= newSeq.length) { clearInterval(interval); setTimeout(() => { setMemoryState('USER_TURN'); setLastClickTime(Date.now()); }, CONFIG.MEM_INTER_STIM_TIME); } }, CONFIG.MEM_SHOW_TIME); };
    const handleMemoryClick = (index: number) => { if (memoryState !== 'USER_TURN') return; const now = Date.now(); const latency = now - lastClickTime; setLastClickTime(now); const newUserSeq = [...userSequence, index]; setUserSequence(newUserSeq); const checkIdx = newUserSeq.length - 1; if (newUserSeq[checkIdx] !== sequence[checkIdx]) { setMemoryRounds(prev => [...prev, { level: memoryLevel, success: false, sequenceLength: sequence.length, avgClickLatency: latency }]); setMemoryState('FAILURE'); setTimeout(() => setCurrentScreen('QA_INTRO'), 1500); } else { if (newUserSeq.length === sequence.length) { setMemoryRounds(prev => [...prev, { level: memoryLevel, success: true, sequenceLength: sequence.length, avgClickLatency: latency }]); setMemoryState('SUCCESS'); const nextLevel = memoryLevel + 1; if (nextLevel > 7) { setTimeout(() => setCurrentScreen('QA_INTRO'), 1500); } else { setMemoryLevel(nextLevel); setTimeout(() => startMemoryRound(nextLevel), 1500); } } } };

    const startQA = () => {
        if (!activePatient) return;
        setCurrentScreen('QA_LOADING');
        setTimeout(() => {
            const questions = generateAdaptiveQuestions(activePatient.id);
            setActiveQuestions(questions);
            setCurrentScreen('QA');
            const start = Date.now();
            timerRef.current = window.setInterval(() => { setQaTimeElapsed(Date.now() - start); }, 1000);
        }, 1500);
    };

    const handleAnswer = (qId: number, optionIndex: number) => { setAnswers(prev => ({ ...prev, [qId]: optionIndex })); };

    const submitQA = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (activePatient) {
            activeQuestions.forEach(q => {
                const selectedIdx = answers[q.id];
                if (selectedIdx !== undefined) {
                    const score = (q.options.length - 1 - selectedIdx) / (q.options.length - 1);
                    (window as any).alasql('INSERT INTO question_logs VALUES (?,?,?,?,?)',
                        [activePatient.id, q.id, q.category, score, Date.now()]
                    );
                }
            });
        }
        setCurrentScreen('RESULTS');
    };

    const ExitButton = ({ dark = false }) => (
        <button 
      onClick= {(e) => {
        e.stopPropagation();
        abortAssessment();
    }
}
className = {`absolute top-6 right-6 p-2 rounded-full transition-all z-50 ${dark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
title = "Abort Assessment"
    >
    <X className="w-5 h-5" />
        </button>
  );

// ==========================
// 5. RENDERING
// ==========================

if (!dbReady) {
    return (
        <div className= "min-h-screen bg-slate-900 flex items-center justify-center text-white flex-col gap-4" >
        <Loader className="w-10 h-10 animate-spin text-indigo-500" />
            <p>Initializing Neuro Adaptive Engine...</p>
                </div>
    );
}

// --- HOME SCREEN ---
if (currentScreen === 'HOME') {
    return (
        <div className= "min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans" >
        <div className="max-w-5xl w-full grid md:grid-cols-2 bg-white rounded-[2rem] shadow-xl overflow-hidden border border-slate-200" >
            <div className="bg-slate-900 p-12 text-white flex flex-col justify-between relative overflow-hidden" >
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-900/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" > </div>
                    < div className = "relative z-10" >
                        <div className="flex items-center gap-3 mb-10 opacity-80" >
                            <Brain className="w-6 h-6 text-indigo-400" />
                                <span className="font-semibold tracking-widest text-xs uppercase" > NeuroMetric Systems </span>
                                    </div>
                                    < h1 className = "text-4xl md:text-5xl font-bold leading-tight mb-6 tracking-tight text-white" >
                                        Cognitive < br /> Performance < br /> <span className="text-indigo-400" > Evaluation </span>
                                            </h1>
                                            < p className = "text-slate-400 text-lg max-w-sm leading-relaxed font-light mb-4" >
                                                Adaptive tools for standardized assessment.
              </p>
                                                    </div>
                                                    < div className = "relative z-10 mt-16" >
                                                    {
                                                        activePatient?(
                <div className = "bg-white/5 backdrop-blur-md p-6 rounded-xl border border-white/10" >
                                                                <div className="flex justify-between items-start">
                                                    <div>
                                                    <div className= "text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" > <CheckCircle className="w-3 h-3" /> Active Session </div>
                                                        < div className = "text-2xl font-bold text-white" > { activePatient.name } </div>
                                                            < div className = "text-sm text-slate-400 mt-1" > { activePatient.age } Years • { activePatient.gender } </div>
                                                                </div>
                                                                < div className = "bg-white/10 p-2 rounded-lg" > <User className="text-white w-5 h-5" /> </div>
                                                                    </div>
                                                                    < button onClick = {() => setActivePatient(null)
} className = "mt-6 text-xs bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition text-slate-300 font-medium w-full text-left" > Switch Patient Profile </button>
    </div>
              ) : (
    <div className= "bg-indigo-900/20 border border-indigo-500/20 border-dashed p-6 rounded-xl" >
    <p className="text-indigo-200/60 text-sm mb-4" > No patient record loaded.</p>
        < button onClick = {() => setCurrentScreen('PATIENT_INTAKE')} className = "text-white font-semibold hover:text-indigo-300 transition text-sm flex items-center gap-2" > <UserPlus className="w-4 h-4" /> Initialize New Record </button>
            </div>
              )}
</div>
    < div className = "absolute bottom-6 left-12 flex items-center gap-2 text-[10px] font-medium text-slate-600 uppercase tracking-widest" >
        <Database className="w-3 h-3" /> Secure Local Storage
            </div>
            </div>
            < div className = "p-12 flex flex-col justify-center bg-white relative" >
                <div className="space-y-5 relative z-10" >
                    <button onClick={ handleStartRequest } className = "w-full bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 flex items-center justify-between px-8 group" >
                        <span>{ activePatient? 'Begin Assessment': 'New Patient Intake' } </span>
                        < ChevronRight className = "group-hover:translate-x-1 transition-transform opacity-70" />
                            </button>
                            < div className = "h-px bg-slate-100 my-6" > </div>
                                < div className = "grid gap-4" >
                                    <button onClick={ () => setCurrentScreen('PATIENT_SELECT') } className = "p-5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left flex items-center gap-4 group" >
                                        <div className="p-3 bg-slate-100 rounded-lg group-hover:bg-indigo-50 transition-colors" > <Users className="w-5 h-5 text-slate-500 group-hover:text-indigo-600" /> </div>
                                            < div > <div className="font-bold text-slate-800 text-sm" > Patient Directory < /div><div className="text-xs text-slate-400">Manage records</div > </div>
                                                </button>
                                                < button onClick = {() => setCurrentScreen('PATIENT_HISTORY')} disabled = {!activePatient} className = {`p-5 rounded-xl border transition-all text-left flex items-center gap-4 group ${activePatient ? 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50' : 'bg-slate-50 border-transparent opacity-50 cursor-not-allowed'}`}>
                                                    <div className={ `p-3 rounded-lg transition-colors ${activePatient ? 'bg-slate-100 group-hover:bg-indigo-50' : 'bg-slate-200'}` }> <History className={ `w-5 h-5 ${activePatient ? 'text-slate-500 group-hover:text-indigo-600' : 'text-slate-400'}` } /></div >
                                                        <div><div className="font-bold text-slate-800 text-sm" > Clinical History < /div><div className="text-xs text-slate-400">Longitudinal data</div > </div>
                                                            </button>
                                                            </div>
                                                            </div>
                                                            </div>
                                                            </div>
                                                            </div>
    );
  }

// --- STANDARD SCREENS ---
if (currentScreen === 'PATIENT_INTAKE') return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" > <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100" > <div className="bg-indigo-700 p-8 text-white" > <h2 className="text-2xl font-bold flex items-center gap-3" > <UserPlus className="text-indigo-200" /> New Registration < /h2></div > <form onSubmit={ registerPatient } className = "p-8 space-y-6" > <div className="space-y-4" > <div><label className="block text-sm font-bold text-slate-700 mb-2" > Full Name < /label><input required name="name" className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. John Doe"/ > </div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-slate-700 mb-2">Age</label > <input required name = "age" type = "number" className = "w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" /> </div><div><label className="block text-sm font-bold text-slate-700 mb-2">Gender</label > <select name="gender" className = "w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" > <option>Male < /option><option>Female</option > <option>Other < /option></select > </div></div > <div><label className="block text-sm font-bold text-slate-700 mb-2" > Notes < /label><textarea name="notes" className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none h-24"/ > </div></div > <div className="flex gap-4" > <button type="button" onClick = {()=> setCurrentScreen('HOME')} className = "flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-xl" > Cancel < /button><button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg">Create Profile</button > </div></form > </div></div >;
if (currentScreen === 'PATIENT_SELECT') return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" > <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[80vh] border border-slate-100" > <div className="bg-indigo-700 p-6 text-white flex justify-between items-center" > <h2 className="text-xl font-bold flex gap-3" > <Users/> Patient Database</h2 > <button onClick={ () => setCurrentScreen('HOME') } className = "hover:bg-indigo-600 p-2 rounded-lg transition" > <X/></button > </div><div className="p-4 overflow-y-auto flex-grow space-y-2">{patients.map(p=><div key={p.id} onClick={()=>selectPatient(p)} className="flex items-center justify-between p-4 hover:bg-indigo-50 rounded-xl cursor-pointer border border-transparent hover:border-indigo-100 transition"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">{p.name[0]}</div > <div><div className="font-bold text-slate-800" > { p.name } < /div><div className="text-xs text-slate-500">{p.id} • {p.age} y/o < /div></div > </div><ChevronRight className="text-slate-300"/ > </div>)}</div > </div></div >;
if (currentScreen === 'DISCLAIMER') return <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" > <div className="max-w-lg w-full bg-white rounded-3xl p-8 space-y-6 relative" > <ExitButton/><h2 className="text-2xl font-bold text-rose-600 flex gap-2"><ShieldAlert/ > Medical Disclaimer < /h2><p className="text-slate-600 leading-relaxed">This tool measures reaction latency and working memory span. It generates statistical insights for research purposes only. <strong>It does not provide a medical diagnosis.</strong > </p><button onClick={()=>setCurrentScreen('GAME_INTRO')} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">I Acknowledge & Continue</button > </div></div >;

// --- GAME UIs ---
if (currentScreen === 'GAME_INTRO') return <div className="min-h-screen bg-slate-900 flex items-center justify-center relative" > <ExitButton dark /> <div className="text-center text-white" > <h2 className="text-4xl font-bold mb-8" > Task 1: Reflexes < /h2><div className="space-y-2 mb-8 text-slate-300"><p>Tap screen immediately when it turns GREEN.</p > <p>Do NOT tap on RED.< /p></div > <button onClick={ startPVT } className = "bg-emerald-500 hover:bg-emerald-600 text-white py-5 px-12 rounded-2xl font-bold text-xl shadow-lg transition-all transform hover:-translate-y-1" > BEGIN TASK < /button></div > </div>;
if (currentScreen === 'GAME') return <div onMouseDown={ handlePVTClick } className = {`min-h-screen cursor-pointer flex flex-col items-center justify-center transition-colors duration-100 select-none ${gameState === 'WAITING' ? 'bg-rose-500' : gameState === 'STIMULUS' ? 'bg-emerald-500' : 'bg-slate-900'}`}> <ExitButton dark /> { gameState === 'FINISHED' ? (<div className= "text-white text-4xl font-bold animate-pulse" > Test Complete < /div>) : (<><div className="text-white/80 font - mono text - 4xl font - bold mb - 8">{gameState === 'WAITING' ? 'WAIT...' : gameState === 'STIMULUS' ? 'CLICK!' : ''}</div><div className="absolute bottom - 10 flex gap - 8 text - white / 60 font - mono text - lg"><div>{(gameTimeLeft/1000).toFixed(1)}s</div><div>Hits: {reactions.length}</div><div>Errors: {falseStarts}</div></div></>)}</div>;
if (currentScreen === 'MEMORY_INTRO') return <div className="min-h-screen bg-slate-900 flex items-center justify-center relative" > <ExitButton dark /> <div className="text-center text-white" > <h2 className="text-4xl font-bold mb-8" > Task 2: Memory < /h2><div className="space-y-2 mb-8 text-slate-300"><p>Watch the grid squares light up.</p > <p>Repeat the sequence exactly.< /p></div > <button onClick={ startMemoryGame } className = "bg-blue-500 hover:bg-blue-600 text-white py-5 px-12 rounded-2xl font-bold text-xl shadow-lg transition-all transform hover:-translate-y-1" > BEGIN TASK < /button></div > </div>;
if (currentScreen === 'MEMORY') return <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center p-4 relative" > <ExitButton dark /> <h2 className="text-white text-2xl font-bold mb-8" > { memoryState === 'SHOWING' ? 'Watch Sequence...' : memoryState === 'USER_TURN' ? 'Your Turn' : memoryState === 'SUCCESS' ? 'Correct!' : 'Incorrect'}</h2><div className="grid grid-cols-3 gap-4 mb-8">{Array.from({ length: 9 }).map((_, i) => (<div key={i} onMouseDown={() => handleMemoryClick(i)} className={`w-24 h-24 rounded-xl transition-all duration-200 border-4 ${showingIdx === i ? 'bg-blue-400 border-blue-200 shadow-[0_0_20px_rgba(96,165,250,0.5)] transform scale-105' : 'bg-slate-700 border-slate-600 hover:border-slate-500'} ${memoryState === 'USER_TURN' ? 'cursor-pointer active:bg-blue-500' : 'cursor-default'}`}/ >))}</div><div className="text-slate-400 font-mono text-lg">Level: {memoryLevel - 2}</div > </div>;
if (currentScreen === 'QA_INTRO') return <div className="min-h-screen bg-slate-50 flex items-center justify-center relative" > <ExitButton/><div className="max-w-md w-full text-center space-y-6"><Activity className="w-16 h-16 mx-auto text-purple-600"/ > <h2 className="text-3xl font-bold text-slate-800" > Response Based Test < /h2><p className="text-slate-600">Final section: Clinical questions regarding daily behavior.</p > <button onClick={ startQA } className = "w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl font-bold text-xl transition-all shadow-lg" > Start Questionnaire < /button></div > </div>;
if (currentScreen === 'QA_LOADING') return <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center relative" > <ExitButton/><div className="max-w-md w-full text-center space-y-8 p-8"><div className="relative w-24 h-24 mx-auto"><div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div > <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin" > </div><Brain className="absolute inset-0 m-auto text-purple-600 w-10 h-10" / > </div><div><h3 className="text-xl font-bold text-slate-800 mb-2">Analyzing History...</h3 > <p className="text-slate-500" > The Neural Engine is generating a dynamic question set based on previous performance patterns.< /p></div > <div className="flex justify-center gap-2" > <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style = {{ animationDelay: '0s' }}> </span><span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></span > <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style = {{ animationDelay: '0.2s' }}> </span></div > </div></div >;
if (currentScreen === 'QA') return <div className="min-h-screen bg-slate-50 flex flex-col relative" > <ExitButton/><div className="max-w-3xl mx-auto w-full p-6 space-y-6 mt-10 pb-20">{activeQuestions.map((q,idx)=><div key={q.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="flex justify-between items-start mb-4"><h3 className="font-bold text-lg text-slate-800 flex gap-3"><span className="bg-purple-100 text-purple-600 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">{idx+1}</span > { q.text } < /h3><span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider border border-slate-100 px-2 py-1 rounded-lg">{q.category}</span > </div><div className="grid gap-2 pl-11">{q.options.map((o,i)=><button key={i} onClick={()=>handleAnswer(q.id,i)} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${answers[q.id]===i?'bg-purple-50 border-purple-500 text-purple-900 font-medium':'bg-white border-slate-100 hover:border-slate-300 text-slate-600'}`}>{o}</button >)}</div></div >)}<button onClick={ submitQA } disabled = { Object.keys(answers).length !== activeQuestions.length } className = "w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xl" > Generate Clinical Report < /button></div > </div>;

// --- RESULTS SCREEN ---
if (currentScreen === 'RESULTS') {
    return (
        <div className= "min-h-screen bg-slate-50 p-6 font-sans text-slate-900 overflow-y-auto" >
        <div className="max-w-5xl mx-auto space-y-6" >

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100" >
                <div>
                <h1 className="text-2xl font-bold text-slate-800" > Assessment Report </h1>
                    < div className = "flex items-center gap-3 mt-2 text-sm text-slate-500 font-medium" >
                        <span className="flex items-center gap-1" > <User className="w-4 h-4" /> { activePatient?.name } </span>
                            < span className = "text-slate-300" >| </span>
                                < span className = "flex items-center gap-1" > <Clock className="w-4 h-4" /> { new Date().toLocaleDateString() } </span>
                                    </div>
                                    </div>
                                    < div className = "text-right" >
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1" > Global Cognitive Score </div>
                                            < div className = "flex items-baseline justify-end gap-2" >
                                                <span className={ `text-5xl font-black ${getScoreColor(results.models.gcs)}` }> { results.models.gcs.toFixed(0) } </span>
                                                    < span className = "text-lg text-slate-400 font-medium" > / 100</span >
                                                        </div>
                                                        </div>
                                                        </div>

    {/* DIAGNOSTICS SECTION */ }
    {
        results.alerts.length > 0 && (
            <div className="space-y-2" >
            {
                results.alerts.map((alert, idx) => (
                    <div key= { idx } className = "bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center gap-3 text-rose-800 text-sm font-bold" >
                    <XCircle className="w-4 h-4" />
                    { alert }
                </div>
                ))
            }
                </div>
          )
    }

    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-800" >
        <Database className="w-5 h-5" />
            <span className="font-bold" > Assessment record saved to clinical database.</span>
                </div>

                < div className = "grid md:grid-cols-2 lg:grid-cols-3 gap-6" >
                    <ResultCard 
               title="Attention & Speed"
    icon = {< Zap className = "text-amber-500" />}
color = "amber"
score = { results.models.api }
inactive = {!results.status.pvtValid} // Visual fade if invalid
            >
    <MetricRow label="Reaction Latency" value = { results.status.pvtValid ? `${results.raw.meanRT.toFixed(0)} ms` : 'N/A' } />
        <MetricRow label="Consistency (SD)" value = { results.status.pvtValid ? `±${results.raw.sdRT.toFixed(0)} ms` : 'N/A' } warning = { results.raw.sdRT > 150 } />
            <MetricRow label="Mental Fatigue" value = { results.status.pvtValid ? `${results.raw.fatigueIndex > 0 ? '+' : ''}${results.raw.fatigueIndex.toFixed(0)}` : 'N/A' } warning = { results.raw.fatigueIndex > 50 } />
                </ResultCard>

                < ResultCard
title = "Memory & Processing"
icon = {< Brain className = "text-blue-500" />}
color = "blue"
score = { results.models.wmc }
inactive = {!results.status.memValid}
            >
    <MetricRow label="Working Span" value = { results.status.memValid ? results.raw.maxSpan : 'N/A' } />
        <MetricRow label="Retrieval Speed" value = { results.status.memValid ? `${results.raw.avgRecallLatency.toFixed(0)} ms` : 'N/A' } />
            </ResultCard>

            < ResultCard
title = "Functional Health"
icon = {< ClipboardList className = "text-emerald-500" />}
color = "emerald"
score = { results.qa.functionalIndex }
inactive = {!results.status.qaValid}
            >
    {
        Object.entries(results.qa.categoryScores).map(([cat, score]) => (
            <MetricRow key= { cat } label = { cat } value = {(score as number).toFixed(1)} />
               ))}
</ResultCard>
    </div>

    < button
onClick = {() => {
    setGameState('IDLE');
    setReactions([]);
    setAnswers({});
    setMemoryLevel(CONFIG.MEM_START_LEVEL);
    setMemoryRounds([]);
    setActiveQuestions([]);
    setCurrentScreen('HOME');
}}
className = "mx-auto block bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition"
    >
    Return to Dashboard
        </button>
        </div>
        </div>
    );
  }

// --- PATIENT HISTORY SCREEN ---
if (currentScreen === 'PATIENT_HISTORY') {
    const trend = analyzeTrend(patientHistory);
    const listData = [...patientHistory];
    const chartData = [...patientHistory].reverse();
    return (
        <div className= "min-h-screen bg-slate-50 flex flex-col p-4 font-sans" >
        <div className="max-w-6xl w-full mx-auto flex-grow flex flex-col gap-6" >
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center" >
                <div className="flex items-center gap-4" > <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center" > <History className="w-6 h-6" /> </div><div><h2 className="text-xl font-bold text-slate-800">Longitudinal Analysis</h2 > <p className="text-xs text-slate-500 font-medium" > { activePatient?.name } • { patientHistory.length } Records < /p></div > </div>
                    < button onClick = {() => setCurrentScreen('HOME')
} className = "bg-slate-100 hover:bg-slate-200 p-2 rounded-full text-slate-600 transition" > <X className="w-5 h-5" /> </button>
    </div>
    < div className = "grid md:grid-cols-12 gap-6 flex-grow overflow-hidden" >
        <div className="md:col-span-5 space-y-6 flex flex-col" >
            <div className={ `${trend.bg} p-6 rounded-3xl border border-transparent` }> <div className="flex items-center gap-4" > <div className={ `p-3 rounded-full bg-white shadow-sm ${trend.color}` }> <trend.icon className="w-6 h-6" /> </div><div><div className="text-xs font-bold uppercase opacity-60 tracking-wider text-slate-800">Current Trend</div > <div className={ `text-2xl font-black ${trend.color}` }> { trend.status } < /div></div > </div></div >
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex-grow min-h-[300px] flex flex-col relative" > <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2" > <BarChart3 className="w-5 h-5 text-indigo-500" /> GCS Trajectory < /h3>{chartData.length > 1 ? (<div className="flex-grow w-full relative"><svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">{[0, 25, 50, 75, 100].map(y => (<line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#f1f5f9" strokeDasharray="4" / >))}<polyline fill="none" stroke = "#6366f1" strokeWidth = "4" strokeLinecap = "round" strokeLinejoin = "round" points = { chartData.map((d, i) => { const x = (i / (chartData.length - 1)) * 100; const y = 100 - d.gcs; return `${x}%,${y}%`; }).join(' ') } className = "drop-shadow-lg" /> { chartData.map((d, i) => (<g key= { d.id } > <circle cx={`${(i / (chartData.length - 1)) * 100}%`} cy = {`${100 - d.gcs}%`} r = "6" className = "fill-white stroke-indigo-600 stroke-[3px]" /> <text x={ `${(i / (chartData.length - 1)) * 100}%` } y = {`${100 - d.gcs - 5}%`} textAnchor = "middle" className = "text-[10px] fill-slate-500 font-bold" > { d.gcs.toFixed(0) } < /text></g >))}</svg></div >) : (<div className= "flex-grow flex flex-col items-center justify-center text-slate-400" > <BarChart3 className="w-12 h-12 mb-2 opacity-20" /> <p className="text-sm" > Insufficient data for trend analysis.< /p></div >)}</div>
                    </div>
                    < div className = "md:col-span-7 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden" >
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30" > <h3 className="font-bold text-slate-800" > History Log < /h3></div >
                            <div className="overflow-y-auto p-4 space-y-4 flex-grow" > { listData.length === 0 ? (<p className= "text-center text-slate-400 py-10" > No assessments recorded.< /p>) : (listData.map((record) => (<div key={record.id} className="p-5 rounded-2xl bg-white border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group"><div className="flex justify-between items-start mb-3"><div><div className="flex items-center gap-2 text-slate-500 mb-1"><Calendar className="w-3 h-3" / > <span className="text-xs font-bold uppercase tracking-wider"> { new Date(record.date).toLocaleDateString() } < /span><span className="text-xs opacity-50">{new Date(record.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span > </div>{record.insight_text && <p className="text-xs text-slate-600 italic mt-1 max-w-md line-clamp-1">"{record.insight_text}"</p >} < /div><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${record.risk_level?.includes('Low') ? 'bg-emerald-100 text-emerald-700' : record.risk_level?.includes('Moderate') ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{record.risk_level || 'N/A'}</span></div><div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-50"><div><div className="text-[10px] text-slate-400 font-bold uppercase">GCS</div><div className={`text-xl font-black ${getScoreColor(record.gcs)}`}>{record.gcs?.toFixed(0)}</div></div><div><div className="text-[10px] text-slate-400 font-bold uppercase">Response</div><div className="text-sm font-semibold text-slate-600">{record.rt_mean ? record.rt_mean.toFixed(0) : ' - '}ms</div></div><div><div className="text-[10px] text-slate-400 font-bold uppercase">Stability</div><div className="text-sm font-semibold text-slate-600">±{record.rt_sd ? record.rt_sd.toFixed(0) : ' - '}</div></div><div><div className="text-[10px] text-slate-400 font-bold uppercase">Fatigue</div><div className={`text-sm font-semibold ${record.fatigue > 30 ? 'text - amber - 600' : 'text - slate - 600'}`}>{record.fatigue ? record.fatigue.toFixed(0) : ' - '}</div></div></div></div>)))}</div>
                                </div>
                                </div>
                                </div>
                                </div>
    );
  }

return null;
}

// --- SUB COMPONENTS ---

const ResultCard = ({ title, icon, color, score, children, inactive }: any) => (
    <div className= {`bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col h-full transition-opacity ${inactive ? 'opacity-50 grayscale' : 'opacity-100'}`}>
        <div className="flex justify-between items-center mb-6" >
            <div className="flex items-center gap-3 font-bold text-slate-700 text-lg" > { icon } { title } </div>
                < div className = {`px-3 py-1 rounded-lg font-bold bg-${color}-50 text-${color}-600`}> { score.toFixed(0) } </div>
                    </div>
                    < div className = "space-y-4 flex-grow" >
                        { children }
                        </div>
                        < div className = "mt-6 pt-4 border-t border-slate-50" >
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden" >
                                <div className={ `h-full bg-${color}-500 transition-all duration-1000` } style = {{ width: `${score}%` }} />
                                    </div>
                                    </div>
                                    </div>
);

const MetricRow = ({ label, value, warning }: any) => (
    <div className= "flex justify-between items-center text-sm" >
    <span className="text-slate-500 font-medium" > { label } </span>
        < span className = {`font-mono font-bold ${warning ? 'text-rose-500' : 'text-slate-700'}`}>
            { value } { warning && <AlertCircle className="w-3 h-3 inline ml-1" />}
</span>
    </div>
);