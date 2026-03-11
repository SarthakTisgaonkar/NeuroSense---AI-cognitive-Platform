import alasql from 'alasql';

// --- Types ---
export interface Patient {
    id: string;
    name: string;
    age: number;
    gender: string;
    notes: string;
    created_at: number;
}

export interface AssessmentRecord {
    id: string;
    type?: 'COGNITIVE';
    patient_id: string;
    date: number;
    gcs: number;
    api: number;
    wmc: number;
    risk_level: string;
    rt_mean: number;
    rt_sd: number;
    cov: number;
    fatigue: number;
    latency: number;
    throughput: number;
    lapses: number;
    insight_text: string;
}

export interface QAQuestion {
    id: number;
    category: 'Safety' | 'Memory' | 'Executive' | 'Mood';
    text: string;
    options: string[];
    correctIndex: number;
    weight: number;
}

export interface TremorDataSample {
    id: number;
    timestamp: string;
    freq: number;
    rms: number;
    max: number;
    tremor: boolean;
}

export interface HandMetrics {
    recorded: boolean;
    samples: TremorDataSample[];
    avg_freq: number;
    avg_rms: number;
    max_amp: number;
    tremor_detected: boolean;
    // Advanced Markers (Level 1 & 2)
    persistence: number;      // % time tremor active
    rhythmicity: number;      // 0-1 (Frequency Stability)
    amplitude_cov: number;    // % (RMS Stability)
    crest_factor: number;     // Peak/RMS ratio (Spikiness)
    severity_score: number;   // 0-10 Composite
    tremor_density: number;   // Percentage 0-100
    amplitude_variability: number; // Standard Deviation of RMS

    // NEW METRICS
    clinical_grade: number;   // 0-4 (MDS-UPDRS Proxy)
    frequency_drift: number;  // Slope of frequency (Fatigue)
    axis_classification: string; // "Flexion-Extension" vs "Pronation-Supination"
    harmonic_ratio: number;   // Spectral Purity
    approx_entropy: number;   // Complexity (ApEn)
}

export interface TremorRecord {
    id: string;
    type?: 'MOTOR';
    patient_id: string;
    date: number;
    left_hand: HandMetrics;
    right_hand: HandMetrics;
    notes: string;

    // Global Metrics
    asymmetry_index: number;  // % Difference L vs R
    cross_coherence: number;  // % Synchronization L vs R
}

export interface SpiralRecord {
    id: string;
    type?: 'SPIRAL';
    patient_id: string;
    date: number;
    score: number; // Probability of PD 0-100
    features_extracted: number; // e.g. 2048
    imageUrl?: string; // Base64 of drawing
    heatmapUrl?: string; // Base64 of Grad-CAM overlay
    riskLabel?: 'Low Risk' | 'Medium Risk' | 'High Risk';
    confidenceLevel?: 'High' | 'Low - Retest Suggested';
}

export type AnyRecord = (AssessmentRecord & { type: 'COGNITIVE' }) | (TremorRecord & { type: 'MOTOR' }) | (SpiralRecord & { type: 'SPIRAL' });

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
    { id: 302, category: 'Safety', text: "Reaction to smell of smoke?", options: ["Evacuate/Call 100/102", "Investigate", "Panic/Freeze", "Ignore"], correctIndex: 0, weight: 1.4 },
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

export const CONFIG = {
    PVT_DURATION_MS: 30000,
    PVT_LAPSE_THRESHOLD: 500,
    MEM_GRID_SIZE: 9,
    MEM_START_LEVEL: 3,
    MEM_SHOW_TIME: 800,
    MEM_INTER_STIM_TIME: 400,
    QA_QUESTIONS_PER_SESSION: 10,
    MIN_PVT_RESPONSES: 3,
};

// --- SECURITY UTILS ---
const WRAPPED_KEY_NAME = 'sys_data_01'; // Was: neuro_wrapped_key
const PIN_HASH_KEY = 'sys_data_02'; // Was: neuro_pin_hash
const DEFAULT_PIN = '1234';

let cachedMasterKey: CryptoKey | null = null;

// Helper: Convert hex string to Uint8Array
const hexToBytes = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
// Helper: Convert Uint8Array to hex string
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return bytesToHex(new Uint8Array(hashBuffer));
}

// 1. Derive Key Wrapping Key (KWK) from PIN
async function deriveWrapperKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(pin),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt.buffer as ArrayBuffer,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
    );
}

// 2. Generate a new Random Master Key
async function generateMasterKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// 3. Wrap Master Key with derived KWK
async function wrapMasterKey(masterKey: CryptoKey, pin: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrapperKey = await deriveWrapperKey(pin, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const wrappedBuffer = await crypto.subtle.wrapKey(
        "jwk",
        masterKey,
        wrapperKey,
        { name: "AES-GCM", iv: iv }
    );

    return `${bytesToHex(salt)}:${bytesToHex(iv)}:${bytesToHex(new Uint8Array(wrappedBuffer))}`;
}

// 4. Unwrap Master Key using PIN
async function unwrapMasterKey(wrappedData: string, pin: string): Promise<CryptoKey | null> {
    try {
        const [saltHex, ivHex, dataHex] = wrappedData.split(':');
        const salt = hexToBytes(saltHex);
        const iv = hexToBytes(ivHex);
        const data = hexToBytes(dataHex);

        const wrapperKey = await deriveWrapperKey(pin, salt);

        const unwrappedKey = await crypto.subtle.unwrapKey(
            "jwk",
            data,
            wrapperKey,
            { name: "AES-GCM", iv: iv },
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        return unwrappedKey;
    } catch (e) {
        // console.warn("Decryption failed - Incorrect PIN or Corrupted Data");
        return null;
    }
}

// Get Cached Key or Fail
async function getEncryptionKey(): Promise<CryptoKey> {
    if (cachedMasterKey) return cachedMasterKey;
    throw new Error("Database Locked. Please unlock with PIN.");
}

// Simple text encryption using AES-GCM
// Returns format: iv_hex:ciphertext_hex
async function encryptData(text: string): Promise<string> {
    if (!text) return text;
    try {
        const key = await getEncryptionKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );

        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const cipherHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');

        return `${ivHex}:${cipherHex}`;
    } catch (e) {
        // console.error("Encryption failed", e); // Silenced for security
        return text; // Fallback to plain if critical (or throw)
    }
}

async function decryptData(cipherText: string): Promise<string> {
    if (!cipherText || !cipherText.includes(':')) return cipherText;
    try {
        const [ivHex, dataHex] = cipherText.split(':');
        const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const data = new Uint8Array(dataHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const key = await getEncryptionKey();

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        // console.error("Decryption failed", e); // Silent fail 
        return "[Locked Data]";
    }
}

// --- DB Helper functions (ASYNC) ---

export const initDB = async (): Promise<boolean> => {
    try {
        // 1. Initialize PIN if missing (Legacy/Fallback)
        if (!localStorage.getItem(PIN_HASH_KEY)) {
            const hash = await sha256(DEFAULT_PIN);
            localStorage.setItem(PIN_HASH_KEY, hash);
        }

        // 1.5 Ensure we have a wrapped key (Migration or Fresh Init)
        // ...

        // DB MIGRATION: Rename legacy localStorage keys to new schema
        const TABLES = ['patients', 'clinical_records', 'question_logs', 'tremor_records'];
        const OLD_DB = 'neuro_local_v6';
        const NEW_DB = 'sys_db_core';

        TABLES.forEach(table => {
            const oldKey = `alasql_${OLD_DB}_${table}`;
            const newKey = `alasql_${NEW_DB}_${table}`;
            if (localStorage.getItem(oldKey) && !localStorage.getItem(newKey)) {
                console.log(`Migrating ${oldKey} -> ${newKey}`);
                localStorage.setItem(newKey, localStorage.getItem(oldKey)!);
                // localStorage.removeItem(oldKey); // Optional: keep as backup or delete
            }
        });

        // Also migrate DB metadata if possible, or just let AlaSQL recreate
        const oldMeta = `alasql_${OLD_DB}`;
        const newMeta = `alasql_${NEW_DB}`;
        if (localStorage.getItem(oldMeta) && !localStorage.getItem(newMeta)) {
            localStorage.setItem(newMeta, localStorage.getItem(oldMeta)!.replace(OLD_DB, NEW_DB));
        }

        // 2. Initialize AlaSQL - OBFUSCATED DB NAME
        (alasql as any)('CREATE LOCALSTORAGE DATABASE IF NOT EXISTS sys_db_core');
        (alasql as any)('ATTACH LOCALSTORAGE DATABASE sys_db_core');
        (alasql as any)('USE sys_db_core');

        (alasql as any)(`
            CREATE TABLE IF NOT EXISTS patients (
            id STRING PRIMARY KEY, 
            name STRING, 
            age INT, 
            gender STRING, 
            notes STRING, 
            created_at NUMBER
            )
        `);

        (alasql as any)(`
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
            cov NUMBER,
            fatigue NUMBER,
            latency NUMBER,
            throughput NUMBER,
            lapses INT,
            insight_text STRING
            )
        `);

        (alasql as any)(`
            CREATE TABLE IF NOT EXISTS question_logs (
            patient_id STRING,
            question_id INT,
            category STRING,
            score_normalized NUMBER, -- 0 to 1
            timestamp NUMBER
            )
        `);

        (alasql as any)(`
            CREATE TABLE IF NOT EXISTS tremor_records (
            id STRING PRIMARY KEY,
            patient_id STRING,
            date NUMBER,
            left_hand JSON,
            right_hand JSON,
            notes STRING
            )
        `);

        (alasql as any)(`
            CREATE TABLE IF NOT EXISTS spiral_records (
            id STRING PRIMARY KEY,
            patient_id STRING,
            date NUMBER,
            score NUMBER,
            features_extracted NUMBER,
            image_b64 STRING
            )
        `);

        return true;
    } catch (e) {
        // console.error("DB Init Error:", e);
        return false;
    }
};

export const verifyPin = async (inputPin: string): Promise<boolean> => {
    // Legacy hash check for fast UI feedback
    const storedHash = localStorage.getItem(PIN_HASH_KEY);
    if (storedHash) {
        const inputHash = await sha256(inputPin);
        if (inputHash !== storedHash) return false;
    }

    // Attempt to unlock (Real Security Check)
    return await unlockDB(inputPin);
};

export const unlockDB = async (pin: string): Promise<boolean> => {
    // 1. Check if we already have a wrapped key
    let wrappedData = localStorage.getItem(WRAPPED_KEY_NAME);

    // MIGRATION FIX: Check for previous version key 'neuro_wrapped_key' if new one missing
    if (!wrappedData) {
        const legacyWrapped = localStorage.getItem('neuro_wrapped_key');
        if (legacyWrapped) {
            // Found legacy key, use it as current (it's compatible, just renamed)
            wrappedData = legacyWrapped;
            localStorage.setItem(WRAPPED_KEY_NAME, legacyWrapped);
            localStorage.removeItem('neuro_wrapped_key'); // Clean up
        }
    }

    if (wrappedData) {
        // Try to unlock
        const key = await unwrapMasterKey(wrappedData, pin);
        if (key) {
            cachedMasterKey = key;
            return true;
        }
        return false;
    } else {
        // NO WRAPPED KEY FOUND - MIGRATION OR FRESH START
        // Check for Legacy Key (Migration)
        const legacyKeyStr = localStorage.getItem('neuro_key'); // Keep legacy name for migration check only
        let mk: CryptoKey;

        if (legacyKeyStr) {
            // Import legacy key
            mk = await crypto.subtle.importKey(
                'jwk',
                JSON.parse(legacyKeyStr),
                { name: 'AES-GCM' },
                true,
                ['encrypt', 'decrypt']
            );
            // Migrate: Wrap it and Delete legacy
            const newWrapped = await wrapMasterKey(mk, pin);
            localStorage.setItem(WRAPPED_KEY_NAME, newWrapped);
            localStorage.removeItem('neuro_key'); // Secure delete
            cachedMasterKey = mk;
            return true;
        } else {
            // Fresh Start with this PIN
            mk = await generateMasterKey();
            const newWrapped = await wrapMasterKey(mk, pin);
            localStorage.setItem(WRAPPED_KEY_NAME, newWrapped);
            // Also set hash for consistency if missing (though initDB does it)
            if (!localStorage.getItem(PIN_HASH_KEY)) {
                localStorage.setItem(PIN_HASH_KEY, await sha256(pin));
            }
            cachedMasterKey = mk;
            return true;
        }
    }
};

export const changePin = async (oldPin: string, newPin: string): Promise<boolean> => {
    // Verify old pin wraps/unwraps correctly first
    if (!cachedMasterKey) {
        if (!await unlockDB(oldPin)) return false;
    }

    // Re-wrap cachedMasterKey with NEW PIN
    if (cachedMasterKey) {
        const newWrapped = await wrapMasterKey(cachedMasterKey, newPin);
        localStorage.setItem(WRAPPED_KEY_NAME, newWrapped);

        // Update Hash
        const newHash = await sha256(newPin);
        localStorage.setItem(PIN_HASH_KEY, newHash);

        return true;
    }
    return false;
};

export const getPatients = async (): Promise<Patient[]> => {
    try {
        const res = (alasql as any)('SELECT * FROM patients ORDER BY created_at DESC') as Patient[];
        // Decrypt sensitive fields
        const decrypted = await Promise.all(res.map(async p => ({
            ...p,
            name: await decryptData(p.name),
            notes: await decryptData(p.notes)
        })));
        return decrypted;
    } catch (e) {
        return [];
    }
};

export const getHistory = async (patientId: string): Promise<AssessmentRecord[]> => {
    try {
        const res = (alasql as any)('SELECT * FROM clinical_records WHERE patient_id = ? ORDER BY date DESC', [patientId]) as AssessmentRecord[];
        const decrypted = await Promise.all(res.map(async r => ({
            ...r,
            insight_text: await decryptData(r.insight_text)
        })));
        return decrypted;
    } catch (e) {
        return [];
    }
};

export const getTremorHistory = async (patientId: string): Promise<TremorRecord[]> => {
    try {
        const res = (alasql as any)('SELECT * FROM tremor_records WHERE patient_id = ? ORDER BY date DESC', [patientId]) as TremorRecord[];
        const decrypted = await Promise.all(res.map(async r => ({
            ...r,
            notes: await decryptData(r.notes)
        })));
        return decrypted;
    } catch (e) {
        return [];
    }
};

export const getSpiralHistory = async (patientId: string): Promise<SpiralRecord[]> => {
    try {
        const res = (alasql as any)('SELECT * FROM spiral_records WHERE patient_id = ? ORDER BY date DESC', [patientId]);
        return res.map((r: any) => ({
            ...r,
            imageUrl: r.image_b64
        })) as SpiralRecord[];
    } catch (e) {
        return [];
    }
};

export const getAllHistory = async (patientId: string): Promise<AnyRecord[]> => {
    const cog = await getHistory(patientId);
    const tremor = await getTremorHistory(patientId);
    const spiral = await getSpiralHistory(patientId);

    // Mix and sort
    const combined = [
        ...cog.map(r => ({ ...r, type: 'COGNITIVE' as const })),
        ...tremor.map(r => ({ ...r, type: 'MOTOR' as const })),
        ...spiral.map(r => ({ ...r, type: 'SPIRAL' as const }))
    ];
    return combined.sort((a, b) => b.date - a.date);
};

export const insertPatient = async (p: Patient) => {
    try {
        const encName = await encryptData(p.name);
        const encNotes = await encryptData(p.notes);

        (alasql as any)('INSERT INTO patients (id, name, age, gender, notes, created_at) VALUES (?,?,?,?,?,?)',
            [p.id, encName, p.age, p.gender, encNotes, p.created_at]);
    } catch (e) {
        // console.error(e);
    }
};

export const insertAssessment = async (a: AssessmentRecord) => {
    try {
        const encInsight = await encryptData(a.insight_text);

        (alasql as any)('INSERT INTO clinical_records (id, patient_id, date, gcs, api, wmc, risk_level, rt_mean, rt_sd, cov, fatigue, latency, throughput, lapses, insight_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [a.id, a.patient_id, a.date, a.gcs, a.api, a.wmc, a.risk_level, a.rt_mean, a.rt_sd, a.cov, a.fatigue, a.latency, a.throughput, a.lapses, encInsight]);
    } catch (e) {
        // console.error(e);
    }
};

export const insertTremorRecord = async (r: TremorRecord) => {
    try {
        const encNotes = await encryptData(r.notes);

        (alasql as any)('INSERT INTO tremor_records (id, patient_id, date, left_hand, right_hand, notes) VALUES (?,?,?,?,?,?)',
            [r.id, r.patient_id, r.date, r.left_hand, r.right_hand, encNotes]);
    } catch (e) {
        // console.error(e);
    }
};

export const insertSpiralRecord = async (r: SpiralRecord) => {
    try {
        (alasql as any)('INSERT INTO spiral_records (id, patient_id, date, score, features_extracted, image_b64) VALUES (?,?,?,?,?,?)',
            [r.id, r.patient_id, r.date, r.score, r.features_extracted, r.imageUrl || '']);
    } catch (e) {
        console.error("DB Insert Error:", e);
    }
};

export const deleteAssessment = async (id: string) => {
    (alasql as any)('DELETE FROM clinical_records WHERE id = ?', [id]);
};

export const deleteTremorRecord = async (id: string) => {
    (alasql as any)('DELETE FROM tremor_records WHERE id = ?', [id]);
};

export const deleteSpiralRecord = async (id: string) => {
    (alasql as any)('DELETE FROM spiral_records WHERE id = ?', [id]);
};

export const deleteRecord = async (id: string, type: 'COGNITIVE' | 'MOTOR' | 'SPIRAL') => {
    if (type === 'COGNITIVE') {
        await deleteAssessment(id);
    } else if (type === 'MOTOR') {
        await deleteTremorRecord(id);
    } else if (type === 'SPIRAL') {
        await deleteSpiralRecord(id);
    }
};

export const deletePatient = async (patientId: string) => {
    (alasql as any)('DELETE FROM patients WHERE id = ?', [patientId]);
    (alasql as any)('DELETE FROM clinical_records WHERE patient_id = ?', [patientId]);
    (alasql as any)('DELETE FROM question_logs WHERE patient_id = ?', [patientId]);
    (alasql as any)('DELETE FROM tremor_records WHERE patient_id = ?', [patientId]);
};

export const logQuestionAnswer = async (patientId: string, qId: number, category: string, score: number) => {
    try {
        (alasql as any)('INSERT INTO question_logs VALUES (?,?,?,?,?)',
            [patientId, qId, category, score, Date.now()]
        );
    } catch (e) {
        // console.error(e);
    }
};

export const generateAdaptiveQuestions = async (patientId: string): Promise<QAQuestion[]> => {
    const logs = (alasql as any)('SELECT * FROM question_logs WHERE patient_id = ? ORDER BY timestamp DESC', [patientId]) as any[];
    const weights: Record<string, number> = { Safety: 1, Memory: 1, Executive: 1, Mood: 1 };
    const recentQIds = new Set<number>();
    const recentLogs = logs.slice(0, 50);

    // ADAPTIVE LOGIC V2: Multiplicative
    recentLogs.forEach((log: any) => {
        recentQIds.add(log.question_id);
        if (log.score_normalized < 0.5) {
            weights[log.category] *= 3; // 3x Probability for low scores
        } else {
            // Slight reduction if answered well, but keep minimum
            weights[log.category] = Math.max(0.5, weights[log.category] * 0.8);
        }
    });

    const selected: QAQuestion[] = [];
    const available = QUESTION_BANK.filter(q => !recentQIds.has(q.id));
    const pool = available.length < CONFIG.QA_QUESTIONS_PER_SESSION ? QUESTION_BANK : available;
    const byCategory: Record<string, QAQuestion[]> = { Safety: [], Memory: [], Executive: [], Mood: [] };
    pool.forEach(q => byCategory[q.category]?.push(q));

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const categories = ['Safety', 'Memory', 'Executive', 'Mood'];

    // Ensure 1 from each if available (Baseline)
    categories.forEach(cat => {
        if (byCategory[cat].length > 0) {
            const randomIndex = Math.floor(Math.random() * byCategory[cat].length);
            selected.push(byCategory[cat].splice(randomIndex, 1)[0]);
        }
    });

    // Fill remainder based on weights
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
            // If category exhausted, pick random from others
            const remainingCats = categories.filter(c => byCategory[c].length > 0);
            if (remainingCats.length === 0) break;
            const backupCat = remainingCats[Math.floor(Math.random() * remainingCats.length)];
            const idx = Math.floor(Math.random() * byCategory[backupCat].length);
            selected.push(byCategory[backupCat].splice(idx, 1)[0]);
        }
    }
    return selected;
};

export const generateClinicalID = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'PID-';
    for (let i = 0; i < 3; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    result += '-';
    for (let i = 0; i < 3; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
};
